type TTenantMutationClient = {
    isMutating(filters: { mutationKey: readonly unknown[] }): number
}

export function createTenantKey<TSegments extends readonly unknown[]>(
    organizationSlug: string,
    ...segments: TSegments
): readonly [
    string,
    ...TSegments,
] {
    return [
        organizationSlug,
        ...segments,
    ]
}

export function hasActiveTenantMutations(
    queryClient: TTenantMutationClient,
    organizationSlug: string,
) {
    if (!organizationSlug) return false

    return (
        queryClient.isMutating({
            mutationKey: createTenantKey(organizationSlug),
        }) > 0
    )
}
