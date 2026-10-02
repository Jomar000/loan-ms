export type TAuditJsonValue =
    | boolean
    | null
    | number
    | string
    | TAuditJsonValue[]
    | { [key: string]: TAuditJsonValue }

export type TAuditSnapshot = Record<string, TAuditJsonValue>

export type TAuditRecord = {
    code?: string
    context?: TAuditSnapshot
    entityType: string
    id: string
    label?: string
    newData?: TAuditSnapshot
    oldData?: TAuditSnapshot
    table: string
}
