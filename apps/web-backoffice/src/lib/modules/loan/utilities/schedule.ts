import dayjs from 'dayjs'

import type { LoanPaymentFrequency } from '../types'

export function getFirstPaymentDate(
    releaseDate: string,
    paymentFrequency: LoanPaymentFrequency | undefined,
): string {
    if (!paymentFrequency || !/^\d{4}-\d{2}-\d{2}$/.test(releaseDate)) return ''
    const date = dayjs(releaseDate)
    if (!date.isValid() || date.format('YYYY-MM-DD') !== releaseDate) return ''
    return (
        paymentFrequency === 'MONTHLY'
            ? date.add(1, 'month')
            : date.add(paymentFrequency === 'WEEKLY' ? 7 : 1, 'day')
    ).format('YYYY-MM-DD')
}
