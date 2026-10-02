import type { TAuditJsonValue, TAuditRecord } from '@hyperion/database/d1'
import { AppError, catalog } from '@hyperion/errors'
import {
    auditTrailActionSchema,
    auditTrailActorTypeSchema,
    auditTrailComponentSchema,
    auditTrailDetailInputSchema,
    auditTrailEntityTypeSchema,
    auditTrailGroupDefinitions,
    auditTrailReadManyInputSchema,
    auditTrailSummaryInputSchema,
    type auditTrailFiltersSchema,
    type TAuditGroup,
} from '@hyperion/validator/backoffice/auditTrail'
import {
    and,
    asc,
    count,
    desc,
    eq,
    gte,
    inArray,
    lte,
    notInArray,
    or,
    sql,
} from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'
import type { AnySQLiteColumn } from 'drizzle-orm/sqlite-core'
import { Hono } from 'hono'
import type { ApplyGlobalResponse } from 'hono/client'
import type { z } from 'zod'

import { activityLogSnapshotFields } from '../../services/auditTrail/snapshots.js'
import type { TGlobalApiResponses, THonoInstance } from '../../types.js'
import {
    apiResponseOkWrapper,
    apiResponsePaginatedOkWrapper,
    getActiveOrganizationId,
} from '../../utilities/helpers.js'
import { isAuthorized } from '../middleware/isAuthorized.js'
import { validateRequest } from '../middleware/validateRequest.js'

type TAuditFilters = z.output<typeof auditTrailFiltersSchema>
type TAuditSelection<T extends string> = {
    exclude?: T[]
    include?: T[]
}

function selectionCondition<T extends string>(
    column: AnySQLiteColumn,
    selection: TAuditSelection<T> | undefined,
): SQL | undefined {
    if (!selection) return undefined
    const includes = selection.include ?? []
    const excludes = selection.exclude ?? []
    if (includes.some((value) => excludes.includes(value))) return sql`false`

    return and(
        includes.length > 0 ? inArray(column, includes) : undefined,
        excludes.length > 0 ? notInArray(column, excludes) : undefined,
    )
}

type TAuditGroupDefinition = {
    componentPrefixes?: readonly string[]
    exactComponents?: readonly string[]
    key: string
}

function groupMatcherCondition(
    component: typeof import('@hyperion/database/d1').dbSchema.auditTrail.component,
    definition: TAuditGroupDefinition,
) {
    const conditions: SQL[] = []
    if (definition.exactComponents?.length) {
        conditions.push(inArray(component, definition.exactComponents))
    }
    if (definition.componentPrefixes?.length) {
        conditions.push(
            ...definition.componentPrefixes.map(
                (prefix) => sql`${component} LIKE ${`${prefix}%`}`,
            ),
        )
    }
    return conditions.length > 0 ? or(...conditions) : undefined
}

function groupCondition(
    component: typeof import('@hyperion/database/d1').dbSchema.auditTrail.component,
    group: TAuditFilters['group'],
) {
    const definition = auditTrailGroupDefinitions.find(
        ({ key }) => key === group,
    )
    return definition ? groupMatcherCondition(component, definition) : undefined
}

function summaryProjection(
    component: typeof import('@hyperion/database/d1').dbSchema.auditTrail.component,
) {
    return Object.fromEntries(
        auditTrailGroupDefinitions.map((definition) => {
            const condition = groupMatcherCondition(component, definition)
            return [
                definition.key,
                condition
                    ? sql<number>`COALESCE(SUM(CASE WHEN ${condition} THEN 1 ELSE 0 END), 0)`.mapWith(
                          Number,
                      )
                    : count(),
            ]
        }),
    ) as Record<TAuditGroup, SQL<number>>
}

function entityTypeMatchCondition(
    records: typeof import('@hyperion/database/d1').dbSchema.auditTrail.records,
    entityType: string,
) {
    return sql`EXISTS (
        SELECT 1
        FROM json_each(${records}) AS record
        WHERE COALESCE(
            json_extract(record.value, '$.entityType'),
            json_extract(record.value, '$.table')
        ) = ${entityType}
    )`
}

