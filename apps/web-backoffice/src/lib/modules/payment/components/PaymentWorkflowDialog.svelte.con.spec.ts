import { describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-svelte'

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
