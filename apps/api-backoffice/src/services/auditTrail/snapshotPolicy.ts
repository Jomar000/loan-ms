import type { TAuditJsonValue, TAuditSnapshot } from '@loanms/database/d1'

export type TAuditSnapshotValueProjector = (
    value: unknown,
) => TAuditJsonValue | undefined

/**
 * Defines allowlisted server-internal correlation metadata. Generic Activity Log
 * responses never expose the projected context object.
 */
export type TAuditContextPolicy = {
    fieldProjectors?: Readonly<Record<string, TAuditSnapshotValueProjector>>
    fields: readonly string[]
    required?: boolean
    validateRecord?: (input: { context: TAuditSnapshot; id: string }) => void
}

export type TAuditSnapshotPolicy<TEntityType extends string = string> = {
    contextPolicies: Readonly<Partial<Record<TEntityType, TAuditContextPolicy>>>
    labelFields: Readonly<Partial<Record<TEntityType, readonly string[]>>>
    snapshotFields: Readonly<Partial<Record<TEntityType, readonly string[]>>>
    snapshotValueProjectors: Readonly<
        Partial<
            Record<
                TEntityType,
                Readonly<Record<string, TAuditSnapshotValueProjector>>
            >
        >
    >
}
