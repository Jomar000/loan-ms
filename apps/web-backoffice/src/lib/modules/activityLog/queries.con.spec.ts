import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
    cachedQueries: [] as Array<{
        queryKey: readonly unknown[]
        state: { data: unknown; dataUpdatedAt: number }
    }>,
    createQuery: vi.fn((factory: () => unknown) => factory()),
    fetchActivityLogList: vi.fn(),
}))

vi.mock('@tanstack/svelte-query', () => ({
    createQuery: mocks.createQuery,
    useQueryClient: () => ({
        getQueryCache: () => ({
            findAll: ({ queryKey }: { queryKey: readonly unknown[] }) =>
                mocks.cachedQueries.filter((query) =>
                    queryKey.every(
                        (segment, index) => query.queryKey[index] === segment,
                    ),
                ),
        }),
    }),
}))
vi.mock('./api', () => ({
    fetchActivityLogDetail: vi.fn(),
    fetchActivityLogList: mocks.fetchActivityLogList,
    fetchActivityLogSummary: vi.fn(),
}))

import {
    createActivityLogListQuery,
    createActivityLogSummaryQuery,
} from './queries'

describe('Activity Log query freshness', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mocks.cachedQueries = []
    })

    it('always refetches list and summary data when the workspace mounts', () => {
        const listQuery = createActivityLogListQuery(
            { organizationSlug: 'example' },
            {
                request: {
                    filters: {},
                    limit: 25,
                    offset: 0,
                    sortOrder: 'desc',
                },
            },
        )
        const summaryQuery = createActivityLogSummaryQuery(
            { organizationSlug: 'example' },
            { filters: {} },
        )

        expect(listQuery).toMatchObject({
            refetchOnMount: 'always',
            staleTime: 0,
        })
        expect(summaryQuery).toMatchObject({ refetchOnMount: 'always' })
    })

    it('reuses placeholder rows only within the active tenant', () => {
        const listQuery = createActivityLogListQuery(
            { organizationSlug: 'tenant-a' },
            {
                request: {
                    filters: {},
                    limit: 25,
                    offset: 0,
                    sortOrder: 'desc',
                },
            },
        ) as unknown as {
            placeholderData: (
                previousData: unknown,
                previousQuery?: { queryKey: readonly unknown[] },
            ) => unknown
        }
        const previousData = { data: [{ publicId: 'event-a' }] }

        expect(
            listQuery.placeholderData(previousData, {
                queryKey: [
                    'tenant-a',
                    'activityLog',
                    'readMany',
                ],
            }),
        ).toBe(previousData)
        expect(
            listQuery.placeholderData(previousData, {
                queryKey: [
                    'tenant-b',
                    'activityLog',
                    'readMany',
                ],
            }),
        ).toBeUndefined()
    })

    it('initializes a new list key from the newest valid same-tenant page', () => {
        const olderPage = {
            count: 1,
            data: [],
            limit: 25,
            offset: 0,
        }
        const newestPage = {
            count: 2,
            data: [],
            limit: 25,
            offset: 25,
        }
        mocks.cachedQueries = [
            {
                queryKey: [
                    'tenant-a',
                    'activityLog',
                    'readMany',
                    { offset: 0 },
                ],
                state: { data: olderPage, dataUpdatedAt: 100 },
            },
            {
                queryKey: [
                    'tenant-b',
                    'activityLog',
                    'readMany',
                    { offset: 0 },
                ],
                state: {
                    data: {
                        count: 99,
                        data: [],
                        limit: 25,
                        offset: 0,
                    },
                    dataUpdatedAt: 400,
                },
            },
            {
                queryKey: [
                    'tenant-a',
                    'activityLog',
                    'readMany',
                    { offset: 50 },
                ],
                state: { data: { malformed: true }, dataUpdatedAt: 300 },
            },
            {
                queryKey: [
                    'tenant-a',
                    'activityLog',
                    'readMany',
                    { offset: 25 },
                ],
                state: { data: newestPage, dataUpdatedAt: 200 },
            },
        ]

        const request = {
            filters: { searchFilter: 'new key' },
            limit: 25,
            offset: 50,
            sortOrder: 'desc' as const,
        }
        const listQuery = createActivityLogListQuery(
            { organizationSlug: 'tenant-a' },
            { request },
        ) as unknown as {
            initialData?: unknown
            initialDataUpdatedAt?: number
            queryFn: () => unknown
            refetchOnMount?: unknown
            staleTime?: number
        }

        expect(listQuery).toMatchObject({
            initialData: newestPage,
            initialDataUpdatedAt: 200,
            refetchOnMount: 'always',
            staleTime: 0,
        })

        listQuery.queryFn()
        expect(mocks.fetchActivityLogList).toHaveBeenCalledWith(request)
    })

    it('does not initialize a tenant from another tenant cache', () => {
        mocks.cachedQueries = [
            {
                queryKey: [
                    'tenant-a',
                    'activityLog',
                    'readMany',
                    {},
                ],
                state: {
                    data: { count: 1, data: [], limit: 25, offset: 0 },
                    dataUpdatedAt: 100,
                },
            },
        ]

        const listQuery = createActivityLogListQuery(
            { organizationSlug: 'tenant-b' },
            {
                request: {
                    filters: {},
                    limit: 25,
                    offset: 0,
                    sortOrder: 'desc',
                },
            },
        ) as unknown as { initialData?: unknown }

        expect(listQuery.initialData).toBeUndefined()
    })
})

// =============================================================================
// END OF BASE TEMPLATE TESTS - FORK-SPECIFIC TESTS MUST BE ADDED BELOW
// =============================================================================
