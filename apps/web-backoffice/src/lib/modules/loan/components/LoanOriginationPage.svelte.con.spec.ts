import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-svelte'

import LoanOriginationPage from './LoanOriginationPage.svelte'

const mocks = vi.hoisted(() => ({
    create: vi.fn(async () => ({
        publicId: '019936e2-b837-7000-8000-000000000101',
    })),
    goto: vi.fn(async () => undefined),
    quote: vi.fn(async () => ({
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
        interestAmountMinor: 140_000,
        installments: [],
        principalMinor: 700_000,
        releaseDate: '2026-10-03',
        riskWarning: null,
        totalPayableMinor: 840_000,
    })),
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
vi.mock('../queries', () => ({
    createLoanCreateMutation: () => ({ mutateAsync: mocks.create }),
    createLoanProductsQuery: () => ({
        data: [
            {
                formulaProfilePublicId: '019936e2-b837-7000-8000-000000000001',
                isActive: true,
                maximumPrincipalMinor: 1_000_000,
                minimumPrincipalMinor: 100_000,
                name: 'Regular 60-Day Loan',
                publicId: '019936e2-b837-7000-8000-000000000010',
            },
        ],
        isError: false,
        isPending: false,
    }),
    createLoanQuoteMutation: () => ({ mutateAsync: mocks.quote }),
}))

describe('Loan origination page', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('shows the server-calculated quote and only then enables loan creation', async () => {
        const screen = await render(LoanOriginationPage, {
            props: {
                borrowerPublicId: '019936e2-b837-7000-8000-000000000020',
                role: 'owner',
            },
        })

        await screen
            .getByLabelText('Loan product')
            .selectOptions('019936e2-b837-7000-8000-000000000010')
        await screen.getByLabelText('Principal amount (PHP)').fill('7000')
        await screen.getByRole('button', { name: 'Calculate quote' }).click()

        await expect.element(screen.getByText('₱8,400.00')).toBeVisible()
        await expect.element(screen.getByText('₱140.00 × 60')).toBeVisible()

        await screen
            .getByRole('button', { name: 'Create loan for approval' })
            .click()

        expect(mocks.create).toHaveBeenCalledWith(
            expect.objectContaining({
                borrowerPublicId: '019936e2-b837-7000-8000-000000000020',
                principalMinor: 700_000,
            }),
        )
        expect(mocks.goto).toHaveBeenCalledWith(
            '/app/owner/loans/019936e2-b837-7000-8000-000000000101',
        )
    })
})
