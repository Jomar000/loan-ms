import * as auditTrailValidator from '@loanms/validator/backoffice/auditTrail'
import type { z } from 'zod'

type ReadManyResponse = z.infer<
    typeof auditTrailValidator.auditTrailReadManyOutputSchema
>
type DetailResponse = z.infer<
    typeof auditTrailValidator.auditTrailDetailOutputSchema
>

export type ActivityLogRecord = Extract<
    ReadManyResponse,
    { success: true }
>['data'][number]
export type ActivityLogDetail = Extract<
    DetailResponse,
    { success: true }
>['data']
export type ActivityLogFilters = z.input<
    typeof auditTrailValidator.auditTrailFiltersSchema
>
export type ActivityLogGroup = z.infer<
    typeof auditTrailValidator.auditTrailGroupSchema
>
export type ActivityLogSummary = Extract<
    z.infer<typeof auditTrailValidator.auditTrailSummaryOutputSchema>,
    { success: true }
>['data']

export interface ActivityLogPage {
    count: number
    data: ActivityLogRecord[]
    limit: number
    offset: number
}
