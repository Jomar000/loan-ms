/**
 * Cloudflare Workers - Durable Objects
 * https://developers.cloudflare.com/durable-objects/best-practices/websockets/
 */

import { serializeError } from '@loanms/errors'
import { refinement } from '@loanms/validator/shared'
import { DurableObject } from 'cloudflare:workers'
import { z } from 'zod'

import {
    REALTIME_STORAGE_VERSION,
    REALTIME_WIRE_VERSION,
    WS_BROKER_FAN_OUT_CONCURRENCY,
    WS_BROKER_FAN_OUT_DEADLINE_MS,
    WS_BROKER_PUBLICATION_BURST,
    WS_BROKER_PUBLICATION_RATE_PER_SECOND,
    WS_LEAF_COUNT,
    WS_LEAF_SOFT_CAP,
    WS_SLOW_CLIENT_MAX_BUFFERED_BYTES,
} from './constants.js'
import {
    hasRealtimeWireVersion,
    serializeRealtimeServerFrame,
    serializeValidatedRealtimeServerFrame,
    validateRealtimeServerFrame,
} from './protocol.js'
import { builtInRealtimeRegistry } from './registry.js'
import {
    brokerPublishResultSchema,
    brokerRealtimePublishInputSchema,
    brokerRealtimeRevocationInputSchema,
    brokerRealtimeRevocationResultSchema,
    realtimeBrokerScopeSchema,
    realtimeLeafDeliveryInputSchema,
    realtimeLeafDeliveryResultSchema,
    realtimeLeafRevocationInputSchema,
    realtimeLeafRevocationResultSchema,
    realtimeLeafScopeSchema,
    realtimeRevocationDirectiveSchema,
    realtimeSequenceSchema,
    realtimeTransportAttachmentSchema,
} from './schemas.js'
import {
    createRealtimeLeafObjectName,
    getSafeOrganizationIdentity,
    getSafeWebSocketObjectIdentity,
    runBoundedTasks,
} from './transport.js'
import type {
    TBrokerPublishResult,
    TBrokerRealtimePublishInput,
    TBrokerRealtimeRevocationInput,
    TBrokerRealtimeRevocationResult,
    TCanonicalRealtimeFrame,
    TRealtimeAudience,
    TRealtimeBrokerScope,
    TRealtimeLeafDeliveryResult,
    TRealtimeLeafRevocationInput,
    TRealtimeLeafRevocationResult,
    TRealtimeLeafScope,
    TRealtimeRegistry,
    TRealtimeRevocationDirective,
    TRealtimeTransportAttachment,
} from './types.js'

const BROKER_REALTIME_SEQUENCE_KEY = 'realtimeSequence'
const BROKER_REALTIME_SERVER_BUCKET_KEY = 'realtimeServerBucket'
const BROKER_REALTIME_REVOCATION_PREFIX = 'realtimeRevocation:'
const LEAF_REALTIME_REVOCATION_PREFIX = 'realtimeRevokedVersion:'
const OBJECT_SCOPE_KEY = 'scope'
const INTERNAL_HEADER_PREFIX = 'X-WS-Transport-'
const MAX_TIMER_DELAY_MS = 2_147_483_647

type TWebSocketEnvironment = object

export {
    brokerPublishResultSchema,
    brokerRealtimePublishInputSchema,
    brokerRealtimeRevocationInputSchema,
    brokerRealtimeRevocationResultSchema,
    realtimeLeafDeliveryInputSchema,
    realtimeLeafDeliveryResultSchema,
    realtimeLeafRevocationInputSchema,
    realtimeLeafRevocationResultSchema,
    realtimeRevocationDeliveryResultSchema,
} from './schemas.js'
export type {
    TBrokerPublishResult,
    TBrokerRealtimePublishInput,
    TBrokerRealtimeRevocationInput,
    TBrokerRealtimeRevocationResult,
    TLeafDeliveryResult,
    TRealtimeLeafDeliveryResult,
    TRealtimeLeafRevocationInput,
    TRealtimeLeafRevocationResult,
    TRealtimeRevocationBroker,
    TRealtimeRevocationDeliveryResult,
} from './types.js'

const wsLog = (entry: Record<string, unknown>) =>
    console.log(JSON.stringify(entry))

const wsError = (entry: Record<string, unknown>) =>
    console.error(JSON.stringify(entry))

const logStorageValidationFailure = (
    storageKind: string,
    scope?: TRealtimeBrokerScope,
) =>
    wsError({
        type: 'WS_STORAGE_VALIDATION_FAILED',
        storageKind,
        storageVersion: scope?.storageVersion,
        organization: scope
            ? getSafeOrganizationIdentity(scope.organizationId)
            : undefined,
        stream: scope?.stream,
        surface: scope?.surface,
    })

const textEncoder = new TextEncoder()

const realtimePendingShardIndexesSchema = z
    .array(
        z
            .number()
            .int()
            .min(0)
            .max(WS_LEAF_COUNT - 1),
    )
    .max(WS_LEAF_COUNT)
    .check((ctx) =>
        refinement.uniqueArrayValues(ctx, {
            message: 'Pending realtime shard indexes must be unique.',
            values: ctx.value,
        }),
    )
const storedRealtimeRevocationSchema =
    brokerRealtimeRevocationInputSchema.extend({
        pendingShardIndexes: realtimePendingShardIndexesSchema,
    })
const storedRealtimeServerBucketSchema = z.object({
    refilledAt: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
    tokens: z.number().min(0).max(Number.MAX_SAFE_INTEGER),
})
const realtimeFanOutConcurrencySchema = z
    .number()
    .int()
    .min(1)
    .max(WS_LEAF_COUNT)
const realtimeFanOutDeadlineSchema = z
    .number()
    .int()
    .min(1)
    .max(MAX_TIMER_DELAY_MS)
const realtimeLeafSoftCapSchema = z
    .number()
    .int()
    .min(1)
    .max(Number.MAX_SAFE_INTEGER)
const realtimePublicationBurstSchema = z
    .number()
    .int()
    .min(1)
    .max(Number.MAX_SAFE_INTEGER)
const realtimePublicationRateSchema = z
    .number()
    .min(0)
    .max(Number.MAX_SAFE_INTEGER)

const realtimeBrokerScopeMatches = (
    left: TRealtimeBrokerScope,
    right: TRealtimeBrokerScope,
) =>
    left.storageVersion === right.storageVersion &&
    left.surface === right.surface &&
    left.organizationId === right.organizationId &&
    left.stream === right.stream

