import {
    builtInRealtimeRegistry,
    createRealtimeTargetAuthorizer,
    type TRealtimeTargetAuthorizationHandlers,
} from '@hyperion/websocket/registry'
import {
    validateRealtimeTopologyCapabilities,
    type TRealtimeTopologyProfile,
} from '@hyperion/websocket/topology'

export const BACKOFFICE_REALTIME_SURFACE = 'backoffice'

export const BACKOFFICE_REALTIME_TOPOLOGY = {
    kind: 'independent-surfaces',
} as const satisfies TRealtimeTopologyProfile

export const backofficeRealtimeRegistry = builtInRealtimeRegistry
const backofficeRealtimeTargetAuthorizationHandlers =
    {} satisfies TRealtimeTargetAuthorizationHandlers
export const authorizeBackofficeRealtimeTarget = createRealtimeTargetAuthorizer(
    backofficeRealtimeRegistry,
    backofficeRealtimeTargetAuthorizationHandlers,
)

type TBackofficeRealtimeCapabilityEnvironment = {
    HYPERIONBOFC_DO_WSB_REMOTE_PUB?: unknown
    HYPERIONBOFC_REALTIME_PUBLISHER_PUB?: unknown
}

type TBackofficeRealtimeStartupEnvironment = {
    STATUS?: unknown
}

export const getBackofficeRealtimeCapabilities = (environment: object) => {
    const capabilities = environment as TBackofficeRealtimeCapabilityEnvironment

    return {
        realtimePublisher: capabilities.HYPERIONBOFC_REALTIME_PUBLISHER_PUB,
        remoteBroker: capabilities.HYPERIONBOFC_DO_WSB_REMOTE_PUB,
    }
}

export const validateBackofficeRealtimeConfiguration = (
    environment: object,
    profile: TRealtimeTopologyProfile = BACKOFFICE_REALTIME_TOPOLOGY,
) =>
    validateRealtimeTopologyCapabilities({
        capabilities: getBackofficeRealtimeCapabilities(environment),
        profile,
        surface: BACKOFFICE_REALTIME_SURFACE,
    })

export const validateBackofficeRealtimeStartupConfiguration = (
    environment: object,
    profile: TRealtimeTopologyProfile = BACKOFFICE_REALTIME_TOPOLOGY,
) => {
    const startupEnvironment =
        environment as TBackofficeRealtimeStartupEnvironment

    if (startupEnvironment.STATUS === 'down') return

    validateBackofficeRealtimeConfiguration(environment, profile)
}
