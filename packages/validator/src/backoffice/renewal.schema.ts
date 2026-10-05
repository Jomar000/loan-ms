import { z } from 'zod'

import * as base from '../shared/base.js'
import * as field from '../shared/field.js'
import {
    paymentFrequencySchema,
    roundingModeSchema,
} from './loanCalculation.schema.js'

const MAX_MONEY_MINOR = 1_000_000_000_000

const moneyMinorSchema = (fieldName: string, min = 0) =>
    field.vBigInt({
        fieldName,
        max: MAX_MONEY_MINOR,
        min,
    })

const publicIdSchema = z.uuid()

export const renewalStatusSchema = z.enum([
    'APPROVED',
    'PENDING_APPROVAL',
    'RELEASED',
    'CANCELLED',
])

export const partialCreditHandlingSchema = z.enum([
    'APPLY_TO_SETTLEMENT',
    'CARRY_FORWARD',
    'MANUAL_REVIEW',
    'REFUND',
])

const renewalRequestFieldsSchema = z.object({
    firstPaymentDate: field.vIsoDate('First payment date'),
    previousLoanPublicId: publicIdSchema,
    releaseDate: field.vIsoDate('Release date'),
    renewalPrincipalMinor: moneyMinorSchema('Renewal principal', 1),
})

const renewalDates = <TSchema extends z.ZodType>(schema: TSchema) =>
    schema.check((ctx) => {
        const value = ctx.value as {
            firstPaymentDate: string
            releaseDate: string
        }
        if (value.firstPaymentDate < value.releaseDate) {
            ctx.issues.push({
                code: 'custom',
                input: value.firstPaymentDate,
                message:
                    'First payment date must be on or after the release date.',
                path: ['firstPaymentDate'],
            })
        }
    })

export const renewalQuoteInputSchema = renewalDates(
    renewalRequestFieldsSchema.strict(),
)

export const renewalCreateInputSchema = renewalDates(
    renewalRequestFieldsSchema
        .extend({
            idempotencyKey: z.uuidv7(),
        })
        .strict(),
)

const renewalFormulaSnapshotSchema = z
    .discriminatedUnion('interestMethod', [
        z.object({
            fixedInterestAmountMinor: z.number().int().nonnegative(),
            interestMethod: z.literal('FIXED_AMOUNT'),
            interestRateBasisPoints: z.null(),
        }),
        z.object({
            fixedInterestAmountMinor: z.null(),
            interestMethod: z.literal('FLAT_PERCENTAGE'),
            interestRateBasisPoints: z.number().int().nonnegative(),
        }),
    ])
    .and(
        z.object({
            installmentCount: z.number().int().positive(),
            paymentFrequency: paymentFrequencySchema,
            roundingMode: roundingModeSchema,
            termDays: z.number().int().positive(),
        }),
    )

const renewalInstallmentSchema = z.object({
    amountDueMinor: z.number().int().positive(),
    dueDate: z.string(),
    installmentNumber: z.number().int().positive(),
})

const renewalQuoteDataSchema = z.object({
    borrowerPublicId: publicIdSchema,
    cashReleaseAmountMinor: z.number().int(),
    dailyPaymentAmountMinor: z.number().int().positive(),
    expectedCompletionDate: z.string(),
    firstPaymentDate: z.string(),
    installments: z.array(renewalInstallmentSchema),
    interestAmountMinor: z.number().int().nonnegative(),
    partialCreditHandling: partialCreditHandlingSchema,
    previousLoanNumber: z.string(),
    previousLoanPublicId: publicIdSchema,
    previousCompletedInstallmentCount: z.number().int().nonnegative(),
    previousPartialCreditMinor: z.number().int().nonnegative(),
    previousRemainingInstallmentCount: z.number().int().nonnegative(),
    renewalFormulaSnapshot: renewalFormulaSnapshotSchema,
    renewalPrincipalMinor: z.number().int().positive(),
    renewalSettlementBalanceMinor: z.number().int().nonnegative(),
    riskWarning: z.string().nullable(),
    totalPayableMinor: z.number().int().positive(),
})

export const renewalQuoteOutputSchema = base.outputSchema(
    renewalQuoteDataSchema,
)

const renewalOutputDataSchema = renewalQuoteDataSchema
    .pick({
        borrowerPublicId: true,
        cashReleaseAmountMinor: true,
        partialCreditHandling: true,
        previousLoanNumber: true,
        previousLoanPublicId: true,
        previousCompletedInstallmentCount: true,
        previousPartialCreditMinor: true,
        previousRemainingInstallmentCount: true,
        renewalPrincipalMinor: true,
        renewalSettlementBalanceMinor: true,
    })
    .extend({
        approvedAt: z.string().nullable(),
        newLoanNumber: z.string().nullable(),
        newLoanPublicId: publicIdSchema.nullable(),
        processedAt: z.string(),
        publicId: publicIdSchema,
        status: renewalStatusSchema,
    })

export const renewalCreateOutputSchema = base.outputSchema(
    renewalOutputDataSchema,
)

const renewalFiltersSchema = z.object({
    borrowerPublicId: publicIdSchema.optional(),
    previousLoanPublicId: publicIdSchema.optional(),
    status: renewalStatusSchema.optional(),
})

export const renewalReadManyInputSchema = base.readManyInputSchema.extend({
    filters: renewalFiltersSchema.default({}),
})

export const renewalReadInputSchema = z
    .object({
        publicId: publicIdSchema,
    })
    .strict()

export const renewalReadManyOutputSchema = base.paginatedOutputSchema(
    z.array(renewalOutputDataSchema),
)
export const renewalReadOutputSchema = base.outputSchema(
    renewalOutputDataSchema,
)

export type TRenewalCreateInput = z.output<typeof renewalCreateInputSchema>
export type TRenewalQuoteInput = z.output<typeof renewalQuoteInputSchema>
export type TRenewalStatus = z.output<typeof renewalStatusSchema>
