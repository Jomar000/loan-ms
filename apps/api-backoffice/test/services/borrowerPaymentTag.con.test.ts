import { describe, expect, it } from 'vitest'

import {
    classifyBorrowerPaymentTag,
    countMissedInstallments,
} from '../../src/services/borrowerPaymentTag.js'
import { defaultBorrowerTagPolicy } from '../../src/services/systemSettings.js'

describe('Borrower payment tag policy', () => {
    it.each([
        [
            0,
            'GOOD_PAYER',
        ],
        [
            2,
            'GOOD_PAYER',
        ],
        [
            3,
            'BAD_PAYER',
        ],
        [
            6,
            'BAD_PAYER',
        ],
        [
            7,
            'SCAMMER',
        ],
    ] as const)(
        'classifies %i missed installments at the default boundary',
        (missed, expected) => {
            for (const paymentFrequency of [
                'DAILY',
                'WEEKLY',
                'MONTHLY',
            ] as const) {
                expect(
                    classifyBorrowerPaymentTag(
                        missed,
                        paymentFrequency,
                        defaultBorrowerTagPolicy,
                    ),
                ).toBe(expected)
            }
        },
    )

    it('counts only overdue unpaid scheduled installments', () => {
        expect(
            countMissedInstallments(
                [
                    {
                        amountDueMinor: 100,
                        amountPaidMinor: 0,
                        dueDate: '2026-10-01',
                        status: 'OVERDUE',
                    },
                    {
                        amountDueMinor: 100,
                        amountPaidMinor: 100,
                        dueDate: '2026-10-01',
                        status: 'PAID',
                    },
                    {
                        amountDueMinor: 100,
                        amountPaidMinor: 0,
                        dueDate: '2026-10-01',
                        status: 'WAIVED',
                    },
                    {
                        amountDueMinor: 100,
                        amountPaidMinor: 0,
                        dueDate: '2026-10-02',
                        status: 'UPCOMING',
                    },
                ],
                '2026-10-02',
            ),
        ).toBe(1)
    })
})
