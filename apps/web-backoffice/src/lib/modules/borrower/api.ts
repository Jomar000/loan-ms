import * as borrowerValidator from '@loanms/validator/backoffice/borrower'

import { borrowersClient } from '$lib/clients'
import type {
    Borrower,
    BorrowerCreateInput,
    BorrowerDocument,
    BorrowerFilters,
    BorrowerListItem,
    BorrowerPaymentTag,
    BorrowerPaymentTagSummary,
    BorrowerUpdateInput,
} from './types'

export type BorrowerListRequest = {
    filters?: BorrowerFilters
    limit?: number
    offset?: number
    sortOrder?: 'asc' | 'desc'
}

export async function fetchBorrowers(request: BorrowerListRequest): Promise<{
    count: number
    data: BorrowerListItem[]
    limit: number
    offset: number
}> {
    const input = borrowerValidator.readManyInputSchema.parse(request)
    const responseJson = await (
        await borrowersClient.readMany.$query({ json: input })
    ).json()
    if (!responseJson.success) throw new Error(responseJson.error.message)
    return responseJson
}

export async function fetchBorrower(publicId: string): Promise<Borrower> {
    const param = borrowerValidator.readInputSchema.parse({ publicId })
    const responseJson = await (
        await borrowersClient.read[':publicId'].$get({ param })
    ).json()
    if (!responseJson.success) throw new Error(responseJson.error.message)
    return responseJson.data
}

export async function fetchBorrowerDocuments(
    borrowerPublicId: string,
): Promise<BorrowerDocument[]> {
    const param = borrowerValidator.documentReadManyInputSchema.parse({
        borrowerPublicId,
    })
    const responseJson = await (
        await borrowersClient.document.readMany[':borrowerPublicId'].$get({
            param,
        })
    ).json()
    if (!responseJson.success) throw new Error(responseJson.error.message)
    return responseJson.data
}

export async function fetchBorrowerPaymentTag(
    publicId: string,
): Promise<BorrowerPaymentTagSummary> {
    const param = borrowerValidator.paymentTagReadInputSchema.parse({
        publicId,
    })
    const responseJson = await (
        await borrowersClient.paymentTag.read[':publicId'].$get({ param })
    ).json()
    if (!responseJson.success) throw new Error(responseJson.error.message)
    return responseJson.data
}

export async function createBorrower(input: BorrowerCreateInput) {
    const parsed = borrowerValidator.createInputSchema.parse(input)
    const responseJson = await (
        await borrowersClient.create.$post({ json: parsed })
    ).json()
    if (!responseJson.success) throw new Error(responseJson.error.message)
    return responseJson.data
}

export async function updateBorrower(input: BorrowerUpdateInput) {
    const parsed = borrowerValidator.updateInputSchema.parse(input)
    const responseJson = await (
        await borrowersClient.update.$post({ json: parsed })
    ).json()
    if (!responseJson.success) throw new Error(responseJson.error.message)
    return responseJson.data
}

export async function archiveBorrower(publicId: string) {
    const input = borrowerValidator.archiveInputSchema.parse({ publicId })
    const responseJson = await (
        await borrowersClient.archive.$post({ json: input })
    ).json()
    if (!responseJson.success) throw new Error(responseJson.error.message)
    return responseJson.data
}

export async function overrideBorrowerPaymentTag(input: {
    paymentTag: BorrowerPaymentTag
    publicId: string
    reason: string
}) {
    const parsed = borrowerValidator.paymentTagOverrideInputSchema.parse(input)
    const responseJson = await (
        await borrowersClient.paymentTag.override.$post({ json: parsed })
    ).json()
    if (!responseJson.success) throw new Error(responseJson.error.message)
    return responseJson.data
}

export async function resetBorrowerPaymentTag(publicId: string) {
    const input = borrowerValidator.paymentTagResetInputSchema.parse({
        publicId,
    })
    const responseJson = await (
        await borrowersClient.paymentTag.reset.$post({ json: input })
    ).json()
    if (!responseJson.success) throw new Error(responseJson.error.message)
    return responseJson.data
}
