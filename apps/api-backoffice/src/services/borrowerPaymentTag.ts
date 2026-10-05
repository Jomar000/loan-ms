import { and, desc, eq, inArray, lt, notInArray } from 'drizzle-orm'

import { getActiveOrganizationId } from '../utilities/helpers.js'
import {
    readRuntimeSystemSettings,
    type TRuntimeSystemSettings,
} from './systemSettings.js'

export type TBorrowerPaymentTag = 'BAD_PAYER' | 'GOOD_PAYER' | 'SCAMMER'
export type TPaymentFrequency = 'DAILY' | 'MONTHLY' | 'WEEKLY'

export const currentManilaDate = () => {
    const parts = new Intl.DateTimeFormat('en-CA', {
        day: '2-digit',
        month: '2-digit',
        timeZone: 'Asia/Manila',
        year: 'numeric',
    }).formatToParts(new Date())
    const part = (type: Intl.DateTimeFormatPartTypes) =>
        parts.find((entry) => entry.type === type)!.value
    return `${part('year')}-${part('month')}-${part('day')}`
}

export function thresholdsFor(
    policy: TRuntimeSystemSettings['borrowerTagPolicy'],
    paymentFrequency: TPaymentFrequency,
) {
    if (paymentFrequency === 'WEEKLY') return policy.weekly
    if (paymentFrequency === 'MONTHLY') return policy.monthly
    return policy.daily
}

export function classifyBorrowerPaymentTag(
    missedInstallmentCount: number,
    paymentFrequency: TPaymentFrequency,
    policy: TRuntimeSystemSettings['borrowerTagPolicy'],
): TBorrowerPaymentTag {
    const thresholds = thresholdsFor(policy, paymentFrequency)
    if (missedInstallmentCount >= thresholds.scammerMinimumMissedInstallments) {
        return 'SCAMMER'
    }
    if (
        missedInstallmentCount > thresholds.goodPayerMaximumMissedInstallments
    ) {
        return 'BAD_PAYER'
    }
    return 'GOOD_PAYER'
}

export function countMissedInstallments(
    installments: {
        amountDueMinor: number
        amountPaidMinor: number
        dueDate: string
        status: string
    }[],
    asOfDate: string,
) {
    return installments.filter(
        (installment) =>
            installment.dueDate < asOfDate &&
            installment.amountPaidMinor < installment.amountDueMinor &&
            ![
                'PAID',
                'WAIVED',
            ].includes(installment.status),
    ).length
}

export function borrowerTagRecalculationStatements(input: {
    actorId: string
    borrowerId: number
    calculatedTag: TBorrowerPaymentTag
    database: D1Database
    enabled: boolean
    historyPublicId: string
    now: number
    organizationId: string
}) {
    if (!input.enabled) return []
    return [
        input.database
            .prepare(
                `UPDATE borrower
                 SET system_payment_tag = ?,
                     payment_tag = CASE WHEN payment_tag_source = 'SYSTEM' THEN ? ELSE payment_tag END,
                     payment_tag_updated_at = ?, updated_by_user_id = ?, updated_at = ?
                 WHERE organization_id = ? AND id = ? AND system_payment_tag <> ?`,
            )
            .bind(
                input.calculatedTag,
                input.calculatedTag,
                input.now,
                input.actorId,
                input.now,
                input.organizationId,
                input.borrowerId,
                input.calculatedTag,
            ),
        input.database
            .prepare(
                `INSERT INTO borrower_payment_tag_history (
                    public_id, organization_id, borrower_id, payment_tag,
                    system_payment_tag, payment_tag_source, override_reason,
                    changed_by_user_id, changed_at
                 ) SELECT ?, organization_id, id, system_payment_tag,
                          system_payment_tag, 'SYSTEM', NULL, ?, ?
                     FROM borrower
                    WHERE organization_id = ? AND id = ? AND changes() = 1`,
            )
            .bind(
                input.historyPublicId,
                input.actorId,
                input.now,
                input.organizationId,
                input.borrowerId,
            ),
    ]
}

