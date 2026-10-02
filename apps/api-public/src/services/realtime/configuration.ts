import {
    builtInRealtimeRegistry,
    createRealtimeTargetAuthorizer,
    type TRealtimeTargetAuthorizationHandlers,
} from '@hyperion/websocket/registry'
import {
    validateRealtimeTopologyCapabilities,
    type TRealtimeTopologyProfile,
} from '@hyperion/websocket/topology'

export const PUBLIC_REALTIME_SURFACE = 'public'

export const PUBLIC_REALTIME_TOPOLOGY = {
    kind: 'independent-surfaces',
} as const satisfies TRealtimeTopologyProfile

export const publicRealtimeRegistry = builtInRealtimeRegistry
const publicRealtimeTargetAuthorizationHandlers =
    {} satisfies TRealtimeTargetAuthorizationHandlers
export const authorizePublicRealtimeTarget = createRealtimeTargetAuthorizer(
    publicRealtimeRegistry,
    publicRealtimeTargetAuthorizationHandlers,
)

type TPublicRealtimeCapabilityEnvironment = {
    HYPERIONPUB_DO_WSB_REMOTE_BOFC?: unknown
    HYPERIONPUB_REALTIME_PUBLISHER_BOFC?: unknown
}

type TPublicRealtimeStartupEnvironment = {
    STATUS?: unknown
}

export const getPublicRealtimeCapabilities = (environment: object) => {
    const capabilities = environment as TPublicRealtimeCapabilityEnvironment

    return {
        realtimePublisher: capabilities.HYPERIONPUB_REALTIME_PUBLISHER_BOFC,
        remoteBroker: capabilities.HYPERIONPUB_DO_WSB_REMOTE_BOFC,
    }
}

export const validatePublicRealtimeConfiguration = (
    environment: object,
    profile: TRealtimeTopologyProfile = PUBLIC_REALTIME_TOPOLOGY,
) =>
    validateRealtimeTopologyCapabilities({
        capabilities: getPublicRealtimeCapabilities(environment),
        profile,
        surface: PUBLIC_REALTIME_SURFACE,
    })

export const validatePublicRealtimeStartupConfiguration = (
    environment: object,
    profile: TRealtimeTopologyProfile = PUBLIC_REALTIME_TOPOLOGY,
) => {
    const startupEnvironment = environment as TPublicRealtimeStartupEnvironment

    if (startupEnvironment.STATUS === 'down') return

    validatePublicRealtimeConfiguration(environment, profile)
}
