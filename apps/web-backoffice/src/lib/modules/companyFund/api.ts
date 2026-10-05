import * as companyFundValidator from '@loanms/validator/backoffice/companyFund'
import * as reportValidator from '@loanms/validator/backoffice/report'
import type { z } from 'zod'

import { companyFundClient, overdueClient, reportsClient } from '$lib/clients'
import type {
    CapitalTransaction,
    CompanyFundSummary,
    OverdueLoan,
    ReportSummary,
} from './types'

export type CompanyFundSetupInput = z.output<
    typeof companyFundValidator.companyFundSetupInputSchema
>
export type CapitalInjectionInput = z.output<
    typeof companyFundValidator.capitalInjectionInputSchema
>
export type CapitalWithdrawalInput = z.output<
    typeof companyFundValidator.capitalWithdrawalInputSchema
>
export type ManualFundTransactionInput = z.output<
    typeof companyFundValidator.manualFundTransactionInputSchema
>

export async function setupCompanyFund(request: CompanyFundSetupInput) {
    const input =
        companyFundValidator.companyFundSetupInputSchema.parse(request)
    const response = await (
        await companyFundClient.setup.$post({ json: input })
    ).json()
    if (!response.success) throw new Error(response.error.message)
    return response.data
}

export async function injectCapital(request: CapitalInjectionInput) {
    const input =
        companyFundValidator.capitalInjectionInputSchema.parse(request)
    const response = await (
        await companyFundClient.capitalInjection.$post({ json: input })
    ).json()
    if (!response.success) throw new Error(response.error.message)
    return response.data
}

export async function withdrawCapital(request: CapitalWithdrawalInput) {
    const input =
        companyFundValidator.capitalWithdrawalInputSchema.parse(request)
    const response = await (
        await companyFundClient.capitalWithdrawal.$post({ json: input })
    ).json()
    if (!response.success) throw new Error(response.error.message)
    return response.data
}

export async function recordManualFundTransaction(
    request: ManualFundTransactionInput,
) {
    const input =
        companyFundValidator.manualFundTransactionInputSchema.parse(request)
    const response = await (
        await companyFundClient.manualTransaction.$post({ json: input })
    ).json()
    if (!response.success) throw new Error(response.error.message)
    return response.data
}

export async function fetchCompanyFundSummary(): Promise<CompanyFundSummary> {
    const response = await (await companyFundClient.summary.$get()).json()
    if (!response.success) throw new Error(response.error.message)
    return response.data
}

export async function fetchCapitalTransactions(request: unknown): Promise<{
    count: number
    data: CapitalTransaction[]
}> {
    const input =
        companyFundValidator.capitalTransactionReadManyInputSchema.parse(
            request,
        )
    const response = await (
        await companyFundClient.transactions.$query({ json: input })
    ).json()
    if (!response.success) throw new Error(response.error.message)
    return response
}

export async function fetchReportSummary(
    request: unknown,
): Promise<ReportSummary> {
    const input = reportValidator.reportReadInputSchema.parse(request)
    const response = await (
        await reportsClient.summary.$query({ json: input })
    ).json()
    if (!response.success) throw new Error(response.error.message)
    return response.data
}

export async function fetchOverdueLoans(request: unknown): Promise<{
    count: number
    data: OverdueLoan[]
}> {
    const input = reportValidator.overdueReadManyInputSchema.parse(request)
    const response = await (
        await overdueClient.readMany.$query({ json: input })
    ).json()
    if (!response.success) throw new Error(response.error.message)
    return response
}
