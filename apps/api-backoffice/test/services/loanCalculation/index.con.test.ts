import { describe, expect, it } from 'vitest'

import {
    allocatePaymentFifo,
    calculateLoan,
    calculateRenewalQuote,
    createInstallmentSchedule,
    getFirstPaymentDate,
} from '../../../src/services/loanCalculation/index.js'

describe('loan calculation service', () => {
    it.each([
        {
            paid: [
                5000,
                0,
                0,
            ],
            amount: 10000,
            selected: [2],
            expected: [
                8000,
                7000,
                0,
            ],
        },
        {
            paid: [
                5000,
                0,
                0,
            ],
            amount: 12000,
            selected: [2],
            expected: [
                8000,
                8000,
                1000,
            ],
        },
        {
            paid: [
                8000,
                0,
                0,
            ],
            amount: 10000,
            selected: [2],
            expected: [
                8000,
                8000,
                2000,
            ],
        },
        {
            paid: [
                0,
                5000,
                0,
                0,
            ],
            amount: 20000,
            selected: [3],
            expected: [
                8000,
                8000,
                8000,
                1000,
            ],
        },
        {
            paid: [
                5000,
                0,
                0,
            ],
            amount: 5000,
            selected: [2],
            expected: [
                8000,
                2000,
                0,
            ],
        },
        {
            paid: [
                7900,
                0,
                0,
            ],
            amount: 10000,
            selected: [
                1,
                2,
            ],
            expected: [
                8000,
                8000,
                1900,
            ],
        },
        {
            paid: [
                5000,
                0,
                0,
            ],
            amount: 25000,
            selected: [2],
            expected: [
                8000,
                8000,
                8000,
            ],
        },
    ])(
        'allocates $amount to the oldest unpaid balances before advancing ($paid)',
        ({ paid, amount, expected }) => {
            const installments = paid.map((amountPaidCents, index) => ({
                installmentNumber: index + 1,
                dueDate: `2026-01-0${index + 1}`,
                amountDueCents: 8000,
                amountPaidCents,
            }))
            const result = allocatePaymentFifo(installments, amount)
            expect(
                result.installments.map((item) => item.amountPaidCents),
            ).toEqual(expected)
            expect(installments.map((item) => item.amountPaidCents)).toEqual(
                paid,
            )
            expect(result.partialPaymentCreditCents).toBe(
                expected
                    .filter((value) => value < 8000)
                    .reduce((total, value) => total + value, 0),
            )
            expect(result.completedInstallmentCount).toBe(
                expected.filter((value) => value === 8000).length,
            )
            expect(result.actualOutstandingBalanceCents).toBe(
                expected.reduce((total, value) => total + 8000 - value, 0),
            )
            expect(
                result.allocations.reduce(
                    (total, item) => total + item.amountAllocatedCents,
                    0,
                ),
            ).toBe(result.amountAppliedCents)
            expect(
                result.amountAppliedCents + result.unappliedAmountCents,
            ).toBe(amount)
            expect(
                new Set(
                    result.allocations.map((item) => item.installmentNumber),
                ).size,
            ).toBe(result.allocations.length)
        },
    )

    it('allocates only selected installments and counts nonconsecutive completed installments in later payments and renewals', () => {
        const schedule = [
            100,
            200,
            300,
            400,
        ].map((amountDueCents, index) => ({
            amountDueCents,
            amountPaidCents: 0,
            dueDate: `2026-01-0${index + 1}`,
            installmentNumber: index + 1,
        }))
        const selected = allocatePaymentFifo(
            schedule,
            600,
            [
                2,
                4,
            ],
        )
        expect(
            selected.allocations.map((item) => item.installmentNumber),
        ).toEqual([
            2,
            4,
        ])
        expect(
            selected.installments.map((item) => item.amountPaidCents),
        ).toEqual([
            0,
            200,
            0,
            400,
        ])
        expect(selected).toMatchObject({
            completedInstallmentCount: 2,
            actualOutstandingBalanceCents: 400,
            partialPaymentCreditCents: 0,
            unappliedAmountCents: 0,
        })
        const renewal = calculateRenewalQuote({
            installments: selected.installments,
            renewalPrincipalAmountCents: 1000,
            minimumRenewalCompletedInstallments: 2,
            partialCreditPolicy: 'CARRY_FORWARD',
            renewalSettlementMethod: 'COMPLETED_INSTALLMENT_BALANCE',
        })
        expect(renewal).toMatchObject({
            completedInstallmentCount: 2,
            remainingInstallmentCount: 2,
            isEligibleForRenewal: true,
            renewalSettlementBalanceCents: 400,
            actualOutstandingBalanceCents: 400,
        })
        const next = allocatePaymentFifo(selected.installments, 150)
        expect(next.allocations.map((item) => item.installmentNumber)).toEqual([
            1,
            3,
        ])
        expect(next).toMatchObject({
            completedInstallmentCount: 3,
            partialPaymentCreditCents: 50,
            actualOutstandingBalanceCents: 250,
        })
    })

    it('preserves all partial credits when paid installments occur between unpaid dates', () => {
        const installments = [
            {
                installmentNumber: 1,
                dueDate: '2026-01-01',
                amountDueCents: 100,
                amountPaidCents: 25,
            },
            {
                installmentNumber: 2,
                dueDate: '2026-01-02',
                amountDueCents: 200,
                amountPaidCents: 200,
            },
            {
                installmentNumber: 3,
                dueDate: '2026-01-03',
                amountDueCents: 300,
                amountPaidCents: 75,
            },
            {
                installmentNumber: 4,
                dueDate: '2026-01-04',
                amountDueCents: 400,
                amountPaidCents: 400,
            },
        ]
        const renewal = calculateRenewalQuote({
            installments,
            renewalPrincipalAmountCents: 1000,
            minimumRenewalCompletedInstallments: 2,
            partialCreditPolicy: 'CARRY_FORWARD',
            renewalSettlementMethod: 'COMPLETED_INSTALLMENT_BALANCE',
        })
        expect(renewal).toMatchObject({
            completedInstallmentCount: 2,
            remainingInstallmentCount: 2,
            partialPaymentCreditCents: 100,
            carriedForwardCreditCents: 100,
            renewalSettlementBalanceCents: 400,
            actualOutstandingBalanceCents: 300,
        })
    })

    it.each([
        [
            'DAILY',
            '2026-12-31',
            '2027-01-01',
        ],
        [
            'WEEKLY',
            '2026-12-31',
            '2027-01-07',
        ],
        [
            'MONTHLY',
            '2026-10-09',
            '2026-11-09',
        ],
        [
            'MONTHLY',
            '2026-01-31',
            '2026-02-28',
        ],
        [
            'MONTHLY',
            '2028-01-31',
            '2028-02-29',
        ],
        [
            'MONTHLY',
            '2026-12-31',
            '2027-01-31',
        ],
    ] as const)(
        'starts %s collection after release on %s at %s',
        (paymentFrequency, releaseDate, expected) => {
            expect(getFirstPaymentDate(releaseDate, paymentFrequency)).toBe(
                expected,
            )
        },
    )

    it.each([
        [
            'DAILY',
            26,
        ],
        [
            'WEEKLY',
            182,
        ],
        [
            'MONTHLY',
            780,
        ],
    ] as const)(
        'derives a %s term from the actual principal and preserves collection per payment',
        (paymentFrequency, termDays) => {
            const calculation = calculateLoan({
                collectionAmountMinor: 14_000,
                principalAmountCents: 300_000,
                interestMethod: 'FLAT_PERCENTAGE',
                interestRateBasisPoints: 2_000,
                termDays: 60,
                installmentCount: 60,
                paymentFrequency,
                roundingMode: 'HALF_UP',
            })
            const schedule = createInstallmentSchedule({
                ...calculation,
                firstDueDate: '2026-01-01',
                installmentAmountCents: calculation.baseInstallmentAmountCents,
            })
            expect(calculation).toMatchObject({
                interestAmountCents: 60_000,
                totalPayableAmountCents: 360_000,
                installmentCount: 26,
                termDays,
                baseInstallmentAmountCents: 14_000,
            })
            expect(
                schedule.map((installment) => installment.amountDueCents),
            ).toEqual([
                ...Array<number>(25).fill(14_000),
                10_000,
            ])
            expect(
                schedule.reduce(
                    (sum, installment) => sum + installment.amountDueCents,
                    0,
                ),
            ).toBe(360_000)
        },
    )

    it('handles fixed interest and a collection greater than the total as one final payment', () => {
        const calculation = calculateLoan({
            collectionAmountMinor: 500_000,
            principalAmountCents: 300_000,
            fixedInterestAmountMinor: 20_000,
            interestMethod: 'FIXED_AMOUNT',
            termDays: 60,
            installmentCount: 60,
            paymentFrequency: 'DAILY',
            roundingMode: 'HALF_UP',
        })
        expect(calculation).toMatchObject({
            installmentCount: 1,
            termDays: 1,
            baseInstallmentAmountCents: 320_000,
        })
        expect(
            createInstallmentSchedule({
                ...calculation,
                firstDueDate: '2026-01-01',
                installmentAmountCents: calculation.baseInstallmentAmountCents,
            }),
        ).toEqual([
            {
                installmentNumber: 1,
                dueDate: '2026-01-01',
                amountDueCents: 320_000,
            },
        ])
    })

    it('rejects collection amounts that exceed the supported repayment term', () => {
        expect(() =>
            calculateLoan({
                collectionAmountMinor: 1,
                principalAmountCents: 300_000,
                interestMethod: 'FLAT_PERCENTAGE',
                interestRateBasisPoints: 2_000,
                termDays: 60,
                installmentCount: 60,
                paymentFrequency: 'DAILY',
                roundingMode: 'HALF_UP',
            }),
        ).toThrow(
            'Collection per payment must produce a repayment term of at most 3,660 days.',
        )
    })
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
