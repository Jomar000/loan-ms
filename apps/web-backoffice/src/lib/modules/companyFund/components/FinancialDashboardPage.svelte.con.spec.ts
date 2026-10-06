import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-svelte'

import FinancialDashboardPage from './FinancialDashboardPage.svelte'

const mocks = vi.hoisted(() => ({
    collectionOptions: undefined as { readonly date: string } | undefined,
    collections: [] as { amountDueMinor: number; amountPaidMinor: number }[],
}))

vi.mock('$lib/states/session', () => ({
    useSessionContext: () => ({ data: { organizationSlug: 'alpha' } }),
}))
vi.mock('$lib/modules/payment/queries', () => ({
    createCollectionsDateQuery: (
        _scope: unknown,
        options: { readonly date: string },
    ) => {
        mocks.collectionOptions = options
        return {
            data: mocks.collections,
            isError: false,
            isPending: false,
            refetch: vi.fn(),
        }
    },
}))
vi.mock('../queries', () => ({
    createCompanyFundSummaryQuery: () => ({
        data: {
            availableCashMinor: 0,
            expensesMinor: 0,
            interestCollectedMinor: 0,
            netEarningsMinor: 0,
            outstandingPrincipalMinor: 0,
            principalCollectedMinor: 0,
            writeOffsMinor: 0,
        },
        isError: false,
        isPending: false,
    }),
    createReportSummaryQuery: () => ({
        data: {
            currentAsOfDate: '2026-10-06',
            currentOverdueAmountMinor: 0,
            currentOverdueLoanCount: 0,
            periodCashInMinor: 0,
            periodCashOutMinor: 0,
        },
        isError: false,
        isPending: false,
    }),
}))

describe('Financial dashboard collections', () => {
    beforeEach(() => {
        mocks.collectionOptions = undefined
        mocks.collections = []
    })

    it('compares the Manila-date schedule with payments applied to it', async () => {
        mocks.collections = [
            { amountDueMinor: 20_000, amountPaidMinor: 10_000 },
            { amountDueMinor: 10_000, amountPaidMinor: 0 },
        ]

        const screen = await render(FinancialDashboardPage)
        const parts = new Intl.DateTimeFormat('en-CA', {
            day: '2-digit',
            month: '2-digit',
            timeZone: 'Asia/Manila',
            year: 'numeric',
        }).formatToParts(new Date())
        const part = (type: Intl.DateTimeFormatPartTypes) =>
            parts.find((entry) => entry.type === type)?.value

        expect(mocks.collectionOptions?.date).toBe(
            `${part('year')}-${part('month')}-${part('day')}`,
        )
        await expect(screen.getByText('₱300.00', { exact: true })).toBeVisible()
        await expect(screen.getByText('₱100.00', { exact: true })).toBeVisible()
        await expect(screen.getByText('₱200.00', { exact: true })).toBeVisible()
        await expect(
            screen.getByRole('img', {
                name: "Today's expected collection: collected and still to collect",
            }),
        ).toBeVisible()
    })

    it('shows an empty state when no installments are due today', async () => {
        const screen = await render(FinancialDashboardPage)

        await expect(
            screen.getByText('No installments are due today.'),
        ).toBeVisible()
        await expect(screen.getByText('₱0.00').first()).toBeVisible()
    })
})
