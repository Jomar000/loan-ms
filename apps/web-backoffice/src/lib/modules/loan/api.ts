import * as loanValidator from '@loanms/validator/backoffice/loan'

import { loansClient } from '$lib/clients'
import type {
    Loan,
    LoanCreateInput,
    LoanFilters,
    LoanListItem,
    LoanProduct,
    LoanProductCreateInput,
    LoanQuote,
    LoanQuoteInput,
} from './types'

export type LoanListRequest = {
    filters?: LoanFilters
    limit?: number
    offset?: number
    sortOrder?: 'asc' | 'desc'
}

export async function fetchLoanProducts(): Promise<LoanProduct[]> {
    const responseJson = await (
        await loansClient.product.readMany.$query({
            json: loanValidator.loanProductReadManyInputSchema.parse({}),
        })
    ).json()
    if (!responseJson.success) throw new Error(responseJson.error.message)
    return responseJson.data
}

export async function createLoanProduct(input: LoanProductCreateInput) {
    const parsed = loanValidator.loanProductCreateInputSchema.parse(input)
    const responseJson = await (
        await loansClient.product.create.$post({ json: parsed })
    ).json()
    if (!responseJson.success) throw new Error(responseJson.error.message)
    return responseJson.data
}

export async function fetchLoans(request: LoanListRequest): Promise<{
    count: number
    data: LoanListItem[]
    limit: number
    offset: number
}> {
    const parsed = loanValidator.loanReadManyInputSchema.parse(request)
    const responseJson = await (
        await loansClient.readMany.$query({ json: parsed })
    ).json()
    if (!responseJson.success) throw new Error(responseJson.error.message)
    return responseJson
}

export async function fetchLoan(publicId: string): Promise<Loan> {
    const param = loanValidator.loanReadInputSchema.parse({ publicId })
    const responseJson = await (
        await loansClient.read[':publicId'].$get({ param })
    ).json()
    if (!responseJson.success) throw new Error(responseJson.error.message)
    return responseJson.data
}

export async function quoteLoan(input: LoanQuoteInput): Promise<LoanQuote> {
    const parsed = loanValidator.loanQuoteInputSchema.parse(input)
    const responseJson = await (
        await loansClient.quote.$post({ json: parsed })
    ).json()
    if (!responseJson.success) throw new Error(responseJson.error.message)
    return responseJson.data
}

export async function createLoan(
    input: LoanCreateInput,
): Promise<LoanListItem> {
    const parsed = loanValidator.loanCreateInputSchema.parse(input)
    const responseJson = await (
        await loansClient.create.$post({ json: parsed })
    ).json()
    if (!responseJson.success) throw new Error(responseJson.error.message)
    return responseJson.data
}

export async function approveLoan(publicId: string): Promise<LoanListItem> {
    const param = loanValidator.loanApproveInputSchema.parse({ publicId })
    const responseJson = await (
        await loansClient[':publicId'].approve.$post({ param })
    ).json()
    if (!responseJson.success) throw new Error(responseJson.error.message)
    return responseJson.data
}

export async function releaseLoan(publicId: string): Promise<Loan> {
    const param = loanValidator.loanReleaseInputSchema.parse({ publicId })
    const responseJson = await (
        await loansClient[':publicId'].release.$post({ param })
    ).json()
    if (!responseJson.success) throw new Error(responseJson.error.message)
    return responseJson.data
}
