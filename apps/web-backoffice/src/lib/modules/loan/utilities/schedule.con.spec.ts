import { describe, expect, it } from 'vitest'

import { getFirstPaymentDate } from './schedule'

describe('first collection date', () => {
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
        'starts %s collection after %s at %s',
        (frequency, releaseDate, expected) => {
            expect(getFirstPaymentDate(releaseDate, frequency)).toBe(expected)
        },
    )

    it('waits for a selected payment type and valid release date', () => {
        expect(getFirstPaymentDate('2026-10-09', undefined)).toBe('')
        expect(getFirstPaymentDate('', 'DAILY')).toBe('')
        expect(getFirstPaymentDate('2026-02-30', 'MONTHLY')).toBe('')
    })
})
