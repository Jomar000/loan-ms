import * as settingsValidator from '@loanms/validator/backoffice/settings'
import { and, eq } from 'drizzle-orm'

import { getActiveOrganizationId } from '../utilities/helpers.js'

export const defaultBorrowerTagPolicy = {
    allowManualOverride: true,
    automaticTaggingEnabled: true,
    blockNewLoanForScammer: false,
    daily: {
        badPayerMaximumMissedInstallments: 6,
        goodPayerMaximumMissedInstallments: 2,
        scammerMinimumMissedInstallments: 7,
    },
    monthly: {
        badPayerMaximumMissedInstallments: 6,
        goodPayerMaximumMissedInstallments: 2,
        scammerMinimumMissedInstallments: 7,
    },
    requireBadPayerRenewalApproval: true,
    requireOverrideReason: true,
    requireScammerRenewalApproval: true,
    showHistoricalWorstTag: true,
    weekly: {
        badPayerMaximumMissedInstallments: 6,
        goodPayerMaximumMissedInstallments: 2,
        scammerMinimumMissedInstallments: 7,
    },
} as const

export const defaultSystemSettings = {
    allowAdvancePayments: true,
    allowPartialPayments: true,
    borrowerTagPolicy: defaultBorrowerTagPolicy,
    defaultLoanProductPublicId: null,
    defaultPaymentFrequency: 'DAILY' as const,
    enabledPaymentFrequencies: [
        'DAILY',
        'WEEKLY',
        'MONTHLY',
    ],
    requireRenewalApproval: true,
    version: 0,
} satisfies typeof settingsValidator.systemSettingsOutputSchema._output

export type TRuntimeSystemSettings =
    typeof settingsValidator.systemSettingsOutputSchema._output

export async function readRuntimeSystemSettings(
    ctx: Parameters<typeof getActiveOrganizationId>[0],
): Promise<TRuntimeSystemSettings> {
    const { loanProduct, systemSettings } = ctx.get('dbSchema')
    const organizationId = getActiveOrganizationId(ctx)
    const [row] = await ctx
        .get('dbClient')
        .select({
            allowAdvancePayments: systemSettings.allowAdvancePayments,
            allowPartialPayments: systemSettings.allowPartialPayments,
            borrowerTagPolicy: systemSettings.borrowerTagPolicy,
            defaultLoanProductPublicId: loanProduct.publicId,
            defaultPaymentFrequency: systemSettings.defaultPaymentFrequency,
            enabledPaymentFrequencies: systemSettings.enabledPaymentFrequencies,
            requireRenewalApproval: systemSettings.requireRenewalApproval,
            version: systemSettings.version,
        })
        .from(systemSettings)
        .leftJoin(
            loanProduct,
            and(
                eq(loanProduct.organizationId, systemSettings.organizationId),
                eq(loanProduct.id, systemSettings.defaultLoanProductId),
            ),
        )
        .where(
            and(
                eq(systemSettings.organizationId, organizationId),
                eq(systemSettings.isCurrent, true),
            ),
        )
        .limit(1)

    return (row as TRuntimeSystemSettings | undefined) ?? defaultSystemSettings
}
