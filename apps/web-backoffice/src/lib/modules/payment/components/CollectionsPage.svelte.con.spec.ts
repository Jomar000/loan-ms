import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-svelte'
import { page } from 'vitest/browser'

import '../../../../app.css'
import type { CollectionItem } from '../types'
import CollectionsPage from './CollectionsPage.svelte'

const collection: CollectionItem = {
    amountDueMinor: 14_000,
    amountPaidMinor: 6_000,
    borrowerName: '__TEST-Partial Borrower',
    borrowerPublicId: '019936e2-b837-7000-8000-000000000001',
    dueDate: '2026-10-04',
    installmentNumber: 2,
    loanNumber: 'LN-000001',
    loanPublicId: '019936e2-b837-7000-8000-000000000101',
    loanStatus: 'ACTIVE',
    paymentFrequency: 'DAILY',
    remainingAmountMinor: 8_000,
    status: 'PARTIAL',
}
let collections = [collection]

beforeEach(async () => {
    await page.viewport(1280, 900)
    collections = [collection]
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-11T04:00:00.000Z'))
})
afterEach(() => {
    vi.useRealTimers()
})

vi.mock('$app/navigation', () => ({ goto: vi.fn() }))
vi.mock('$lib/states/session', () => ({
    useSessionContext: () => ({ data: { organizationSlug: 'alpha' } }),
}))
vi.mock('../queries', () => ({
    createCollectionsBorrowerQuery: () => ({
        data: [collection],
        isError: false,
        isPending: false,
    }),
    createCollectionsDateQuery: () => ({
        data: collections,
        isError: false,
        isPending: false,
        refetch: vi.fn(),
    }),
    createPaymentCreateMutation: () => ({ mutateAsync: vi.fn() }),
    createPaymentQuoteMutation: () => ({ mutateAsync: vi.fn() }),
}))

it.each([
    {
        dueDate: '2026-11-09',
        remainingAmountMinor: 8_000,
        amountPaidMinor: 6_000,
        status: 'PARTIAL' as const,
        label: 'Overdue',
        amount: '₱80.00',
    },
    {
        dueDate: '2026-11-12',
        remainingAmountMinor: 8_000,
        amountPaidMinor: 6_000,
        status: 'PARTIAL' as const,
        label: 'Unpaid',
        amount: '₱80.00',
    },
    {
        dueDate: '2026-11-09',
        remainingAmountMinor: 0,
        amountPaidMinor: 14_000,
        status: 'PAID' as const,
        label: 'Paid',
        amount: '₱0.00',
    },
])(
    'makes the $label collection amount visible next to the borrower',
    async ({
        dueDate,
        remainingAmountMinor,
        amountPaidMinor,
        status,
        label,
        amount,
    }) => {
        collections = [
            {
                ...collection,
                dueDate,
                remainingAmountMinor,
                amountPaidMinor,
                status,
            },
        ]
        const screen = await render(CollectionsPage, {
            props: { role: 'owner' },
        })
        await expect
            .element(
                screen.getByRole('columnheader', { name: 'Unpaid collection' }),
            )
            .toBeVisible()
        const row = screen.getByRole('row', { name: /__TEST-Partial Borrower/ })
        await expect
            .element(row.getByText(amount, { exact: true }))
            .toBeVisible()
        await expect
            .element(row.getByText(label, { exact: true }).first())
            .toBeVisible()
    },
)

it('shows the selected installment balance when recording a collection payment', async () => {
    const screen = await render(CollectionsPage, { props: { role: 'owner' } })

    await screen
        .getByRole('button', { name: 'Record payment', exact: true })
        .click()
    const dialog = screen.getByRole('dialog', { name: 'Record payment' })
    const summary = dialog.getByRole('region', { name: 'Selected collection' })

    await expect
        .element(summary.getByText('₱80.00', { exact: true }))
        .toBeVisible()
    await expect.element(dialog.getByLabelText('Date selection')).toBeVisible()
    await expect
        .element(summary.getByText(/Installment 2\s*·\s*Due/))
        .toBeVisible()
})