const realtimeLeafScopeMatches = (
    left: TRealtimeLeafScope,
    right: TRealtimeLeafScope,
) =>
    realtimeBrokerScopeMatches(left, right) &&
    left.topology === right.topology &&
    left.shardIndex === right.shardIndex

const getRealtimeRevokedVersionKey = (
    identityId: string,
    authorizationVersion: string,
) =>
    `${LEAF_REALTIME_REVOCATION_PREFIX}${encodeURIComponent(identityId)}:${authorizationVersion}`

const getBrokerRealtimeRevocationKey = (operationId: string) =>
    `${BROKER_REALTIME_REVOCATION_PREFIX}${operationId}`

const realtimeRevocationDirectiveMatches = (
    left: TRealtimeRevocationDirective,
    right: TRealtimeRevocationDirective,
) =>
    left.operationId === right.operationId &&
    left.organizationId === right.organizationId &&
    left.identityId === right.identityId &&
    left.authorizationVersion === right.authorizationVersion &&
    left.expiresAt === right.expiresAt

const parseRealtimeTransportAttachment = (rawInput: unknown) => {
    const parsedInput = realtimeTransportAttachmentSchema.safeParse(rawInput)

    return parsedInput.success ? parsedInput.data : null
}

const readRealtimeTransportAttachment = (
    headers: Headers,
): TRealtimeTransportAttachment | null => {
    const target = headers.get(`${INTERNAL_HEADER_PREFIX}Target`)
    const rawInput = {
        storageVersion: REALTIME_STORAGE_VERSION,
        topology: 'leaf',
        surface: headers.get(`${INTERNAL_HEADER_PREFIX}Surface`),
        organizationId: headers.get(`${INTERNAL_HEADER_PREFIX}Organization-Id`),
        stream: headers.get(`${INTERNAL_HEADER_PREFIX}Stream`),
        shardIndex: Number(headers.get(`${INTERNAL_HEADER_PREFIX}Shard-Index`)),
        connectionId: headers.get(`${INTERNAL_HEADER_PREFIX}Connection-Id`),
        authorizationVersion: headers.get(
            `${INTERNAL_HEADER_PREFIX}Authorization-Version`,
        ),
        identityId: headers.get(`${INTERNAL_HEADER_PREFIX}Identity-Id`),
        wireVersion: headers.get(`${INTERNAL_HEADER_PREFIX}Wire-Version`),
        roles: (() => {
            try {
                return JSON.parse(
                    headers.get(`${INTERNAL_HEADER_PREFIX}Roles`) ?? '',
                )
            } catch {
                return null
            }
        })(),
        sessionExpiresAt: Number(
            headers.get(`${INTERNAL_HEADER_PREFIX}Session-Expires-At`),
        ),
        target: target === null || target === '' ? null : target,
    }

    return parseRealtimeTransportAttachment(rawInput)
}

export const setRealtimeTransportHeaders = (
    headers: Headers,
    attachment: TRealtimeTransportAttachment,
) => {
    headers.set(
        `${INTERNAL_HEADER_PREFIX}Authorization-Version`,
        attachment.authorizationVersion,
    )
    headers.set(
        `${INTERNAL_HEADER_PREFIX}Connection-Id`,
        attachment.connectionId,
    )
    headers.set(`${INTERNAL_HEADER_PREFIX}Identity-Id`, attachment.identityId)
    headers.set(
        `${INTERNAL_HEADER_PREFIX}Organization-Id`,
        attachment.organizationId,
    )
    headers.set(`${INTERNAL_HEADER_PREFIX}Wire-Version`, attachment.wireVersion)
    headers.set(
        `${INTERNAL_HEADER_PREFIX}Roles`,
        JSON.stringify(attachment.roles),
    )
    headers.set(
        `${INTERNAL_HEADER_PREFIX}Session-Expires-At`,
        String(attachment.sessionExpiresAt),
    )
    headers.set(
        `${INTERNAL_HEADER_PREFIX}Shard-Index`,
        String(attachment.shardIndex),
    )
    headers.set(`${INTERNAL_HEADER_PREFIX}Stream`, attachment.stream)
    headers.set(`${INTERNAL_HEADER_PREFIX}Surface`, attachment.surface)
    headers.set(`${INTERNAL_HEADER_PREFIX}Target`, attachment.target ?? '')
    headers.set(`${INTERNAL_HEADER_PREFIX}Topology`, attachment.topology)
}

export abstract class WebSocketServerBase<
    TEnvironment extends TWebSocketEnvironment,
