import { defineError } from '../publicCodes.js'

export const auditTrailErrors = {
    auditTrailListFailed: defineError(
        'AUDIT_TRAIL_LIST_FAILED',
        'AUDIT_TRAIL_LIST_FAILED',
        'Activity log retrieval failed.',
    ),
    auditTrailNotFound: defineError(
        'AUDIT_TRAIL_NOT_FOUND',
        'AUDIT_TRAIL_NOT_FOUND',
        'Activity log event not found.',
    ),
    auditTrailRecordPreparationFailed: defineError(
        'AUDIT_TRAIL_RECORD_PREPARATION_FAILED',
        'AUDIT_TRAIL_RECORD_PREPARATION_FAILED',
        'Audit trail record preparation failed.',
    ),
    auditTrailSummaryFailed: defineError(
        'AUDIT_TRAIL_SUMMARY_FAILED',
        'AUDIT_TRAIL_SUMMARY_FAILED',
        'Activity log summary retrieval failed.',
    ),
    auditTrailWriteFailed: defineError(
        'AUDIT_TRAIL_WRITE_FAILED',
        'AUDIT_TRAIL_WRITE_FAILED',
        'Audit trail write failed.',
    ),
} as const
