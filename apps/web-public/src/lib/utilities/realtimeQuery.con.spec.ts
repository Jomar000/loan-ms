import {
    QueryClient,
    QueryObserver,
    type QueryObserverOptions,
} from '@tanstack/svelte-query'
import { describe, expect, it, vi } from 'vitest'

import {
    appRealtimeEventQueryMeta,
    appRealtimeQueryMeta,
    EVENT_DRIVEN_QUERY_OPTIONS,
    isOwnedRealtimeQuery,
    isRealtimeEventDrivenQuery,
    realtimeQueryMeta,
    REVALIDATE_ON_ACTIVATION_QUERY_OPTIONS,
} from './realtimeQuery'

const APP_QUERY_OWNERSHIP = {
    organizationSlug: 'example',
    owner: 'APP',
    recovery: 'invalidate',
    stream: 'APP',
} as const

/** Fetches an entry once, leaves it, then looks at the same entry again. */
async function countFetchesAcrossTwoViews(
    options: Omit<QueryObserverOptions, 'queryFn' | 'queryKey'>,
) {
    const client = new QueryClient()
    const queryFn = vi.fn(async () => 'value')
    const observe = () =>
        new QueryObserver(client, { ...options, queryFn, queryKey: ['entry'] })

    const leaveFirstView = observe().subscribe(() => {})
    await vi.waitFor(() => {
        expect(client.getQueryState(['entry'])?.status).toBe('success')
    })
    leaveFirstView()

    const leaveSecondView = observe().subscribe(() => {})
    await new Promise((resolve) => setTimeout(resolve))
    leaveSecondView()
    client.clear()

    return queryFn.mock.calls.length
}

describe('realtime query ownership', () => {
    it('provides opt-in event-driven query options', () => {
        expect(EVENT_DRIVEN_QUERY_OPTIONS).toEqual({
            refetchOnMount: false,
            refetchOnReconnect: false,
            refetchOnWindowFocus: false,
            staleTime: Infinity,
        })
    })

    it('provides opt-in options that revalidate a query whenever it becomes active', async () => {
        expect(REVALIDATE_ON_ACTIVATION_QUERY_OPTIONS).toEqual({
            refetchOnMount: 'always',
            staleTime: 0,
        })

        // An entry shown again revalidates; the event-driven options trust the
        // cache instead, and a spread override opts a single option back out.
        expect(
            await countFetchesAcrossTwoViews(
                REVALIDATE_ON_ACTIVATION_QUERY_OPTIONS,
            ),
        ).toBe(2)
        expect(
            await countFetchesAcrossTwoViews(EVENT_DRIVEN_QUERY_OPTIONS),
        ).toBe(1)
        expect(
            await countFetchesAcrossTwoViews({
                ...REVALIDATE_ON_ACTIVATION_QUERY_OPTIONS,
                refetchOnMount: false,
            }),
        ).toBe(1)
    })

    it('creates realtime query metadata', () => {
        expect(realtimeQueryMeta(APP_QUERY_OWNERSHIP)).toEqual({
            realtime: APP_QUERY_OWNERSHIP,
        })
    })

    it('marks recovery-only APP queries without the event-driven flag', () => {
        const query = { meta: appRealtimeQueryMeta('example') }

        expect(query.meta).toEqual({ realtime: APP_QUERY_OWNERSHIP })
        expect(isRealtimeEventDrivenQuery(query)).toBe(false)
    })

    it('marks event-driven APP queries that remain recovery-owned', () => {
        const query = { meta: appRealtimeEventQueryMeta('example') }

        expect(isRealtimeEventDrivenQuery(query)).toBe(true)
        expect(
            isOwnedRealtimeQuery(query, {
                organizationSlug: 'example',
                owner: 'APP',
                stream: 'APP',
            }),
        ).toBe(true)
    })

    it('treats queries without metadata as not event-driven', () => {
        expect(isRealtimeEventDrivenQuery({ meta: undefined })).toBe(false)
        expect(isRealtimeEventDrivenQuery({ meta: {} })).toBe(false)
    })

    it('matches tenant, recovery, stream, and optional owner', () => {
        const query = {
            meta: realtimeQueryMeta(APP_QUERY_OWNERSHIP),
        }
        const match = {
            organizationSlug: 'example',
            owner: 'APP',
            stream: 'APP',
        }

        expect(isOwnedRealtimeQuery(query, match)).toBe(true)
        expect(
            isOwnedRealtimeQuery(query, {
                ...match,
                organizationSlug: 'other',
            }),
        ).toBe(false)
        expect(
            isOwnedRealtimeQuery(query, { ...match, owner: 'FEATURE' }),
        ).toBe(false)
        expect(
            isOwnedRealtimeQuery(query, { ...match, owner: undefined }),
        ).toBe(true)
        expect(
            isOwnedRealtimeQuery(query, { ...match, stream: 'DEDICATED' }),
        ).toBe(false)
        expect(
            isOwnedRealtimeQuery(
                {
                    meta: {
                        realtime: {
                            ...APP_QUERY_OWNERSHIP,
                            recovery: 'manual',
                        },
                    },
                },
                match,
            ),
        ).toBe(false)
        expect(isOwnedRealtimeQuery({ meta: undefined }, match)).toBe(false)
    })

    it('matches optional targets exactly in both directions', () => {
        const targetlessQuery = {
            meta: realtimeQueryMeta(APP_QUERY_OWNERSHIP),
        }
        const targetedQuery = {
            meta: realtimeQueryMeta({
                ...APP_QUERY_OWNERSHIP,
                target: 'resource-a',
            }),
        }
        const targetlessMatch = {
            organizationSlug: 'example',
            owner: 'APP',
            stream: 'APP',
        }

        expect(isOwnedRealtimeQuery(targetlessQuery, targetlessMatch)).toBe(
            true,
        )
        expect(isOwnedRealtimeQuery(targetedQuery, targetlessMatch)).toBe(false)
        expect(
            isOwnedRealtimeQuery(targetlessQuery, {
                ...targetlessMatch,
                target: 'resource-a',
            }),
        ).toBe(false)
        expect(
            isOwnedRealtimeQuery(targetedQuery, {
                ...targetlessMatch,
                target: 'resource-a',
            }),
        ).toBe(true)
        expect(
            isOwnedRealtimeQuery(targetedQuery, {
                ...targetlessMatch,
                target: 'resource-b',
            }),
        ).toBe(false)
    })
})

// =============================================================================
// END OF BASE TEMPLATE TESTS - FORK-SPECIFIC TESTS MUST BE ADDED BELOW
// =============================================================================
