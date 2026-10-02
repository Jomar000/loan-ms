import { describe, expect, it } from 'vitest'

import {
    createActiveFilter,
    getManualFilterChips,
    getQuickFilterGroups,
    groupActiveFilters,
    normalizeFilterRules,
    parseWorkspaceUrl,
    serializeWorkspaceUrl,
} from './filtering'
import type { FilterFieldDefinition } from './types'

const definitions: FilterFieldDefinition[] = [
    {
        key: 'states',
        label: 'Record state',
        options: [
            { label: 'Active', value: 'ACTIVE' },
            { label: 'Inactive', value: 'INACTIVE' },
        ],
    },
    {
        key: 'parents',
        label: 'Parent',
        validateValue: (value) => value.startsWith('parent-'),
    },
]

describe('data workspace filtering', () => {
    it('normalizes OR includes and conjunctive exclusions by category', () => {
        const normalized = normalizeFilterRules([
            createActiveFilter({
                field: 'states',
                operator: 'is',
                value: 'ACTIVE',
            }),
            createActiveFilter({
                field: 'states',
                operator: 'is',
                value: 'INACTIVE',
            }),
            createActiveFilter({
                field: 'parents',
                operator: 'is_not',
                value: 'parent-1',
            }),
        ])

        expect(normalized).toEqual({
            matchNone: false,
            selections: {
                parents: { exclude: ['parent-1'] },
                states: {
                    include: [
                        'ACTIVE',
                        'INACTIVE',
                    ],
                },
            },
        })
    })

    it('returns match-none for contradictory include and exclude rules', () => {
        const normalized = normalizeFilterRules([
            createActiveFilter({
                field: 'states',
                operator: 'is',
                value: 'ACTIVE',
            }),
            createActiveFilter({
                field: 'states',
                operator: 'is_not',
                value: 'ACTIVE',
            }),
        ])

        expect(normalized.matchNone).toBe(true)
    })

    it('groups chips by category while retaining every rule', () => {
        const groups = groupActiveFilters(
            [
                createActiveFilter({
                    field: 'states',
                    operator: 'is',
                    value: 'ACTIVE',
                }),
                createActiveFilter({
                    field: 'states',
                    operator: 'is_not',
                    value: 'INACTIVE',
                }),
            ],
            definitions,
        )

        expect(groups).toHaveLength(1)
        expect(groups[0]).toMatchObject({ label: 'Record state' })
        expect(groups[0]?.filters).toHaveLength(2)
    })

    it('separates quick presets from grouped manual filter chips', () => {
        const filters = [
            createActiveFilter({
                field: 'states',
                label: 'Active',
                operator: 'is',
                quickFilter: 'ACTIVE',
                value: 'ACTIVE',
            }),
            createActiveFilter({
                field: 'states',
                label: 'Inactive',
                operator: 'is_not',
                value: 'INACTIVE',
            }),
        ]

        expect(getQuickFilterGroups(filters)).toEqual([
            {
                filterIds: ['states:is:ACTIVE'],
                id: 'quick-ACTIVE',
                label: 'Active',
            },
        ])
        expect(getManualFilterChips(filters, definitions)).toEqual([
            {
                filterIds: ['states:is_not:INACTIVE'],
                id: 'manual-states',
                label: 'Record state: not Inactive',
            },
        ])
    })

    it('round-trips valid URL state and discards invalid filters', () => {
        const params = new URLSearchParams()
        params.append('filter', 'states:is:ACTIVE')
        params.append('filter', 'states:is:UNKNOWN')
        params.append('filter', 'unknown:is:value')
        params.append('filter', 'parents:is:parent-1')
        params.set('page', '3')
        params.set('pageSize', '50')
        params.set('searchFilter', 'Acme')
        params.set('sortBy', 'updatedAt')
        params.set('sortOrder', 'desc')
        params.set('parent', 'parent-1')

        const parsed = parseWorkspaceUrl(params, definitions)
        const serialized = serializeWorkspaceUrl(parsed)

        expect(parsed.filters).toHaveLength(2)
        expect(parsed).toMatchObject({
            page: 3,
            pageSize: 50,
            parent: 'parent-1',
            searchFilter: 'Acme',
            sortBy: 'updatedAt',
            sortOrder: 'desc',
        })
        expect(serialized.getAll('filter')).toEqual([
            'states:is:ACTIVE',
            'parents:is:parent-1',
        ])
    })
})

// =============================================================================
// END OF BASE TEMPLATE TESTS - FORK-SPECIFIC TESTS MUST BE ADDED BELOW
// =============================================================================
