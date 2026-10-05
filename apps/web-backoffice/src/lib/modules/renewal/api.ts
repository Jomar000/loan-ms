import * as renewalValidator from '@loanms/validator/backoffice/renewal'

import { renewalsClient } from '$lib/clients'
import type {
    Renewal,
    RenewalCreateInput,
    RenewalListRequest,
    RenewalQuote,
    RenewalQuoteInput,
} from './types'

export async function quoteRenewal(
    input: RenewalQuoteInput,
): Promise<RenewalQuote> {
    const parsed = renewalValidator.renewalQuoteInputSchema.parse(input)
    const responseJson = await (
        await renewalsClient.quote.$post({ json: parsed })
    ).json()
    if (!responseJson.success) throw new Error(responseJson.error.message)
    return responseJson.data
}

export async function createRenewal(
    input: RenewalCreateInput,
): Promise<Renewal> {
    const parsed = renewalValidator.renewalCreateInputSchema.parse(input)
    const responseJson = await (
        await renewalsClient.index.$post({ json: parsed })
    ).json()
    if (!responseJson.success) throw new Error(responseJson.error.message)
    return responseJson.data
}

export async function fetchRenewals(request: RenewalListRequest): Promise<{
    count: number
    data: Renewal[]
    limit: number
    offset: number
}> {
    const input = renewalValidator.renewalReadManyInputSchema.parse(request)
    const responseJson = await (
        await renewalsClient.readMany.$query({ json: input })
    ).json()
    if (!responseJson.success) throw new Error(responseJson.error.message)
    return responseJson
}
