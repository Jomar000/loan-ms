import { z } from 'zod'

import * as base from '../shared/base.js'
import * as field from '../shared/field.js'
import { updatedFields } from '../shared/refinement.js'
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

export const loanStatusSchema = z.enum([
    'ACTIVE',
    'APPROVED',
    'CANCELLED',
    'DRAFT',
    'FULLY_PAID',
    'OVERDUE',
    'PENDING_APPROVAL',
    'RENEWED',
    'WRITTEN_OFF',
])

export const loanInstallmentStatusSchema = z.enum([
    'OVERDUE',
    'PAID',
    'PARTIAL',
    'UPCOMING',
    'WAIVED',
])

const loanProductFieldsSchema = z.object({
    formulaProfilePublicId: publicIdSchema,
    isActive: z.boolean().default(true),
    maximumPrincipalMinor: moneyMinorSchema('Maximum principal', 1),
    minimumPrincipalMinor: moneyMinorSchema('Minimum principal', 1),
    name: field.vText({ fieldName: 'Loan product name', max: 96 }),
})

export const loanProductCreateInputSchema = loanProductFieldsSchema
    .extend({
        idempotencyKey: z.uuidv7(),
    })
    .strict()
    .check((ctx) => {
        if (ctx.value.minimumPrincipalMinor > ctx.value.maximumPrincipalMinor) {
            ctx.issues.push({
                code: 'custom',
                input: ctx.value.minimumPrincipalMinor,
                message: 'Minimum principal must not exceed maximum principal.',
                path: ['minimumPrincipalMinor'],
            })
        }
    })

export const loanProductUpdateInputSchema = loanProductFieldsSchema
    .partial()
    .extend({
        publicId: publicIdSchema,
    })
    .strict()
    .check(updatedFields(['publicId']))

const loanProductFiltersSchema = z.object({
    isActive: z.boolean().optional(),
    search: field.vText({ fieldName: 'Search', max: 96 }).optional(),
})

export const loanProductReadManyInputSchema = base.readManyInputSchema.extend({
    filters: loanProductFiltersSchema.default({}),
})

const loanProductOutputDataSchema = z.object({
    formulaProfilePublicId: publicIdSchema,
    isActive: z.boolean(),
    maximumPrincipalMinor: z.number().int(),
    minimumPrincipalMinor: z.number().int(),
    name: z.string(),
    publicId: publicIdSchema,
})

export const loanProductCreateOutputSchema = base.outputSchema(
    loanProductOutputDataSchema,
)
export const loanProductReadManyOutputSchema = base.paginatedOutputSchema(
    z.array(loanProductOutputDataSchema),
)
export const loanProductUpdateOutputSchema = base.outputSchema(
    loanProductOutputDataSchema,
)

const loanRequestFieldsSchema = z.object({
    borrowerPublicId: publicIdSchema,
    firstPaymentDate: field.vIsoDate('First payment date'),
    loanProductPublicId: publicIdSchema,
    principalMinor: moneyMinorSchema('Principal', 1),
    releaseDate: field.vIsoDate('Release date'),
})

export const loanQuoteInputSchema = loanRequestFieldsSchema
    .strict()
    .check((ctx) => {
        if (ctx.value.firstPaymentDate <= ctx.value.releaseDate) {
            ctx.issues.push({
                code: 'custom',
                input: ctx.value.firstPaymentDate,
                message: 'First payment date must be after the release date.',
                path: ['firstPaymentDate'],
            })
        }
    })

export const loanCreateInputSchema = loanRequestFieldsSchema
    .extend({
        idempotencyKey: z.uuidv7(),
    })
    .strict()
    .check((ctx) => {
        if (ctx.value.firstPaymentDate <= ctx.value.releaseDate) {
            ctx.issues.push({
                code: 'custom',
                input: ctx.value.firstPaymentDate,
                message: 'First payment date must be after the release date.',
                path: ['firstPaymentDate'],
            })
        }
    })

