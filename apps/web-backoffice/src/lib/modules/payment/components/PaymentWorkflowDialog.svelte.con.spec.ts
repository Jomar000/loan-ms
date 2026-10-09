import { describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-svelte'

import type { CollectionItem } from '../types'
import PaymentWorkflowDialog from './PaymentWorkflowDialog.svelte'

const mocks = vi.hoisted(() => ({
    create: vi.fn(async () => ({
        actualOutstandingBalanceAfterPaymentMinor: 826_000,
        allocations: [
            {
                allocatedAmountMinor: 14_000,
                amountDueMinor: 14_000,
                amountPaidMinor: 14_000,
                dueDate: '2026-10-04',
                installmentNumber: 1,
                loanInstallmentPublicId: '019936e2-b837-7000-8000-000000000201',
                status: 'PAID' as const,
            },
        ],
        amountAllocatedMinor: 14_000,
        amountReceivedMinor: 14_000,
        borrowerPublicId: '019936e2-b837-7000-8000-000000000001',
        completedInstallmentsAfterPayment: 1,
        loanPublicId: '019936e2-b837-7000-8000-000000000101',
        partialPaymentCreditAfterPaymentMinor: 0,
        paymentDate: '2026-10-04',
        paymentMethod: 'CASH',
        paymentNumber: 'PAY-000001',
        paymentTypeSnapshot: 'DAILY' as const,
        publicId: '019936e2-b837-7000-8000-000000000301',
        referenceNumber: null,
        remainingInstallmentsAfterPayment: 59,
        status: 'POSTED' as const,
        unallocatedMinor: 0,
    })),
    quote: vi.fn(async () => ({
        actualOutstandingBalanceAfterPaymentMinor: 826_000,
        allocations: [],
        amountAllocatedMinor: 14_000,
        amountReceivedMinor: 14_000,
        borrowerPublicId: '019936e2-b837-7000-8000-000000000001',
        completedInstallmentsAfterPayment: 1,
        loanPublicId: '019936e2-b837-7000-8000-000000000101',
        partialPaymentCreditAfterPaymentMinor: 0,
        paymentDate: '2026-10-04',
        paymentMethod: 'CASH',
        paymentTypeSnapshot: 'DAILY' as const,
        referenceNumber: null,
        remainingInstallmentsAfterPayment: 59,
        unallocatedMinor: 0,
    })),
    toastError: vi.fn(),
    toastSuccess: vi.fn(),
}))

vi.mock('$lib/states/session', () => ({
    useSessionContext: () => ({ data: { organizationSlug: 'alpha' } }),
}))
vi.mock('$lib/utilities/idempotencyKey', () => ({
    createIdempotencyKeyLifecycle: () => ({
        abandonAttempt: vi.fn(),
        claim: () => ({
            key: '019936e2-b837-7000-8000-000000000401',
            ok: true,
        }),
        confirmSuccess: vi.fn(),
    }),
}))
vi.mock('svelte-sonner', () => ({
    toast: { error: mocks.toastError, success: mocks.toastSuccess },
}))
vi.mock('../queries', () => ({
    createPaymentCreateMutation: () => ({ mutateAsync: mocks.create }),
    createPaymentQuoteMutation: () => ({ mutateAsync: mocks.quote }),
}))

describe('Payment workflow dialog', () => {
    it.each([
        {
            amountPaidMinor: 0,
            remainingAmountMinor: 14_000,
            expected: '₱140.00',
        },
        {
            amountPaidMinor: 6_000,
            remainingAmountMinor: 8_000,
            expected: '₱80.00',
        },
        { amountPaidMinor: 14_000, remainingAmountMinor: 0, expected: '₱0.00' },
    ])(
        'shows $expected remaining for the selected collection',
        async ({ amountPaidMinor, remainingAmountMinor, expected }) => {
            const collection: CollectionItem = {
                amountDueMinor: 14_000,
                amountPaidMinor,
                borrowerName: '__TEST-Collection Borrower',
                borrowerPublicId: '019936e2-b837-7000-8000-000000000001',
                dueDate: '2026-10-04',
                installmentNumber: 2,
                loanNumber: 'LN-000001',
                loanPublicId: '019936e2-b837-7000-8000-000000000101',
                loanStatus: 'ACTIVE',
                paymentFrequency: 'DAILY',
                remainingAmountMinor,
                status:
                    amountPaidMinor === 0
                        ? 'UPCOMING'
                        : remainingAmountMinor === 0
                          ? 'PAID'
                          : 'PARTIAL',
            }
            const screen = await render(PaymentWorkflowDialog, {
                props: {
                    collection,
                    loanPublicId: collection.loanPublicId,
                    open: true,
                },
            })
            const summary = screen.getByRole('region', {
                name: 'Selected collection',
            })

            await expect
                .element(summary.getByText('Amount due for this collection'))
                .toBeVisible()
            await expect
                .element(summary.getByText(expected, { exact: true }).first())
                .toBeVisible()
            await expect
                .element(summary.getByText(/Installment 2 · Due/))
                .toBeVisible()
            await expect.element(summary.getByText('Scheduled')).toBeVisible()
            await expect
                .element(summary.getByText('Already paid'))
                .toBeVisible()
        },
    )

    it('shows a generated Cash reference and requires an entered GCash or bank reference', async () => {
        mocks.quote.mockClear()
        const screen = await render(PaymentWorkflowDialog, {
            props: {
                loanPublicId: '019936e2-b837-7000-8000-000000000101',
                open: true,
            },
        })
        await expect
            .element(
                screen.getByRole('region', { name: 'Selected collection' }),
            )
            .not.toBeInTheDocument()
        await expect
            .element(screen.getByLabelText('Reference number'))
            .toBeDisabled()
        await screen.getByLabelText('Amount received (PHP)').fill('140.00')
        await screen.getByLabelText('Payment method').selectOptions('GCASH')
        await expect
            .element(screen.getByLabelText('Reference number'))
            .toBeEnabled()

        await screen
            .getByRole('button', { name: 'Calculate allocation' })
            .click()
        expect(mocks.quote).not.toHaveBeenCalled()

        await screen.getByLabelText('Reference number').fill('__TEST-GCASH-1')
        await screen
            .getByRole('button', { name: 'Calculate allocation' })
            .click()
        expect(mocks.quote).toHaveBeenCalledWith(
            expect.objectContaining({
                paymentMethod: 'GCASH',
                referenceNumber: '__TEST-GCASH-1',
            }),
        )

        await screen.getByLabelText('Payment method').selectOptions('BANK')
        await expect
            .element(screen.getByLabelText('Reference number'))
            .toHaveValue('')
        await screen.getByLabelText('Reference number').fill('__TEST-BANK-1')
        await screen
            .getByRole('button', { name: 'Calculate allocation' })
            .click()
        expect(mocks.quote).toHaveBeenLastCalledWith(
            expect.objectContaining({
                paymentMethod: 'BANK',
                referenceNumber: '__TEST-BANK-1',
            }),
        )
    })

    it('quotes before posting, then retains a receipt after the cash-in is confirmed', async () => {
        const screen = await render(PaymentWorkflowDialog, {
            props: {
                loanPublicId: '019936e2-b837-7000-8000-000000000101',
                open: true,
            },
        })

        await screen.getByLabelText('Amount received (PHP)').fill('140.00')
        await screen
            .getByRole('button', { name: 'Calculate allocation' })
            .click()

        await expect
            .element(screen.getByText('Completed installments'))
            .toBeVisible()
        expect(mocks.quote).toHaveBeenCalledWith(
            expect.objectContaining({
                amountReceivedMinor: 14_000,
                loanPublicId: '019936e2-b837-7000-8000-000000000101',
            }),
        )

        await screen.getByRole('button', { name: 'Post payment' }).click()

        await expect
            .element(screen.getByRole('heading', { name: 'Payment receipt' }))
            .toBeVisible()
        expect(mocks.create).toHaveBeenCalledWith(
            expect.objectContaining({
                amountReceivedMinor: 14_000,
                idempotencyKey: '019936e2-b837-7000-8000-000000000401',
            }),
        )
    })
})
