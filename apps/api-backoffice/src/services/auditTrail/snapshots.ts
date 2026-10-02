import type {
    TAuditJsonValue,
    TAuditRecord,
    TAuditSnapshot,
} from '@hyperion/database/d1'
import { AppError, catalog } from '@hyperion/errors'
import {
    auditTrailEntityTypes,
    auditTrailEntityTypeSchema,
} from '@hyperion/validator/backoffice/auditTrail'
import type { z } from 'zod'

import {
    extensionSnapshotPolicy,
    type TExtensionAuditRecordContext,
} from './snapshotPolicy.extension.js'
import type {
    TAuditSnapshotPolicy,
    TAuditSnapshotValueProjector,
} from './snapshotPolicy.js'

type TAuditEntityType = z.output<typeof auditTrailEntityTypeSchema>

export type TAuditRecordInput<TContext = TExtensionAuditRecordContext> = Omit<
    TAuditRecord,
    'context' | 'entityType' | 'newData' | 'oldData'
> & {
    context?: TContext
    entityType?: TAuditEntityType
    newData?: Record<string, unknown>
    oldData?: Record<string, unknown>
}

const baseSnapshotFields = {
    account: ['providerId'],
    apikey: [
        'expiresAt',
        'name',
        'principalPublicId',
    ],
    notification_delivery: [
        'isRead',
        'readAt',
    ],
    object_storage: [
        'isUploaded',
        'key',
        'size',
    ],
    service_principal: [
        'audience',
        'description',
        'enabled',
        'name',
        'permissions',
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
} as const

export const activityLogSnapshotFields: Record<
    TAuditEntityType,
    readonly string[]
> = {
    ...baseSnapshotFields,
    ...extensionSnapshotPolicy.snapshotFields,
}

const AUDIT_JSON_MAX_DEPTH = 32
const AUDIT_JSON_MAX_NODES = 10_000

type TAuditJsonTraversalState = {
    ancestors: WeakSet<object>
    nodes: number
}

function createAuditJsonTraversalState(): TAuditJsonTraversalState {
    return {
        ancestors: new WeakSet<object>(),
        nodes: 0,
    }
}

function assertAuditJsonTraversalBudget(
    state: TAuditJsonTraversalState,
    depth: number,
    message: string,
) {
    state.nodes += 1
    if (depth > AUDIT_JSON_MAX_DEPTH || state.nodes > AUDIT_JSON_MAX_NODES) {
        throw new Error(message)
    }
}

function assertPlainObject(value: object, message: string) {
    if (
        Array.isArray(value) ||
        ![
            null,
            Object.prototype,
        ].includes(Object.getPrototypeOf(value))
    ) {
        throw new Error(message)
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
    assertAuditJsonTraversalBudget(
        state,
        depth,
        'Audit values exceed the supported size or nesting depth.',
    )
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

        assertPlainObject(
            value,
            'Audit values must contain only plain objects and arrays.',
        )
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

function assertJsonValue(
    value: unknown,
    message: string,
    state = createAuditJsonTraversalState(),
    depth = 0,
): asserts value is TAuditJsonValue {
    assertAuditJsonTraversalBudget(state, depth, message)
    if (
        value === null ||
        typeof value === 'boolean' ||
        typeof value === 'string'
    ) {
        return
    }
    if (typeof value === 'number') {
        if (Number.isFinite(value)) return
        throw new Error(message)
    }
    if (typeof value !== 'object' || value instanceof Date) {
        throw new Error(message)
    }
    if (state.ancestors.has(value)) throw new Error(message)

    state.ancestors.add(value)
    try {
        if (Array.isArray(value)) {
            if (
                Object.getPrototypeOf(value) !== Array.prototype ||
                Object.getOwnPropertySymbols(value).length > 0
            ) {
                throw new Error(message)
            }
            for (const [
                field,
                descriptor,
            ] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
                if (field === 'length') continue
                if (!isArrayIndex(field) || !('value' in descriptor)) {
                    throw new Error(message)
                }
                assertJsonValue(descriptor.value, message, state, depth + 1)
            }
            return
        }

        assertPlainObject(value, message)
        if (Object.getOwnPropertySymbols(value).length > 0) {
            throw new Error(message)
        }
        for (const descriptor of Object.values(
            Object.getOwnPropertyDescriptors(value),
        )) {
            if (!descriptor.enumerable) continue
            if (!('value' in descriptor)) throw new Error(message)
            assertJsonValue(descriptor.value, message, state, depth + 1)
        }
    } finally {
        state.ancestors.delete(value)
    }
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

function rejectAuditRecordPreparation(message: string): never {
    throw auditRecordPreparationError(new Error(message))
}

function assertKnownPolicyEntities(
    section: string,
    entries: Readonly<Record<string, unknown>>,
) {
    for (const entityType of Object.keys(entries)) {
        if (!auditTrailEntityTypes.includes(entityType as TAuditEntityType)) {
            throw new Error(
                `Audit snapshot policy ${section} contains unknown entity ${entityType}.`,
            )
        }
    }
}

function assertUniquePolicyFields(
    section: string,
    entityType: TAuditEntityType,
    fields: readonly string[],
) {
    const duplicate = fields.find(
        (field, index) => fields.indexOf(field) !== index,
    )
    if (duplicate) {
        throw new Error(
            `Audit snapshot policy ${section} for ${entityType} contains duplicate field ${duplicate}.`,
        )
    }
}

function validateSnapshotPolicy(
    extensionPolicy: TAuditSnapshotPolicy<TAuditEntityType>,
    snapshotFields: Record<TAuditEntityType, readonly string[]>,
) {
    for (const [
        section,
        entries,
    ] of [
        [
            'contextPolicies',
            extensionPolicy.contextPolicies,
        ],
        [
            'labelFields',
            extensionPolicy.labelFields,
        ],
        [
            'snapshotFields',
            extensionPolicy.snapshotFields,
        ],
        [
            'snapshotValueProjectors',
            extensionPolicy.snapshotValueProjectors,
        ],
    ] as const) {
        assertKnownPolicyEntities(section, entries)
    }

    for (const entityType of auditTrailEntityTypes) {
        const allowedSnapshotFields = snapshotFields[entityType]
        if (!Array.isArray(allowedSnapshotFields)) {
            throw new Error(
                `Audit snapshot policy is missing fields for ${entityType}.`,
            )
        }
        assertUniquePolicyFields(
            'snapshotFields',
            entityType,
            allowedSnapshotFields,
        )
        const allowedSnapshotFieldSet = new Set(allowedSnapshotFields)

        const labelFields = extensionPolicy.labelFields[entityType] ?? []
        assertUniquePolicyFields('labelFields', entityType, labelFields)
        for (const field of labelFields) {
            if (!allowedSnapshotFieldSet.has(field)) {
                throw new Error(
                    `Audit label field ${entityType}.${field} is not snapshot-allowlisted.`,
                )
            }
        }

        const snapshotProjectors =
            extensionPolicy.snapshotValueProjectors[entityType] ?? {}
        for (const field of Object.keys(snapshotProjectors)) {
            if (!allowedSnapshotFieldSet.has(field)) {
                throw new Error(
                    `Audit snapshot projector ${entityType}.${field} is not snapshot-allowlisted.`,
                )
            }
        }

        const contextPolicy = extensionPolicy.contextPolicies[entityType]
        if (!contextPolicy) continue
        assertUniquePolicyFields(
            'contextPolicies',
            entityType,
            contextPolicy.fields,
        )
        const allowedContextFields = new Set(contextPolicy.fields)
        for (const field of Object.keys(contextPolicy.fieldProjectors ?? {})) {
            if (!allowedContextFields.has(field)) {
                throw new Error(
                    `Audit context projector ${entityType}.${field} is not context-allowlisted.`,
                )
            }
        }
    }
}

export function createAuditRecordProjector<TContext>(
    extensionPolicy: TAuditSnapshotPolicy<TAuditEntityType>,
) {
    const snapshotFields: Record<TAuditEntityType, readonly string[]> = {
        ...baseSnapshotFields,
        ...extensionPolicy.snapshotFields,
    }
    validateSnapshotPolicy(extensionPolicy, snapshotFields)

    function toFieldValue(
        entityType: TAuditEntityType,
        field: string,
        value: unknown,
    ): TAuditJsonValue | undefined {
        const projector: TAuditSnapshotValueProjector | undefined =
            extensionPolicy.snapshotValueProjectors[entityType]?.[field]
        const projectedValue = projector ? projector(value) : toJsonValue(value)
        if (projector && projectedValue !== undefined) {
            assertJsonValue(
                projectedValue,
                `Audit snapshot projector ${entityType}.${field} must return a JSON-safe value.`,
            )
        }
        return projectedValue
    }

    function projectSnapshot(
        entityType: TAuditEntityType,
        value: Record<string, unknown> | undefined,
    ) {
        if (!value) return undefined
        assertPlainObject(value, 'Audit snapshot inputs must be plain objects.')

        const snapshot = Object.fromEntries(
            snapshotFields[entityType]
                .map(
                    (field) =>
                        [
                            field,
                            toFieldValue(
                                entityType,
                                field,
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

    function projectContext(
        entityType: TAuditEntityType,
        id: string,
        value: Record<string, unknown> | undefined,
    ): TAuditSnapshot | undefined {
        const policy = extensionPolicy.contextPolicies[entityType]
        if (!policy) return undefined
        if (!value) {
            if (policy.required) {
                rejectAuditRecordPreparation(
                    `Audit ${entityType} context is required.`,
                )
            }
            return undefined
        }
        assertPlainObject(value, 'Audit context inputs must be plain objects.')

        const context = Object.fromEntries(
            policy.fields.map((field) => {
                const rawValue = ownDataProperty(
                    value,
                    field,
                    'Audit context inputs must not contain accessor properties.',
                )
                if (rawValue === undefined) {
                    rejectAuditRecordPreparation(
                        `Audit context ${field} is required.`,
                    )
                }
                const projector = policy.fieldProjectors?.[field]
                const projectedValue = projector
                    ? projector(rawValue)
                    : toJsonValue(rawValue)
                if (projector && projectedValue !== undefined) {
                    assertJsonValue(
                        projectedValue,
                        `Audit context projector ${entityType}.${field} must return a JSON-safe value.`,
                    )
                }
                if (projectedValue === undefined) {
                    rejectAuditRecordPreparation(
                        `Audit context ${field} must be JSON-safe.`,
                    )
                }
                return [
                    field,
                    projectedValue,
                ] as const
            }),
        )
        policy.validateRecord?.({
            context,
            id,
        })
        return context
    }

    function projectRecord(input: TAuditRecordInput<TContext>): TAuditRecord {
        const entityType = auditTrailEntityTypeSchema.parse(
            input.entityType ?? input.table,
        )
        const oldData = projectSnapshot(entityType, input.oldData)
        const newData = projectSnapshot(entityType, input.newData)
        const context = projectContext(
            entityType,
            input.id,
            input.context as Record<string, unknown> | undefined,
        )
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
            ...(extensionPolicy.labelFields[entityType] ?? []).map(
                (field) => displaySnapshot?.[field],
            ),
        ].find((value): value is string => typeof value === 'string')
        const inferredCode =
            typeof displaySnapshot?.code === 'string'
                ? displaySnapshot.code
                : undefined

        return {
            entityType,
            table: input.table,
            id: input.id,
            ...(context ? { context } : {}),
            ...(input.label || inferredLabel
                ? { label: input.label ?? inferredLabel }
                : {}),
            ...(input.code || inferredCode
                ? { code: input.code ?? inferredCode }
                : {}),
            ...(recordedOldData ? { oldData: recordedOldData } : {}),
            ...(recordedNewData ? { newData: recordedNewData } : {}),
        }
    }

    return (input: TAuditRecordInput<TContext>): TAuditRecord => {
        try {
            return projectRecord(input)
        } catch (error) {
            throw auditRecordPreparationError(error)
        }
    }
}

export const projectAuditRecord =
    createAuditRecordProjector<TExtensionAuditRecordContext>(
        extensionSnapshotPolicy,
    )