function entityTypeCondition(
    records: typeof import('@hyperion/database/d1').dbSchema.auditTrail.records,
    selection: TAuditFilters['entityTypes'],
) {
    if (!selection) return undefined
    const includes = selection.include
        ? or(
              ...selection.include.map((value) =>
                  entityTypeMatchCondition(records, value),
              ),
          )
        : undefined
    const excludes = selection.exclude
        ? and(
              ...selection.exclude.map(
                  (value) =>
                      sql`NOT (${entityTypeMatchCondition(records, value)})`,
              ),
          )
        : undefined
    return and(includes, excludes)
}

function caseInsensitiveContains(column: AnySQLiteColumn, search: string) {
    return sql`LOWER(COALESCE(${column}, '')) LIKE ${`%${search.toLowerCase()}%`}`
}

function searchableRecordCondition(
    records: typeof import('@hyperion/database/d1').dbSchema.auditTrail.records,
    search: string,
) {
    const pattern = `%${search.toLowerCase()}%`
    const allowlistValues = Object.entries(activityLogSnapshotFields)
        .flatMap(
            ([
                entityType,
                fields,
            ]) =>
                fields.map(
                    (field) =>
                        [
                            entityType,
                            field,
                        ] as const,
                ),
        )
        .map(
            ([
                entityType,
                field,
            ]) =>
                `('${entityType.replaceAll("'", "''")}', '${field.replaceAll("'", "''")}')`,
        )
        .join(', ')

    return sql`EXISTS (
        SELECT 1
        FROM json_each(COALESCE(${records}, '[]')) AS audit_record
        WHERE LOWER(COALESCE(CAST(json_extract(audit_record.value, '$.id') AS TEXT), '')) LIKE ${pattern}
            OR LOWER(COALESCE(CAST(json_extract(audit_record.value, '$.label') AS TEXT), '')) LIKE ${pattern}
            OR LOWER(COALESCE(CAST(json_extract(audit_record.value, '$.code') AS TEXT), '')) LIKE ${pattern}
            OR EXISTS (
                WITH allowed_snapshot(entity_type, field) AS (
                    VALUES ${sql.raw(allowlistValues)}
                )
                SELECT 1
                FROM allowed_snapshot
                WHERE allowed_snapshot.entity_type = COALESCE(
                    json_extract(audit_record.value, '$.entityType'),
                    json_extract(audit_record.value, '$.table')
                )
                AND (
                    LOWER(COALESCE(CAST(json_extract(
                        audit_record.value,
                        '$.oldData.' || allowed_snapshot.field
                    ) AS TEXT), '')) LIKE ${pattern}
                    OR LOWER(COALESCE(CAST(json_extract(
                        audit_record.value,
                        '$.newData.' || allowed_snapshot.field
                    ) AS TEXT), '')) LIKE ${pattern}
                )
            )
    )`
}

function buildConditions(
    auditTrail: typeof import('@hyperion/database/d1').dbSchema.auditTrail,
    organizationId: string,
    filters: TAuditFilters,
    includeGroup = true,
) {
    const search = filters.searchFilter
    return and(
        eq(auditTrail.organizationId, organizationId),
        gte(auditTrail.loggedAt, new Date(filters.dateFrom)),
        lte(auditTrail.loggedAt, new Date(filters.dateTo)),
        includeGroup
            ? groupCondition(auditTrail.component, filters.group)
            : undefined,
        selectionCondition(auditTrail.component, filters.components),
        selectionCondition(auditTrail.action, filters.actions),
        selectionCondition(auditTrail.actorType, filters.actorTypes),
        entityTypeCondition(auditTrail.records, filters.entityTypes),
        search
            ? or(
                  caseInsensitiveContains(auditTrail.description, search),
                  caseInsensitiveContains(auditTrail.component, search),
                  caseInsensitiveContains(auditTrail.action, search),
                  caseInsensitiveContains(auditTrail.actorDisplayName, search),
                  caseInsensitiveContains(auditTrail.actorIdentifier, search),
                  caseInsensitiveContains(auditTrail.actorRole, search),
                  caseInsensitiveContains(auditTrail.ipAddress, search),
                  caseInsensitiveContains(auditTrail.publicId, search),
                  searchableRecordCondition(auditTrail.records, search),
              )
            : undefined,
    )
}

