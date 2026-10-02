import { DEFAULT_WORKSPACE_PAGE_SIZE, isWorkspacePageSize } from './constants'
import type {
    ActiveFilter,
    FilterChip,
    FilterChipGroup,
    FilterFieldDefinition,
    FilterOperator,
    NormalizedFilterSelection,
    ParsedWorkspaceUrlState,
} from './types'

const SORT_FIELDS = new Set([
    'name',
    'code',
    'sku',
    'item',
    'size',
    'quantity',
    'updatedAt',
])

export function createActiveFilter(options: {
    field: string
    label?: string
    operator: FilterOperator
    quickFilter?: string
    value: string
}): ActiveFilter {
    return {
        ...options,
        id: `${options.field}:${options.operator}:${options.value}`,
    }
}

export function groupActiveFilters(
    filters: readonly ActiveFilter[],
    definitions: readonly FilterFieldDefinition[],
): FilterChipGroup[] {
    const definitionsByKey = new Map(
        definitions.map((definition) => [
            definition.key,
            definition,
        ]),
    )
    const groups = new Map<string, ActiveFilter[]>()

    for (const filter of filters) {
        const group = groups.get(filter.field) ?? []
        group.push(filter)
        groups.set(filter.field, group)
    }

    return Array.from(
        groups,
        ([
            field,
            groupedFilters,
        ]) => ({
            field,
            label: definitionsByKey.get(field)?.label ?? field,
            filters: groupedFilters,
        }),
    )
}

export function getManualFilters(filters: readonly ActiveFilter[]) {
    return filters.filter((filter) => !filter.quickFilter)
}

export function getQuickFilterGroups(
    filters: readonly ActiveFilter[],
): FilterChip[] {
    const groups = new Map<string, FilterChip>()

    for (const filter of filters) {
        if (!filter.quickFilter) continue

        const group = groups.get(filter.quickFilter)
        if (group) {
            group.filterIds.push(filter.id)
            continue
        }

        groups.set(filter.quickFilter, {
            filterIds: [filter.id],
            id: `quick-${filter.quickFilter}`,
            label: filter.label ?? 'Quick filter',
        })
    }

    return [...groups.values()]
}

export function getManualFilterChips(
    filters: readonly ActiveFilter[],
    definitions: readonly FilterFieldDefinition[],
): FilterChip[] {
    const manualFilters = getManualFilters(filters)
    const definitionsByKey = new Map(
        definitions.map((definition) => [
            definition.key,
            definition,
        ]),
    )
    const filtersByField = new Map<string, ActiveFilter[]>()

    for (const filter of manualFilters) {
        const fieldFilters = filtersByField.get(filter.field)
        if (fieldFilters) {
            fieldFilters.push(filter)
            continue
        }

        filtersByField.set(filter.field, [filter])
    }

    return [...filtersByField.entries()].map(
        ([
            field,
            fieldFilters,
        ]) => ({
            filterIds: fieldFilters.map((filter) => filter.id),
            id: `manual-${field}`,
            label: getManualFilterChipLabel(fieldFilters, definitionsByKey),
        }),
    )
}

export function getActiveFilterCategoryCount(filters: readonly ActiveFilter[]) {
    return new Set(filters.map((filter) => filter.field)).size
}

export function removeFiltersById(
    filters: readonly ActiveFilter[],
    ids: readonly string[],
) {
    const idsToRemove = new Set(ids)

    return filters.filter((filter) => !idsToRemove.has(filter.id))
}

export function normalizeFilterRules(filters: readonly ActiveFilter[]) {
    const selections: Record<string, NormalizedFilterSelection> = {}
    let matchNone = false

    for (const filter of filters) {
        const selection = selections[filter.field] ?? {}
        const target = filter.operator === 'is' ? 'include' : 'exclude'
        const values = selection[target] ?? []

        if (!values.includes(filter.value)) values.push(filter.value)
        selection[target] = values
        selections[filter.field] = selection
    }

    for (const selection of Object.values(selections)) {
        if (
            selection.include?.some((value) =>
                selection.exclude?.includes(value),
            )
        ) {
            matchNone = true
            break
        }
    }

    return { matchNone, selections }
}

