export const WORKSPACE_PAGE_SIZES = [
    10,
    25,
    50,
    100,
] as const

export const DEFAULT_WORKSPACE_PAGE_SIZE = 25

export function isWorkspacePageSize(
    value: number,
): value is (typeof WORKSPACE_PAGE_SIZES)[number] {
    return WORKSPACE_PAGE_SIZES.some((pageSize) => pageSize === value)
}
