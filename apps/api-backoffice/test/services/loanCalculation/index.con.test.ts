import { describe, expect, it } from 'vitest'

import {
    allocatePaymentFifo,
    calculateLoan,
    calculateRenewalQuote,
    createInstallmentSchedule,
} from '../../../src/services/loanCalculation/index.js'

describe('loan calculation service', () => {
    it('calculates a ₱5,000 loan with the locked 20% 60-day daily profile', () => {
        const calculation = calculateLoan({
            principalAmountCents: 500_000,
            interestMethod: 'FLAT_PERCENTAGE',
            interestRateBasisPoints: 2_000,
            termDays: 60,
            installmentCount: 60,
            paymentFrequency: 'DAILY',
            roundingMode: 'HALF_UP',
        })

        expect(calculation).toMatchObject({
            interestAmountCents: 100_000,
            totalPayableAmountCents: 600_000,
            baseInstallmentAmountCents: 10_000,
            installmentResidueCents: 0,
            dailyPaymentAmountCents: 10_000,
        })
    })

    it('calculates the locked 20% 60-day daily profile in centavos', () => {
        const calculation = calculateLoan({
            principalAmountCents: 700_000,
            interestMethod: 'FLAT_PERCENTAGE',
            interestRateBasisPoints: 2_000,
            termDays: 60,
            installmentCount: 60,
            paymentFrequency: 'DAILY',
            roundingMode: 'HALF_UP',
        })

        expect(calculation).toMatchObject({
            interestAmountCents: 140_000,
            totalPayableAmountCents: 840_000,
            baseInstallmentAmountCents: 14_000,
            installmentResidueCents: 0,
            dailyPaymentAmountCents: 14_000,
        })
    })

    it('uses half-up interest rounding and deterministic final-installment residue', () => {
        const calculation = calculateLoan({
            principalAmountCents: 501,
            interestMethod: 'FLAT_PERCENTAGE',
            interestRateBasisPoints: 10,
            termDays: 3,
            installmentCount: 3,
            paymentFrequency: 'DAILY',
            roundingMode: 'HALF_UP',
        })
        const schedule = createInstallmentSchedule({
            ...calculation,
            firstDueDate: '2026-01-01',
        })

        expect(calculation.interestAmountCents).toBe(1)
        expect(
            schedule.map((installment) => installment.amountDueCents),
        ).toEqual([
            167,
            167,
            168,
        ])
        expect(
            schedule.reduce(
                (total, installment) => total + installment.amountDueCents,
                0,
            ),
        ).toBe(calculation.totalPayableAmountCents)
    })

    it('applies profile rounding modes and fixed interest amounts', () => {
        const base = {
            principalAmountCents: 1,
            interestMethod: 'FLAT_PERCENTAGE' as const,
            interestRateBasisPoints: 1,
            termDays: 1,
            installmentCount: 1,
            paymentFrequency: 'DAILY' as const,
        }

        expect(
            calculateLoan({
                ...base,
                roundingMode: 'DOWN',
            }).interestAmountCents,
        ).toBe(0)
        expect(
            calculateLoan({
                ...base,
                roundingMode: 'HALF_UP',
            }).interestAmountCents,
        ).toBe(0)
        expect(
            calculateLoan({
                ...base,
                roundingMode: 'UP',
            }).interestAmountCents,
        ).toBe(1)
        expect(
            calculateLoan({
                principalAmountCents: 10_000,
                fixedInterestAmountMinor: 321,
                interestMethod: 'FIXED_AMOUNT',
                termDays: 1,
                installmentCount: 1,
                paymentFrequency: 'DAILY',
                roundingMode: 'HALF_UP',
            }).interestAmountCents,
        ).toBe(321)
    })

    it('rejects unknown runtime calculation modes', () => {
        expect(() =>
            calculateLoan({
                principalAmountCents: 10_000,
                interestMethod: 'FLAT_PERCENTAGE',
                interestRateBasisPoints: 2_000,
                termDays: 60,
                installmentCount: 60,
                paymentFrequency: 'FORTNIGHTLY' as never,
                roundingMode: 'HALF_UP',
            }),
        ).toThrow('Payment frequency must be DAILY, WEEKLY, or MONTHLY.')
        expect(() =>
            calculateRenewalQuote({
                installments: [
                    {
                        installmentNumber: 1,
                        dueDate: '2026-01-01',
                        amountDueCents: 100,
                        amountPaidCents: 0,
                    },
                ],
                renewalPrincipalAmountCents: 100,
                minimumRenewalCompletedInstallments: 0,
                partialCreditPolicy: 'IGNORE' as never,
                renewalSettlementMethod: 'COMPLETED_INSTALLMENT_BALANCE',
            }),
        ).toThrow(
            'Partial credit policy must be CARRY_FORWARD, APPLY_TO_SETTLEMENT, REFUND, or MANUAL_REVIEW.',
        )
    })

    it('creates daily, weekly, and end-of-month-clamped monthly schedules', () => {
        const base = {
            installmentCount: 3,
            totalPayableAmountCents: 300,
        }

        expect(
            createInstallmentSchedule({
                ...base,
                paymentFrequency: 'DAILY',
                firstDueDate: '2026-01-30',
            }).map((installment) => installment.dueDate),
        ).toEqual([
            '2026-01-30',
            '2026-01-31',
            '2026-02-01',
        ])
        expect(
            createInstallmentSchedule({
                ...base,
                paymentFrequency: 'WEEKLY',
                firstDueDate: '2026-01-30',
            }).map((installment) => installment.dueDate),
        ).toEqual([
            '2026-01-30',
            '2026-02-06',
            '2026-02-13',
        ])
        expect(
            createInstallmentSchedule({
                ...base,
                paymentFrequency: 'MONTHLY',
                firstDueDate: '2026-01-31',
            }).map((installment) => installment.dueDate),
        ).toEqual([
            '2026-01-31',
            '2026-02-28',
            '2026-03-31',
        ])
    })

    it('allocates payments FIFO and retains unapplied excess explicitly', () => {
        const result = allocatePaymentFifo(
            [
                {
                    installmentNumber: 1,
                    dueDate: '2026-01-01',
                    amountDueCents: 100,
                    amountPaidCents: 0,
                },
                {
                    installmentNumber: 2,
                    dueDate: '2026-01-02',
                    amountDueCents: 100,
                    amountPaidCents: 0,
                },
            ],
            250,
        )

        expect(result.allocations).toEqual([
            {
                installmentNumber: 1,
                amountAllocatedCents: 100,
                amountPaidAfterCents: 100,
                amountRemainingAfterCents: 0,
            },
            {
                installmentNumber: 2,
                amountAllocatedCents: 100,
                amountPaidAfterCents: 100,
                amountRemainingAfterCents: 0,
            },
        ])
        expect(result).toMatchObject({
            amountAppliedCents: 200,
            unappliedAmountCents: 50,
            completedInstallmentCount: 2,
            partialPaymentCreditCents: 0,
            actualOutstandingBalanceCents: 0,
        })
    })

    it('quotes the approved carry-forward renewal example without losing partial credit', () => {
        const loan = calculateLoan({
            principalAmountCents: 700_000,
            interestMethod: 'FLAT_PERCENTAGE',
            interestRateBasisPoints: 2_000,
            termDays: 60,
            installmentCount: 60,
            paymentFrequency: 'DAILY',
            roundingMode: 'HALF_UP',
        })
        const schedule = createInstallmentSchedule({
            ...loan,
            firstDueDate: '2026-01-01',
        }).map((installment) => ({
            ...installment,
            amountPaidCents: 0,
        }))
        const allocation = allocatePaymentFifo(schedule, 400_000)
        const renewal = calculateRenewalQuote({
            installments: allocation.installments,
            renewalPrincipalAmountCents: 700_000,
            minimumRenewalCompletedInstallments: 0,
            partialCreditPolicy: 'CARRY_FORWARD',
            renewalSettlementMethod: 'COMPLETED_INSTALLMENT_BALANCE',
        })

        expect(allocation).toMatchObject({
            completedInstallmentCount: 28,
            partialPaymentCreditCents: 8_000,
            actualOutstandingBalanceCents: 440_000,
        })
        expect(renewal).toMatchObject({
            completedInstallmentCount: 28,
            remainingInstallmentCount: 32,
            partialPaymentCreditCents: 8_000,
            actualOutstandingBalanceCents: 440_000,
            renewalSettlementBalanceCents: 448_000,
            carriedForwardCreditCents: 8_000,
            cashReleaseAmountCents: 252_000,
            additionalSettlementDueCents: 0,
            isEligibleForRenewal: true,
        })
    })

    it('reports a renewal settlement shortfall rather than a negative cash release', () => {
        const quote = calculateRenewalQuote({
            installments: [
                {
                    installmentNumber: 1,
                    dueDate: '2026-01-01',
                    amountDueCents: 500,
                    amountPaidCents: 0,
                },
            ],
            renewalPrincipalAmountCents: 400,
            minimumRenewalCompletedInstallments: 0,
            partialCreditPolicy: 'CARRY_FORWARD',
            renewalSettlementMethod: 'COMPLETED_INSTALLMENT_BALANCE',
        })

        expect(quote).toMatchObject({
            renewalSettlementBalanceCents: 500,
            cashReleaseAmountCents: 0,
            additionalSettlementDueCents: 100,
        })
    })

    it('uses exact outstanding settlement and blocks manual-review confirmation', () => {
        const installments = [
            {
                installmentNumber: 1,
                dueDate: '2026-01-01',
                amountDueCents: 100,
                amountPaidCents: 40,
            },
            {
                installmentNumber: 2,
                dueDate: '2026-01-02',
                amountDueCents: 100,
                amountPaidCents: 0,
            },
        ]
        const exactOutstanding = calculateRenewalQuote({
            installments,
            renewalPrincipalAmountCents: 200,
            minimumRenewalCompletedInstallments: 1,
            partialCreditPolicy: 'CARRY_FORWARD',
            renewalSettlementMethod: 'EXACT_OUTSTANDING_BALANCE',
        })
        const manualReview = calculateRenewalQuote({
            installments,
            renewalPrincipalAmountCents: 200,
            minimumRenewalCompletedInstallments: 1,
            partialCreditPolicy: 'MANUAL_REVIEW',
            renewalSettlementMethod: 'COMPLETED_INSTALLMENT_BALANCE',
        })

        expect(exactOutstanding).toMatchObject({
            actualOutstandingBalanceCents: 160,
            renewalSettlementBalanceCents: 160,
            cashReleaseAmountCents: 40,
            isEligibleForRenewal: false,
        })
        expect(manualReview).toMatchObject({
            renewalSettlementBalanceCents: 200,
            manualReviewCreditCents: 40,
            requiresManualReview: true,
            isEligibleForRenewal: false,
        })
    })
})