> extends DurableObject<TEnvironment> {
    protected getLeafSoftCap() {
        return WS_LEAF_SOFT_CAP
    }

    protected getSocketBufferedAmount(socket: WebSocket) {
        return socket.bufferedAmount
    }

    protected getRealtimeRegistry(): TRealtimeRegistry {
        return builtInRealtimeRegistry
    }

    async fetch(request: Request): Promise<Response> {
        if (request.headers.get('Upgrade') !== 'websocket') {
            return new Response('Expected Upgrade: websocket', { status: 426 })
        }

        if (
            request.headers.get(`${INTERNAL_HEADER_PREFIX}Wire-Version`) !==
            REALTIME_WIRE_VERSION
        ) {
            return new Response('Invalid realtime transport metadata.', {
                status: 400,
            })
        }

        return this.acceptRealtimeWebSocket(request)
    }

    webSocketClose(
        ws: WebSocket,
        code: number,
        _reason: string,
        wasClean: boolean,
    ) {
        if (wasClean) {
            wsLog({ type: 'WS_CLOSE', code })
        } else {
            wsError({ type: 'WS_CLOSE_ERROR', code })
        }

        this.logAttachmentGauge(ws, true)
    }

    webSocketError(_ws: WebSocket, error: unknown) {
        wsError({ type: 'WS_ERROR', ...serializeError(error) })
    }

    async webSocketMessage(ws: WebSocket): Promise<void> {
        const rawInput = ws.deserializeAttachment()
        const attachment = parseRealtimeTransportAttachment(rawInput)

        if (!attachment) {
            wsError({
                type: 'WS_PUBLISH_REJECTED',
                code: 'INVALID_TRANSPORT_ATTACHMENT',
            })
            ws.close(1011, 'Invalid transport state.')
            return
        }

        wsLog({
            type: 'WS_PUBLISH_REJECTED',
            code: 'REALTIME_CLIENT_FRAME_FORBIDDEN',
            organization: getSafeOrganizationIdentity(
                attachment.organizationId,
            ),
            stream: attachment.stream,
            surface: attachment.surface,
        })
        ws.close(1008, 'Application commands require HTTP.')
    }

    async deliverRealtimeFrame(
        serializedFrame: string,
        frameBytes: number,
        audience: TRealtimeAudience,
        scope: TRealtimeLeafScope,
        target: string | null,
        revocations: readonly TRealtimeLeafRevocationInput[] = [],
    ): Promise<TRealtimeLeafDeliveryResult> {
        const rawInput = {
            audience,
            frameBytes,
            revocations,
            scope,
            serializedFrame,
            target,
        }
        const parsedInput = realtimeLeafDeliveryInputSchema.safeParse(rawInput)

        if (!parsedInput.success) {
            throw new Error('Invalid realtime leaf delivery input.')
        }

        const input = parsedInput.data

        if (
            textEncoder.encode(input.serializedFrame).byteLength !==
            input.frameBytes
        ) {
            throw new Error('Invalid realtime leaf delivery input.')
        }

        const result: TRealtimeLeafDeliveryResult = {
            deliveredCount: 0,
            expiredSocketCount: 0,
            revokedSocketCount: 0,
            sendFailureCount: 0,
            slowSocketCount: 0,
        }

        for (const revocation of input.revocations) {
            if (!realtimeLeafScopeMatches(revocation.scope, input.scope)) {
                throw new Error('Realtime revocation scope mismatch.')
            }
        }

        const blockedVersionKeys = await this.ctx.blockConcurrencyWhile(
            async () => {
                if (!(await this.ensureRealtimeLeafScope(input.scope))) {
                    throw new Error('WebSocket object scope mismatch.')
                }

                return (
                    await this.persistRealtimeLeafRevocations(input.revocations)
                ).blockedVersionKeys
            },
        )

        for (const socket of this.ctx.getWebSockets()) {
            if (socket.readyState !== WebSocket.OPEN) continue

            const rawAttachment = socket.deserializeAttachment()
            const attachment = parseRealtimeTransportAttachment(rawAttachment)

            if (
                !attachment ||
                !realtimeLeafScopeMatches(attachment, input.scope)
            ) {
                socket.close(1008, 'Realtime authorization refresh required.')
                result.revokedSocketCount += 1
                continue
            }

            if (
                blockedVersionKeys.has(
                    getRealtimeRevokedVersionKey(
                        attachment.identityId,
                        attachment.authorizationVersion,
                    ),
                )
            ) {
                socket.close(1008, 'Realtime authorization revoked.')
                result.revokedSocketCount += 1
                continue
            }

            if (attachment.sessionExpiresAt <= Date.now()) {
                socket.close(1008, 'Session expired.')
                result.expiredSocketCount += 1
                continue
            }

            if (input.target !== null && attachment.target !== input.target) {
                continue
            }
            if (!this.matchesRealtimeAudience(attachment, input.audience)) {
                continue
            }

            const bufferedAmount = this.getSocketBufferedAmount(socket)

            if (
                bufferedAmount + input.frameBytes >
                WS_SLOW_CLIENT_MAX_BUFFERED_BYTES
            ) {
                socket.close(1013, 'Client is too slow.')
                result.slowSocketCount += 1
                wsLog({
                    type: 'WS_SLOW_CONSUMER_CLOSED',
                    organization: getSafeOrganizationIdentity(
                        attachment.organizationId,
                    ),
                    stream: attachment.stream,
                    surface: attachment.surface,
                    shardIndex: attachment.shardIndex,
                })
                continue
            }

            try {
                socket.send(input.serializedFrame)
                result.deliveredCount += 1
            } catch (error) {
                result.sendFailureCount += 1
                wsError({
                    type: 'WS_MESSAGE_SEND_ERROR',
                    ...serializeError(error),
                })
            }
        }

        return realtimeLeafDeliveryResultSchema.parse(result)
    }

    async applyRealtimeRevocation(
        rawInput: TRealtimeLeafRevocationInput,
    ): Promise<TRealtimeLeafRevocationResult> {
        const parsedInput =
            realtimeLeafRevocationInputSchema.safeParse(rawInput)

        if (!parsedInput.success) {
            throw new Error('Invalid realtime leaf revocation input.')
        }

        const input = parsedInput.data

        if (input.directive.organizationId !== input.scope.organizationId) {
            throw new Error('Invalid realtime leaf revocation input.')
        }

        return this.ctx
            .blockConcurrencyWhile(async () => {
                if (!(await this.ensureRealtimeLeafScope(input.scope))) {
                    throw new Error('WebSocket object scope mismatch.')
                }

                const persisted = await this.persistRealtimeLeafRevocations([
                    input,
                ])

                let closedSocketCount = 0

                for (const socket of this.ctx.getWebSockets()) {
                    if (socket.readyState !== WebSocket.OPEN) continue

                    const rawAttachment = socket.deserializeAttachment()
                    const attachment =
                        parseRealtimeTransportAttachment(rawAttachment)

                    if (!attachment) {
                        socket.close(
                            1008,
                            'Realtime authorization refresh required.',
                        )
                        closedSocketCount += 1
                        continue
                    }

                    if (!realtimeLeafScopeMatches(attachment, input.scope)) {
                        socket.close(
                            1008,
                            'Realtime authorization refresh required.',
                        )
                        closedSocketCount += 1
                        continue
                    }

                    if (
                        persisted.blockedVersionKeys.has(
                            getRealtimeRevokedVersionKey(
                                attachment.identityId,
                                attachment.authorizationVersion,
                            ),
                        )
                    ) {
                        socket.close(1008, 'Realtime authorization revoked.')
                        closedSocketCount += 1
                    }
                }

                return {
                    closedSocketCount,
                    replayed: persisted.replayed[0]!,
                }
            })
            .then((result) => realtimeLeafRevocationResultSchema.parse(result))
    }

    private async persistRealtimeLeafRevocations(
        inputs: readonly TRealtimeLeafRevocationInput[],
    ) {
        for (const input of inputs) {
            if (input.directive.organizationId !== input.scope.organizationId) {
                throw new Error('Invalid realtime leaf revocation input.')
            }
        }

        const keys = inputs.map((input) =>
            getRealtimeRevokedVersionKey(
                input.directive.identityId,
                input.directive.authorizationVersion,
            ),
        )
        const uniqueKeys = [...new Set(keys)]
        const stored =
            uniqueKeys.length === 0
                ? new Map<string, unknown>()
                : await this.ctx.storage.get<unknown>(uniqueKeys)
        const blockedVersionKeys = new Set<string>()
        const pending = new Map<string, TRealtimeRevocationDirective>()
        const replayed: boolean[] = []
        const now = Date.now()

        inputs.forEach((input, index) => {
            const key = keys[index]!
            const storedExisting = stored.has(key)
                ? stored.get(key)
                : pending.get(key)
            const parsedExisting =
                storedExisting === undefined
                    ? undefined
                    : realtimeRevocationDirectiveSchema.safeParse(
                          storedExisting,
                      )

            if (parsedExisting && !parsedExisting.success) {
                logStorageValidationFailure('leaf-revocation', input.scope)
                throw new Error('Invalid stored realtime revocation state.')
            }

            const existing = parsedExisting?.data

            if (
                existing &&
                !realtimeRevocationDirectiveMatches(existing, input.directive)
            ) {
                throw new Error(
                    'Realtime authorization version was revoked by a different operation.',
                )
            }

            replayed.push(existing !== undefined)
            blockedVersionKeys.add(key)

            if (input.directive.expiresAt > now && !existing) {
                pending.set(key, input.directive)
            }
        })

        if (pending.size > 0) {
            await this.ctx.storage.put(Object.fromEntries(pending))
            await this.scheduleRealtimeLeafRevocationAlarm()
        }

        return {
            blockedVersionKeys,
            replayed,
        }
    }

    async alarm(): Promise<void> {
        const stored = await this.ctx.storage.list<unknown>({
            prefix: LEAF_REALTIME_REVOCATION_PREFIX,
        })
        const now = Date.now()
        const expiredKeys: string[] = []

        for (const [
            key,
            value,
        ] of stored) {
            const directive = realtimeRevocationDirectiveSchema.safeParse(value)

            if (!directive.success) {
                logStorageValidationFailure('leaf-revocation')
                continue
            }

            if (directive.data.expiresAt <= now) expiredKeys.push(key)
        }

        if (expiredKeys.length > 0) {
            await this.ctx.storage.delete(expiredKeys)
        }

        await this.scheduleRealtimeLeafRevocationAlarm()
    }

    private acceptRealtimeWebSocket(request: Request): Promise<Response> {
        const attachment = readRealtimeTransportAttachment(request.headers)
        const offeredProtocols = request.headers.get('Sec-WebSocket-Protocol')
        const registry = this.getRealtimeRegistry()
        const stream = attachment
            ? registry.getStream(attachment.stream)
            : undefined
        const normalizedTarget =
            attachment && stream?.kind === 'dedicated' && attachment.target
                ? registry.normalizeTarget(stream.wireName, attachment.target)
                : null
        const validTarget =
            !!attachment &&
            !!stream &&
            (stream.kind === 'app'
                ? attachment.target === null
                : attachment.target !== null &&
                  normalizedTarget?.success === true &&
                  normalizedTarget.target === attachment.target)

        if (
            !attachment ||
            !hasRealtimeWireVersion(offeredProtocols) ||
            !stream ||
            !validTarget ||
            attachment.sessionExpiresAt <= Date.now()
        ) {
            return Promise.resolve(
                new Response('Invalid realtime transport metadata.', {
                    status: 400,
                }),
            )
        }

        return this.ctx.blockConcurrencyWhile(async () => {
            if (!(await this.ensureRealtimeLeafScope(attachment))) {
                return new Response('WebSocket object scope mismatch.', {
                    status: 409,
                })
            }

            const revokedVersionKey = getRealtimeRevokedVersionKey(
                attachment.identityId,
                attachment.authorizationVersion,
            )
            const storedRevokedVersion =
                await this.ctx.storage.get<unknown>(revokedVersionKey)
            const revokedVersion =
                storedRevokedVersion === undefined
                    ? undefined
                    : realtimeRevocationDirectiveSchema.safeParse(
                          storedRevokedVersion,
                      )

            if (revokedVersion && !revokedVersion.success) {
                logStorageValidationFailure('leaf-revocation', attachment)
                return new Response(
                    'Realtime authorization state is unavailable.',
                    {
                        status: 503,
                        headers: {
                            'X-WS-Admission': 'authorization-unavailable',
                        },
                    },
                )
            }

            if (
                revokedVersion?.data.expiresAt &&
                revokedVersion.data.expiresAt > Date.now()
            ) {
                return new Response('Realtime authorization was revoked.', {
                    status: 403,
                    headers: {
                        'X-WS-Admission': 'revoked',
                    },
                })
            }

            if (revokedVersion?.success) {
                await this.ctx.storage.delete(revokedVersionKey)
            }

            const leafSoftCap = realtimeLeafSoftCapSchema.safeParse(
                this.getLeafSoftCap(),
            )

            if (
                !leafSoftCap.success ||
                this.ctx.getWebSockets().length >= leafSoftCap.data
            ) {
                return new Response('WebSocket leaf is full.', {
                    status: 503,
                    headers: {
                        'X-WS-Admission': 'full',
                    },
                })
            }

            const ready = serializeRealtimeServerFrame(
                this.getRealtimeRegistry(),
                {
                    authorizationVersion: attachment.authorizationVersion,
                    connectionId: attachment.connectionId,
                    stream: attachment.stream,
                    ...(attachment.target === null
                        ? {}
                        : { target: attachment.target }),
                    type: 'READY',
                    wireVersion: REALTIME_WIRE_VERSION,
                },
            )
            const { 0: client, 1: server } = new WebSocketPair()

            this.ctx.acceptWebSocket(server, [
                REALTIME_WIRE_VERSION,
                `identity:${getSafeWebSocketObjectIdentity(
                    attachment.identityId,
                )}`,
                ...attachment.roles.map((role) => `role:${role}`),
            ])
            server.serializeAttachment(attachment)
            server.send(ready.serializedFrame)
            this.logAttachmentGauge(server, false)

            wsLog({
                type: 'WS_CONNECT',
                organization: getSafeOrganizationIdentity(
                    attachment.organizationId,
                ),
                stream: attachment.stream,
                surface: attachment.surface,
                shardIndex: attachment.shardIndex,
                wireVersion: attachment.wireVersion,
            })

            return new Response(null, {
                headers: {
                    'Sec-WebSocket-Protocol': REALTIME_WIRE_VERSION,
                },
                status: 101,
                webSocket: client,
            })
        })
    }

    private async ensureRealtimeLeafScope(scope: TRealtimeLeafScope) {
        const existingScope =
            await this.ctx.storage.get<unknown>(OBJECT_SCOPE_KEY)

        if (existingScope === undefined) {
            await this.ctx.storage.put(OBJECT_SCOPE_KEY, scope)
            return true
        }

        const parsedScope = realtimeLeafScopeSchema.safeParse(existingScope)

        if (!parsedScope.success) {
            logStorageValidationFailure('leaf-scope', scope)
            return false
        }

        return realtimeLeafScopeMatches(parsedScope.data, scope)
    }

    private async scheduleRealtimeLeafRevocationAlarm() {
        const stored = await this.ctx.storage.list<unknown>({
            prefix: LEAF_REALTIME_REVOCATION_PREFIX,
        })
        const now = Date.now()
        let nextAlarm: number | undefined

        for (const value of stored.values()) {
            const directive = realtimeRevocationDirectiveSchema.safeParse(value)
            let candidate: number | undefined

            if (!directive.success) {
                logStorageValidationFailure('leaf-revocation')
                candidate = now + 60_000
            } else if (directive.data.expiresAt > now) {
                candidate = directive.data.expiresAt
            }

            if (candidate !== undefined) {
                nextAlarm =
                    nextAlarm === undefined
                        ? candidate
                        : Math.min(nextAlarm, candidate)
            }
        }

        if (nextAlarm === undefined) {
            await this.ctx.storage.deleteAlarm()
        } else {
            await this.ctx.storage.setAlarm(nextAlarm)
        }
    }

    private matchesRealtimeAudience(
        attachment: TRealtimeTransportAttachment,
        audience: TRealtimeAudience,
    ) {
        switch (audience.kind) {
            case 'identity':
                return audience.identityIds.includes(attachment.identityId)
            case 'organization':
                return true
            case 'role':
                return attachment.roles.some((role) =>
                    audience.roles.includes(role),
                )
        }
    }

    private logAttachmentGauge(socket: WebSocket, excludeSocket: boolean) {
        const attachment = parseRealtimeTransportAttachment(
            socket.deserializeAttachment(),
        )
        const realtimeWireVersionSocketCount = this.ctx
            .getWebSockets(REALTIME_WIRE_VERSION)
            .filter(
                (candidate) => !excludeSocket || candidate !== socket,
            ).length
        const organizationId = attachment?.organizationId

        wsLog({
            type: 'WS_TRANSPORT_GAUGE',
            object: getSafeWebSocketObjectIdentity(this.ctx.id.toString()),
            organization:
                organizationId === undefined
                    ? undefined
                    : getSafeOrganizationIdentity(organizationId),
            stream: attachment?.stream,
            surface: attachment?.surface,
            topology: attachment?.topology,
            shardIndex: attachment?.shardIndex ?? null,
            realtime_wire_version_socket_count: realtimeWireVersionSocketCount,
        })
    }
}

