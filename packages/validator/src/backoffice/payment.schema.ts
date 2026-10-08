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

export const paymentStatusSchema = z.enum([
    'POSTED',
    'REVERSED',
])

const paymentFieldsSchema = z.object({
    amountReceivedMinor: moneyMinorSchema('Payment amount', 1),
    loanPublicId: publicIdSchema,
    notes: field.vText({ fieldName: 'Notes', max: 500 }).optional(),
    paymentDate: field.vIsoDate('Payment date'),
    paymentMethod: z.enum([
        'CASH',
        'GCASH',
        'BANK',
    ]),
    referenceNumber: field
        .vText({ fieldName: 'Reference number', max: 128 })
        .optional(),
})

const installmentAllocationOutputSchema = z.object({
    allocatedAmountMinor: z.number().int().positive(),
    amountDueMinor: z.number().int().positive(),
    amountPaidMinor: z.number().int().nonnegative(),
    dueDate: z.string(),
    installmentNumber: z.number().int().positive(),
    loanInstallmentPublicId: publicIdSchema,
    status: z.enum([
        'OVERDUE',
        'PAID',
        'PARTIAL',
        'UPCOMING',
        'WAIVED',
    ]),
})

const paymentOutputDataSchema = z.object({
    allocations: z.array(installmentAllocationOutputSchema),
    amountAllocatedMinor: z.number().int().nonnegative(),
    amountReceivedMinor: z.number().int().positive(),
    unallocatedMinor: z.number().int().nonnegative(),
    borrowerPublicId: publicIdSchema,
    completedInstallmentsAfterPayment: z.number().int().nonnegative(),
    loanPublicId: publicIdSchema,
    partialPaymentCreditAfterPaymentMinor: z.number().int().nonnegative(),
    paymentDate: z.string(),
    paymentMethod: z.string(),
    paymentNumber: z.string(),
    paymentTypeSnapshot: z.enum([
        'DAILY',
        'MONTHLY',
        'WEEKLY',
    ]),
    publicId: publicIdSchema,
    remainingInstallmentsAfterPayment: z.number().int().nonnegative(),
    referenceNumber: z.string().nullable(),
    actualOutstandingBalanceAfterPaymentMinor: z.number().int().nonnegative(),
    status: paymentStatusSchema,
})

const requireElectronicReference = <T extends z.ZodType>(schema: T) =>
    schema.check((ctx) => {
        const input = ctx.value as {
            paymentMethod: string
            referenceNumber?: string
        }
        if (input.paymentMethod !== 'CASH' && !input.referenceNumber?.trim()) {
            ctx.issues.push({
                code: 'custom',
                input: input.referenceNumber,
                message:
                    'Reference number is required for GCash and bank payments.',
                path: ['referenceNumber'],
            })
        }
    })

export const paymentQuoteInputSchema = requireElectronicReference(
    paymentFieldsSchema.strict(),
)
export const paymentQuoteOutputSchema = base.outputSchema(
    paymentOutputDataSchema.omit({
        paymentNumber: true,
        publicId: true,
        status: true,
    }),
)

export const paymentCreateInputSchema = requireElectronicReference(
    paymentFieldsSchema.extend({ idempotencyKey: z.uuidv7() }).strict(),
)
export const paymentCreateOutputSchema = base.outputSchema(
    paymentOutputDataSchema,
)

export const paymentReverseInputSchema = z
    .object({
        reason: field.vText({ fieldName: 'Reversal reason', min: 3, max: 500 }),
    })
    .strict()
export const paymentReverseOutputSchema = base.outputSchema(
    paymentOutputDataSchema,
)
export const paymentPublicIdInputSchema = z.object({ publicId: publicIdSchema })

const paymentReadManyFiltersSchema = z.object({
    borrowerPublicId: publicIdSchema.optional(),
    loanPublicId: publicIdSchema.optional(),
    status: paymentStatusSchema.optional(),
})

export const paymentReadManyInputSchema = base.readManyInputSchema.extend({
    filters: paymentReadManyFiltersSchema.default({}),
})
export const paymentReadManyOutputSchema = base.paginatedOutputSchema(
    z.array(paymentOutputDataSchema),
)

const collectionItemOutputSchema = z.object({
    amountDueMinor: z.number().int().positive(),
    amountPaidMinor: z.number().int().nonnegative(),
    borrowerName: z.string(),
    borrowerPublicId: publicIdSchema,
    dueDate: z.string(),
    installmentNumber: z.number().int().positive(),
    loanNumber: z.string(),
    loanPublicId: publicIdSchema,
    loanStatus: z.enum([
        'ACTIVE',
        'FULLY_PAID',
        'OVERDUE',
        'RENEWED',
        'WRITTEN_OFF',
    ]),
    paymentFrequency: z.enum([
        'DAILY',
        'MONTHLY',
        'WEEKLY',
    ]),
    remainingAmountMinor: z.number().int().nonnegative(),
    status: z.enum([
        'OVERDUE',
        'PAID',
        'PARTIAL',
        'UPCOMING',
        'WAIVED',
    ]),
})

export const collectionDateInputSchema = z.object({
    date: field.vIsoDate('Date'),
})
export const collectionBorrowerInputSchema = z.object({
    borrowerPublicId: publicIdSchema,
})
export const collectionOverdueInputSchema = z.object({
    limit: field.vInt({ fieldName: 'Limit', min: 1, max: 100 }).default(100),
})
export const collectionOutputSchema = base.outputSchema(
    z.array(collectionItemOutputSchema),
)

export type TPaymentCreateInput = z.output<typeof paymentCreateInputSchema>
export type TPaymentQuoteInput = z.output<typeof paymentQuoteInputSchema>
