import * as auditTrailValidator from '@hyperion/validator/backoffice/auditTrail'

import { auditTrailClient } from '$lib/clients'
import type {
    ActivityLogDetail,
    ActivityLogFilters,
    ActivityLogPage,
    ActivityLogSummary,
} from './types'

export type ActivityLogListRequest = {
    filters: ActivityLogFilters
    limit: number
    offset: number
    sortOrder: 'asc' | 'desc'
}

export async function fetchActivityLogList(
    request: ActivityLogListRequest,
): Promise<ActivityLogPage> {
    const input =
        auditTrailValidator.auditTrailReadManyInputSchema.parse(request)
    const responseJson = await (
        await auditTrailClient.readMany.$query({ json: input })
    ).json()
    if (!responseJson.success) throw new Error(responseJson.error.message)
    return {
        count: responseJson.count,
        data: responseJson.data,
        limit: responseJson.limit,
        offset: responseJson.offset,
    }
}

export async function fetchActivityLogSummary(
    filters: ActivityLogFilters,
): Promise<ActivityLogSummary> {
    const input = auditTrailValidator.auditTrailSummaryInputSchema.parse({
        filters,
    })
    const responseJson = await (
        await auditTrailClient.summary.$query({ json: input })
    ).json()
    if (!responseJson.success) throw new Error(responseJson.error.message)
    return responseJson.data
}

export async function fetchActivityLogDetail(
    publicId: string,
): Promise<ActivityLogDetail> {
    const param = auditTrailValidator.auditTrailDetailInputSchema.parse({
        publicId,
    })
    const responseJson = await (
        await auditTrailClient[':publicId'].$get({ param })
    ).json()
    if (!responseJson.success) throw new Error(responseJson.error.message)
    return responseJson.data
}
