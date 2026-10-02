import type { Query } from '@tanstack/svelte-query'

export const EVENT_DRIVEN_QUERY_OPTIONS = {
    refetchOnMount: false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
    staleTime: Infinity,
} as const

/**
 * @description
 * Options for an event-driven query that revalidates whenever it becomes
 * active. Events refresh only the queries on screen, so an entry that was off
 * screen, such as a previous filter or a page left behind, may have missed
 * some. Its cached data shows until the response arrives. Unlike
 * `EVENT_DRIVEN_QUERY_OPTIONS`, it keeps mount refetches on. Spread it, then
 * override single options for a query that needs them.
 */
export const REVALIDATE_ON_ACTIVATION_QUERY_OPTIONS = {
    refetchOnMount: 'always',
    staleTime: 0,
} as const

export type TRealtimeQueryRecoveryMode = 'invalidate'

export type TRealtimeQueryOwnership = {
    organizationSlug: string
    owner: string
    recovery: TRealtimeQueryRecoveryMode
    stream: string
    target?: string
}

export type TRealtimeQueryMeta = {
    realtime: TRealtimeQueryOwnership
}

export type TRealtimeQueryMatch = {
    organizationSlug: string
    owner?: string
    stream: string
    target?: string
}

export function realtimeQueryMeta(
    ownership: TRealtimeQueryOwnership,
): TRealtimeQueryMeta {
    return {
        realtime: { ...ownership },
    }
}

/**
 * @description
 * Marks a query owned by the APP stream so gap and reconnect recovery
 * invalidates it. Use it for queries that only need recovery-time refresh,
 * such as catalog and settings lookups.
 */
export function appRealtimeQueryMeta(organizationSlug: string) {
    return realtimeQueryMeta({
        organizationSlug,
        owner: 'APP',
        recovery: 'invalidate',
        stream: 'APP',
    })
}

/**
 * @description
 * Marks an APP-owned query whose authoritative state changes with the APP
 * events listed in `EXTENSION_APP_REALTIME_INVALIDATION_EVENTS`. Only these
 * queries refresh on each listed event; other APP-owned queries refresh through
 * gap and reconnect recovery. The flag is independent of
 * `EVENT_DRIVEN_QUERY_OPTIONS`, which only disables mount and focus refetches.
 */
export function appRealtimeEventQueryMeta(organizationSlug: string) {
    return {
        ...appRealtimeQueryMeta(organizationSlug),
        realtimeEventDriven: true,
    }
}

/**
 * @description
 * Reports whether a query opted into per-event invalidation through
 * `appRealtimeEventQueryMeta`.
 */
export function isRealtimeEventDrivenQuery(query: Pick<Query, 'meta'>) {
    return query.meta?.realtimeEventDriven === true
}

export function isOwnedRealtimeQuery(
    query: Pick<Query, 'meta'>,
    match: TRealtimeQueryMatch,
) {
    const ownership = query.meta?.realtime

    if (typeof ownership !== 'object' || ownership === null) return false

    return (
        Reflect.get(ownership, 'organizationSlug') === match.organizationSlug &&
        Reflect.get(ownership, 'recovery') === 'invalidate' &&
        Reflect.get(ownership, 'stream') === match.stream &&
        (match.owner === undefined ||
            Reflect.get(ownership, 'owner') === match.owner) &&
        Reflect.get(ownership, 'target') === match.target
    )
}
