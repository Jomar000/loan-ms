import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-svelte'

import LoanDetailPage from './LoanDetailPage.svelte'

const mocks = vi.hoisted(() => {
    let resolveApprove: (() => void) | undefined

    return {
        approve: vi.fn(
            () =>
                new Promise<void>((resolve) => {
                    resolveApprove = resolve
                }),
        ),
        goto: vi.fn(async () => undefined),
        refetch: vi.fn(async () => undefined),
        release: vi.fn(async () => undefined),
        resolveApprove() {
            resolveApprove?.()
        },
        toastError: vi.fn(),
        toastSuccess: vi.fn(),
    }
})

vi.mock('$app/navigation', () => ({ goto: mocks.goto }))
vi.mock('$lib/states/session', () => ({
    useSessionContext: () => ({ data: { organizationSlug: 'alpha' } }),
}))
vi.mock('svelte-sonner', () => ({
    toast: { error: mocks.toastError, success: mocks.toastSuccess },
}))
vi.mock('../queries', () => ({
    createLoanApproveMutation: () => ({ mutateAsync: mocks.approve }),
    createLoanDetailQuery: () => ({
        data: {
            actualOutstandingBalanceMinor: 840_000,
            approvedAt: null,
            approvedByUserPublicId: null,
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
            installments: [
                {
                    amountDueMinor: 14_000,
                    amountPaidMinor: 0,
                    dueDate: '2026-10-04',
                    installmentNumber: 1,
                    status: 'UPCOMING',
                },
            ],
            interestAmountMinor: 140_000,
            loanNumber: 'LN-000001',
            loanProductPublicId: '019936e2-b837-7000-8000-000000000010',
            partialPaymentCreditMinor: 0,
            principalMinor: 700_000,
            publicId: '019936e2-b837-7000-8000-000000000101',
            releaseDate: '2026-10-03',
            releasedAt: null,
            status: 'PENDING_APPROVAL',
            totalAmountPaidMinor: 0,
            totalPayableMinor: 840_000,
        },
        isError: false,
        isPending: false,
        refetch: mocks.refetch,
    }),
    createLoanReleaseMutation: () => ({ mutateAsync: mocks.release }),
}))

describe('Loan detail page', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('keeps the approval confirmation locked while approval is pending', async () => {
        const screen = await render(LoanDetailPage, {
            props: {
                publicId: '019936e2-b837-7000-8000-000000000101',
                role: 'owner',
            },
        })

        await expect.element(screen.getByText('LN-000001')).toBeVisible()
        await screen.getByRole('button', { name: 'Approve loan' }).click()
        const confirm = screen
            .getByRole('alertdialog', { name: 'Approve this loan?' })
            .getByRole('button', { name: 'Approve loan' })
        await confirm.click()

        await expect.element(confirm).toBeDisabled()
        expect(mocks.approve).toHaveBeenCalledWith(
            '019936e2-b837-7000-8000-000000000101',
        )

        mocks.resolveApprove()
        await expect.element(confirm).not.toBeInTheDocument()
    })
})
