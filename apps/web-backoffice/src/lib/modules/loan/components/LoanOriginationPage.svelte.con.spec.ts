import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-svelte'

import LoanOriginationPage from './LoanOriginationPage.svelte'

const mocks = vi.hoisted(() => ({
    create: vi.fn(async () => ({
        publicId: '019936e2-b837-7000-8000-000000000101',
    })),
    goto: vi.fn(async () => undefined),
    quote: vi.fn(async () => ({
        expectedCompletionDate: '2026-12-06',
        firstPaymentDate: '2026-10-08',
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
        releaseDate: '2026-10-07',
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
                paymentFrequency: 'DAILY',
                publicId: '019936e2-b837-7000-8000-000000000010',
            },
            ...(
                [
                    'WEEKLY',
                    'MONTHLY',
                ] as const
            ).map((paymentFrequency) => ({
                formulaProfilePublicId: '019936e2-b837-7000-8000-000000000001',
                isActive: true,
                maximumPrincipalMinor: 1_000_000,
                minimumPrincipalMinor: 100_000,
                name: paymentFrequency,
                paymentFrequency,
                publicId: paymentFrequency,
            })),
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

    it('updates the preview and quote input when payment type or release date changes', async () => {
        const screen = await render(LoanOriginationPage, {
            props: {
                borrowerPublicId: '019936e2-b837-7000-8000-000000000020',
                role: 'owner',
            },
        })
        await screen.getByLabelText('Principal amount (PHP)').fill('7000')
        await screen.getByLabelText('Release date').fill('2026-01-31')
        await screen.getByLabelText('Loan product').selectOptions('WEEKLY')
        await expect
            .element(screen.getByLabelText('Estimated first collection date'))
            .toHaveValue('2026-02-07')
        await screen.getByLabelText('Loan product').selectOptions('MONTHLY')
        await expect
            .element(screen.getByLabelText('Estimated first collection date'))
            .toHaveValue('2026-02-28')
        await screen.getByLabelText('Release date').fill('2028-01-31')
        await expect
            .element(screen.getByLabelText('Estimated first collection date'))
            .toHaveValue('2028-02-29')
        await screen.getByRole('button', { name: 'Calculate quote' }).click()
        expect(mocks.quote).toHaveBeenCalledWith(
            expect.objectContaining({
                firstPaymentDate: '2028-02-29',
                releaseDate: '2028-01-31',
            }),
        )
    })

    it('uses the entered principal and shows the smaller final collection separately', async () => {
        const sampleQuote = await mocks.quote()
        mocks.quote.mockClear()
        mocks.quote.mockResolvedValueOnce({
            ...sampleQuote,
            formulaSnapshot: {
                ...sampleQuote.formulaSnapshot,
                installmentCount: 26,
                termDays: 26,
            },
            installmentResidueMinor: 4_000,
            interestAmountMinor: 60_000,
            principalMinor: 300_000,
            totalPayableMinor: 360_000,
        })
        const screen = await render(LoanOriginationPage, {
            props: {
                borrowerPublicId: '019936e2-b837-7000-8000-000000000020',
                role: 'owner',
            },
        })
        await screen
            .getByLabelText('Loan product')
            .selectOptions('019936e2-b837-7000-8000-000000000010')
        await screen.getByLabelText('Principal amount (PHP)').fill('3000')
        await screen.getByLabelText('Release date').fill('2026-10-07')
        await screen.getByRole('button', { name: 'Calculate quote' }).click()
        expect(mocks.quote).toHaveBeenCalledWith(
            expect.objectContaining({ principalMinor: 300_000 }),
        )
        await expect.element(screen.getByText('₱3,600.00')).toBeVisible()
        await expect
            .element(screen.getByText('₱140.00 × 25 + ₱100.00 final'))
            .toBeVisible()
        await screen
            .getByRole('button', { name: 'Create loan for approval' })
            .click()
        expect(mocks.create).toHaveBeenCalledWith(
            expect.objectContaining({ principalMinor: 300_000 }),
        )
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
        await screen.getByLabelText('Release date').fill('2026-10-07')
        await expect
            .element(screen.getByLabelText('Estimated first collection date'))
            .toHaveValue('2026-10-08')
        await screen.getByRole('button', { name: 'Calculate quote' }).click()

        expect(mocks.quote).toHaveBeenCalledWith(
            expect.objectContaining({
                firstPaymentDate: '2026-10-08',
                releaseDate: '2026-10-07',
            }),
        )

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
