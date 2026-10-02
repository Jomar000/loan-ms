import type {
    TRealtimeRevocationDestination,
    TRealtimeSurface,
    TRealtimeTopologyCapabilities,
    TRealtimeTopologyProfile,
} from './types.js'

export { REALTIME_SURFACES } from './constants.js'
export {
    realtimeSurfaceSchema,
    realtimeTopologyProfileSchema,
} from './schemas.js'
export type {
    TRealtimeRevocationDestination,
    TRealtimeSurface,
    TRealtimeTopologyCapabilities,
    TRealtimeTopologyProfile,
} from './types.js'

const getPeerSurface = (surface: TRealtimeSurface): TRealtimeSurface =>
    surface === 'public' ? 'backoffice' : 'public'

const isSharedAuthorizationProfile = (profile: TRealtimeTopologyProfile) =>
    profile.kind === 'shared-auth-security-only' ||
    profile.kind === 'shared-auth-events'

const assertSurfaceIsEnabled = (
    profile: TRealtimeTopologyProfile,
    surface: TRealtimeSurface,
) => {
    if (profile.kind === 'local-only' && profile.surface !== surface) {
        throw new Error(
            `Realtime topology "local-only" does not enable the "${surface}" surface.`,
        )
    }
}

export const getRealtimeRevocationDestinations = (
    profile: TRealtimeTopologyProfile,
    sourceSurface: TRealtimeSurface,
): TRealtimeRevocationDestination[] => {
    assertSurfaceIsEnabled(profile, sourceSurface)

    const destinations: TRealtimeRevocationDestination[] = [
        {
            delivery: 'local',
            surface: sourceSurface,
        },
    ]

    if (isSharedAuthorizationProfile(profile)) {
        destinations.push({
            delivery: 'remote',
            surface: getPeerSurface(sourceSurface),
        })
    }

    return destinations
}

export const getRealtimeEventDestinations = (
    profile: TRealtimeTopologyProfile,
    sourceSurface: TRealtimeSurface,
): TRealtimeSurface[] => {
    assertSurfaceIsEnabled(profile, sourceSurface)

    if (profile.kind !== 'shared-auth-events') return []

    if (
        profile.direction === 'bidirectional' ||
        (profile.direction === 'public-to-backoffice' &&
            sourceSurface === 'public') ||
        (profile.direction === 'backoffice-to-public' &&
            sourceSurface === 'backoffice')
    ) {
        return [getPeerSurface(sourceSurface)]
    }

    return []
}

export const validateRealtimeTopologyCapabilities = (input: {
    capabilities?: TRealtimeTopologyCapabilities
    profile: TRealtimeTopologyProfile
    surface: TRealtimeSurface
}) => {
    assertSurfaceIsEnabled(input.profile, input.surface)

    const capabilities = input.capabilities ?? {}

    if (
        isSharedAuthorizationProfile(input.profile) &&
        (capabilities.remoteBroker === undefined ||
            capabilities.remoteBroker === null)
    ) {
        throw new Error(
            `Realtime topology "${input.profile.kind}" requires a remote broker capability for the "${input.surface}" surface.`,
        )
    }

    if (
        getRealtimeEventDestinations(input.profile, input.surface).length > 0 &&
        (capabilities.realtimePublisher === undefined ||
            capabilities.realtimePublisher === null)
    ) {
        throw new Error(
            `Realtime topology "${input.profile.kind}" requires a realtime publisher capability for the "${input.surface}" surface.`,
        )
    }
}
