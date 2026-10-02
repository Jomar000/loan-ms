import type { TAuditJsonValue, TAuditRecord } from '@hyperion/database/d1'
import { AppError, catalog } from '@hyperion/errors'
import { auditTrailEntityTypeSchema } from '@hyperion/validator/backoffice/auditTrail'
import type { z } from 'zod'

type TAuditEntityType = z.output<typeof auditTrailEntityTypeSchema>

export type TAuditRecordInput = Omit<
    TAuditRecord,
    'context' | 'entityType' | 'newData' | 'oldData'
> & {
    entityType?: TAuditEntityType
    newData?: Record<string, unknown>
    oldData?: Record<string, unknown>
}

const snapshotFields = {
    account: ['providerId'],
    object_storage: [
        'isUploaded',
        'key',
        'size',
    ],
    notification_delivery: [
        'isRead',
        'readAt',
    ],
    upload: [
        'isCommitted',
        'name',
        'status',
    ],
    upload_attachment: [
        'name',
        'objectStorageId',
        'uploadId',
    ],
    user: [
        'email',
        'name',
        'username',
    ],
    user_address: [
        'addressLine1',
        'addressLine2',
        'barangay',
        'cityMunicipality',
        'countryCode',
        'dependentLocality',
        'isPrimary',
        'label',
        'locality',
        'postalCode',
        'province',
        'psgcCode',
        'region',
        'administrativeArea',
        'type',
    ],
    user_profile: [
        'backupPhoneNumber',
        'firstName',
        'gender',
        'lastName',
        'middleName',
        'nameExtension',
    ],
} satisfies Partial<Record<TAuditEntityType, readonly string[]>>

const AUDIT_JSON_MAX_DEPTH = 32
const AUDIT_JSON_MAX_NODES = 10_000

type TAuditJsonTraversalState = {
    ancestors: WeakSet<object>
    nodes: number
}

const createAuditJsonTraversalState = (): TAuditJsonTraversalState => ({
    ancestors: new WeakSet<object>(),
    nodes: 0,
})

function assertAuditJsonTraversalBudget(
    state: TAuditJsonTraversalState,
    depth: number,
) {
    state.nodes += 1
    if (depth > AUDIT_JSON_MAX_DEPTH || state.nodes > AUDIT_JSON_MAX_NODES) {
        throw new Error(
            'Audit values exceed the supported size or nesting depth.',
        )
    }
}

function assertPlainObject(value: object) {
    if (
        Array.isArray(value) ||
        ![
            null,
            Object.prototype,
        ].includes(Object.getPrototypeOf(value))
    ) {
        throw new Error(
            'Audit values must contain only plain objects and arrays.',
        )
    }
}

function ownDataProperty(
    value: object,
    field: string,
    accessorMessage: string,
) {
    const descriptor = Object.getOwnPropertyDescriptor(value, field)
    if (!descriptor) return undefined
    if (!('value' in descriptor)) throw new Error(accessorMessage)
    return descriptor.value
}

function isArrayIndex(field: string) {
    if (!/^(0|[1-9]\d*)$/.test(field)) return false
    const index = Number(field)
    return Number.isSafeInteger(index) && index < 4_294_967_295
}

function toJsonValue(
    value: unknown,
    state = createAuditJsonTraversalState(),
    depth = 0,
): TAuditJsonValue | undefined {
    assertAuditJsonTraversalBudget(state, depth)
    if (value === null) return null
    if (typeof value === 'number') {
        if (!Number.isFinite(value)) {
            throw new Error('Audit values must contain only finite numbers.')
        }
        return value
    }
    if (typeof value === 'boolean' || typeof value === 'string') return value
    if (value instanceof Date) return value.toISOString()
    if (typeof value !== 'object') return undefined
    if (state.ancestors.has(value)) {
        throw new Error('Audit values must not contain circular references.')
    }

    state.ancestors.add(value)
    try {
        if (Array.isArray(value)) {
            if (Object.getPrototypeOf(value) !== Array.prototype) {
                throw new Error(
                    'Audit values must contain only plain objects and arrays.',
                )
            }
            const result: TAuditJsonValue[] = []
            for (const [
                field,
                descriptor,
            ] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
                if (!isArrayIndex(field)) continue
                if (!('value' in descriptor)) {
                    throw new Error(
                        'Audit values must not contain accessor properties.',
                    )
                }
                const entry = toJsonValue(descriptor.value, state, depth + 1)
                if (entry !== undefined) result.push(entry)
            }
            return result
        }

        assertPlainObject(value)
        return Object.fromEntries(
            Object.entries(Object.getOwnPropertyDescriptors(value))
                .filter(
                    ([
                        ,
                        descriptor,
                    ]) => descriptor.enumerable,
                )
                .map(
                    ([
                        key,
                        descriptor,
                    ]) => {
                        if (!('value' in descriptor)) {
                            throw new Error(
                                'Audit values must not contain accessor properties.',
                            )
                        }
                        return [
                            key,
                            toJsonValue(descriptor.value, state, depth + 1),
                        ] as const
                    },
                )
                .filter(
                    (
                        entry,
                    ): entry is [
                        string,
                        TAuditJsonValue,
                    ] => entry[1] !== undefined,
                ),
        )
    } finally {
        state.ancestors.delete(value)
    }
}

