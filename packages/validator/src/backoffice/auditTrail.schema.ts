import { z } from 'zod'

import * as base from '../shared/base.js'
import * as field from '../shared/field.js'
import * as refinement from '../shared/refinement.js'
import {
    extensionAuditTrailActions,
    extensionAuditTrailComponents,
    extensionAuditTrailEntityTypes,
    extensionAuditTrailGroupDefinitions,
} from './auditTrail.extension.schema.js'

function sortedRegistry<TValue extends string>(
    values: readonly TValue[],
): readonly TValue[] {
    return [...values].sort()
}

export const auditTrailComponents = sortedRegistry([
    'admin.servicePrincipal',
    'admin.user.password',
    'admin.user.profile',
    'auth',
    'objectStorage.upload',
    'objectStorage.uploadAttachment',
    'user.address',
    'user.notification',
    'user.profile',
    ...extensionAuditTrailComponents,
] as const)

export const auditTrailActions = sortedRegistry([
    'commit',
    'create',
    'credential.create',
    'credential.revoke',
    'delete',
    'disable',
    'enable',
    'markRead',
    'organization.setActive',
    'password.change',
    'password.reset',
    'password.resetRequest',
    'reset',
    'resetRequest',
    'setPrimary',
    'signIn.email',
    'signIn.username',
    'signOut',
    'update',
    'verifyEmail',
    ...extensionAuditTrailActions,
] as const)

export const auditTrailEntityTypes = sortedRegistry([
    'account',
    'apikey',
    'notification_delivery',
    'object_storage',
    'service_principal',
    'upload',
    'upload_attachment',
    'user',
    'user_address',
    'user_profile',
    ...extensionAuditTrailEntityTypes,
] as const)

export const auditTrailActorTypeSchema = z.enum([
    'anonymous',
    'servicePrincipal',
    'system',
    'user',
])
export const auditTrailComponentSchema = z.enum(auditTrailComponents)
export const auditTrailActionSchema = z.enum(auditTrailActions)
export const auditTrailEntityTypeSchema = z.enum(auditTrailEntityTypes)
export const auditTrailGroupDefinitions =
    extensionAuditTrailGroupDefinitions satisfies readonly {
        componentPrefixes?: readonly string[]
        exactComponents?: readonly (typeof auditTrailComponents)[number][]
        key: string
    }[]

export const auditTrailGroups = auditTrailGroupDefinitions.map(
    ({ key }) => key,
) as [
    (typeof auditTrailGroupDefinitions)[number]['key'],
    ...(typeof auditTrailGroupDefinitions)[number]['key'][],
]
export const auditTrailGroupSchema = z.enum(auditTrailGroups)

export type TAuditAction = z.output<typeof auditTrailActionSchema>
export type TAuditActorType = z.output<typeof auditTrailActorTypeSchema>
export type TAuditComponent = z.output<typeof auditTrailComponentSchema>
export type TAuditEntityType = z.output<typeof auditTrailEntityTypeSchema>
export type TAuditGroup = z.output<typeof auditTrailGroupSchema>

function defaultDateFrom() {
    return currentLocalDayBoundary(0, 0, 0, 0)
}

function defaultDateTo() {
    return currentLocalDayBoundary(23, 59, 59, 999)
}

function currentLocalDayBoundary(
    hours: number,
    minutes: number,
    seconds: number,
    milliseconds: number,
) {
    const now = new Date()
    return new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        hours,
        minutes,
        seconds,
        milliseconds,
    ).toISOString()
}

const selectionFilterSchema = <T>(
    valueSchema: z.ZodType<T>,
    fieldName: string,
) =>
    z.object({
        include: z
            .array(valueSchema)
            .min(1, `${fieldName} must contain at least one value.`)
            .check((ctx) =>
                refinement.uniqueArrayValues(ctx, {
                    values: ctx.value,
                    message: `${fieldName} must not contain duplicate values.`,
                }),
            )
            .optional(),
        exclude: z
            .array(valueSchema)
            .min(1, `${fieldName} must contain at least one value.`)
            .check((ctx) =>
                refinement.uniqueArrayValues(ctx, {
                    values: ctx.value,
                    message: `${fieldName} must not contain duplicate values.`,
                }),
            )
            .optional(),
    })

