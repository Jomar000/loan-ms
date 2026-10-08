import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-svelte'
import { page } from 'vitest/browser'

import '../../../../app.css'
import LoanManagementPage from './LoanManagementPage.svelte'

const mocks = vi.hoisted(() => ({
    rowCount: 2,
    deleteLoan: vi.fn(async (_publicId: string) => ({ publicId: _publicId })),
    goto: vi.fn(async () => undefined),
}))

const pendingLoan = {
    actualOutstandingBalanceMinor: 840_000,
    borrowerName: 'Test Borrower',
    borrowerPublicId: '019936e2-b837-7000-8000-000000000020',
    completedInstallmentCount: 0,
    createdAt: '2026-10-03T00:00:00.000Z',
    dailyPaymentAmountMinor: 14_000,
    expectedCompletionDate: '2026-12-02',
    firstPaymentDate: '2026-10-04',
    formulaSnapshot: {
        fixedInterestAmountMinor: null,
        formulaProfilePublicId: '019936e2-b837-7000-8000-000000000001',
        formulaProfileVersion: 1,
        installmentCount: 60,
        interestMethod: 'FLAT_PERCENTAGE',
        interestRateBasisPoints: 2000,
        paymentFrequency: 'DAILY',
        roundingMode: 'HALF_UP',
        termDays: 60,
    },
    installmentAmountMinor: 14_000,
    installmentResidueMinor: 0,
    interestAmountMinor: 140_000,
    loanNumber: 'LN-PENDING',
    loanProductPublicId: '019936e2-b837-7000-8000-000000000010',
    partialPaymentCreditMinor: 0,
    principalMinor: 700_000,
    publicId: '019936e2-b837-7000-8000-000000000101',
    releaseDate: '2026-10-03',
    releasedAt: null,
    status: 'PENDING_APPROVAL',
    totalAmountPaidMinor: 0,
    totalPayableMinor: 840_000,
} as const

vi.mock('$app/navigation', () => ({ goto: mocks.goto }))
vi.mock('$lib/states/session', () => ({
    useSessionContext: () => ({ data: { organizationSlug: 'alpha' } }),
}))
vi.mock('svelte-sonner', () => ({
    toast: { error: vi.fn(), success: vi.fn() },
}))
vi.mock('../queries', () => ({
    createLoanDeleteMutation: () => ({ mutateAsync: mocks.deleteLoan }),
    createLoanListQuery: () => ({
        data: {
            count: mocks.rowCount,
            data: Array.from({ length: mocks.rowCount }, (_, index) => ({
                ...pendingLoan,
                loanNumber:
                    index === 0
                        ? 'LN-PENDING'
                        : index === 1
                          ? 'LN-ACTIVE'
                          : `LN-${index}`,
                publicId: `019936e2-b837-7000-8000-${String(
                    101 + index,
                ).padStart(12, '0')}`,
                status: index === 0 ? 'PENDING_APPROVAL' : 'ACTIVE',
            })),
        },
        isError: false,
        isFetching: false,
        isPending: false,
        refetch: vi.fn(),
    }),
}))

describe('Loans page', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mocks.rowCount = 2
    })

    it('confirms deletion for a pending loan without opening its detail page', async () => {
        const screen = await render(LoanManagementPage, {
            props: { role: 'owner' },
        })

        await expect
            .element(screen.getByRole('button', { name: 'Delete LN-ACTIVE' }))
            .not.toBeInTheDocument()
        await screen.getByRole('button', { name: 'Delete LN-PENDING' }).click()
        expect(mocks.goto).not.toHaveBeenCalled()
        expect(mocks.deleteLoan).not.toHaveBeenCalled()

        await screen.getByRole('button', { name: 'Delete loan' }).click()
        await expect
            .poll(() => mocks.deleteLoan)
            .toHaveBeenCalledWith(pendingLoan.publicId)
    })

    it('hides deletion from users who cannot manage loans', async () => {
        const screen = await render(LoanManagementPage, {
            props: { role: 'cashier' },
        })

        await expect
            .element(screen.getByRole('button', { name: 'Delete LN-PENDING' }))
            .not.toBeInTheDocument()
    })
})

describe('Loans page scrolling', () => {
    const viewports = [
        { name: 'mobile', width: 375, height: 560 },
        { name: 'tablet', width: 768, height: 650 },
        { name: 'desktop', width: 1440, height: 800 },
        { name: 'short desktop', width: 1440, height: 320 },
    ]

    for (const viewport of viewports) {
        for (const rowCount of [
            2,
            80,
        ]) {
            it(`${
                viewport.name
            } keeps table scrolling and pagination reachable with ${
                rowCount
            } rows`, async () => {
                mocks.rowCount = rowCount
                await page.viewport(viewport.width, viewport.height)
                const screen = await render(LoanManagementPage, {
                    props: { role: 'owner' },
                })
                screen.container.style.cssText =
                    'display: flex; flex-direction: column; height: calc(100dvh - 80px); width: 100%;'
                const table = screen
                    .getByRole('table')
                    .element() as HTMLTableElement
                const scroller = table.parentElement!.parentElement!
                const pageRoot = screen.container.querySelector('section')!
                const nextPage = screen
                    .getByRole('button', { name: 'Next page' })
                    .element()

                await expect
                    .poll(() => scroller.clientHeight)
                    .toBeGreaterThan(150)
                expect(screen.container.scrollWidth).toBeLessThanOrEqual(
                    screen.container.clientWidth,
                )
                expect(getComputedStyle(scroller).overflowX).toBe('auto')
                expect(getComputedStyle(table.parentElement!).overflowX).toBe(
                    'visible',
                )

                if (rowCount > 2) {
                    expect(scroller.scrollHeight).toBeGreaterThan(
                        scroller.clientHeight,
                    )
                    expect(
                        table.getBoundingClientRect().bottom,
                    ).toBeGreaterThan(scroller.getBoundingClientRect().bottom)
                    scroller.scrollTop = 250
                    await expect
                        .poll(() =>
                            Math.abs(
                                table.tHead!.getBoundingClientRect().top -
                                    scroller.getBoundingClientRect().top,
                            ),
                        )
                        .toBeLessThan(2)
                } else if (viewport.name === 'desktop') {
                    expect(
                        scroller.getBoundingClientRect().bottom -
                            table.getBoundingClientRect().bottom,
                    ).toBeGreaterThan(50)
                }

                if (viewport.width < 1300) {
                    scroller.scrollLeft = scroller.scrollWidth
                    await expect
                        .poll(() => scroller.scrollLeft)
                        .toBeGreaterThan(0)
                }
                pageRoot.scrollTop = pageRoot.scrollHeight
                await expect
                    .poll(() => nextPage.getBoundingClientRect().bottom)
                    .toBeLessThanOrEqual(
                        pageRoot.getBoundingClientRect().bottom,
                    )
                expect(
                    nextPage.getBoundingClientRect().top,
                ).toBeGreaterThanOrEqual(pageRoot.getBoundingClientRect().top)
                await screen.unmount()
            })
        }
    }
})