function projectSnapshot(
    entityType: TAuditEntityType,
    value: Record<string, unknown> | undefined,
) {
    if (!value) return undefined
    assertPlainObject(value)
    const fields =
        snapshotFields[entityType as keyof typeof snapshotFields] ?? []
    const snapshot = Object.fromEntries(
        fields
            .map(
                (field) =>
                    [
                        field,
                        toJsonValue(
                            ownDataProperty(
                                value,
                                field,
                                'Audit snapshot inputs must not contain accessor properties.',
                            ),
                        ),
                    ] as const,
            )
            .filter(
                (
                    entry,
                ): entry is [
                    string,
                    TAuditJsonValue,
                ] => entry[1] !== undefined,
            ),
    )
    return Object.keys(snapshot).length > 0 ? snapshot : undefined
}

export function auditRecordPreparationError(cause: unknown) {
    if (
        cause instanceof AppError &&
        cause.code === 'AUDIT_TRAIL_RECORD_PREPARATION_FAILED'
    ) {
        return cause
    }
    return new AppError(catalog.auditTrailRecordPreparationFailed, { cause })
}

function projectRecord(input: TAuditRecordInput): TAuditRecord {
    const entityType = auditTrailEntityTypeSchema.parse(
        input.entityType ?? input.table,
    )
    const oldData = projectSnapshot(entityType, input.oldData)
    const newData = projectSnapshot(entityType, input.newData)
    const displaySnapshot = newData ?? oldData
    const changedFields =
        oldData && newData
            ? [
                  ...new Set([
                      ...Object.keys(oldData),
                      ...Object.keys(newData),
                  ]),
              ].filter(
                  (field) =>
                      JSON.stringify(oldData[field]) !==
                      JSON.stringify(newData[field]),
              )
            : []
    const projectedOldData =
        oldData && newData
            ? Object.fromEntries(
                  changedFields
                      .filter((field) => field in oldData)
                      .map((field) => [
                          field,
                          oldData[field],
                      ]),
              )
            : oldData
    const projectedNewData =
        oldData && newData
            ? Object.fromEntries(
                  changedFields
                      .filter((field) => field in newData)
                      .map((field) => [
                          field,
                          newData[field],
                      ]),
              )
            : newData
    const recordedOldData =
        projectedOldData && Object.keys(projectedOldData).length > 0
            ? projectedOldData
            : undefined
    const recordedNewData =
        projectedNewData && Object.keys(projectedNewData).length > 0
            ? projectedNewData
            : undefined
    const inferredLabel = [
        displaySnapshot?.name,
        displaySnapshot?.label,
    ].find((value): value is string => typeof value === 'string')

    return {
        entityType,
        table: input.table,
        id: input.id,
        ...(input.label || inferredLabel
            ? { label: input.label ?? inferredLabel }
            : {}),
        ...(input.code ? { code: input.code } : {}),
        ...(recordedOldData ? { oldData: recordedOldData } : {}),
        ...(recordedNewData ? { newData: recordedNewData } : {}),
    }
}

export function projectAuditRecord(input: TAuditRecordInput): TAuditRecord {
    try {
        return projectRecord(input)
    } catch (error) {
        throw auditRecordPreparationError(error)
    }
}
