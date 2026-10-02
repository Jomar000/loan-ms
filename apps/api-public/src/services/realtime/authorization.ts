import { dbClient } from '@hyperion/database/d1'
import { serializeError } from '@hyperion/errors'
import {
    brokerRealtimeRevocationResultSchema,
    realtimeRevocationDeliveryResultSchema,
    type TBrokerRealtimeRevocationInput,
    type TRealtimeRevocationBroker,
    type TRealtimeRevocationDeliveryResult,
} from '@hyperion/websocket/server'
import {
    getRealtimeRevocationDestinations,
    validateRealtimeTopologyCapabilities,
    type TRealtimeTopologyProfile,
} from '@hyperion/websocket/topology'
import {
    createRealtimeBrokerObjectName,
    REALTIME_STORAGE_VERSION,
    realtimeRevocationDirectiveSchema,
    runBoundedTasks,
    WS_BROKER_FAN_OUT_CONCURRENCY,
    type TRealtimeBrokerScope,
    type TRealtimeRevocationDirective,
} from '@hyperion/websocket/transport'

import type { WebSocketBroker } from '../../core/durableObject/webSocket.js'
import {
    createMembershipWebSocketRevocation,
    listPendingWebSocketRevocationDeliveries,
    purgeExpiredWebSocketRevocations,
    recordWebSocketRevocationDeliveryAttempt,
    type TMembershipAuthorizationMutation,
} from './authorizationPersistence.js'
import {
    PUBLIC_REALTIME_SURFACE,
    PUBLIC_REALTIME_TOPOLOGY,
    publicRealtimeRegistry,
} from './configuration.js'

/** Persisted and returned in place of a caught exception's message. */
const REVOCATION_DELIVERY_FAILED_MESSAGE =
    'Realtime revocation delivery failed.'

const realtimeRevocationError = (entry: Record<string, unknown>) =>
    console.error(JSON.stringify(entry))

export const deliverPublicRealtimeRevocationLocally = async (
    namespace: DurableObjectNamespace<WebSocketBroker>,
    rawInput: TRealtimeRevocationDirective,
): Promise<TRealtimeRevocationDeliveryResult> => {
    const parsedInput = realtimeRevocationDirectiveSchema.safeParse(rawInput)

    if (!parsedInput.success) {
        return {
            accepted: false,
            error: 'INVALID_REVOCATION_DIRECTIVE',
        }
    }

    const directive = parsedInput.data

    if (directive.expiresAt <= Date.now()) {
        return {
            accepted: false,
            error: 'INVALID_REVOCATION_DIRECTIVE',
        }
    }

    const taskResults = await runBoundedTasks(
        publicRealtimeRegistry.streams.map((stream) => {
            const scope: TRealtimeBrokerScope = {
                organizationId: directive.organizationId,
                storageVersion: REALTIME_STORAGE_VERSION,
                stream: stream.wireName,
                surface: PUBLIC_REALTIME_SURFACE,
            }
            const input: TBrokerRealtimeRevocationInput = {
                directive,
                scope,
            }

            return async () => {
                const rawResult = await namespace
                    .getByName(createRealtimeBrokerObjectName(scope))
                    .revokeRealtimeAuthorization(input)
                const result =
                    brokerRealtimeRevocationResultSchema.safeParse(rawResult)

                if (!result.success) {
                    return {
                        accepted: false as const,
                        error: 'INVALID_RPC_RESULT',
                    }
                }

                return result.data.accepted
                    ? { accepted: true as const }
                    : {
                          accepted: false as const,
                          error: result.data.code,
                      }
            }
        }),
        WS_BROKER_FAN_OUT_CONCURRENCY,
        5_000,
    )
    for (const result of taskResults) {
        if (result.status === 'rejected') {
            realtimeRevocationError({
                ...serializeError(result.reason),
                type: 'WS_REVOCATION_DELIVERY_ERROR',
                operationId: directive.operationId,
                surface: PUBLIC_REALTIME_SURFACE,
            })
            return {
                accepted: false,
                error: REVOCATION_DELIVERY_FAILED_MESSAGE,
            }
        }

        if (!result.value.accepted) return result.value
    }

    return { accepted: true }
}

const recordDeliveryResult = async (input: {
    client: ReturnType<typeof dbClient>
    directive: TRealtimeRevocationDirective
    result: TRealtimeRevocationDeliveryResult
    surface: 'backoffice' | 'public'
}) => {
    try {
        await recordWebSocketRevocationDeliveryAttempt(input.client, {
            accepted: input.result.accepted,
            error: input.result.error,
            operationId: input.directive.operationId,
            organizationId: input.directive.organizationId,
            surface: input.surface,
        })
    } catch (error) {
        realtimeRevocationError({
            type: 'WS_REVOCATION_DELIVERY_RECORD_ERROR',
            operationId: input.directive.operationId,
            surface: input.surface,
            ...serializeError(error),
        })
    }
}

type TRealtimeRevocationDeliveryClientInput =
    | {
          database?: never
          deliveryClient?: ReturnType<typeof dbClient>
      }
    | {
          database: D1Database
          deliveryClient?: never
      }

