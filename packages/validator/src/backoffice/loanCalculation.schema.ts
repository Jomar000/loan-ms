import { z } from 'zod'

import * as base from '../shared/base.js'
import * as field from '../shared/field.js'

const MAX_INTEREST_RATE_BASIS_POINTS = 100_000
const MAX_INSTALLMENT_COUNT = 3_660
const MAX_MONEY_MINOR = 1_000_000_000_000
const MAX_TERM_DAYS = 3_660

const minorMoneySchema = (fieldName: string, min = 0) =>
    field.vBigInt({
        fieldName,
        min,
        max: MAX_MONEY_MINOR,
    })

const interestRateBasisPointsSchema = field.vInt({
    fieldName: 'Interest rate basis points',
    min: 0,
    max: MAX_INTEREST_RATE_BASIS_POINTS,
})

const installmentCountSchema = field.vInt({
    fieldName: 'Installment count',
    min: 1,
    max: MAX_INSTALLMENT_COUNT,
})

const termDaysSchema = field.vInt({
    fieldName: 'Term days',
    min: 1,
    max: MAX_TERM_DAYS,
})

export const interestMethodSchema = z.enum([
    'FIXED_AMOUNT',
    'FLAT_PERCENTAGE',
])

export const paymentFrequencySchema = z.enum([
    'DAILY',
    'WEEKLY',
    'MONTHLY',
])

export const renewalSettlementMethodSchema = z.enum([
    'COMPLETED_INSTALLMENT_BALANCE',
    'EXACT_OUTSTANDING_BALANCE',
])

export const partialCreditPolicySchema = z.enum([
    'APPLY_TO_SETTLEMENT',
    'CARRY_FORWARD',
    'MANUAL_REVIEW',
    'REFUND',
])

export const roundingModeSchema = z.enum([
    'DOWN',
    'HALF_UP',
    'UP',
])

const formulaProfilePolicySchema = z.object({
    allowRenewalPrincipalChange: z.boolean(),
    minimumRenewalCompletedInstallments: field.vInt({
        fieldName: 'Minimum renewal completed installments',
        min: 0,
        max: MAX_INSTALLMENT_COUNT,
    }),
    partialCreditPolicy: partialCreditPolicySchema,
    renewalSettlementMethod: renewalSettlementMethodSchema,
    roundingMode: roundingModeSchema,
    // Calculated money is always represented in whole centavos, so no
    // sub-centavo precision is permitted.
    roundingPrecision: field.vInt({
        fieldName: 'Rounding precision',
        min: 0,
        max: 0,
    }),
})

const formulaProfileBaseSchema = z.object({
    effectiveDate: field.vIsoDate('Effective date'),
    installmentCount: installmentCountSchema,
    name: field.vText({ fieldName: 'Formula profile name', max: 96 }),
    paymentFrequency: paymentFrequencySchema,
    termDays: termDaysSchema,
    version: field.vInt({
        fieldName: 'Formula profile version',
        min: 1,
        max: 1_000_000,
    }),
})

const flatPercentageFormulaProfileInputSchema = formulaProfileBaseSchema
    .extend({
        interestMethod: z.literal('FLAT_PERCENTAGE'),
        interestRateBasisPoints: interestRateBasisPointsSchema,
    })
    .extend(formulaProfilePolicySchema.shape)
    .strict()

const fixedAmountFormulaProfileInputSchema = formulaProfileBaseSchema
    .extend({
        fixedInterestAmountMinor: minorMoneySchema('Fixed interest amount', 1),
        interestMethod: z.literal('FIXED_AMOUNT'),
    })
    .extend(formulaProfilePolicySchema.shape)
    .strict()

export const calculationFormulaProfileInputSchema = z
    .discriminatedUnion('interestMethod', [
        fixedAmountFormulaProfileInputSchema,
        flatPercentageFormulaProfileInputSchema,
    ])
    .check((ctx) => {
        if (
            ctx.value.minimumRenewalCompletedInstallments >
            ctx.value.installmentCount
        ) {
            ctx.issues.push({
                code: 'custom',
                input: ctx.value.minimumRenewalCompletedInstallments,
                message:
                    'Minimum renewal completed installments must not exceed installment count.',
                path: ['minimumRenewalCompletedInstallments'],
            })
        }
    })

const formulaProfileFiltersSchema = z.object({
    isActive: z.boolean().optional(),
    search: field.vText({ fieldName: 'Search', max: 96 }).optional(),
})

export const formulaProfileReadManyInputSchema =
    base.readManyInputSchema.extend({
        filters: formulaProfileFiltersSchema.default({}),
    })

export const formulaProfileReadInputSchema = z
    .object({ publicId: z.uuid() })
    .strict()

export const formulaProfileCreateInputSchema = z
    .object({
        formulaProfile: calculationFormulaProfileInputSchema,
        idempotencyKey: z.uuidv7(),
    })
    .strict()

