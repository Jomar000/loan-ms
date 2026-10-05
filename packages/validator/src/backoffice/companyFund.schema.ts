import { z } from 'zod'

import * as base from '../shared/base.js'
import * as field from '../shared/field.js'

const MAX_MONEY_MINOR = 1_000_000_000_000

const moneyMinorSchema = (fieldName: string, min = 0) =>
    field.vBigInt({
        fieldName,
        max: MAX_MONEY_MINOR,
        min,
    })

const publicIdSchema = z.uuid()

export const capitalTransactionTypeSchema = z.enum([
    'ADJUSTMENT',
    'CAPITAL_INJECTION',
    'CAPITAL_WITHDRAWAL',
    'EXPENSE',
    'INTEREST_COLLECTION',
    'LOAN_PRINCIPAL_RELEASE',
    'OPENING_CAPITAL',
    'PRINCIPAL_COLLECTION',
    'REFUND',
    'RENEWAL_RELEASE',
    'RENEWAL_PARTIAL_CREDIT_TRANSFER',
    'RENEWAL_SETTLEMENT_INTEREST',
    'RENEWAL_SETTLEMENT_PRINCIPAL',
    'WRITE_OFF',
])

export const capitalTransactionDirectionSchema = z.enum([
    'IN',
    'OUT',
])

const companyFundOutputDataSchema = z.object({
    currency: z.string(),
    fundName: z.string(),
    isPrimary: z.literal(true),
    openingCapitalMinor: z.number().int().nonnegative(),
    publicId: publicIdSchema,
})

export const companyFundSetupInputSchema = z
    .object({
        currency: field
            .vText({ fieldName: 'Currency', min: 3, max: 3 })
            .default('PHP'),
        fundName: field.vText({ fieldName: 'Fund name', min: 1, max: 128 }),
        idempotencyKey: z.uuidv7(),
        openingCapitalMinor: moneyMinorSchema('Opening capital', 1),
        transactionDate: field.vIsoDate('Transaction date'),
    })
    .strict()

const capitalMovementFieldsSchema = z.object({
    amountMinor: moneyMinorSchema('Capital amount', 1),
    idempotencyKey: z.uuidv7(),
    reason: field.vText({ fieldName: 'Reason', min: 3, max: 500 }),
    referenceNumber: field
        .vText({ fieldName: 'Reference number', max: 128 })
        .optional(),
    transactionDate: field.vIsoDate('Transaction date'),
})

export const capitalInjectionInputSchema = capitalMovementFieldsSchema.strict()
export const capitalWithdrawalInputSchema = capitalMovementFieldsSchema.strict()

export const manualFundTransactionInputSchema = capitalMovementFieldsSchema
    .extend({
        direction: capitalTransactionDirectionSchema.default('OUT'),
        transactionType: z.enum([
            'ADJUSTMENT',
            'EXPENSE',
            'WRITE_OFF',
        ]),
    })
    .strict()
    .check((ctx) => {
        if (
            ctx.value.transactionType !== 'ADJUSTMENT' &&
            ctx.value.direction !== 'OUT'
        ) {
            ctx.issues.push({
                code: 'custom',
                input: ctx.value.direction,
                message: 'Expenses and write-offs must be cash-out entries.',
                path: ['direction'],
            })
        }
    })

const capitalTransactionOutputDataSchema = z.object({
    amountMinor: z.number().int().positive(),
    direction: capitalTransactionDirectionSchema,
    fundPublicId: publicIdSchema,
    loanPublicId: publicIdSchema.nullable(),
    paymentPublicId: publicIdSchema.nullable(),
    publicId: publicIdSchema,
    referenceNumber: z.string().nullable(),
    renewalPublicId: publicIdSchema.nullable(),
    transactionAt: z.string(),
    transactionNumber: z.string(),
    transactionType: capitalTransactionTypeSchema,
})

export const capitalTransactionCreateOutputSchema = base.outputSchema(
    capitalTransactionOutputDataSchema,
)
export const companyFundSetupOutputSchema = base.outputSchema(
    companyFundOutputDataSchema.extend({
        openingTransaction: capitalTransactionOutputDataSchema,
    }),
)

const capitalTransactionFiltersSchema = z.object({
    dateFrom: field.vIsoDate('From date').optional(),
    dateTo: field.vIsoDate('To date').optional(),
    transactionType: capitalTransactionTypeSchema.optional(),
})

export const capitalTransactionReadManyInputSchema = base.readManyInputSchema
    .extend({ filters: capitalTransactionFiltersSchema.default({}) })
    .check((ctx) => {
        const { dateFrom, dateTo } = ctx.value.filters
        if (dateFrom && dateTo && dateFrom > dateTo) {
            ctx.issues.push({
                code: 'custom',
                input: ctx.value.filters,
                message: 'From date must be on or before To date.',
                path: [
                    'filters',
                    'dateFrom',
                ],
            })
        }
    })

export const capitalTransactionReadManyOutputSchema =
    base.paginatedOutputSchema(z.array(capitalTransactionOutputDataSchema))

export const companyFundSummaryOutputSchema = base.outputSchema(
    z.object({
        additionalCapitalMinor: z.number().int().nonnegative(),
        availableCashMinor: z.number().int(),
        capitalWithdrawnMinor: z.number().int().nonnegative(),
        currency: z.string().nullable(),
        fundPublicId: publicIdSchema.nullable(),
        interestCollectedMinor: z.number().int().nonnegative(),
        expensesMinor: z.number().int().nonnegative(),
        netEarningsMinor: z.number().int(),
        openingCapitalMinor: z.number().int().nonnegative(),
        outstandingPrincipalMinor: z.number().int().nonnegative(),
        principalCollectedMinor: z.number().int().nonnegative(),
        principalReleasedMinor: z.number().int().nonnegative(),
        renewalReleasedMinor: z.number().int().nonnegative(),
        refundedMinor: z.number().int().nonnegative(),
        writeOffsMinor: z.number().int().nonnegative(),
    }),
)

export type TCapitalInjectionInput = z.output<
    typeof capitalInjectionInputSchema
>
export type TCapitalWithdrawalInput = z.output<
    typeof capitalWithdrawalInputSchema
>
export type TManualFundTransactionInput = z.output<
    typeof manualFundTransactionInputSchema
>