export async function readBorrowerPaymentTagDetails(
    ctx: Parameters<typeof getActiveOrganizationId>[0],
    borrowerPublicId: string,
    asOfDate = currentManilaDate(),
) {
    const { borrower, borrowerPaymentTagHistory, loan, loanInstallment } =
        ctx.get('dbSchema')
    const organizationId = getActiveOrganizationId(ctx)
    const [borrowerRecord] = await ctx
        .get('dbClient')
        .select({
            id: borrower.id,
            paymentTag: borrower.paymentTag,
            paymentTagSource: borrower.paymentTagSource,
            paymentTagUpdatedAt: borrower.paymentTagUpdatedAt,
            systemPaymentTag: borrower.systemPaymentTag,
        })
        .from(borrower)
        .where(
            and(
                eq(borrower.organizationId, organizationId),
                eq(borrower.publicId, borrowerPublicId),
            ),
        )
        .limit(1)
    if (!borrowerRecord) return null

    const settings = await readRuntimeSystemSettings(ctx)
    const [activeLoan] = await ctx
        .get('dbClient')
        .select({ id: loan.id, paymentFrequency: loan.paymentFrequency })
        .from(loan)
        .where(
            and(
                eq(loan.organizationId, organizationId),
                eq(loan.borrowerId, borrowerRecord.id),
                inArray(loan.status, [
                    'ACTIVE',
                    'OVERDUE',
                ]),
            ),
        )
        .orderBy(desc(loan.createdAt), desc(loan.id))
        .limit(1)

    let missedInstallmentCount = 0
    let calculatedTag = borrowerRecord.systemPaymentTag
    if (activeLoan) {
        const [{ value }] = await ctx
            .get('dbClient')
            .select({ value: ctx.get('dbClient').$count(loanInstallment) })
            .from(loanInstallment)
            .where(
                and(
                    eq(loanInstallment.organizationId, organizationId),
                    eq(loanInstallment.loanId, activeLoan.id),
                    lt(loanInstallment.dueDate, asOfDate),
                    notInArray(loanInstallment.status, [
                        'PAID',
                        'WAIVED',
                    ]),
                ),
            )
        missedInstallmentCount = value
        if (settings.borrowerTagPolicy.automaticTaggingEnabled) {
            calculatedTag = classifyBorrowerPaymentTag(
                missedInstallmentCount,
                activeLoan.paymentFrequency,
                settings.borrowerTagPolicy,
            )
        }
    }

    const historical = await ctx
        .get('dbClient')
        .select({
            systemPaymentTag: borrowerPaymentTagHistory.systemPaymentTag,
        })
        .from(borrowerPaymentTagHistory)
        .where(
            and(
                eq(borrowerPaymentTagHistory.organizationId, organizationId),
                eq(borrowerPaymentTagHistory.borrowerId, borrowerRecord.id),
            ),
        )
    const severity = { BAD_PAYER: 1, GOOD_PAYER: 0, SCAMMER: 2 } as const
    const historicalWorstTag = settings.borrowerTagPolicy.showHistoricalWorstTag
        ? historical.reduce<TBorrowerPaymentTag>(
              (worst, entry) =>
                  severity[entry.systemPaymentTag] > severity[worst]
                      ? entry.systemPaymentTag
                      : worst,
              calculatedTag,
          )
        : null
    const threshold = activeLoan
        ? thresholdsFor(settings.borrowerTagPolicy, activeLoan.paymentFrequency)
        : settings.borrowerTagPolicy.daily

    return {
        currentCalculatedTag: calculatedTag,
        currentTag:
            borrowerRecord.paymentTagSource === 'MANUAL_OVERRIDE'
                ? borrowerRecord.paymentTag
                : calculatedTag,
        historicalWorstTag,
        lastCalculatedAt: borrowerRecord.paymentTagUpdatedAt,
        missedInstallmentCount,
        paymentType: activeLoan?.paymentFrequency ?? null,
        source: borrowerRecord.paymentTagSource,
        thresholds: {
            badPayerMaximumMissedInstallments:
                threshold.badPayerMaximumMissedInstallments,
            badPayerMinimumMissedInstallments:
                threshold.goodPayerMaximumMissedInstallments + 1,
            goodPayerMaximumMissedInstallments:
                threshold.goodPayerMaximumMissedInstallments,
            scammerMinimumMissedInstallments:
                threshold.scammerMinimumMissedInstallments,
        },
    }
}
