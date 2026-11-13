import { formatNumericDate } from '$lib/modules/loan/utilities/format'

import type { PaymentAllocation } from '../types'

export function formatPeriodCovered(allocations: PaymentAllocation[]): string {
    if (allocations.length === 0) return 'No installment allocation'

    const first = allocations[0]!
    const last = allocations.at(-1)!
    const installmentRange =
        first.installmentNumber === last.installmentNumber
            ? `${first.installmentNumber}`
            : `${first.installmentNumber}-${last.installmentNumber}`

    return `${formatNumericDate(first.dueDate)}- ${formatNumericDate(last.dueDate)} (ins. ${installmentRange})`
}
