import { createQuery, useQueryClient } from '@tanstack/svelte-query'

import { createTenantKey } from '$lib/states/session/tenant'
import {
    fetchActivityLogDetail,
    fetchActivityLogList,
    fetchActivityLogSummary,
    type ActivityLogListRequest,
} from './api'
import type { ActivityLogFilters, ActivityLogPage } from './types'

export function createActivityLogListQuery(
    scope: { readonly organizationSlug: string },
    options: { readonly request: ActivityLogListRequest },
) {
    const queryClient = useQueryClient()

    return createQuery(() => {
        const organizationSlug = scope.organizationSlug
        const cachedPage = findNewestTenantPage(queryClient, organizationSlug)

        return {
            enabled: Boolean(organizationSlug),
            initialData: cachedPage?.data,
            initialDataUpdatedAt: cachedPage?.updatedAt,
            placeholderData: (previousData, previousQuery) =>
                previousQuery?.queryKey[0] === organizationSlug
                    ? previousData
                    : undefined,
            refetchOnMount: 'always',
            staleTime: 0,
            queryKey: createTenantKey(
                organizationSlug,
                'activityLog',
                'readMany',
                options.request,
            ),
            queryFn: () => fetchActivityLogList(options.request),
        }
    })
}

export function createActivityLogSummaryQuery(
    scope: { readonly organizationSlug: string },
    options: { readonly filters: ActivityLogFilters },
) {
    return createQuery(() => ({
        enabled: Boolean(scope.organizationSlug),
        refetchOnMount: 'always',
        queryKey: createTenantKey(
            scope.organizationSlug,
            'activityLog',
            'summary',
            options.filters,
        ),
        queryFn: () => fetchActivityLogSummary(options.filters),
    }))
}

export function createActivityLogDetailQuery(
    scope: { readonly organizationSlug: string },
    options: { readonly publicId: string },
) {
    return createQuery(() => ({
        enabled: Boolean(scope.organizationSlug && options.publicId),
        queryKey: createTenantKey(
            scope.organizationSlug,
            'activityLog',
            'detail',
            options.publicId,
        ),
        queryFn: () => fetchActivityLogDetail(options.publicId),
    }))
}

function findNewestTenantPage(
    queryClient: ReturnType<typeof useQueryClient>,
    organizationSlug: string,
) {
    if (!organizationSlug) return undefined

    return queryClient
        .getQueryCache()
        .findAll({
            queryKey: createTenantKey(
                organizationSlug,
                'activityLog',
                'readMany',
            ),
        })
        .flatMap((query) => {
            const data = query.state.data
            return isActivityLogPage(data)
                ? [
                      {
                          data,
                          updatedAt: query.state.dataUpdatedAt,
                      },
                  ]
                : []
        })
        .sort((left, right) => right.updatedAt - left.updatedAt)[0]
}

function isActivityLogPage(value: unknown): value is ActivityLogPage {
    if (!value || typeof value !== 'object') return false
    return (
        'count' in value &&
        typeof value.count === 'number' &&
        'data' in value &&
        Array.isArray(value.data) &&
        'limit' in value &&
        typeof value.limit === 'number' &&
        'offset' in value &&
        typeof value.offset === 'number'
    )
}
