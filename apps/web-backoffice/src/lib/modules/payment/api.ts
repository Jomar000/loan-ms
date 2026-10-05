import * as paymentValidator from '@loanms/validator/backoffice/payment'

import { collectionsClient, paymentsClient } from '$lib/clients'
import type {
    CollectionItem,
    Payment,
    PaymentCreateInput,
    PaymentDraft,
    PaymentListRequest,
    PaymentQuote,
} from './types'

export async function quotePayment(input: PaymentDraft): Promise<PaymentQuote> {
    const parsed = paymentValidator.paymentQuoteInputSchema.parse(input)
    const responseJson = await (
        await paymentsClient.quote.$post({ json: parsed })
    ).json()
    if (!responseJson.success) throw new Error(responseJson.error.message)
    return responseJson.data
}

export async function createPayment(
    input: PaymentCreateInput,
): Promise<Payment> {
    const parsed = paymentValidator.paymentCreateInputSchema.parse(input)
    const responseJson = await (
        await paymentsClient.create.$post({ json: parsed })
    ).json()
    if (!responseJson.success) throw new Error(responseJson.error.message)
    return responseJson.data
}

export async function reversePayment(input: {
    publicId: string
    reason: string
}): Promise<Payment> {
    const param = paymentValidator.paymentPublicIdInputSchema.parse({
        publicId: input.publicId,
    })
    const json = paymentValidator.paymentReverseInputSchema.parse({
        reason: input.reason,
    })
    const responseJson = await (
        await paymentsClient[':publicId'].reverse.$post({ json, param })
    ).json()
    if (!responseJson.success) throw new Error(responseJson.error.message)
    return responseJson.data
}

export async function fetchPayments(request: PaymentListRequest): Promise<{
    count: number
    data: Payment[]
    limit: number
    offset: number
}> {
    const input = paymentValidator.paymentReadManyInputSchema.parse(request)
    const responseJson = await (
        await paymentsClient.readMany.$query({ json: input })
    ).json()
    if (!responseJson.success) throw new Error(responseJson.error.message)
    return responseJson
}

export async function fetchCollectionsForDate(
    date: string,
): Promise<CollectionItem[]> {
    const param = paymentValidator.collectionDateInputSchema.parse({ date })
    const responseJson = await (
        await collectionsClient.date[':date'].$get({ param })
    ).json()
    if (!responseJson.success) throw new Error(responseJson.error.message)
    return responseJson.data
}
