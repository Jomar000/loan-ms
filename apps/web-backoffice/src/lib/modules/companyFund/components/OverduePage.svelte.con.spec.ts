import { describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-svelte'

import OverduePage from './OverduePage.svelte'

const mocks = vi.hoisted(() => ({
    csv: 'overdue-csv',
    downloadCsv: vi.fn(),
    queryOptions: undefined as
        | {
              readonly request: {
                  readonly filters: Record<string, number>
                  readonly limit: number
                  readonly offset: number
              }
          }
        | undefined,
    refetch: vi.fn(async () => undefined),
    rows: {
        count: 26,
        data: [
            {
                borrowerName: 'Maria Santos',
                borrowerPublicId: '019936e2-b837-7000-8000-000000000001',
                daysLate: 14,
                loanNumber: 'LN-000001',
                loanPublicId: '019936e2-b837-7000-8000-000000000002',
                oldestDueDate: '2026-09-10',
                overdueAmountMinor: 500_00,
            },
        ],
    },
    toCsv: vi.fn(() => 'overdue-csv'),
}))

vi.mock('$app/navigation', () => ({ goto: vi.fn(async () => undefined) }))
vi.mock('$lib/states/session', () => ({
    useSessionContext: () => ({ data: { organizationSlug: 'alpha' } }),
}))
vi.mock('$lib/utilities/csv', () => ({
    createCsvFileName: (base: string) => `${base}.csv`,
    downloadCsv: mocks.downloadCsv,
    toCsv: mocks.toCsv,
}))
vi.mock('../queries', () => ({
    createOverdueLoansQuery: (
        _scope: unknown,
        options: typeof mocks.queryOptions,
    ) => {
        mocks.queryOptions = options
        return {
            data: mocks.rows,
            isError: false,
            isFetching: false,
            isPending: false,
            refetch: mocks.refetch,
        }
    },
}))

describe('Overdue page', () => {
    it('applies server filters, paginates, and exports the visible page', async () => {
        const screen = await render(OverduePage, { props: { role: 'owner' } })

        await screen.getByLabelText('Minimum days late').fill('7')
        await screen.getByLabelText('Maximum days late').fill('30')

        await expect
            .poll(() => mocks.queryOptions?.request)
            .toEqual({
                filters: { maxDaysLate: 30, minDaysLate: 7 },
                limit: 25,
                offset: 0,
                sortOrder: 'desc',
            })

        await screen.getByRole('button', { name: 'Next page' }).click()
        await expect.poll(() => mocks.queryOptions?.request.offset).toBe(25)

        await screen.getByRole('button', { name: 'Export page CSV' }).click()

        expect(mocks.toCsv).toHaveBeenCalledWith(
            [
                {
                    borrower_name: 'Maria Santos',
                    days_late: 14,
                    loan_number: 'LN-000001',
                    oldest_due_date: '2026-09-10',
                    overdue_amount_minor: 500_00,
                },
            ],
            expect.objectContaining({
                columns: expect.arrayContaining([
                    'borrower_name',
                    'overdue_amount_minor',
                ]),
            }),
        )
        expect(mocks.downloadCsv).toHaveBeenCalledWith(
            'overdue-csv',
            'overdue-loans-page-2.csv',
        )
    })
})