const formulaSnapshotOutputSchema = z
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
            formulaProfilePublicId: publicIdSchema,
            formulaProfileVersion: z.number().int().positive(),
            installmentCount: z.number().int().positive(),
            paymentFrequency: paymentFrequencySchema,
            roundingMode: roundingModeSchema,
            termDays: z.number().int().positive(),
        }),
    )

const installmentOutputDataSchema = z.object({
    amountDueMinor: z.number().int().positive(),
    amountPaidMinor: z.number().int().nonnegative(),
    dueDate: z.string(),
    installmentNumber: z.number().int().positive(),
    publicId: publicIdSchema,
    status: loanInstallmentStatusSchema,
})

const loanOutputDataSchema = z.object({
    actualOutstandingBalanceMinor: z.number().int().nonnegative(),
    approvedAt: z.string().nullable(),
    approvedByUserPublicId: publicIdSchema.nullable(),
    borrowerPublicId: publicIdSchema,
    completedInstallmentCount: z.number().int().nonnegative(),
    createdAt: z.string(),
    dailyPaymentAmountMinor: z.number().int().nonnegative(),
    expectedCompletionDate: z.string(),
    firstPaymentDate: z.string(),
    formulaSnapshot: formulaSnapshotOutputSchema,
    installmentAmountMinor: z.number().int().positive(),
    installmentResidueMinor: z.number().int().nonnegative(),
    interestAmountMinor: z.number().int().nonnegative(),
    loanNumber: z.string(),
    loanProductPublicId: publicIdSchema,
    partialPaymentCreditMinor: z.number().int().nonnegative(),
    principalMinor: z.number().int().positive(),
    publicId: publicIdSchema,
    releaseDate: z.string(),
    releasedAt: z.string().nullable(),
    status: loanStatusSchema,
    totalAmountPaidMinor: z.number().int().nonnegative(),
    totalPayableMinor: z.number().int().positive(),
})

const loanQuoteOutputDataSchema = loanOutputDataSchema
    .pick({
        dailyPaymentAmountMinor: true,
        expectedCompletionDate: true,
        firstPaymentDate: true,
        formulaSnapshot: true,
        installmentAmountMinor: true,
        installmentResidueMinor: true,
        interestAmountMinor: true,
        principalMinor: true,
        releaseDate: true,
        totalPayableMinor: true,
    })
    .extend({
        installments: z.array(
            installmentOutputDataSchema.omit({ publicId: true, status: true }),
        ),
    })

export const loanQuoteOutputSchema = base.outputSchema(
    loanQuoteOutputDataSchema,
)
export const loanCreateOutputSchema = base.outputSchema(loanOutputDataSchema)

const loanFiltersSchema = z.object({
    borrowerPublicId: publicIdSchema.optional(),
    status: loanStatusSchema.optional(),
})

export const loanReadManyInputSchema = base.readManyInputSchema.extend({
    filters: loanFiltersSchema.default({}),
})

export const loanReadInputSchema = z.object({
    publicId: publicIdSchema,
})

export const loanReadManyOutputSchema = base.paginatedOutputSchema(
    z.array(loanOutputDataSchema.extend({ borrowerName: z.string() })),
)
export const loanReadOutputSchema = base.outputSchema(
    loanOutputDataSchema.extend({
        installments: z.array(installmentOutputDataSchema),
    }),
)

export const loanDeleteInputSchema = z.object({
    publicId: publicIdSchema,
})
export const loanDeleteOutputSchema = base.outputSchema(loanDeleteInputSchema)

export const loanApproveInputSchema = z
    .object({
        publicId: publicIdSchema,
    })
    .strict()
export const loanApproveOutputSchema = base.outputSchema(loanOutputDataSchema)

export const loanReleaseInputSchema = z
    .object({
        publicId: publicIdSchema,
    })
    .strict()
export const loanReleaseOutputSchema = base.outputSchema(
    loanOutputDataSchema.extend({
        installments: z.array(installmentOutputDataSchema),
    }),
)

export type TLoanCreateInput = z.output<typeof loanCreateInputSchema>
export type TLoanProductCreateInput = z.output<
    typeof loanProductCreateInputSchema
>
export type TLoanQuoteInput = z.output<typeof loanQuoteInputSchema>
