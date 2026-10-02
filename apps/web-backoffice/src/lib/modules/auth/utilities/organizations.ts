import { createInfiniteQuery, createMutation } from '@tanstack/svelte-query'

import { authClient } from '$lib/clients'

export function createOrganizationListQuery(options: {
    readonly enabled: boolean
    readonly searchFilter: string
}) {
    return createInfiniteQuery(() => ({
        enabled: options.enabled,
        queryKey: [
            'auth',
            'organizations',
            { searchFilter: options.searchFilter },
        ],
        initialPageParam: 0,
        queryFn: async ({ pageParam }) => {
            const input = {
                filters: options.searchFilter
                    ? { searchFilter: options.searchFilter }
                    : {},
                limit: 50,
                offset: pageParam,
                sortOrder: 'asc' as const,
            }
            const response = await authClient.organization.readMany.$query({
                json: input,
            })
            const responseJson = await response.json()

            if (!responseJson.success) {
                throw new Error(responseJson.error.message)
            }

            const { data, count, limit, offset } = responseJson
            return { data, count, limit, offset }
        },
        getNextPageParam: (lastPage) => {
            const nextOffset = lastPage.offset + lastPage.limit
            return nextOffset < lastPage.count ? nextOffset : undefined
        },
    }))
}

export function createSetActiveOrganizationMutation() {
    return createMutation(() => ({
        mutationKey: [
            'auth',
            'organization',
            'setActive',
        ],
        mutationFn: async (organizationSlug: string) => {
            const response = await authClient.organization.setActive.$post({
                json: { organizationSlug },
            })
            const responseJson = await response.json()

            if (!responseJson.success) {
                throw new Error(responseJson.error.message)
            }
        },
    }))
}
