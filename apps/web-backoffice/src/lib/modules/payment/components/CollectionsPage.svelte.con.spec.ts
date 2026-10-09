import { expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-svelte'

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

vi.mock('$app/navigation', () => ({ goto: vi.fn() }))
vi.mock('$lib/states/session', () => ({
    useSessionContext: () => ({ data: { organizationSlug: 'alpha' } }),
}))
vi.mock('../queries', () => ({
    createCollectionsDateQuery: () => ({
        data: [collection],
        isError: false,
        isPending: false,
        refetch: vi.fn(),
    }),
    createPaymentCreateMutation: () => ({ mutateAsync: vi.fn() }),
    createPaymentQuoteMutation: () => ({ mutateAsync: vi.fn() }),
}))

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
    await expect
        .element(summary.getByText('₱140.00', { exact: true }))
        .toBeVisible()
    await expect
        .element(summary.getByText('₱60.00', { exact: true }))
        .toBeVisible()
    await expect.element(summary.getByText(/Installment 2 · Due/)).toBeVisible()
})