export const auditTrailFiltersSchema = z
    .object({
        actions: selectionFilterSchema(
            auditTrailActionSchema,
            'Actions',
        ).optional(),
        actorTypes: selectionFilterSchema(
            auditTrailActorTypeSchema,
            'Actor Types',
        ).optional(),
        components: selectionFilterSchema(
            auditTrailComponentSchema,
            'Components',
        ).optional(),
        dateFrom: field
            .vIsoDateTime('Date From')
            .optional()
            .default(defaultDateFrom),
        dateTo: field.vIsoDateTime('Date To').optional().default(defaultDateTo),
        entityTypes: selectionFilterSchema(
            auditTrailEntityTypeSchema,
            'Entity Types',
        ).optional(),
        group: auditTrailGroupSchema.optional().default('all'),
        searchFilter: field
            .vText({ fieldName: 'Search Filter', max: 200 })
            .optional(),
    })
    .check((ctx) => {
        const { dateFrom, dateTo } = ctx.value
        if (dateFrom && dateTo && Date.parse(dateFrom) > Date.parse(dateTo)) {
            ctx.issues.push({
                code: 'custom',
                input: ctx.value,
                message: 'Date From must be before or equal to Date To.',
                path: ['dateFrom'],
            })
        }
    })

export const auditTrailReadManyInputSchema = base.readManyInputSchema.extend({
    filters: auditTrailFiltersSchema.prefault({ group: 'all' }),
    // Activity Logs intentionally opens on a compact newest-first operational
    // window instead of the shared catalog-list defaults (100, ascending).
    limit: base.readManyInputSchema.shape.limit.unwrap().default(25),
    sortOrder: base.readManyInputSchema.shape.sortOrder
        .unwrap()
        .default('desc'),
})
export const auditTrailSummaryInputSchema = z.object({
    filters: auditTrailFiltersSchema.prefault({ group: 'all' }),
})
export const auditTrailDetailInputSchema = z.object({
    publicId: z.uuid('Public ID must be a UUID.'),
})

const auditTrailActorOutputSchema = z.object({
    displayName: z.string().nullable(),
    identifier: z.string().nullable(),
    role: z.string().nullable(),
    type: auditTrailActorTypeSchema.nullable(),
})
const auditTrailRecordSummaryOutputSchema = z.object({
    code: z.string().nullable(),
    entityType: z.string(),
    id: z.string(),
    label: z.string().nullable(),
})
const auditTrailListOutputDataSchema = z.object({
    action: auditTrailActionSchema,
    actor: auditTrailActorOutputSchema,
    component: auditTrailComponentSchema,
    description: z.string(),
    ipAddress: z.string().nullable(),
    loggedAt: z.iso.datetime(),
    publicId: z.uuid(),
    records: z.array(auditTrailRecordSummaryOutputSchema),
    sourceChannel: z.enum([
        'Anonymous',
        'API credential',
        'System',
        'Unknown',
        'User session',
    ]),
})

const auditTrailDisplayValueSchema = z.object({
    field: z.string(),
    label: z.string(),
    value: z.union([
        z.boolean(),
        z.null(),
        z.number(),
        z.string(),
    ]),
})
const auditTrailChangeSchema = z.object({
    after: auditTrailDisplayValueSchema.shape.value.optional(),
    before: auditTrailDisplayValueSchema.shape.value.optional(),
    field: z.string(),
    label: z.string(),
})
const auditTrailDetailRecordOutputSchema =
    auditTrailRecordSummaryOutputSchema.extend({
        changes: z.array(auditTrailChangeSchema),
        snapshot: z.array(auditTrailDisplayValueSchema),
        snapshotRecorded: z.boolean(),
    })

export const auditTrailReadManyOutputSchema = base.paginatedOutputSchema(
    z.array(auditTrailListOutputDataSchema),
)
export const auditTrailSummaryOutputSchema = base.outputSchema(
    z.record(auditTrailGroupSchema, z.number()),
)
export const auditTrailDetailOutputSchema = base.outputSchema(
    auditTrailListOutputDataSchema.extend({
        records: z.array(auditTrailDetailRecordOutputSchema),
        userAgent: z.string().nullable(),
    }),
)