type TRealtimeBrokerTarget<TEnvironment extends TWebSocketEnvironment> = {
    objectName: string
    stub: DurableObjectStub<WebSocketServerBase<TEnvironment>>
}

type TStoredRealtimeRevocation = z.infer<typeof storedRealtimeRevocationSchema>
type TStoredRealtimeServerBucket = z.infer<
    typeof storedRealtimeServerBucketSchema
>

export abstract class WebSocketBrokerBase<
    TEnvironment extends TWebSocketEnvironment,
> extends DurableObject<TEnvironment> {
    private operationTail: Promise<void> = Promise.resolve()

    protected abstract getLeafNamespace(): DurableObjectNamespace<
        WebSocketServerBase<TEnvironment>
    >

    protected getRealtimeRegistry(): TRealtimeRegistry {
        return builtInRealtimeRegistry
    }

    publishRealtime(
        rawInput: TBrokerRealtimePublishInput,
    ): Promise<TBrokerPublishResult> {
        return this.enqueue(() =>
            this.publishRealtimeSerialized(rawInput),
        ).then((result) => brokerPublishResultSchema.parse(result))
    }

    revokeRealtimeAuthorization(
        rawInput: TBrokerRealtimeRevocationInput,
    ): Promise<TBrokerRealtimeRevocationResult> {
        return this.enqueue(() =>
            this.revokeRealtimeAuthorizationSerialized(rawInput),
        ).then((result) => brokerRealtimeRevocationResultSchema.parse(result))
    }

    alarm(): Promise<void> {
        return this.enqueue(() => this.retryRealtimeRevocations())
    }

    private enqueue<T>(operation: () => Promise<T>): Promise<T> {
        const result = this.operationTail
            .catch(() => undefined)
            .then(() => operation())

        this.operationTail = result.then(
            () => undefined,
            () => undefined,
        )

        return result
    }

    private async publishRealtimeSerialized(
        rawInput: TBrokerRealtimePublishInput,
    ): Promise<TBrokerPublishResult> {
        const startedAt = Date.now()
        const parsedInput = brokerRealtimePublishInputSchema.safeParse(rawInput)
        const organization = parsedInput.success
            ? getSafeOrganizationIdentity(parsedInput.data.scope.organizationId)
            : 'invalid'

        if (!parsedInput.success) {
            return {
                accepted: false,
                code: 'FRAME_INVALID',
            }
        }

        const input = parsedInput.data
        const registry = this.getRealtimeRegistry()
        const stream = registry.getStream(input.scope.stream)
        const event = registry.getEvent(input.scope.stream, input.event)

        if (
            !stream ||
            !event ||
            !event.audiences.includes(input.audience.kind)
        ) {
            return {
                accepted: false,
                code: 'FRAME_INVALID',
            }
        }

        if (
            (event.delivery === 'organization' && input.target !== null) ||
            (event.delivery === 'target' && input.target === null) ||
            (stream.kind === 'app' && input.target !== null)
        ) {
            return {
                accepted: false,
                code: 'FRAME_INVALID',
            }
        }

        let target = input.target

        if (target !== null) {
            const normalizedTarget = registry.normalizeTarget(
                stream.wireName,
                target,
            )

            if (!normalizedTarget.success) {
                return {
                    accepted: false,
                    code: 'FRAME_INVALID',
                }
            }

            target = normalizedTarget.target
        }

        const draftFrame = {
            event: input.event,
            eventId: input.eventId,
            occurredAt: input.occurredAt,
            payload: input.payload,
            stream: stream.wireName,
            ...(target === null ? {} : { target }),
            type: 'EVENT',
        }
        const validatedFrame = validateRealtimeServerFrame(registry, draftFrame)

        if (!validatedFrame.success || validatedFrame.data.type !== 'EVENT') {
            return {
                accepted: false,
                code: 'FRAME_INVALID',
            }
        }

        const fanOutConfiguration =
            this.getValidatedRealtimeFanOutConfiguration()
        const publicationConfiguration =
            this.getValidatedRealtimePublicationConfiguration()

        if (!fanOutConfiguration || !publicationConfiguration) {
            return {
                accepted: false,
                code: 'FANOUT_UNAVAILABLE',
            }
        }

        if (!(await this.ensureRealtimeBrokerScope(input.scope))) {
            return {
                accepted: false,
                code: 'FANOUT_UNAVAILABLE',
            }
        }

        const admission = await this.consumeRealtimePublicationCapacity(
            target === null && input.audience.kind === 'organization',
            publicationConfiguration,
        )

        if (!admission.accepted) {
            if (admission.reason === 'storage-invalid') {
                return {
                    accepted: false,
                    code: 'FANOUT_UNAVAILABLE',
                }
            }

            wsLog({
                type: 'WS_BROKER_RATE_LIMITED',
                organization,
                stream: stream.wireName,
                surface: input.scope.surface,
            })

            return {
                accepted: false,
                code: 'RATE_LIMITED',
            }
        }

        const sequence = admission.sequence
        let canonicalFrame: TCanonicalRealtimeFrame

        try {
            canonicalFrame = serializeValidatedRealtimeServerFrame({
                ...validatedFrame.data,
                ...(sequence === undefined ? {} : { sequence }),
            })
        } catch (error) {
            return {
                accepted: false,
                code:
                    error instanceof Error &&
                    error.message.includes('exceeds the server frame limit')
                        ? 'FRAME_TOO_LARGE'
                        : 'FRAME_INVALID',
            }
        }

        const targets = this.createRealtimeTargets(input.scope)
        const activeRevocations = await this.getActiveRealtimeRevocations(
            input.scope,
        )

        if (activeRevocations === null) {
            return {
                accepted: false,
                code: 'FANOUT_UNAVAILABLE',
            }
        }

        const taskResults = await runBoundedTasks(
            targets.map((realtimeTarget, shardIndex) => {
                const leafScope: TRealtimeLeafScope = {
                    ...input.scope,
                    shardIndex,
                    topology: 'leaf',
                }

                return async () =>
                    realtimeTarget.stub.deliverRealtimeFrame(
                        canonicalFrame.serializedFrame,
                        canonicalFrame.frameBytes,
                        input.audience,
                        leafScope,
                        target,
                        activeRevocations.map(({ directive }) => ({
                            directive,
                            scope: leafScope,
                        })),
                    )
            }),
            fanOutConfiguration.concurrency,
            fanOutConfiguration.deadlineMs,
        )
        let deliveredCount = 0
        let expiredSocketCount = 0
        let revokedSocketCount = 0
        let sendFailureCount = 0
        let slowSocketCount = 0
        let successfulTargetCount = 0

        for (const result of taskResults) {
            if (result.status === 'rejected') continue

            const parsedResult = realtimeLeafDeliveryResultSchema.safeParse(
                result.value,
            )

            if (!parsedResult.success) continue

            successfulTargetCount += 1
            deliveredCount += parsedResult.data.deliveredCount
            expiredSocketCount += parsedResult.data.expiredSocketCount
            revokedSocketCount += parsedResult.data.revokedSocketCount
            sendFailureCount += parsedResult.data.sendFailureCount
            slowSocketCount += parsedResult.data.slowSocketCount
        }

        const failedTargetCount = targets.length - successfulTargetCount
        const logData = {
            organization,
            stream: stream.wireName,
            surface: input.scope.surface,
            event: input.event,
            eventId: input.eventId,
            sequence,
            frameBytes: canonicalFrame.frameBytes,
            durationMs: Date.now() - startedAt,
            deliveredCount,
            expiredSocketCount,
            revokedSocketCount,
            sendFailureCount,
            slowSocketCount,
            successfulTargetCount,
            failedTargetCount,
        }

        if (successfulTargetCount === 0) {
            wsError({
                type: 'WS_BROADCAST_UNAVAILABLE',
                ...logData,
            })

            return {
                accepted: false,
                code: 'FANOUT_UNAVAILABLE',
            }
        }

        wsLog({
            type:
                failedTargetCount === 0
                    ? 'WS_BROADCAST_COMPLETED'
                    : 'WS_BROADCAST_PARTIAL_FAILURE',
            ...logData,
        })

        return {
            accepted: true,
            deliveredCount,
            failedTargetCount,
            successfulTargetCount,
        }
    }

    private async revokeRealtimeAuthorizationSerialized(
        rawInput: TBrokerRealtimeRevocationInput,
    ): Promise<TBrokerRealtimeRevocationResult> {
        const parsedInput =
            brokerRealtimeRevocationInputSchema.safeParse(rawInput)

        if (!parsedInput.success) {
            return {
                accepted: false,
                closedSocketCount: 0,
                code: 'FANOUT_UNAVAILABLE',
                failedLeafCount: WS_LEAF_COUNT,
                successfulLeafCount: 0,
            }
        }

        const input = parsedInput.data

        if (
            input.directive.organizationId !== input.scope.organizationId ||
            input.directive.expiresAt <= Date.now()
        ) {
            return {
                accepted: false,
                closedSocketCount: 0,
                code: 'FANOUT_UNAVAILABLE',
                failedLeafCount: WS_LEAF_COUNT,
                successfulLeafCount: 0,
            }
        }

        if (!(await this.ensureRealtimeBrokerScope(input.scope))) {
            return {
                accepted: false,
                closedSocketCount: 0,
                code: 'FANOUT_UNAVAILABLE',
                failedLeafCount: WS_LEAF_COUNT,
                successfulLeafCount: 0,
            }
        }

        const key = getBrokerRealtimeRevocationKey(input.directive.operationId)
        const storedExisting = await this.ctx.storage.get<unknown>(key)
        const parsedExisting =
            storedExisting === undefined
                ? undefined
                : storedRealtimeRevocationSchema.safeParse(storedExisting)

        if (parsedExisting && !parsedExisting.success) {
            logStorageValidationFailure('broker-revocation', input.scope)
            return {
                accepted: false,
                closedSocketCount: 0,
                code: 'FANOUT_UNAVAILABLE',
                failedLeafCount: WS_LEAF_COUNT,
                successfulLeafCount: 0,
            }
        }

        const existing = parsedExisting?.data

        if (
            existing &&
            (!realtimeBrokerScopeMatches(existing.scope, input.scope) ||
                !realtimeRevocationDirectiveMatches(
                    existing.directive,
                    input.directive,
                ))
        ) {
            return {
                accepted: false,
                closedSocketCount: 0,
                code: 'FANOUT_UNAVAILABLE',
                failedLeafCount: WS_LEAF_COUNT,
                successfulLeafCount: 0,
            }
        }

        const stored =
            existing ??
            ({
                ...input,
                pendingShardIndexes: Array.from(
                    { length: WS_LEAF_COUNT },
                    (_, shardIndex) => shardIndex,
                ),
            } satisfies TStoredRealtimeRevocation)

        if (!existing) {
            await this.persistRealtimeRevocation(key, stored)
        }

        wsLog({
            type: 'WS_AUTHORIZATION_REVOKED',
            operationId: input.directive.operationId,
            organization: getSafeOrganizationIdentity(
                input.directive.organizationId,
            ),
            stream: input.scope.stream,
            surface: input.scope.surface,
            replayed: existing !== undefined,
        })

        if (stored.pendingShardIndexes.length === 0) {
            await this.scheduleRealtimeRevocationAlarm()

            return {
                accepted: true,
                closedSocketCount: 0,
                failedLeafCount: 0,
                successfulLeafCount: WS_LEAF_COUNT,
            }
        }

        return this.fanOutRealtimeRevocation(key, stored)
    }

    private async fanOutRealtimeRevocation(
        key: string,
        stored: TStoredRealtimeRevocation,
    ): Promise<TBrokerRealtimeRevocationResult> {
        const fanOutConfiguration =
            this.getValidatedRealtimeFanOutConfiguration()
        const targets = this.createRealtimeTargets(stored.scope)
        const pendingTargets = stored.pendingShardIndexes.map((shardIndex) => ({
            shardIndex,
            target: targets[shardIndex]!,
        }))
        const tasks = pendingTargets.map(({ shardIndex, target }) => {
            const scope: TRealtimeLeafScope = {
                ...stored.scope,
                shardIndex,
                topology: 'leaf',
            }

            return async () =>
                target.stub.applyRealtimeRevocation({
                    directive: stored.directive,
                    scope,
                })
        })
        const taskResults = fanOutConfiguration
            ? await runBoundedTasks(
                  tasks,
                  fanOutConfiguration.concurrency,
                  fanOutConfiguration.deadlineMs,
              )
            : tasks.map(() => ({
                  status: 'rejected' as const,
                  reason: new Error('Invalid realtime fan-out configuration.'),
              }))
        const successfulShardIndexes = new Set<number>()
        let closedSocketCount = 0

        taskResults.forEach((result, index) => {
            if (result.status === 'rejected') return

            const parsedResult = realtimeLeafRevocationResultSchema.safeParse(
                result.value,
            )

            if (!parsedResult.success) return

            successfulShardIndexes.add(pendingTargets[index]!.shardIndex)
            closedSocketCount += parsedResult.data.closedSocketCount
        })

        const pendingShardIndexes = stored.pendingShardIndexes.filter(
            (shardIndex) => !successfulShardIndexes.has(shardIndex),
        )

        await this.persistRealtimeRevocation(key, {
            ...stored,
            pendingShardIndexes,
        } satisfies TStoredRealtimeRevocation)

        const successfulLeafCount = WS_LEAF_COUNT - pendingShardIndexes.length
        const revocationLog = {
            operationId: stored.directive.operationId,
            organization: getSafeOrganizationIdentity(
                stored.directive.organizationId,
            ),
            stream: stored.scope.stream,
            surface: stored.scope.surface,
            closedSocketCount,
            failedLeafCount: pendingShardIndexes.length,
            successfulLeafCount,
        }

        if (pendingShardIndexes.length > 0) {
            wsError({
                type: 'WS_REVOCATION_PARTIAL_FAILURE',
                ...revocationLog,
            })

            return {
                accepted: false,
                closedSocketCount,
                code: 'FANOUT_UNAVAILABLE',
                failedLeafCount: pendingShardIndexes.length,
                successfulLeafCount,
            }
        }

        wsLog({
            type: 'WS_REVOCATION_COMPLETED',
            ...revocationLog,
        })

        return {
            accepted: true,
            closedSocketCount,
            failedLeafCount: 0,
            successfulLeafCount,
        }
    }

    private async getActiveRealtimeRevocations(scope: TRealtimeBrokerScope) {
        const stored = await this.ctx.storage.list<unknown>({
            prefix: BROKER_REALTIME_REVOCATION_PREFIX,
        })
        const now = Date.now()
        const expiredKeys: string[] = []
        const active: TStoredRealtimeRevocation[] = []

        for (const [
            key,
            value,
        ] of stored) {
            const parsedOperation =
                storedRealtimeRevocationSchema.safeParse(value)

            if (!parsedOperation.success) {
                logStorageValidationFailure('broker-revocation', scope)
                return null
            }

            const operation = parsedOperation.data

            if (operation.directive.expiresAt <= now) {
                expiredKeys.push(key)
            } else if (realtimeBrokerScopeMatches(operation.scope, scope)) {
                active.push(operation)
            }
        }

        if (expiredKeys.length > 0) {
            await this.scheduleRealtimeRevocationAlarm()
        }

        return active
    }

    private async retryRealtimeRevocations() {
        const stored = await this.ctx.storage.list<unknown>({
            prefix: BROKER_REALTIME_REVOCATION_PREFIX,
        })
        const now = Date.now()

        for (const [
            key,
            value,
        ] of stored) {
            const parsedOperation =
                storedRealtimeRevocationSchema.safeParse(value)

            if (!parsedOperation.success) {
                logStorageValidationFailure('broker-revocation')
                continue
            }

            const operation = parsedOperation.data

            if (operation.directive.expiresAt <= now) {
                continue
            }

            if (operation.pendingShardIndexes.length > 0) {
                wsLog({
                    type: 'WS_REVOCATION_RETRY',
                    operationId: operation.directive.operationId,
                    organization: getSafeOrganizationIdentity(
                        operation.directive.organizationId,
                    ),
                    stream: operation.scope.stream,
                    surface: operation.scope.surface,
                    pendingLeafCount: operation.pendingShardIndexes.length,
                })
                await this.fanOutRealtimeRevocation(key, operation)
            }
        }

        await this.scheduleRealtimeRevocationAlarm()
    }

    private async scheduleRealtimeRevocationAlarm() {
        await this.ctx.storage.transaction((transaction) =>
            this.reconcileRealtimeRevocationAlarm(transaction),
        )
    }

    private async persistRealtimeRevocation(
        key: string,
        stored: TStoredRealtimeRevocation,
    ) {
        await this.ctx.storage.transaction(async (transaction) => {
            await transaction.put(key, stored)
            await this.reconcileRealtimeRevocationAlarm(transaction, {
                key,
                stored,
            })
        })
    }

    private async reconcileRealtimeRevocationAlarm(
        transaction: DurableObjectTransaction,
        pendingWrite?: {
            key: string
            stored: TStoredRealtimeRevocation
        },
    ) {
        const stored = await transaction.list<unknown>({
            prefix: BROKER_REALTIME_REVOCATION_PREFIX,
        })

        if (pendingWrite) {
            stored.set(pendingWrite.key, pendingWrite.stored)
        }

        const now = Date.now()
        const expiredKeys: string[] = []
        let nextAlarm: number | undefined

        for (const [
            key,
            value,
        ] of stored) {
            const parsedOperation =
                storedRealtimeRevocationSchema.safeParse(value)

            if (!parsedOperation.success) {
                logStorageValidationFailure('broker-revocation')
                const retryAt = now + 60_000
                nextAlarm =
                    nextAlarm === undefined
                        ? retryAt
                        : Math.min(nextAlarm, retryAt)
                continue
            }

            const operation = parsedOperation.data

            if (operation.directive.expiresAt <= now) {
                expiredKeys.push(key)
                continue
            }

            const candidate =
                operation.pendingShardIndexes.length > 0
                    ? Math.min(now + 60_000, operation.directive.expiresAt)
                    : operation.directive.expiresAt

            nextAlarm =
                nextAlarm === undefined
                    ? candidate
                    : Math.min(nextAlarm, candidate)
        }

        if (expiredKeys.length > 0) {
            await transaction.delete(expiredKeys)
        }

        if (nextAlarm === undefined) {
            await transaction.deleteAlarm()
        } else {
            await transaction.setAlarm(nextAlarm)
        }
    }

    protected getFanOutConcurrency() {
        return WS_BROKER_FAN_OUT_CONCURRENCY
    }

    protected getFanOutDeadlineMs() {
        return WS_BROKER_FAN_OUT_DEADLINE_MS
    }

    protected getPublicationBurst() {
        return WS_BROKER_PUBLICATION_BURST
    }

    protected getPublicationRatePerSecond() {
        return WS_BROKER_PUBLICATION_RATE_PER_SECOND
    }

    private getValidatedRealtimeFanOutConfiguration() {
        const concurrency = realtimeFanOutConcurrencySchema.safeParse(
            this.getFanOutConcurrency(),
        )
        const deadlineMs = realtimeFanOutDeadlineSchema.safeParse(
            this.getFanOutDeadlineMs(),
        )

        if (!concurrency.success || !deadlineMs.success) return null

        return {
            concurrency: concurrency.data,
            deadlineMs: deadlineMs.data,
        }
    }

    private getValidatedRealtimePublicationConfiguration() {
        const burst = realtimePublicationBurstSchema.safeParse(
            this.getPublicationBurst(),
        )
        const ratePerSecond = realtimePublicationRateSchema.safeParse(
            this.getPublicationRatePerSecond(),
        )

        if (!burst.success || !ratePerSecond.success) return null

        return {
            burst: burst.data,
            ratePerSecond: ratePerSecond.data,
        }
    }

    private async ensureRealtimeBrokerScope(scope: TRealtimeBrokerScope) {
        const existingScope =
            await this.ctx.storage.get<unknown>(OBJECT_SCOPE_KEY)

        if (existingScope === undefined) {
            await this.ctx.storage.put(OBJECT_SCOPE_KEY, scope)
            return true
        }

        const parsedScope = realtimeBrokerScopeSchema.safeParse(existingScope)

        if (!parsedScope.success) {
            logStorageValidationFailure('broker-scope', scope)
            return false
        }

        return realtimeBrokerScopeMatches(parsedScope.data, scope)
    }

    private async consumeRealtimePublicationCapacity(
        shouldSequence: boolean,
        configuration: {
            burst: number
            ratePerSecond: number
        },
    ) {
        return this.ctx.storage.transaction(async (transaction) => {
            const now = Date.now()
            const storedBucket = await transaction.get<unknown>(
                BROKER_REALTIME_SERVER_BUCKET_KEY,
            )
            const parsedBucket =
                storedRealtimeServerBucketSchema.safeParse(storedBucket)

            if (storedBucket !== undefined && !parsedBucket.success) {
                logStorageValidationFailure('broker-rate-bucket')
            }
            const elapsedMs = parsedBucket.success
                ? Math.max(0, now - parsedBucket.data.refilledAt)
                : 0
            const availableTokens = Math.min(
                configuration.burst,
                (parsedBucket.success
                    ? parsedBucket.data.tokens
                    : configuration.burst) +
                    (elapsedMs * configuration.ratePerSecond) / 1000,
            )

            if (availableTokens < 1) {
                await transaction.put(BROKER_REALTIME_SERVER_BUCKET_KEY, {
                    refilledAt: now,
                    tokens: availableTokens,
                } satisfies TStoredRealtimeServerBucket)

                return {
                    accepted: false as const,
                    reason: 'rate-limited' as const,
                }
            }

            await transaction.put(BROKER_REALTIME_SERVER_BUCKET_KEY, {
                refilledAt: now,
                tokens: availableTokens - 1,
            } satisfies TStoredRealtimeServerBucket)

            if (!shouldSequence) {
                return {
                    accepted: true as const,
                    sequence: undefined,
                }
            }

            const storedSequence = await transaction.get<unknown>(
                BROKER_REALTIME_SEQUENCE_KEY,
            )
            const parsedSequence =
                storedSequence === undefined
                    ? undefined
                    : realtimeSequenceSchema.safeParse(storedSequence)

            if (parsedSequence && !parsedSequence.success) {
                logStorageValidationFailure('broker-sequence')
                return {
                    accepted: false as const,
                    reason: 'storage-invalid' as const,
                }
            }

            const sequence =
                (parsedSequence === undefined
                    ? 0n
                    : BigInt(parsedSequence.data)) + 1n
            const serializedSequence = sequence.toString()
            await transaction.put(
                BROKER_REALTIME_SEQUENCE_KEY,
                serializedSequence,
            )

            return {
                accepted: true as const,
                sequence: serializedSequence,
            }
        })
    }

    protected createRealtimeTargets(
        scope: TRealtimeBrokerScope,
    ): Array<TRealtimeBrokerTarget<TEnvironment>> {
        const namespace = this.getLeafNamespace()

        return Array.from({ length: WS_LEAF_COUNT }, (_, shardIndex) => {
            const objectName = createRealtimeLeafObjectName(scope, shardIndex)

            return {
                objectName,
                stub: namespace.getByName(objectName),
            }
        })
    }
}
