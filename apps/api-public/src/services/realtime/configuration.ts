import {
    builtInRealtimeRegistry,
    createRealtimeTargetAuthorizer,
    type TRealtimeTargetAuthorizationHandlers,
} from '@loanms/websocket/registry'
import {
    validateRealtimeTopologyCapabilities,
    type TRealtimeTopologyProfile,
} from '@loanms/websocket/topology'

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
    LOANMSPUB_DO_WSB_REMOTE_BOFC?: unknown
    LOANMSPUB_REALTIME_PUBLISHER_BOFC?: unknown
}

type TPublicRealtimeStartupEnvironment = {
    STATUS?: unknown
}

export const getPublicRealtimeCapabilities = (environment: object) => {
    const capabilities = environment as TPublicRealtimeCapabilityEnvironment

    return {
        realtimePublisher: capabilities.LOANMSPUB_REALTIME_PUBLISHER_BOFC,
        remoteBroker: capabilities.LOANMSPUB_DO_WSB_REMOTE_BOFC,
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
