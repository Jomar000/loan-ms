import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-svelte'

import type { LoanListItem } from '$lib/modules/loan/types'
import BorrowerProfilePageTestHarness from './BorrowerProfilePageTestHarness.svelte'

const mocks = vi.hoisted(() => ({
    goto: vi.fn(async () => undefined),
    loanList: vi.fn(),
    loanRefetch: vi.fn(),
    toastError: vi.fn(),
    toastSuccess: vi.fn(),
}))

vi.mock('$app/navigation', () => ({ goto: mocks.goto }))
vi.mock('$lib/states/session', () => ({
    useSessionContext: () => ({ data: { organizationSlug: 'alpha' } }),
}))
vi.mock('svelte-sonner', () => ({
    toast: { error: mocks.toastError, success: mocks.toastSuccess },
}))
vi.mock('$lib/modules/loan/queries', () => ({
    createLoanListQuery: mocks.loanList,
}))
vi.mock('../queries', () => ({
    createBorrowerArchiveMutation: () => ({ mutateAsync: vi.fn() }),
    createBorrowerDetailQuery: () => ({
        data: {
            addressLine: '1 Rizal Street',
            barangay: 'San Jose',
            borrowerNumber: 'BR-000001',
            cityMunicipality: 'Manila',
            contactNumber: '09171234567',
            email: null,
            fullName: 'Ana Dela Cruz',
            gender: 'FEMALE',
            notes: null,
            paymentTag: 'GOOD_PAYER',
            paymentTagOverrideReason: null,
            paymentTagSource: 'SYSTEM',
            paymentTagUpdatedAt: '2026-10-03T00:00:00.000Z',
            province: 'Metro Manila',
            publicId: '019936e2-b837-7000-8000-000000000001',
            secondaryContactNumber: null,
            status: 'ACTIVE',
            systemPaymentTag: 'GOOD_PAYER',
        },
        isError: false,
        isPending: false,
        refetch: vi.fn(),
    }),
    createBorrowerDocumentsQuery: () => ({ data: [], isPending: false }),
    createBorrowerPaymentTagOverrideMutation: () => ({ mutateAsync: vi.fn() }),
    createBorrowerPaymentTagQuery: () => ({
        data: {
            currentCalculatedTag: 'GOOD_PAYER',
            currentTag: 'GOOD_PAYER',
            lastCalculatedAt: '2026-10-03T00:00:00.000Z',
            missedInstallmentCount: 0,
            paymentType: null,
            source: 'SYSTEM',
            thresholds: {
                badPayerMinimumMissedInstallments: 3,
                scammerMinimumMissedInstallments: 7,
            },
        },
    }),
    createBorrowerPaymentTagResetMutation: () => ({ mutateAsync: vi.fn() }),
    createBorrowerUpdateMutation: () => ({ mutateAsync: vi.fn() }),
}))

describe('Borrower profile page', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mocks.loanList.mockReturnValue({
            data: { count: 0, data: [] },
            isError: false,
            isFetching: false,
            isPending: false,
            refetch: mocks.loanRefetch,
        })
    })

    it('keeps a borrower with no loan explicitly available and explains the empty loan state', async () => {
        const screen = await render(BorrowerProfilePageTestHarness)

        await expect
            .element(screen.getByRole('heading', { name: 'Ana Dela Cruz' }))
            .toBeVisible()
        await expect
            .element(screen.getByText('Emergency contact:'))
            .not.toBeInTheDocument()
        await expect.element(screen.getByText('No loan yet')).toBeVisible()
        await screen.getByRole('tab', { name: 'Loans' }).click()
        await expect
            .element(
                screen.getByText(
                    'This borrower can remain independent of loans, or a new loan can be prepared when needed.',
                ),
            )
            .toBeVisible()
    })

    it('shows the active loan in the Loans tab with its balance and detail link', async () => {
        const loan: LoanListItem = {
            actualOutstandingBalanceMinor: 840_000,
            borrowerPublicId: '019936e2-b837-7000-8000-000000000001',
            completedInstallmentCount: 0,
            createdAt: '2026-10-03T00:00:00.000Z',
            dailyPaymentAmountMinor: 14_000,
            expectedCompletionDate: '2026-12-02',
            firstPaymentDate: '2026-10-04',
            formulaSnapshot: {
                fixedInterestAmountMinor: null,
                formulaProfilePublicId: '019936e2-b837-7000-8000-000000000010',
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
            loanNumber: 'TESTLN000001',
            loanProductPublicId: '019936e2-b837-7000-8000-000000000011',
            partialPaymentCreditMinor: 0,
            principalMinor: 700_000,
            publicId: '019936e2-b837-7000-8000-000000000101',
            releaseDate: '2026-10-03',
            releasedAt: '2026-10-03T00:00:00.000Z',
            status: 'ACTIVE',
            totalAmountPaidMinor: 0,
            totalPayableMinor: 840_000,
        }
        mocks.loanList.mockReturnValue({
            data: { count: 26, data: [loan] },
            isError: false,
            isFetching: false,
            isPending: false,
            refetch: mocks.loanRefetch,
        })
        const screen = await render(BorrowerProfilePageTestHarness)
        await screen.getByRole('tab', { name: 'Loans' }).click()

        const link = screen.getByRole('link', { name: loan.loanNumber })
        await expect.element(link).toBeVisible()
        await expect
            .element(link)
            .toHaveAttribute('href', `/app/owner/loans/${loan.publicId}`)
        const row = screen.getByRole('row', { name: /TESTLN000001/ })
        await expect
            .element(row.getByText('ACTIVE', { exact: true }))
            .toBeVisible()
        await expect
            .element(row.getByRole('cell').nth(1))
            .toHaveTextContent('₱7,000.00')
        await expect
            .element(row.getByRole('cell').nth(3))
            .toHaveTextContent('₱8,400.00')
        await expect
            .element(screen.getByText('No loans yet'))
            .not.toBeInTheDocument()
        await screen.getByRole('button', { name: 'Next page' }).click()
        const [
            scope,
            options,
        ] = mocks.loanList.mock.calls.at(-1)!
        expect(scope.organizationSlug).toBe('alpha')
        expect(options.request).toEqual({
            filters: { borrowerPublicId: loan.borrowerPublicId },
            limit: 25,
            offset: 25,
            sortOrder: 'desc',
        })
        await screen.getByRole('button', { name: 'Previous page' }).click()
        expect(options.request.offset).toBe(0)
    })

    it('shows loan loading instead of claiming that the borrower has no loans', async () => {
        mocks.loanList.mockReturnValue({ isPending: true })
        const screen = await render(BorrowerProfilePageTestHarness)
        await screen.getByRole('tab', { name: 'Loans' }).click()

        await expect
            .element(screen.getByRole('status'))
            .toHaveTextContent('Loading borrower loans')
        await expect
            .element(screen.getByText('No loans yet'))
            .not.toBeInTheDocument()
    })

    it('shows a failed loan query and lets the user retry it', async () => {
        mocks.loanList.mockReturnValue({
            error: new Error('Could not retrieve borrower loans.'),
            isError: true,
            isPending: false,
            refetch: mocks.loanRefetch,
        })
        const screen = await render(BorrowerProfilePageTestHarness)
        await screen.getByRole('tab', { name: 'Loans' }).click()

        await expect
            .element(screen.getByText('Loans could not be loaded'))
            .toBeVisible()
        await expect
            .element(screen.getByText('No loans yet'))
            .not.toBeInTheDocument()
        await screen.getByRole('button', { name: 'Refresh loans' }).click()
        expect(mocks.loanRefetch).toHaveBeenCalledOnce()
    })
})
