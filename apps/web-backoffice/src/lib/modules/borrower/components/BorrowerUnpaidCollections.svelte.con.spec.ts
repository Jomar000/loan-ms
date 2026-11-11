import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-svelte'
import { page } from 'vitest/browser'

import type { LoanInstallment, LoanListItem } from '$lib/modules/loan/types'
import { formatDate } from '$lib/modules/loan/utilities/format'
import '../../../../app.css'
import BorrowerUnpaidCollections from './BorrowerUnpaidCollectionsHarness.fixture.svelte'

const loan: LoanListItem = {
    actualOutstandingBalanceMinor: 36_000,
    borrowerPublicId: '019936e2-b837-7000-8000-000000000001',
    completedInstallmentCount: 1,
    createdAt: '2026-11-01T00:00:00.000Z',
    dailyPaymentAmountMinor: 10_000,
    expectedCompletionDate: '2026-11-14',
    firstPaymentDate: '2026-11-09',
    formulaSnapshot: {
        fixedInterestAmountMinor: null,
        formulaProfilePublicId: '019936e2-b837-7000-8000-000000000002',
        formulaProfileVersion: 1,
        installmentCount: 6,
        interestMethod: 'FLAT_PERCENTAGE',
        interestRateBasisPoints: 0,
        paymentFrequency: 'DAILY',
        roundingMode: 'HALF_UP',
        termDays: 6,
    },
    installmentAmountMinor: 10_000,
    installmentResidueMinor: 0,
    interestAmountMinor: 0,
    loanNumber: '__TEST-LN-UNPAID',
    loanProductPublicId: '019936e2-b837-7000-8000-000000000003',
    partialPaymentCreditMinor: 4_000,
    principalMinor: 60_000,
    publicId: '019936e2-b837-7000-8000-000000000004',
    releaseDate: '2026-11-08',
    releasedAt: '2026-11-08T00:00:00.000Z',
    status: 'OVERDUE',
    totalAmountPaidMinor: 14_000,
    totalPayableMinor: 60_000,
}
const installments: LoanInstallment[] = [
    {
        installmentNumber: 1,
        dueDate: '2026-11-09',
        amountDueMinor: 10_000,
        amountPaidMinor: 0,
        status: 'UPCOMING',
    },
    {
        installmentNumber: 2,
        dueDate: '2026-11-10',
        amountDueMinor: 10_000,
        amountPaidMinor: 4_000,
        status: 'PARTIAL',
    },
    {
        installmentNumber: 3,
        dueDate: '2026-11-11',
        amountDueMinor: 10_000,
        amountPaidMinor: 0,
        status: 'UPCOMING',
    },
    {
        installmentNumber: 4,
        dueDate: '2026-11-12',
        amountDueMinor: 10_000,
        amountPaidMinor: 10_000,
        status: 'PAID',
    },
    {
        installmentNumber: 5,
        dueDate: '2026-11-13',
        amountDueMinor: 10_000,
        amountPaidMinor: 0,
        status: 'WAIVED',
    },
    {
        installmentNumber: 6,
        dueDate: '2026-11-14',
        amountDueMinor: 10_000,
        amountPaidMinor: 0,
        status: 'UPCOMING',
    },
]
const props = {
    loan,
    loanHref: '/app/owner/loans/__TEST-LN-UNPAID',
    onRefresh: vi.fn(),
}

describe('Borrower unpaid collections summary', () => {
    beforeEach(() => {
        vi.useFakeTimers({ toFake: ['Date'] })
        vi.setSystemTime(new Date('2026-11-11T04:00:00.000Z'))
        vi.clearAllMocks()
    })
    afterEach(() => {
        vi.useRealTimers()
    })

    it('highlights the unpaid balance and overdue remainder while excluding paid and waived dates', async () => {
        const screen = await render(BorrowerUnpaidCollections, {
            props: { ...props, installments },
        })
        const summary = screen.getByRole('region', {
            name: 'Borrower unpaid collections',
        })
        await expect
            .element(summary.getByText('₱360.00', { exact: true }))
            .toBeVisible()
        await expect
            .element(summary.getByText('Overdue collection', { exact: true }))
            .toBeVisible()
        await expect
            .element(summary.getByText('4', { exact: true }))
            .toBeVisible()
        await expect
            .element(summary.getByText('₱160.00', { exact: true }))
            .toBeVisible()
        await expect
            .element(summary.getByText('2 overdue dates', { exact: true }))
            .toBeVisible()
        await expect
            .element(
                summary.getByText(formatDate('2026-11-09'), { exact: true }),
            )
            .toBeVisible()
        await expect
            .element(
                summary.getByRole('link', {
                    name: 'View loan and unpaid dates',
                }),
            )
            .toHaveAttribute('href', props.loanHref)
    })

    it('keeps future unpaid collections distinct from overdue collections', async () => {
        const screen = await render(BorrowerUnpaidCollections, {
            props: {
                ...props,
                loan: { ...loan, actualOutstandingBalanceMinor: 10_000 },
                installments: [installments[5]!],
            },
        })
        await expect
            .element(screen.getByText('Payment pending', { exact: true }))
            .toBeVisible()
        await expect
            .element(screen.getByText('0 overdue dates', { exact: true }))
            .toBeVisible()
        await expect
            .element(screen.getByText('Overdue collection', { exact: true }))
            .not.toBeInTheDocument()
    })

    it('keeps the known balance visible without showing false zero counts while dates load', async () => {
        const screen = await render(BorrowerUnpaidCollections, { props })
        await expect
            .element(screen.getByText('₱360.00', { exact: true }))
            .toBeVisible()
        await expect
            .element(screen.getByRole('status'))
            .toHaveTextContent('Loading unpaid dates')
        await expect
            .element(screen.getByText('Overdue amount', { exact: true }))
            .not.toBeInTheDocument()
    })

    it('offers a schedule refresh when dates fail to load', async () => {
        const screen = await render(BorrowerUnpaidCollections, {
            props: { ...props, isError: true },
        })
        await expect
            .element(screen.getByText(/Unpaid dates could not be loaded/))
            .toBeVisible()
        await screen
            .getByRole('button', { name: 'Refresh unpaid dates' })
            .click()
        expect(props.onRefresh).toHaveBeenCalledOnce()
    })

    it('shows a settled balance without an unpaid warning', async () => {
        const screen = await render(BorrowerUnpaidCollections, {
            props: {
                ...props,
                loan: { ...loan, actualOutstandingBalanceMinor: 0 },
                installments: [installments[3]!],
            },
        })
        await expect
            .element(screen.getByText('No unpaid balance', { exact: true }))
            .toBeVisible()
        await expect
            .element(screen.getByText('No unpaid dates', { exact: true }))
            .toBeVisible()
    })

    it('fits the summary and its action within a mobile viewport', async () => {
        await page.viewport(390, 844)
        const screen = await render(BorrowerUnpaidCollections, {
            props: { ...props, installments },
        })
        const summary = screen
            .getByRole('region', { name: 'Borrower unpaid collections' })
            .element()
        const bounds = summary.getBoundingClientRect()
        expect(bounds.left).toBeGreaterThanOrEqual(0)
        expect(bounds.right).toBeLessThanOrEqual(390)
        expect(summary.scrollWidth).toBeLessThanOrEqual(summary.clientWidth)
        await expect
            .element(
                screen.getByRole('link', {
                    name: 'View loan and unpaid dates',
                }),
            )
            .toBeVisible()
    })
})
