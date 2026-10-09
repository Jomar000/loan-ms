import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-svelte'

import type { LoanInstallment } from '../types'
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
        installments: [] as LoanInstallment[],
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
            installments: mocks.installments,
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
        vi.useFakeTimers({ toFake: ['Date'] })
        vi.setSystemTime(new Date('2026-10-08T16:00:00.000Z'))
        mocks.installments = [
            {
                amountDueMinor: 14_000,
                amountPaidMinor: 0,
                dueDate: '2026-10-04',
                installmentNumber: 1,
                status: 'UPCOMING',
            },
        ]
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    it.each<{
        amountPaidMinor: number
        dueDate: string
        expected: string
        status: LoanInstallment['status']
    }>([
        {
            amountPaidMinor: 0,
            dueDate: '2026-10-08',
            expected: 'OVERDUE',
            status: 'UPCOMING',
        },
        {
            amountPaidMinor: 7_000,
            dueDate: '2026-10-08',
            expected: 'OVERDUE',
            status: 'PARTIAL',
        },
        {
            amountPaidMinor: 0,
            dueDate: '2026-10-09',
            expected: 'UPCOMING',
            status: 'UPCOMING',
        },
        {
            amountPaidMinor: 7_000,
            dueDate: '2026-10-09',
            expected: 'PARTIAL',
            status: 'PARTIAL',
        },
        {
            amountPaidMinor: 0,
            dueDate: '2026-10-10',
            expected: 'UPCOMING',
            status: 'UPCOMING',
        },
        {
            amountPaidMinor: 14_000,
            dueDate: '2026-10-08',
            expected: 'PAID',
            status: 'PAID',
        },
        {
            amountPaidMinor: 0,
            dueDate: '2026-10-08',
            expected: 'WAIVED',
            status: 'WAIVED',
        },
        {
            amountPaidMinor: 0,
            dueDate: '2026-10-08',
            expected: 'OVERDUE',
            status: 'OVERDUE',
        },
    ])(
        'shows $expected for a $status installment due $dueDate',
        async ({ amountPaidMinor, dueDate, expected, status }) => {
            mocks.installments[0] = {
                ...mocks.installments[0]!,
                amountPaidMinor,
                dueDate,
                status,
            }
            const screen = await render(LoanDetailPage, {
                props: {
                    publicId: '019936e2-b837-7000-8000-000000000101',
                    role: 'owner',
                },
            })

            await expect
                .element(
                    screen.getByRole('cell', { name: expected, exact: true }),
                )
                .toBeVisible()
        },
    )

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

    it('offers approval beside the cash-out message for a pending owner loan', async () => {
        const screen = await render(LoanDetailPage, {
            props: {
                publicId: '019936e2-b837-7000-8000-000000000101',
                role: 'owner',
            },
        })

        await expect
            .element(
                screen.getByText('No cash has been released for this loan.'),
            )
            .toBeVisible()
        await screen.getByRole('button', { name: 'Approve this loan' }).click()
        await expect
            .element(
                screen.getByRole('alertdialog', { name: 'Approve this loan?' }),
            )
            .toBeVisible()
    })

    it('explains who can approve when the viewer lacks permission', async () => {
        const screen = await render(LoanDetailPage, {
            props: {
                publicId: '019936e2-b837-7000-8000-000000000101',
                role: 'cashier',
            },
        })

        await expect
            .element(
                screen.getByText(
                    'An owner or admin must approve this loan before cash can be released.',
                ),
            )
            .toBeVisible()
        await expect
            .element(screen.getByRole('button', { name: 'Approve this loan' }))
            .not.toBeInTheDocument()
    })
})
