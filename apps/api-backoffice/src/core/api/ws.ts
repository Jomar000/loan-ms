import { catalog, type TErrorDefinition } from '@loanms/errors'
import {
    hasRealtimeWireVersion,
    REALTIME_WIRE_VERSION,
} from '@loanms/websocket/protocol'
import {
    APP_REALTIME_STREAM,
    resolveRealtimeAdmission,
} from '@loanms/websocket/registry'
import { setRealtimeTransportHeaders } from '@loanms/websocket/server'
import {
    createRealtimeLeafObjectName,
    createRealtimeLeafProbeOrder,
    getSafeOrganizationIdentity,
    getWebSocketAdmissionFailure,
    REALTIME_STORAGE_VERSION,
    type TRealtimeBrokerScope,
    type TRealtimeTransportAttachment,
} from '@loanms/websocket/transport'
import { Hono, type Context } from 'hono'

import {
    authorizeBackofficeRealtimeTarget,
    backofficeRealtimeRegistry,
} from '../../services/realtime/configuration.js'
import type { THonoInstance } from '../../types.js'
import {
    apiResponseErrorWrapper,
    getActiveOrganizationId,
    parseAuthRoles,
} from '../../utilities/helpers.js'
import { isAuthorized } from '../middleware/isAuthorized.js'

type TRealtimeAdmissionErrorCode = Exclude<
    Awaited<ReturnType<typeof resolveRealtimeAdmission>>,
    { success: true }
>['code']

const realtimeAdmissionErrors = {
    REALTIME_TARGET_FORBIDDEN: catalog.realtimeTargetForbidden,
    REALTIME_TARGET_INVALID: catalog.realtimeTargetInvalid,
    REALTIME_TARGET_REQUIRED: catalog.realtimeTargetRequired,
    REALTIME_TARGET_UNEXPECTED: catalog.realtimeTargetUnexpected,
    REALTIME_UNKNOWN_STREAM: catalog.realtimeUnknownStream,
} as const satisfies Record<TRealtimeAdmissionErrorCode, TErrorDefinition>

const realtimeAdmissionError = (
    ctx: Context<THonoInstance>,
    code: TRealtimeAdmissionErrorCode,
) => {
    return apiResponseErrorWrapper(ctx, realtimeAdmissionErrors[code])
}

const connectRealtime = async (
    ctx: Context<THonoInstance>,
    streamName: string,
    target?: string,
) => {
    if (ctx.req.header('Upgrade') !== 'websocket') {
        return apiResponseErrorWrapper(ctx, catalog.websocketUpgradeRequired)
    }

    if (
        !hasRealtimeWireVersion(
            ctx.req.header('Sec-WebSocket-Protocol') ?? null,
        )
    ) {
        return apiResponseErrorWrapper(ctx, catalog.websocketProtocolRequired)
    }

    const session = ctx.get('session')!
    const user = ctx.get('user')!
    const authorizationVersion =
        ctx.get('sessionAccess')?.websocketAuthorizationVersion

    if (!authorizationVersion) {
        return apiResponseErrorWrapper(ctx, catalog.realtimeMembershipRequired)
    }

    const context = {
        authorizationVersion,
        connectionId: crypto.randomUUID(),
        identityId: user.id,
        organizationId: getActiveOrganizationId(ctx),
        roles: parseAuthRoles(ctx.get('role')),
        sessionExpiresAt: session.expiresAt.getTime(),
        surface: 'backoffice' as const,
    }
    const admission = await resolveRealtimeAdmission({
        context,
        registry: backofficeRealtimeRegistry,
        stream: streamName,
        target,
        authorizeTarget: authorizeBackofficeRealtimeTarget,
    })

    if (!admission.success) {
        return realtimeAdmissionError(ctx, admission.code)
    }

    const brokerScope: TRealtimeBrokerScope = {
        organizationId: context.organizationId,
        storageVersion: REALTIME_STORAGE_VERSION,
        stream: admission.stream.wireName,
        surface: context.surface,
    }
    const probeOrder = createRealtimeLeafProbeOrder(
        brokerScope,
        context.connectionId,
    )
    const namespace = ctx.get('doWssClient')
    let fullLeafCount = 0
    let unavailableLeafCount = 0

    for (const shardIndex of probeOrder) {
        const attachment: TRealtimeTransportAttachment = {
            ...brokerScope,
            authorizationVersion: context.authorizationVersion,
            topology: 'leaf',
            shardIndex,
            connectionId: context.connectionId,
            identityId: context.identityId,
            roles: context.roles,
            sessionExpiresAt: context.sessionExpiresAt,
            target: admission.target,
            wireVersion: REALTIME_WIRE_VERSION,
        }
        const headers = new Headers(ctx.req.raw.headers)
        setRealtimeTransportHeaders(headers, attachment)

        try {
            const response = await namespace
                .getByName(
                    createRealtimeLeafObjectName(brokerScope, shardIndex),
                )
                .fetch(new Request(ctx.req.raw, { headers }))

            if (response.status === 101) {
                console.log(
                    JSON.stringify({
                        type: 'WS_ADMISSION_ACCEPTED',
                        organization: getSafeOrganizationIdentity(
                            context.organizationId,
                        ),
                        stream: admission.stream.wireName,
                        surface: context.surface,
                        shardIndex,
                    }),
                )
                return response
            }

            if (response.headers.get('X-WS-Admission') === 'full') {
                fullLeafCount += 1
                console.log(
                    JSON.stringify({
                        type: 'WS_ADMISSION_FULL',
                        organization: getSafeOrganizationIdentity(
                            context.organizationId,
                        ),
                        stream: admission.stream.wireName,
                        surface: context.surface,
                        shardIndex,
                    }),
                )
            } else {
                unavailableLeafCount += 1
            }
        } catch {
            unavailableLeafCount += 1
        }
    }

    const failure = getWebSocketAdmissionFailure(
        fullLeafCount,
        unavailableLeafCount,
    )
    console.error(
        JSON.stringify({
            type: 'WS_ADMISSION_EXHAUSTED',
            code: failure.code,
            organization: getSafeOrganizationIdentity(context.organizationId),
            stream: admission.stream.wireName,
            surface: context.surface,
            fullLeafCount,
            unavailableLeafCount,
        }),
    )

    return apiResponseErrorWrapper(
        ctx,
        failure.code === 'WEBSOCKET_CAPACITY_UNAVAILABLE'
            ? catalog.websocketCapacityUnavailable
            : catalog.websocketShardUnavailable,
    )
}

const realtimeAuthorization = isAuthorized({
    ws: ['listen'],
})

export const wsRoute = new Hono<THonoInstance>()
    .get('/app', realtimeAuthorization, (ctx) =>
        connectRealtime(ctx, APP_REALTIME_STREAM),
    )
    .get('/:stream/:target', realtimeAuthorization, (ctx) =>
        connectRealtime(ctx, ctx.req.param('stream'), ctx.req.param('target')),
    )

export default wsRoute
