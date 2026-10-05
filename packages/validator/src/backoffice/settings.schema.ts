import { z } from 'zod'

import * as base from '../shared/base.js'
import * as field from '../shared/field.js'
import * as refinement from '../shared/refinement.js'

export const paymentFrequencySchema = z.enum([
    'DAILY',
    'WEEKLY',
    'MONTHLY',
])

const missedInstallmentCountSchema = field.vInt({
    fieldName: 'Missed installment threshold',
    max: 3_660,
    min: 0,
})

export const borrowerTagThresholdSchema = z
    .object({
        badPayerMaximumMissedInstallments: missedInstallmentCountSchema,
        goodPayerMaximumMissedInstallments: missedInstallmentCountSchema,
        scammerMinimumMissedInstallments: missedInstallmentCountSchema,
    })
    .strict()
    .check((ctx) => {
        const {
            badPayerMaximumMissedInstallments,
            goodPayerMaximumMissedInstallments,
            scammerMinimumMissedInstallments,
        } = ctx.value
        if (
            goodPayerMaximumMissedInstallments >=
                badPayerMaximumMissedInstallments ||
            badPayerMaximumMissedInstallments >=
                scammerMinimumMissedInstallments
        ) {
            ctx.issues.push({
                code: 'custom',
                input: ctx.value,
                message:
                    'Tag thresholds must satisfy good maximum < bad maximum < scammer minimum.',
                path: ['badPayerMaximumMissedInstallments'],
            })
        }
    })

export const borrowerTagPolicySchema = z
    .object({
        allowManualOverride: z.boolean(),
        automaticTaggingEnabled: z.boolean(),
        blockNewLoanForScammer: z.boolean(),
        daily: borrowerTagThresholdSchema,
        monthly: borrowerTagThresholdSchema,
        requireBadPayerRenewalApproval: z.boolean(),
        requireOverrideReason: z.boolean(),
        requireScammerRenewalApproval: z.boolean(),
        showHistoricalWorstTag: z.boolean(),
        weekly: borrowerTagThresholdSchema,
    })
    .strict()

const systemSettingsDataSchema = z
    .object({
        allowAdvancePayments: z.boolean(),
        allowPartialPayments: z.boolean(),
        borrowerTagPolicy: borrowerTagPolicySchema,
        defaultLoanProductPublicId: z.uuid().nullable(),
        defaultPaymentFrequency: paymentFrequencySchema,
        enabledPaymentFrequencies: z
            .array(paymentFrequencySchema)
            .min(1)
            .check((ctx) => {
                refinement.uniqueArrayValues(ctx, {
                    message: 'Enabled payment frequencies must be unique.',
                    values: ctx.value,
                })
            }),
        requireRenewalApproval: z.boolean(),
    })
    .strict()
    .check((ctx) => {
        if (
            !ctx.value.enabledPaymentFrequencies.includes(
                ctx.value.defaultPaymentFrequency,
            )
        ) {
            ctx.issues.push({
                code: 'custom',
                input: ctx.value,
                message:
                    'Default payment frequency must be enabled for future loans.',
                path: ['defaultPaymentFrequency'],
            })
        }
    })

export const systemSettingsOutputSchema = systemSettingsDataSchema.extend({
    version: z.number().int().nonnegative(),
})

export const systemSettingsUpdateInputSchema = systemSettingsDataSchema
    .extend({
        expectedVersion: z.number().int().nonnegative(),
        idempotencyKey: z.uuidv7(),
    })
    .strict()

export const systemSettingsUpdateOutputSchema = base.outputSchema(
    systemSettingsOutputSchema,
)

export const systemSettingsCurrentOutputSchema = base.outputSchema(
    systemSettingsOutputSchema,
)
