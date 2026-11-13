import { describe, expect, it } from 'vitest'

import { formatPeriodCovered } from './formatPeriodCovered'

const allocation = (dueDate: string, installmentNumber: number) => ({
    allocatedAmountMinor: 10_000,
    amountDueMinor: 10_000,
    amountPaidMinor: 10_000,
    dueDate,
    installmentNumber,
    loanInstallmentPublicId: `installment-${installmentNumber}`,
    status: 'PAID' as const,
})

describe('payment period covered formatting', () => {
    it('shows one installment number when a single installment is covered', () => {
        expect(formatPeriodCovered([allocation('2026-10-04', 1)])).toBe(
            '10/04/2026- 10/04/2026 (ins. 1)',
        )
    })

    it('shows the first and last covered installment numbers', () => {
        expect(
            formatPeriodCovered([
                allocation('2026-10-04', 11),
                allocation('2026-10-05', 13),
                allocation('2026-10-06', 15),
            ]),
        ).toBe('10/04/2026- 10/06/2026 (ins. 11-15)')
    })

    it('labels payments without installment allocations', () => {
        expect(formatPeriodCovered([])).toBe('No installment allocation')
    })
})