export function parseWorkspaceUrl(
    searchParams: URLSearchParams,
    definitions: readonly FilterFieldDefinition[],
): ParsedWorkspaceUrlState {
    const definitionsByKey = new Map(
        definitions.map((definition) => [
            definition.key,
            definition,
        ]),
    )
    const filters = searchParams
        .getAll('filter')
        .map(parseFilterParameter)
        .flatMap((filter): ActiveFilter[] => {
            if (!filter) return []

            const definition = definitionsByKey.get(filter.field)
            if (!definition) return []

            if (definition.validateValue) {
                return definition.validateValue(filter.value) ? [filter] : []
            }

            if (definition.options) {
                const option = definition.options.find(
                    (candidate) => candidate.value === filter.value,
                )
                return option ? [{ ...filter, label: option.label }] : []
            }

            return [filter]
        })
    const page = parsePositiveInteger(searchParams.get('page'), 1)
    const requestedPageSize = parsePositiveInteger(
        searchParams.get('pageSize'),
        DEFAULT_WORKSPACE_PAGE_SIZE,
    )
    const requestedSortBy = searchParams.get('sortBy') ?? 'name'
    const requestedSortOrder = searchParams.get('sortOrder')

    return {
        filters: deduplicateFilters(filters),
        page,
        pageSize: isWorkspacePageSize(requestedPageSize)
            ? requestedPageSize
            : DEFAULT_WORKSPACE_PAGE_SIZE,
        parent: searchParams.get('parent') ?? '',
        searchFilter: searchParams.get('searchFilter') ?? '',
        sortBy: SORT_FIELDS.has(requestedSortBy)
            ? (requestedSortBy as ParsedWorkspaceUrlState['sortBy'])
            : 'name',
        sortOrder: requestedSortOrder === 'desc' ? 'desc' : 'asc',
    }
}

export function serializeWorkspaceUrl(
    state: ParsedWorkspaceUrlState,
): URLSearchParams {
    const searchParams = new URLSearchParams()

    if (state.searchFilter) {
        searchParams.set('searchFilter', state.searchFilter)
    }
    for (const filter of state.filters) {
        searchParams.append(
            'filter',
            `${filter.field}:${filter.operator}:${filter.value}`,
        )
    }
    if (state.page > 1) searchParams.set('page', String(state.page))
    if (state.pageSize !== DEFAULT_WORKSPACE_PAGE_SIZE) {
        searchParams.set('pageSize', String(state.pageSize))
    }
    if (state.sortBy !== 'name') searchParams.set('sortBy', state.sortBy)
    if (state.sortOrder !== 'asc') {
        searchParams.set('sortOrder', state.sortOrder)
    }
    if (state.parent) searchParams.set('parent', state.parent)

    return searchParams
}

export function replaceFilterCategory(
    filters: readonly ActiveFilter[],
    field: string,
    replacements: readonly ActiveFilter[],
) {
    return [
        ...filters.filter((filter) => filter.field !== field),
        ...replacements,
    ]
}

function deduplicateFilters(filters: readonly ActiveFilter[]) {
    return Array.from(
        new Map(
            filters.map((filter) => [
                filter.id,
                filter,
            ]),
        ).values(),
    )
}

function getManualFilterChipLabel(
    filters: ActiveFilter[],
    definitionsByKey: Map<string, FilterFieldDefinition>,
) {
    const firstFilter = filters[0]
    if (!firstFilter) return 'Filter'

    const definition = definitionsByKey.get(firstFilter.field)
    const includedLabels = filters
        .filter((filter) => filter.operator === 'is')
        .map((filter) => getFilterValueLabel(filter, definitionsByKey))
    const excludedLabels = filters
        .filter((filter) => filter.operator === 'is_not')
        .map((filter) => `not ${getFilterValueLabel(filter, definitionsByKey)}`)
    const valuesLabel = [
        includedLabels.join(' or '),
        excludedLabels.join(' and '),
    ]
        .filter(Boolean)
        .join(' · ')

    return `${definition?.label ?? 'Filter'}: ${valuesLabel}`
}

function getFilterValueLabel(
    filter: ActiveFilter,
    definitionsByKey: Map<string, FilterFieldDefinition>,
) {
    const definition = definitionsByKey.get(filter.field)

    return (
        filter.label ??
        definition?.options?.find((option) => option.value === filter.value)
            ?.label ??
        filter.value
    )
}

function parseFilterParameter(parameter: string): ActiveFilter | null {
    const [
        field,
        operator,
        ...valueParts
    ] = parameter.split(':')
    const value = valueParts.join(':')

    if (!field || !value || (operator !== 'is' && operator !== 'is_not')) {
        return null
    }

    return createActiveFilter({ field, operator, value })
}

function parsePositiveInteger(value: string | null, fallback: number) {
    if (!value) return fallback

    const parsed = Number.parseInt(value, 10)
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}
