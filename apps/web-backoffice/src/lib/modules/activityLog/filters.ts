import {
    auditTrailActions,
    auditTrailActorTypeSchema,
    auditTrailComponents,
    auditTrailEntityTypes,
} from '@loanms/validator/backoffice/auditTrail'

import { normalizeFilterRules } from '$lib/components/dataWorkspace/filtering'
import type {
    ActiveFilter,
    FilterFieldDefinition,
} from '$lib/components/dataWorkspace/types'
import { activityActionLabel, activityComponentLabel } from './config'
import type { ActivityLogFilters } from './types'

export const ACTIVITY_LOG_FILTER_DEFINITIONS = [
    {
        key: 'components',
        label: 'Module',
        options: auditTrailComponents.map((value) => ({
            label: activityComponentLabel(value),
            value,
        })),
    },
    {
        key: 'actions',
        label: 'Action',
        options: auditTrailActions.map((value) => ({
            label: activityActionLabel(value),
            value,
        })),
    },
    {
        key: 'actorTypes',
        label: 'Actor type',
        options: auditTrailActorTypeSchema.options.map((value) => ({
            label: activityComponentLabel(value),
            value,
        })),
    },
    {
        key: 'entityTypes',
        label: 'Record type',
        options: auditTrailEntityTypes.map((value) => ({
            label: activityComponentLabel(value),
            value,
        })),
    },
] as const satisfies readonly FilterFieldDefinition[]

export function normalizeActivityLogFilters(options: {
    activeFilters: readonly ActiveFilter[]
    dateFrom: string
    dateTo: string
    group: ActivityLogFilters['group']
    searchFilter: string
}) {
    const normalized = normalizeFilterRules(options.activeFilters)
    const dateFrom = toIsoDateTime(options.dateFrom)
    const dateTo = toIsoDateTime(options.dateTo, true)
    return {
        matchNone: normalized.matchNone,
        filters: {
            ...normalized.selections,
            ...(dateFrom ? { dateFrom } : {}),
            ...(dateTo ? { dateTo } : {}),
            group: options.group,
            ...(options.searchFilter
                ? { searchFilter: options.searchFilter }
                : {}),
        } as ActivityLogFilters,
    }
}

function toIsoDateTime(value: string, includeWholeMinute = false) {
    const timestamp = Date.parse(value)
    const isMinutePrecisionLocalValue = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(
        value,
    )
    return Number.isNaN(timestamp)
        ? undefined
        : new Date(
              timestamp +
                  (includeWholeMinute && isMinutePrecisionLocalValue
                      ? 59_999
                      : 0),
          ).toISOString()
}
