import { describe, expect, it } from 'vitest'

import {
    createActiveFilter,
    parseWorkspaceUrl,
    serializeWorkspaceUrl,
} from '$lib/components/dataWorkspace/filtering'
import {
    ACTIVITY_LOG_FILTER_DEFINITIONS,
    normalizeActivityLogFilters,
} from './filters'

describe.concurrent('activity log filters', () => {
    it('normalizes module, action, actor, record, date, and search filters', () => {
        const dateFrom = '2026-09-01T08:00'
        const expectedDateFrom = new Date(Date.parse(dateFrom)).toISOString()
        const dateTo = '2026-09-03T18:00'
        const expectedDateTo = new Date(
            Date.parse(dateTo) + 59_999,
        ).toISOString()
        const activeFilters = [
            createActiveFilter({
                field: 'components',
                operator: 'is',
                value: 'user.profile',
            }),
            createActiveFilter({
                field: 'actions',
                operator: 'is_not',
                value: 'delete',
            }),
            createActiveFilter({
                field: 'actorTypes',
                operator: 'is',
                value: 'user',
            }),
            createActiveFilter({
                field: 'entityTypes',
                operator: 'is',
                value: 'user_profile',
            }),
        ]

        expect(
            normalizeActivityLogFilters({
                activeFilters,
                dateFrom,
                dateTo,
                group: 'all',
                searchFilter: 'profile',
            }),
        ).toMatchObject({
            matchNone: false,
            filters: {
                actions: { exclude: ['delete'] },
                actorTypes: { include: ['user'] },
                components: { include: ['user.profile'] },
                dateFrom: expectedDateFrom,
                dateTo: expectedDateTo,
                entityTypes: { include: ['user_profile'] },
                group: 'all',
                searchFilter: 'profile',
            },
        })
    })

    it('detects contradictory filter rules', () => {
        const normalized = normalizeActivityLogFilters({
            activeFilters: [
                createActiveFilter({
                    field: 'actions',
                    operator: 'is',
                    value: 'update',
                }),
                createActiveFilter({
                    field: 'actions',
                    operator: 'is_not',
                    value: 'update',
                }),
            ],
            dateFrom: '2026-09-01T00:00',
            dateTo: '2026-09-03T00:00',
            group: 'all',
            searchFilter: '',
        })

        expect(normalized.matchNone).toBe(true)
    })

    it('round-trips filter and pagination state through URL parameters', () => {
        const filters = [
            createActiveFilter({
                field: 'components',
                operator: 'is',
                value: 'objectStorage.upload',
            }),
        ]
        const params = serializeWorkspaceUrl({
            filters,
            page: 3,
            pageSize: 50,
            parent: '',
            searchFilter: 'received',
            sortBy: 'name',
            sortOrder: 'desc',
        })
        const restored = parseWorkspaceUrl(
            params,
            ACTIVITY_LOG_FILTER_DEFINITIONS,
        )

        expect(restored).toMatchObject({
            filters,
            page: 3,
            pageSize: 50,
            searchFilter: 'received',
            sortOrder: 'desc',
        })
    })
})

// =============================================================================
// END OF BASE TEMPLATE TESTS - FORK-SPECIFIC TESTS MUST BE ADDED BELOW
// =============================================================================