export const formulaProfileVersionInputSchema = formulaProfileCreateInputSchema

export const formulaProfileActivateInputSchema = z
    .object({
        isDefault: z.boolean(),
    })
    .strict()

const formulaProfileOutputDataSchema = z.object({
    allowRenewalPrincipalChange: z.boolean(),
    createdAt: z.string(),
    effectiveDate: field.vIsoDate('Effective date'),
    fixedInterestAmountMinor: z.number().int().nonnegative().nullable(),
    installmentCount: z.number().int().positive(),
    interestMethod: interestMethodSchema,
    interestRateBasisPoints: z.number().int().nonnegative(),
    isActive: z.boolean(),
    isDefault: z.boolean(),
    minimumRenewalCompletedInstallments: z.number().int().nonnegative(),
    name: z.string(),
    partialCreditPolicy: partialCreditPolicySchema,
    paymentFrequency: paymentFrequencySchema,
    publicId: z.uuid(),
    renewalSettlementMethod: renewalSettlementMethodSchema,
    retiredAt: z.string().nullable(),
    roundingMode: roundingModeSchema,
    termDays: z.number().int().positive(),
    version: z.number().int().positive(),
})

export const formulaProfileOutputSchema = base.outputSchema(
    formulaProfileOutputDataSchema,
)

export const formulaProfileReadManyOutputSchema = base.paginatedOutputSchema(
    z.array(formulaProfileOutputDataSchema),
)

const loanCalculationPreviewOutputDataSchema = z.object({
    actualOutstandingBalanceMinor: z.number().int().nonnegative(),
    completedInstallmentCount: z.number().int().nonnegative(),
    dailyPaymentAmountMinor: z.number().int().nonnegative(),
    installmentAmountMinor: z.number().int().nonnegative(),
    installmentResidueMinor: z.number().int().nonnegative(),
    interestAmountMinor: z.number().int().nonnegative(),
    partialPaymentCreditMinor: z.number().int().nonnegative(),
    remainingInstallmentCount: z.number().int().nonnegative(),
    renewalCashReleaseMinor: z.number().int().nonnegative(),
    renewalSettlementBalanceMinor: z.number().int().nonnegative(),
    totalPayableMinor: z.number().int().positive(),
})

export const loanCalculationPreviewOutputSchema = base.outputSchema(
    loanCalculationPreviewOutputDataSchema,
)

export const loanCalculationPreviewInputSchema = z
    .object({
        firstPaymentDate: field.vIsoDate('First payment date'),
        formulaProfile: calculationFormulaProfileInputSchema,
        principalMinor: minorMoneySchema('Principal', 1),
        releaseDate: field.vIsoDate('Release date'),
        totalPaidMinor: minorMoneySchema('Total paid').default(0),
    })
    .strict()
    .check((ctx) => {
        if (ctx.value.firstPaymentDate < ctx.value.releaseDate) {
            ctx.issues.push({
                code: 'custom',
                input: ctx.value.firstPaymentDate,
                message:
                    'First payment date must be on or after the release date.',
                path: ['firstPaymentDate'],
            })
        }
    })

export const renewalCalculationQuoteInputSchema = z
    .object({
        asOfDate: field.vIsoDate('As-of date'),
        firstPaymentDate: field.vIsoDate('First payment date'),
        formulaProfile: calculationFormulaProfileInputSchema,
        principalMinor: minorMoneySchema('Principal', 1),
        releaseDate: field.vIsoDate('Release date'),
        renewalPrincipalMinor: minorMoneySchema('Renewal principal', 1),
        totalPaidMinor: minorMoneySchema('Total paid'),
    })
    .strict()
    .check((ctx) => {
        if (ctx.value.firstPaymentDate < ctx.value.releaseDate) {
            ctx.issues.push({
                code: 'custom',
                input: ctx.value.firstPaymentDate,
                message:
                    'First payment date must be on or after the release date.',
                path: ['firstPaymentDate'],
            })
        }

        if (ctx.value.asOfDate < ctx.value.releaseDate) {
            ctx.issues.push({
                code: 'custom',
                input: ctx.value.asOfDate,
                message: 'As-of date must be on or after the release date.',
                path: ['asOfDate'],
            })
        }

        if (
            !ctx.value.formulaProfile.allowRenewalPrincipalChange &&
            ctx.value.renewalPrincipalMinor !== ctx.value.principalMinor
        ) {
            ctx.issues.push({
                code: 'custom',
                input: ctx.value.renewalPrincipalMinor,
                message:
                    'Renewal principal must equal the original principal for this formula profile.',
                path: ['renewalPrincipalMinor'],
            })
        }
    })

export type TCalculationFormulaProfileInput = z.output<
    typeof calculationFormulaProfileInputSchema
>
export type TLoanCalculationPreviewInput = z.output<
    typeof loanCalculationPreviewInputSchema
>
export type TRenewalCalculationQuoteInput = z.output<
    typeof renewalCalculationQuoteInputSchema
>
