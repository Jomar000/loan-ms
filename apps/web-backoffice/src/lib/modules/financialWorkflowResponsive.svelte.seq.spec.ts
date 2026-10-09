import { describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-svelte'
import { page } from 'vitest/browser'

import '../../app.css'
import BorrowerManagementPage from './borrower/components/BorrowerManagementPage.svelte'
import CompanyFundPage from './companyFund/components/CompanyFundPage.svelte'
import OverduePage from './companyFund/components/OverduePage.svelte'
import ReportsPage from './companyFund/components/ReportsPage.svelte'
import LoanOriginationPage from './loan/components/LoanOriginationPage.svelte'
import PaymentWorkflowDialog from './payment/components/PaymentWorkflowDialog.svelte'
import RenewalOriginationPage from './renewal/components/RenewalOriginationPage.svelte'

const BREAKPOINTS = {
    desktop: { height: 900, width: 1536 },
    laptop: { height: 800, width: 1280 },
    mobile: { height: 844, width: 390 },
    tablet: { height: 1024, width: 768 },
} as const

const mocks = vi.hoisted(() => ({
    borrowerCreate: vi.fn(),
    companyFundSummary: {
        additionalCapitalMinor: 0,
        availableCashMinor: 500_000,
        capitalWithdrawnMinor: 0,
        currency: 'PHP',
        fundPublicId: '019936e2-b837-7000-8000-000000000101',
        interestCollectedMinor: 0,
        netEarningsMinor: 0,
        openingCapitalMinor: 500_000,
        outstandingPrincipalMinor: 0,
        principalCollectedMinor: 0,
        principalReleasedMinor: 0,
        refundedMinor: 0,
        renewalReleasedMinor: 0,
    },
    goto: vi.fn(async () => undefined),
    paymentCreate: vi.fn(),
    paymentQuote: vi.fn(),
    renewalCreate: vi.fn(),
    renewalQuote: vi.fn(),
}))

vi.mock('$app/navigation', () => ({ goto: mocks.goto }))
vi.mock('$lib/states/session', () => ({
    useSessionContext: () => ({ data: { organizationSlug: 'alpha' } }),
}))
vi.mock('$lib/utilities/csv', () => ({
    createCsvFileName: (base: string) => `${base}.csv`,
    downloadCsv: vi.fn(),
    toCsv: vi.fn(),
}))
vi.mock('$lib/utilities/idempotencyKey', () => ({
    createIdempotencyKeyLifecycle: () => ({
        abandonAttempt: vi.fn(),
        claim: () => ({
            key: '019936e2-b837-7000-8000-000000000401',
            ok: true,
        }),
        confirmSuccess: vi.fn(),
        current: '019936e2-b837-7000-8000-000000000401',
    }),
}))
vi.mock('svelte-sonner', () => ({
    toast: { error: vi.fn(), success: vi.fn() },
}))
vi.mock('./borrower/queries', () => ({
    createBorrowerCreateMutation: () => ({ mutateAsync: mocks.borrowerCreate }),
    createBorrowerListQuery: () => ({
        data: {
            count: 1,
            data: [
                {
                    borrowerNumber: 'BR-000001',
                    contactNumber: '09171234567',
                    firstName: 'Maria',
                    lastName: 'Santos',
                    paymentTag: 'GOOD_PAYER',
                    paymentTagSource: 'SYSTEM',
                    publicId: '019936e2-b837-7000-8000-000000000001',
                    status: 'ACTIVE',
                },
            ],
            limit: 25,
            offset: 0,
        },
        isError: false,
        isFetching: false,
        isPending: false,
        refetch: vi.fn(),
    }),
}))
vi.mock('./loan/queries', () => ({
    createLoanCreateMutation: () => ({ mutateAsync: vi.fn() }),
    createLoanDetailQuery: () => ({
        data: {
            formulaSnapshot: { paymentFrequency: 'DAILY' },
            loanNumber: 'LN-000001',
            principalMinor: 700_000,
        },
        isPending: false,
    }),
    createLoanProductsQuery: () => ({
        data: [
            {
                formulaProfilePublicId: '019936e2-b837-7000-8000-000000000001',
                isActive: true,
                maximumPrincipalMinor: 1_000_000,
                minimumPrincipalMinor: 100_000,
                name: 'Regular 60-Day Loan',
                paymentFrequency: 'DAILY',
                publicId: '019936e2-b837-7000-8000-000000000010',
            },
        ],
        isError: false,
        isPending: false,
    }),
    createLoanQuoteMutation: () => ({ mutateAsync: vi.fn() }),
}))
vi.mock('./payment/queries', () => ({
    createPaymentCreateMutation: () => ({ mutateAsync: mocks.paymentCreate }),
    createPaymentQuoteMutation: () => ({ mutateAsync: mocks.paymentQuote }),
}))
vi.mock('./renewal/queries', () => ({
    createRenewalCreateMutation: () => ({ mutateAsync: mocks.renewalCreate }),
    createRenewalQuoteMutation: () => ({ mutateAsync: mocks.renewalQuote }),
}))
vi.mock('./companyFund/queries', () => ({
    createCapitalInjectionMutation: () => ({ mutateAsync: vi.fn() }),
    createCapitalTransactionsQuery: () => ({
        data: {
            data: [
                {
                    amountMinor: 500_000,
                    direction: 'IN',
                    publicId: '019936e2-b837-7000-8000-000000000201',
                    referenceNumber: null,
                    transactionAt: '2026-10-04T00:00:00.000Z',
                    transactionNumber: 'CAP-000001',
                    transactionType: 'OPENING_CAPITAL',
                },
            ],
        },
        isError: false,
        isPending: false,
        refetch: vi.fn(),
    }),
    createCapitalWithdrawalMutation: () => ({ mutateAsync: vi.fn() }),
    createCompanyFundSetupMutation: () => ({ mutateAsync: vi.fn() }),
    createManualFundTransactionMutation: () => ({ mutateAsync: vi.fn() }),
    createCompanyFundSummaryQuery: () => ({
        data: mocks.companyFundSummary,
        isError: false,
        isPending: false,
        refetch: vi.fn(),
    }),
    createOverdueLoansQuery: () => ({
        data: {
            count: 1,
            data: [
                {
                    borrowerName: 'Maria Santos',
                    borrowerPublicId: '019936e2-b837-7000-8000-000000000001',
                    daysLate: 14,
                    loanNumber: 'LN-000001',
                    loanPublicId: '019936e2-b837-7000-8000-000000000002',
                    oldestDueDate: '2026-09-10',
                    overdueAmountMinor: 50_000,
                },
            ],
        },
        isError: false,
        isFetching: false,
        isPending: false,
        refetch: vi.fn(),
    }),
    createReportSummaryQuery: () => ({
        data: {
            currentActiveLoanCount: 4,
            currentActivePrincipalMinor: 800_000,
            currentAsOfDate: '2026-10-04',
            currentOverdueAmountMinor: 50_000,
            currentOverdueLoanCount: 1,
            currentOutstandingReceivableMinor: 700_000,
            periodCashInMinor: 600_000,
            periodCashOutMinor: 200_000,
            periodDateFrom: null,
            periodDateTo: null,
            periodInterestCollectedMinor: 100_000,
            periodPrincipalCollectedMinor: 300_000,
            periodRenewalReleasedMinor: 90_000,
        },
        isError: false,
        isPending: false,
        refetch: vi.fn(),
    }),
}))

describe('financial workflow responsive verification', () => {
    it('keeps borrower registration within the mobile viewport', async () => {
        await page.viewport(BREAKPOINTS.mobile.width, BREAKPOINTS.mobile.height)
        const screen = await render(BorrowerManagementPage, {
            props: { role: 'owner' },
        })

        expectWorkspaceFitsViewport()
        await screen
            .getByRole('button', { name: /create new borrower/i })
            .click()
        expectDialogFitsViewport(
            screen
                .getByRole('dialog', { name: /create new borrower/i })
                .element(),
        )
        const cancel = screen.getByRole('button', { name: 'Cancel' }).element()
        expect(cancel.getBoundingClientRect().bottom).toBeLessThanOrEqual(
            window.innerHeight,
        )
        await expect
            .element(screen.getByLabelText('Mobile number'))
            .toBeVisible()
        await screen.unmount()
    })

    it('keeps loan calculator inputs contained and stacks quote cards on mobile', async () => {
        await page.viewport(BREAKPOINTS.mobile.width, BREAKPOINTS.mobile.height)
        const screen = await render(LoanOriginationPage, {
            props: {
                borrowerPublicId: '019936e2-b837-7000-8000-000000000020',
                role: 'owner',
            },
        })

        expectWorkspaceFitsViewport()
        expectElementsFitViewport(
            screen.getByLabelText('Principal amount (PHP)').element(),
            screen.getByLabelText('Release date').element(),
        )
        expectStacksVertically(
            getCard(screen, 'Loan details'),
            getCard(screen, 'Loan quote'),
        )
        await screen.unmount()
    })

    it('fits payment collection and paired fields in the mobile viewport', async () => {
        await page.viewport(BREAKPOINTS.mobile.width, BREAKPOINTS.mobile.height)
        const screen = await render(PaymentWorkflowDialog, {
            props: {
                collection: {
                    amountDueMinor: 14_000,
                    amountPaidMinor: 6_000,
                    borrowerName: '__TEST-Collection Borrower',
                    borrowerPublicId: '019936e2-b837-7000-8000-000000000001',
                    dueDate: '2026-10-04',
                    installmentNumber: 2,
                    loanNumber: 'LN-000001',
                    loanPublicId: '019936e2-b837-7000-8000-000000000101',
                    loanStatus: 'ACTIVE',
                    paymentFrequency: 'DAILY',
                    remainingAmountMinor: 8_000,
                    status: 'PARTIAL',
                },
                loanPublicId: '019936e2-b837-7000-8000-000000000101',
                open: true,
            },
        })

        expectDialogFitsViewport(
            screen.getByRole('dialog', { name: 'Record payment' }).element(),
        )
        expectElementsFitViewport(
            screen
                .getByRole('region', { name: 'Selected collection' })
                .element(),
            screen.getByLabelText('Payment date').element(),
            screen.getByLabelText('Payment method').element(),
        )
        await screen.unmount()
    })

    it('keeps renewal dates contained and stacks settlement cards on mobile', async () => {
        await page.viewport(BREAKPOINTS.mobile.width, BREAKPOINTS.mobile.height)
        const screen = await render(RenewalOriginationPage, {
            props: {
                previousLoanPublicId: '019936e2-b837-7000-8000-000000000101',
                role: 'owner',
            },
        })

        expectWorkspaceFitsViewport()
        expectElementsFitViewport(
            screen.getByLabelText('Release date').element(),
            screen.getByLabelText('First payment date').element(),
        )
        expectStacksVertically(
            getCard(screen, 'Renewal details'),
            getCard(screen, 'Renewal quote'),
        )
        await screen.unmount()
    })

    it('stacks company-fund metrics while keeping the capital ledger scroll local', async () => {
        await page.viewport(BREAKPOINTS.mobile.width, BREAKPOINTS.mobile.height)
        const screen = await render(CompanyFundPage, {
            props: { role: 'owner' },
        })

        expectWorkspaceFitsViewport()
        expectStacksVertically(
            getCard(screen, 'Available cash'),
            getCard(screen, 'Outstanding principal'),
        )
        expectTableFitsViewport(screen)
        await screen.unmount()
    })

    it('stacks report metrics and keeps export reachable on mobile', async () => {
        await page.viewport(BREAKPOINTS.mobile.width, BREAKPOINTS.mobile.height)
        const screen = await render(ReportsPage)

        expectWorkspaceFitsViewport()
        expectStacksVertically(
            getCard(screen, 'Cash in'),
            getCard(screen, 'Cash out'),
        )
        await expect
            .element(screen.getByRole('button', { name: 'Export period CSV' }))
            .toBeVisible()
        await screen.unmount()
    })

    it('keeps overdue filters in the mobile workspace and table scrolling local', async () => {
        await page.viewport(BREAKPOINTS.mobile.width, BREAKPOINTS.mobile.height)
        const screen = await render(OverduePage, { props: { role: 'owner' } })

        expectWorkspaceFitsViewport()
        expectTableFitsViewport(screen)
        await expect
            .element(screen.getByLabelText('Minimum days late'))
            .toBeVisible()
        await expect
            .element(screen.getByRole('button', { name: 'Export page CSV' }))
            .toBeVisible()
        await screen.unmount()
    })

    it('uses the tablet metric grid without viewport overflow', async () => {
        await page.viewport(BREAKPOINTS.tablet.width, BREAKPOINTS.tablet.height)
        const screen = await render(CompanyFundPage, {
            props: { role: 'owner' },
        })

        expectWorkspaceFitsViewport()
        expectElementsFitViewport(
            getCard(screen, 'Available cash'),
            getCard(screen, 'Outstanding principal'),
        )
        expectTableFitsViewport(screen)
        await screen.unmount()
    })

    it('uses the laptop quote workspace without viewport overflow', async () => {
        await page.viewport(BREAKPOINTS.laptop.width, BREAKPOINTS.laptop.height)
        const screen = await render(LoanOriginationPage, {
            props: {
                borrowerPublicId: '019936e2-b837-7000-8000-000000000020',
                role: 'owner',
            },
        })

        expectWorkspaceFitsViewport()
        expectElementsFitViewport(
            getCard(screen, 'Loan details'),
            getCard(screen, 'Loan quote'),
        )
        expectElementsFitViewport(
            screen.getByLabelText('Principal amount (PHP)').element(),
            screen.getByLabelText('Release date').element(),
        )
        await screen.unmount()
    })

    it('uses the desktop report grid without viewport overflow', async () => {
        await page.viewport(
            BREAKPOINTS.desktop.width,
            BREAKPOINTS.desktop.height,
        )
        const screen = await render(ReportsPage)

        expectWorkspaceFitsViewport()
        expectElementsFitViewport(
            getCard(screen, 'Cash in'),
            getCard(screen, 'Cash out'),
            screen.getByLabelText('Reports from date').element(),
            screen.getByLabelText('Reports to date').element(),
            screen.getByRole('button', { name: 'Export period CSV' }).element(),
        )
        await screen.unmount()
    })
})

function expectDialogFitsViewport(dialog: Element) {
    const bounds = dialog.getBoundingClientRect()

    expect(bounds.left).toBeGreaterThanOrEqual(0)
    expect(bounds.right).toBeLessThanOrEqual(window.innerWidth)
    expect(bounds.top).toBeGreaterThanOrEqual(0)
    expect(bounds.bottom).toBeLessThanOrEqual(window.innerHeight)
}

function expectStacksVertically(first: Element, second: Element) {
    expect(second.getBoundingClientRect().top).toBeGreaterThanOrEqual(
        first.getBoundingClientRect().bottom,
    )
}

function expectElementsFitViewport(...elements: Element[]) {
    for (const element of elements) {
        const bounds = element.getBoundingClientRect()

        expect(bounds.left).toBeGreaterThanOrEqual(0)
        expect(bounds.right).toBeLessThanOrEqual(window.innerWidth)
    }
}

function expectTableFitsViewport(screen: Awaited<ReturnType<typeof render>>) {
    const tableContainer = screen
        .getByRole('table')
        .element()
        .closest<HTMLElement>('[data-slot="table-container"]')

    expect(tableContainer).not.toBeNull()
    expectElementsFitViewport(tableContainer!)
}

function expectWorkspaceFitsViewport() {
    const workspace = document.querySelector<HTMLElement>('section')

    expect(workspace).not.toBeNull()
    expectElementsFitViewport(workspace!)
}

function getCard(screen: Awaited<ReturnType<typeof render>>, title: string) {
    const card = screen
        .getByText(title, { exact: true })
        .element()
        .closest<HTMLElement>('[data-slot="card"]')

    expect(card).not.toBeNull()
    return card!
}
