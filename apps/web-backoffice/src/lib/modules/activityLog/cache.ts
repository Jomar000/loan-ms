import type { QueryClient } from '@tanstack/svelte-query'

import { createTenantKey } from '$lib/states/session/tenant'

export async function invalidateActivityLogQueries(
    queryClient: QueryClient,
    organizationSlug: string,
) {
    await queryClient.invalidateQueries({
        queryKey: createTenantKey(organizationSlug, 'activityLog'),
    })
}