export const createAndDeliverMembershipRealtimeRevocation = async (
    input: {
        client: ReturnType<typeof dbClient>
        mutation: TMembershipAuthorizationMutation
        namespace: DurableObjectNamespace<WebSocketBroker>
        operationId: string
        organizationId: string
        profile?: TRealtimeTopologyProfile
        reason: string
        remoteBroker?: TRealtimeRevocationBroker
        retainUntil?: Date
        userId: string
        waitUntil: (promise: Promise<unknown>) => void
    } & TRealtimeRevocationDeliveryClientInput,
) => {
    const profile = input.profile ?? PUBLIC_REALTIME_TOPOLOGY

    validateRealtimeTopologyCapabilities({
        capabilities: {
            remoteBroker: input.remoteBroker,
        },
        profile,
        surface: PUBLIC_REALTIME_SURFACE,
    })

    const created = await createMembershipWebSocketRevocation({
        client: input.client,
        destinations: getRealtimeRevocationDestinations(
            profile,
            PUBLIC_REALTIME_SURFACE,
        ),
        mutation: input.mutation,
        operationId: input.operationId,
        organizationId: input.organizationId,
        reason: input.reason,
        retainUntil: input.retainUntil,
        userId: input.userId,
    })
    const directive: TRealtimeRevocationDirective = {
        authorizationVersion: created.operation.revokedAuthorizationVersion,
        expiresAt: created.operation.retainUntil.getTime(),
        identityId: created.operation.userId,
        operationId: created.operation.id,
        organizationId: created.operation.organizationId,
    }
    const deliveryPromise = (async () => {
        const client = input.database
            ? dbClient(input.database)
            : (input.deliveryClient ?? input.client)

        const results = await Promise.all(
            getRealtimeRevocationDestinations(
                profile,
                PUBLIC_REALTIME_SURFACE,
            ).map(async (destination) => {
                let result: TRealtimeRevocationDeliveryResult

                try {
                    const rawResult =
                        destination.delivery === 'local'
                            ? await deliverPublicRealtimeRevocationLocally(
                                  input.namespace,
                                  directive,
                              )
                            : await input.remoteBroker!.deliverRealtimeRevocation(
                                  directive,
                              )
                    const parsedResult =
                        realtimeRevocationDeliveryResultSchema.safeParse(
                            rawResult,
                        )
                    result = parsedResult.success
                        ? parsedResult.data
                        : {
                              accepted: false,
                              error: 'INVALID_RPC_RESULT',
                          }
                } catch (error) {
                    realtimeRevocationError({
                        ...serializeError(error),
                        type: 'WS_REVOCATION_DELIVERY_ERROR',
                        operationId: directive.operationId,
                        surface: destination.surface,
                    })
                    result = {
                        accepted: false,
                        error: REVOCATION_DELIVERY_FAILED_MESSAGE,
                    }
                }

                await recordDeliveryResult({
                    client,
                    directive,
                    result,
                    surface: destination.surface,
                })

                return result
            }),
        )
        const failedDeliveryCount = results.filter(
            (result) => !result.accepted,
        ).length
        const entry = {
            type:
                failedDeliveryCount === 0
                    ? 'WS_REVOCATION_COMPLETED'
                    : 'WS_REVOCATION_PARTIAL_FAILURE',
            operationId: directive.operationId,
            deliveryCount: results.length,
            failedDeliveryCount,
        }

        if (failedDeliveryCount === 0) {
            console.log(JSON.stringify(entry))
        } else {
            realtimeRevocationError(entry)
        }
    })()

    try {
        input.waitUntil(deliveryPromise)
    } catch (error) {
        realtimeRevocationError({
            type: 'WS_REVOCATION_WAIT_UNTIL_ERROR',
            operationId: directive.operationId,
            ...serializeError(error),
        })
    }

    return created
}

export const recoverPublicRealtimeRevocations = async (input: {
    client: ReturnType<typeof dbClient>
    limit?: number
    namespace: DurableObjectNamespace<WebSocketBroker>
}) => {
    const purgedCount = await purgeExpiredWebSocketRevocations(input.client, {
        limit: input.limit ?? 25,
        surface: PUBLIC_REALTIME_SURFACE,
    })
    const deliveries = await listPendingWebSocketRevocationDeliveries(
        input.client,
        {
            limit: input.limit ?? 25,
            surface: PUBLIC_REALTIME_SURFACE,
        },
    )

    for (const delivery of deliveries) {
        const directive: TRealtimeRevocationDirective = {
            authorizationVersion: delivery.revokedAuthorizationVersion,
            expiresAt: delivery.retainUntil.getTime(),
            identityId: delivery.userId,
            operationId: delivery.operationId,
            organizationId: delivery.organizationId,
        }
        console.log(
            JSON.stringify({
                type: 'WS_REVOCATION_RETRY',
                operationId: directive.operationId,
                surface: delivery.surface,
            }),
        )
        const result = await deliverPublicRealtimeRevocationLocally(
            input.namespace,
            directive,
        )

        await recordDeliveryResult({
            client: input.client,
            directive,
            result,
            surface: delivery.surface,
        })
        console.log(
            JSON.stringify({
                type: result.accepted
                    ? 'WS_REVOCATION_COMPLETED'
                    : 'WS_REVOCATION_PARTIAL_FAILURE',
                operationId: directive.operationId,
                surface: delivery.surface,
            }),
        )
    }

    return {
        processedCount: deliveries.length,
        purgedCount,
    }
}
