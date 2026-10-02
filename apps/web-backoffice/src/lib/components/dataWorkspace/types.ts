export type FilterOperator = 'is' | 'is_not'

export interface FilterOption {
    label: string
    value: string
}

export interface FilterFieldDefinition {
    key: string
    label: string
    options?: readonly FilterOption[]
    asyncOptionProvider?: (search: string) => Promise<FilterOption[]>
    validateValue?: (value: string) => boolean
}

export interface ActiveFilter {
    id: string
    field: string
    operator: FilterOperator
    value: string
    label?: string
    quickFilter?: string
}

export interface FilterChipGroup {
    field: string
    label: string
    filters: ActiveFilter[]
}

export interface FilterChip {
    filterIds: string[]
    id: string
    label: string
}

export interface NormalizedFilterSelection {
    exclude?: string[]
    include?: string[]
}

export interface ParsedWorkspaceUrlState {
    filters: ActiveFilter[]
    page: number
    pageSize: number
    parent: string
    searchFilter: string
    sortBy: 'name' | 'code' | 'sku' | 'item' | 'size' | 'quantity' | 'updatedAt'
    sortOrder: 'asc' | 'desc'
}
