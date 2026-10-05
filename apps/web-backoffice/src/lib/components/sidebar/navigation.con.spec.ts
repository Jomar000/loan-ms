import { describe, expect, it } from 'vitest'

import { createRoleNavigation } from './navigation'

describe('operational role sidebar navigation', () => {
    it.each([
        [
            'cashier',
            [
                [
                    'Payments',
                    '/app/cashier/loans',
                ],
            ],
        ],
        [
            'collector',
            [
                [
                    'Assigned Collections',
                    '/app/collector/collections',
                ],
            ],
        ],
        [
            'viewer',
            [
                [
                    'Loan Records',
                    '/app/viewer/loans',
                ],
                [
                    'Collection Records',
                    '/app/viewer/collections',
                ],
                [
                    'Overdue',
                    '/app/viewer/overdue',
                ],
                [
                    'Reports',
                    '/app/viewer/reports',
                ],
            ],
        ],
        [
            'auditor',
            [
                [
                    'Loan Records',
                    '/app/auditor/loans',
                ],
                [
                    'Collection Records',
                    '/app/auditor/collections',
                ],
                [
                    'Overdue',
                    '/app/auditor/overdue',
                ],
                [
                    'Reports',
                    '/app/auditor/reports',
                ],
            ],
        ],
    ] as const)('exposes only %s capabilities', (role, expectedItems) => {
        const items = createRoleNavigation(role, true, true)

        expect(
            items.map(({ href, label }) => [
                label,
                href,
            ]),
        ).toEqual(expectedItems)
        expect(items.every((item) => item.disabled !== true)).toBe(true)
    })
})