function sourceChannel(actorType: string | null) {
    if (actorType === 'servicePrincipal') return 'API credential' as const
    if (actorType === 'anonymous') return 'Anonymous' as const
    if (actorType === 'system') return 'System' as const
    if (actorType !== 'user') return 'Unknown' as const
    return 'User session' as const
}

function projectRecordSummary(record: TAuditRecord) {
    return {
        code: record.code ?? null,
        entityType: record.entityType ?? record.table,
        id: record.id,
        label: record.label ?? null,
    }
}

function projectListRow(row: {
    action: string
    actorDisplayName: string | null
    actorIdentifier: string | null
    actorRole: string | null
    actorType: string | null
    component: string
    description: string
    ipAddress: string | null
    loggedAt: Date
    publicId: string
    records: TAuditRecord[] | null
}) {
    const actorType = auditTrailActorTypeSchema.safeParse(row.actorType)

    return {
        action: auditTrailActionSchema.parse(row.action),
        actor: {
            displayName: row.actorDisplayName,
            identifier: row.actorIdentifier,
            role: row.actorRole,
            type: actorType.success ? actorType.data : null,
        },
        component: auditTrailComponentSchema.parse(row.component),
        description: row.description,
        ipAddress: row.ipAddress,
        loggedAt: row.loggedAt.toISOString(),
        publicId: row.publicId,
        records: (row.records ?? []).map(projectRecordSummary),
        sourceChannel: sourceChannel(row.actorType),
    }
}

function displayLabel(field: string) {
    return field
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .replaceAll('_', ' ')
        .replace(/^./, (value) => value.toUpperCase())
}

function displayValue(value: TAuditJsonValue) {
    return typeof value === 'object' && value !== null
        ? JSON.stringify(value)
        : value
}

function projectDetailRecord(record: TAuditRecord) {
    const oldData = record.oldData ?? {}
    const newData = record.newData ?? {}
    const entityType = auditTrailEntityTypeSchema.safeParse(
        record.entityType ?? record.table,
    )
    const allowedFields = new Set(
        entityType.success ? activityLogSnapshotFields[entityType.data] : [],
    )
    const fields = [
        ...new Set([
            ...Object.keys(oldData),
            ...Object.keys(newData),
        ]),
    ].filter((field) => allowedFields.has(field))
    const hasBothSnapshots = Boolean(record.oldData && record.newData)
    const changes = hasBothSnapshots
        ? fields
              .filter(
                  (field) =>
                      JSON.stringify(oldData[field]) !==
                      JSON.stringify(newData[field]),
              )
              .map((field) => ({
                  field,
                  label: displayLabel(field),
                  ...(field in oldData
                      ? { before: displayValue(oldData[field]) }
                      : {}),
                  ...(field in newData
                      ? { after: displayValue(newData[field]) }
                      : {}),
              }))
        : []
    const snapshotData = record.newData ?? record.oldData ?? {}
    const snapshot = Object.entries(snapshotData)
        .filter(([field]) => allowedFields.has(field))
        .map(
            ([
                field,
                value,
            ]) => ({
                field,
                label: displayLabel(field),
                value: displayValue(value),
            }),
        )

    return {
        ...projectRecordSummary(record),
        changes,
        snapshot,
        snapshotRecorded:
            Object.keys(oldData).length > 0 || Object.keys(newData).length > 0,
    }
}

