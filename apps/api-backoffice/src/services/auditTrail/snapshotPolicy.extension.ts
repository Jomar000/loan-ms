import type { TAuditEntityType } from '@loanms/validator/backoffice/auditTrail'

import type { TAuditSnapshotPolicy } from './snapshotPolicy.js'

export type TExtensionAuditRecordContext = never

export const extensionSnapshotPolicy = {
    contextPolicies: {},
    labelFields: {},
    snapshotFields: {},
    snapshotValueProjectors: {},
} as const satisfies TAuditSnapshotPolicy<TAuditEntityType>
