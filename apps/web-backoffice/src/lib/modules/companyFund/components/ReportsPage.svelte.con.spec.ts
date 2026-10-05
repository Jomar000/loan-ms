import { describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-svelte'

import ReportsPage from './ReportsPage.svelte'

const mocks = vi.hoisted(() => ({
    csv: 'report-csv',
    downloadCsv: vi.fn(),
    queryOptions: undefined as
        | { readonly request: { readonly filters: Record<string, string> } }
        | undefined,
    report: {
        currentActiveLoanCount: 4,
        currentActivePrincipalMinor: 8_000_00,
        currentAsOfDate: '2026-10-04',
        currentOverdueAmountMinor: 500_00,
        currentOverdueLoanCount: 1,
        currentOutstandingReceivableMinor: 7_000_00,
        periodCashInMinor: 6_000_00,
        periodCashOutMinor: 2_000_00,
        periodDateFrom: null,
        periodDateTo: null,
        periodInterestCollectedMinor: 1_000_00,
        periodExpensesMinor: 200_00,
        periodLoanReleasedMinor: 1_500_00,
        periodNetEarningsMinor: 700_00,
        periodPrincipalCollectedMinor: 3_000_00,
        periodRefundedMinor: 100_00,
        periodRenewalReleasedMinor: 900_00,
        periodWriteOffsMinor: 100_00,
    },
    refetch: vi.fn(async () => undefined),
    toCsv: vi.fn(() => 'report-csv'),
}))

vi.mock('$lib/states/session', () => ({
    useSessionContext: () => ({ data: { organizationSlug: 'alpha' } }),
}))
vi.mock('$lib/utilities/csv', () => ({
    createCsvFileName: (base: string, stamp?: string) =>
        `${base}_${stamp ?? 'now'}.csv`,
    downloadCsv: mocks.downloadCsv,
    toCsv: mocks.toCsv,
}))
vi.mock('../queries', () => ({
    createReportSummaryQuery: (
        _scope: unknown,
        options: typeof mocks.queryOptions,
    ) => {
        mocks.queryOptions = options
        return {
            data: mocks.report,
            isError: false,
            isPending: false,
            refetch: mocks.refetch,
        }
    },
}))

describe('Reports page', () => {
    it('sends selected server date bounds and exports only returned totals', async () => {
        const screen = await render(ReportsPage)

        await screen.getByLabelText('Reports from date').fill('2026-09-01')
        await screen.getByLabelText('Reports to date').fill('2026-09-30')

        await expect
            .poll(() => mocks.queryOptions?.request)
            .toEqual({
                filters: {
                    dateFrom: '2026-09-01',
                    dateTo: '2026-09-30',
                },
            })

        await screen.getByRole('button', { name: 'Export period CSV' }).click()

        expect(mocks.toCsv).toHaveBeenCalledWith(
            [
                {
                    cash_in_minor: 6_000_00,
                    cash_out_minor: 2_000_00,
                    expenses_minor: 200_00,
                    interest_collected_minor: 1_000_00,
                    loan_released_minor: 1_500_00,
                    net_earnings_minor: 700_00,
                    principal_collected_minor: 3_000_00,
                    refunded_minor: 100_00,
                    renewal_released_minor: 900_00,
                    write_offs_minor: 100_00,
                },
            ],
            {
                columns: [
                    'cash_in_minor',
                    'cash_out_minor',
                    'principal_collected_minor',
                    'interest_collected_minor',
                    'loan_released_minor',
                    'renewal_released_minor',
                    'refunded_minor',
                    'expenses_minor',
                    'write_offs_minor',
                    'net_earnings_minor',
                ],
            },
        )
        expect(mocks.downloadCsv).toHaveBeenCalledWith(
            'report-csv',
            'loanms-period-report_2026-09-01_to_2026-09-30.csv',
        )
    })
})