const listProjection = (
    auditTrail: typeof import('@hyperion/database/d1').dbSchema.auditTrail,
) => ({
    action: auditTrail.action,
    actorDisplayName: auditTrail.actorDisplayName,
    actorIdentifier: auditTrail.actorIdentifier,
    actorRole: auditTrail.actorRole,
    actorType: auditTrail.actorType,
    component: auditTrail.component,
    description: auditTrail.description,
    ipAddress: auditTrail.ipAddress,
    loggedAt: auditTrail.loggedAt,
    publicId: auditTrail.publicId,
    records: auditTrail.records,
})

export const auditTrailRoute = new Hono<THonoInstance>()
    .on(
        'QUERY',
        '/readMany',
        isAuthorized({ auditTrail: ['read'] }),
        validateRequest('json', auditTrailReadManyInputSchema),
        async (ctx) => {
            const input = ctx.req.valid('json')
            const organizationId = getActiveOrganizationId(ctx)
            const { auditTrail } = ctx.get('dbSchema')
            const conditions = buildConditions(
                auditTrail,
                organizationId,
                input.filters,
            )
            const orderBy = input.sortOrder === 'asc' ? asc : desc

            try {
                const db = ctx.get('dbClient')
                const [{ count: total }] = await db
                    .select({ count: count() })
                    .from(auditTrail)
                    .where(conditions)
                const rows = await db
                    .select(listProjection(auditTrail))
                    .from(auditTrail)
                    .where(conditions)
                    .orderBy(
                        orderBy(auditTrail.loggedAt),
                        orderBy(auditTrail.id),
                    )
                    .limit(input.limit)
                    .offset(input.offset)

                return apiResponsePaginatedOkWrapper(ctx, {
                    data: rows.map(projectListRow),
                    count: total,
                    limit: input.limit,
                    offset: input.offset,
                })
            } catch (error) {
                throw new AppError(catalog.auditTrailListFailed, {
                    cause: error,
                })
            }
        },
    )
    .on(
        'QUERY',
        '/summary',
        isAuthorized({ auditTrail: ['read'] }),
        validateRequest('json', auditTrailSummaryInputSchema),
        async (ctx) => {
            const input = ctx.req.valid('json')
            const organizationId = getActiveOrganizationId(ctx)
            const { auditTrail } = ctx.get('dbSchema')

            try {
                const [data] = await ctx
                    .get('dbClient')
                    .select(summaryProjection(auditTrail.component))
                    .from(auditTrail)
                    .where(
                        buildConditions(
                            auditTrail,
                            organizationId,
                            input.filters,
                            false,
                        ),
                    )

                return apiResponseOkWrapper(ctx, { data })
            } catch (error) {
                throw new AppError(catalog.auditTrailSummaryFailed, {
                    cause: error,
                })
            }
        },
    )
    .get(
        '/:publicId',
        isAuthorized({ auditTrail: ['read'] }),
        validateRequest('param', auditTrailDetailInputSchema),
        async (ctx) => {
            const input = ctx.req.valid('param')
            const organizationId = getActiveOrganizationId(ctx)
            const { auditTrail } = ctx.get('dbSchema')

            try {
                const [row] = await ctx
                    .get('dbClient')
                    .select({
                        ...listProjection(auditTrail),
                        userAgent: auditTrail.userAgent,
                    })
                    .from(auditTrail)
                    .where(
                        and(
                            eq(auditTrail.organizationId, organizationId),
                            eq(auditTrail.publicId, input.publicId),
                        ),
                    )
                    .limit(1)

                if (!row) throw new AppError(catalog.auditTrailNotFound)
                const projected = projectListRow(row)
                return apiResponseOkWrapper(ctx, {
                    data: {
                        ...projected,
                        records: (row.records ?? []).map(projectDetailRecord),
                        userAgent: row.userAgent,
                    },
                })
            } catch (error) {
                if (error instanceof AppError) throw error
                throw new AppError(catalog.auditTrailListFailed, {
                    cause: error,
                })
            }
        },
    )

export default auditTrailRoute
export type AuditTrailRouteType = ApplyGlobalResponse<
    typeof auditTrailRoute,
    TGlobalApiResponses
>
