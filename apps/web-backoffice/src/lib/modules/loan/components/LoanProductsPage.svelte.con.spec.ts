import { describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-svelte'

import LoanProductsPage from './LoanProductsPage.svelte'

const mocks = vi.hoisted(() => ({
    create: vi.fn(async () => ({ publicId: 'product-id' })),
}))

vi.mock('$lib/states/session', () => ({
    useSessionContext: () => ({ data: { organizationSlug: 'alpha' } }),
}))
vi.mock('$lib/utilities/idempotencyKey', () => ({
    createIdempotencyKeyLifecycle: () => ({
        abandonAttempt: vi.fn(),
        claim: () => ({
            key: '019936e2-b837-7000-8000-000000000611',
            ok: true,
        }),
        confirmSuccess: vi.fn(),
    }),
}))
vi.mock('svelte-sonner', () => ({
    toast: { error: vi.fn(), success: vi.fn() },
}))
vi.mock('../../settings/queries', () => ({
    createFormulaProfilesQuery: () => ({
        data: [
            {
                isDefault: true,
                name: '__TEST-Standard Formula',
                publicId: '019936e2-b837-7000-8000-000000000601',
                version: 2,
            },
        ],
        isError: false,
        isPending: false,
    }),
}))
vi.mock('../queries', () => ({
    createLoanProductCreateMutation: () => ({ mutateAsync: mocks.create }),
    createLoanProductsQuery: () => ({
        data: [],
        isError: false,
        isPending: false,
    }),
}))

describe('Loan products page', () => {
    it('creates a product from a named active formula profile selection', async () => {
        const screen = await render(LoanProductsPage)

        await screen
            .getByRole('button', { name: 'Create loan product' })
            .click()
        await screen.getByLabelText('Name').fill('__TEST-Regular loan')
        await screen
            .getByLabelText('Formula profile')
            .selectOptions('019936e2-b837-7000-8000-000000000601')
        await screen.getByLabelText('Minimum principal (PHP)').fill('1000')
        await screen.getByLabelText('Maximum principal (PHP)').fill('10000')
        await screen.getByRole('button', { name: 'Create product' }).click()

        await expect
            .poll(() => mocks.create)
            .toHaveBeenCalledWith({
                formulaProfilePublicId: '019936e2-b837-7000-8000-000000000601',
                idempotencyKey: '019936e2-b837-7000-8000-000000000611',
                maximumPrincipalMinor: 1_000_000,
                minimumPrincipalMinor: 100_000,
                name: '__TEST-Regular loan',
            })
    })
})
