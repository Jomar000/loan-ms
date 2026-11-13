import { describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-svelte'
import { page, userEvent } from 'vitest/browser'

import type { CollectionItem } from '../types'
import PaymentWorkflowDialog from './PaymentWorkflowDialogHarness.fixture.svelte'

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
    createCollectionsBorrowerQuery: () => ({
        data: Array.from({ length: 6 }, (_, index) => ({
            amountDueMinor: 10_000,
            amountPaidMinor: 0,
            dueDate: `2026-10-${String(4 + index).padStart(2, '0')}`,
            installmentNumber: index + 1,
            loanPublicId: '019936e2-b837-7000-8000-000000000101',
            remainingAmountMinor: 10_000,
            status: 'UPCOMING',
        })),
        isError: false,
        isPending: false,
    }),
    createPaymentCreateMutation: () => ({ mutateAsync: mocks.create }),
    createPaymentQuoteMutation: () => ({ mutateAsync: mocks.quote }),
}))

describe('Payment workflow dialog', () => {
    it('keeps optional notes collapsed and includes them when entered before calculating', async () => {
        mocks.quote.mockClear()
        const screen = await render(PaymentWorkflowDialog, {
            props: {
                loanPublicId: '019936e2-b837-7000-8000-000000000101',
                open: true,
            },
        })
        await expect
            .element(screen.getByLabelText('Notes', { exact: true }))
            .not.toBeVisible()
        await screen.getByText('Notes (optional)', { exact: true }).click()
        await screen
            .getByLabelText('Notes', { exact: true })
            .fill('__TEST-Advance collection')
        await screen.getByLabelText('Amount received (PHP)').fill('140')
        await screen
            .getByRole('button', { name: 'Calculate allocation' })
            .click()
        expect(mocks.quote).toHaveBeenCalledWith(
            expect.objectContaining({
                notes: '__TEST-Advance collection',
                amountReceivedMinor: 14_000,
            }),
        )
        await expect
            .element(screen.getByRole('button', { name: 'Post payment' }))
            .toBeVisible()
    })

    it('locks date selection and keeps the dialog open during a pending quote', async () => {
        const result = await mocks.quote()
        let resolveQuote: ((value: typeof result) => void) | undefined
        mocks.quote.mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    resolveQuote = resolve
                }),
        )
        const screen = await render(PaymentWorkflowDialog, {
            props: {
                collection: {
                    amountDueMinor: 10_000,
                    amountPaidMinor: 0,
                    borrowerName: '__TEST-Locked Borrower',
                    borrowerPublicId: '019936e2-b837-7000-8000-000000000001',
                    dueDate: '2026-10-04',
                    installmentNumber: 1,
                    loanNumber: '__TEST-LN',
                    loanPublicId: '019936e2-b837-7000-8000-000000000101',
                    loanStatus: 'ACTIVE',
                    paymentFrequency: 'DAILY',
                    remainingAmountMinor: 10_000,
                    status: 'UPCOMING',
                },
                loanPublicId: '019936e2-b837-7000-8000-000000000101',
                open: true,
            },
        })
        await screen.getByLabelText('Amount received (PHP)').fill('100')
        await screen
            .getByRole('button', { name: 'Calculate allocation' })
            .click()
        try {
            await expect
                .element(screen.getByLabelText('Date selection'))
                .toBeDisabled()
            await userEvent.keyboard('{Escape}')
            await expect
                .element(screen.getByRole('dialog', { name: 'Record payment' }))
                .toBeVisible()
            await page
                .elementLocator(
                    document.querySelector<HTMLElement>(
                        '[data-slot="dialog-overlay"]',
                    )!,
                )
                .click({ force: true, position: { x: 2, y: 2 } })
            await expect
                .element(screen.getByRole('dialog', { name: 'Record payment' }))
                .toBeVisible()
        } finally {
            resolveQuote?.(result)
        }
        await expect
            .element(screen.getByLabelText('Date selection'))
            .toBeEnabled()
    })

    it.each([
        'dates',
        'range',
    ])(
        'covers five daily installments with one 500-peso payment using %s',
        async (mode) => {
            mocks.quote.mockClear()
            mocks.create.mockClear()
            const collection: CollectionItem = {
                amountDueMinor: 10_000,
                amountPaidMinor: 0,
                borrowerName: '__TEST-Coverage Borrower',
                borrowerPublicId: '019936e2-b837-7000-8000-000000000001',
                dueDate: '2026-10-04',
                installmentNumber: 1,
                loanNumber: '__TEST-LN-coverage',
                loanPublicId: '019936e2-b837-7000-8000-000000000101',
                loanStatus: 'ACTIVE',
                paymentFrequency: 'DAILY',
                remainingAmountMinor: 10_000,
                status: 'UPCOMING',
            }
            const screen = await render(PaymentWorkflowDialog, {
                props: {
                    collection,
                    loanPublicId: collection.loanPublicId,
                    open: true,
                },
            })
            await screen.getByLabelText('Date selection').selectOptions(mode)
            if (mode === 'dates') {
                for (const date of [
                    '04',
                    '05',
                    '06',
                    '07',
                    '08',
                ]) {
                    await screen
                        .getByRole('checkbox', {
                            name: `Cover 2026-10-${date}`,
                        })
                        .click()
                }
            } else {
                await screen.getByLabelText('Cover from').fill('2026-10-04')
                await screen.getByLabelText('Cover through').fill('2026-10-08')
            }
            await expect
                .element(screen.getByRole('status'))
                .toHaveTextContent('5 installment dates selected')
            await screen
                .getByRole('button', { name: 'Use selected total' })
                .click()
            await expect
                .element(screen.getByLabelText('Amount received (PHP)'))
                .toHaveValue(500)
            await screen
                .getByRole('button', { name: 'Calculate allocation' })
                .click()
            const expected = {
                amountReceivedMinor: 50_000,
                coveredDates: [
                    '2026-10-04',
                    '2026-10-05',
                    '2026-10-06',
                    '2026-10-07',
                    '2026-10-08',
                ],
            }
            expect(mocks.quote).toHaveBeenCalledWith(
                expect.objectContaining(expected),
            )
            await screen.getByRole('button', { name: 'Post payment' }).click()
            expect(mocks.create).toHaveBeenCalledWith(
                expect.objectContaining(expected),
            )
            await expect
                .element(
                    screen.getByRole('region', {
                        name: 'Covered installment dates',
                    }),
                )
                .toBeVisible()
        },
    )

    it('uses one selected installment date as the payment date', async () => {
        mocks.quote.mockClear()
        mocks.create.mockClear()
        const screen = await render(PaymentWorkflowDialog, {
            props: {
                borrowerPublicId: '019936e2-b837-7000-8000-000000000001',
                loanPublicId: '019936e2-b837-7000-8000-000000000101',
                open: true,
            },
        })

        await screen.getByLabelText('Date selection').selectOptions('single')
        await screen.getByLabelText('Installment date').fill('2026-10-04')
        await screen.getByLabelText('Amount received (PHP)').fill('100')
        await screen
            .getByRole('button', { name: 'Calculate allocation' })
            .click()

        const expected = {
            amountReceivedMinor: 10_000,
            coveredDates: ['2026-10-04'],
            paymentDate: '2026-10-04',
        }
        expect(mocks.quote).toHaveBeenCalledWith(
            expect.objectContaining(expected),
        )
        await screen.getByRole('button', { name: 'Post payment' }).click()
        expect(mocks.create).toHaveBeenCalledWith(
            expect.objectContaining(expected),
        )
    })

    it('clears the quote when covered dates change and permits skipping earlier unpaid dates', async () => {
        const screen = await render(PaymentWorkflowDialog, {
            props: {
                collection: {
                    amountDueMinor: 10_000,
                    amountPaidMinor: 0,
                    borrowerName: '__TEST-Borrower',
                    borrowerPublicId: '019936e2-b837-7000-8000-000000000001',
                    dueDate: '2026-10-04',
                    installmentNumber: 1,
                    loanNumber: '__TEST-LN',
                    loanPublicId: '019936e2-b837-7000-8000-000000000101',
                    loanStatus: 'ACTIVE',
                    paymentFrequency: 'DAILY',
                    remainingAmountMinor: 10_000,
                    status: 'UPCOMING',
                },
                loanPublicId: '019936e2-b837-7000-8000-000000000101',
                open: true,
            },
        })
        await screen.getByLabelText('Amount received (PHP)').fill('100')
        await screen
            .getByRole('button', { name: 'Calculate allocation' })
            .click()
        await expect
            .element(screen.getByRole('button', { name: 'Post payment' }))
            .toBeVisible()
        await screen.getByLabelText('Date selection').selectOptions('dates')
        await expect
            .element(screen.getByRole('button', { name: 'Post payment' }))
            .not.toBeInTheDocument()
        await screen.getByRole('checkbox', { name: 'Cover 2026-10-05' }).click()
        await expect
            .element(screen.getByRole('button', { name: 'Use selected total' }))
            .toBeEnabled()
        await screen.getByRole('button', { name: 'Use selected total' }).click()
        await screen
            .getByRole('button', { name: 'Calculate allocation' })
            .click()
        expect(mocks.quote).toHaveBeenLastCalledWith(
            expect.objectContaining({
                coveredDates: ['2026-10-05'],
                amountReceivedMinor: 10_000,
            }),
        )
    })

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
                .element(summary.getByText(/Installment 2\s*·\s*Due/))
                .toBeVisible()
            await expect
                .element(screen.getByLabelText('Date selection'))
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
