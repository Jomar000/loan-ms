import { describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-svelte'

import RenewalOriginationPage from './RenewalOriginationPage.svelte'

const mocks = vi.hoisted(() => ({
    create: vi.fn(async () => ({
        newLoanPublicId: '019936e2-b837-7000-8000-000000000102',
    })),
    goto: vi.fn(async () => undefined),
    quote: vi.fn(async () => ({
        borrowerPublicId: '019936e2-b837-7000-8000-000000000001',
        cashReleaseAmountMinor: 252_000,
        previousCompletedInstallmentCount: 28,
        dailyPaymentAmountMinor: 14_000,
        expectedCompletionDate: '2026-12-02',
        firstPaymentDate: '2026-10-04',
        installments: [],
        interestAmountMinor: 140_000,
        partialCreditHandling: 'CARRY_FORWARD' as const,
        previousLoanNumber: 'LN-000001',
        previousLoanPublicId: '019936e2-b837-7000-8000-000000000101',
        previousPartialCreditMinor: 8_000,
        previousRemainingInstallmentCount: 32,
        renewalFormulaSnapshot: {
            fixedInterestAmountMinor: null,
            installmentCount: 60,
            interestMethod: 'FLAT_PERCENTAGE' as const,
            interestRateBasisPoints: 2000,
            paymentFrequency: 'DAILY' as const,
            roundingMode: 'HALF_UP' as const,
            termDays: 60,
        },
        renewalPrincipalMinor: 700_000,
        renewalSettlementBalanceMinor: 448_000,
        riskWarning: null,
        totalPayableMinor: 840_000,
    })),
    toastError: vi.fn(),
    toastSuccess: vi.fn(),
}))

vi.mock('$app/navigation', () => ({ goto: mocks.goto }))
vi.mock('$lib/modules/loan/queries', () => ({
    createLoanDetailQuery: () => ({
        data: {
            principalMinor: 700_000,
            loanNumber: 'LN-000001',
        },
        isPending: false,
    }),
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
    createRenewalCreateMutation: () => ({ mutateAsync: mocks.create }),
    createRenewalQuoteMutation: () => ({ mutateAsync: mocks.quote }),
}))

describe('Renewal origination page', () => {
    it('quotes the server settlement before allowing the linked renewal confirmation', async () => {
        const screen = await render(RenewalOriginationPage, {
            props: {
                previousLoanPublicId: '019936e2-b837-7000-8000-000000000101',
                role: 'owner',
            },
        })

        await screen
            .getByRole('button', { name: 'Use existing principal' })
            .click()
        await screen.getByRole('button', { name: 'Calculate renewal' }).click()

        await expect
            .element(screen.getByText('Cash release', { exact: true }))
            .toBeVisible()
        expect(mocks.quote).toHaveBeenCalledWith(
            expect.objectContaining({
                previousLoanPublicId: '019936e2-b837-7000-8000-000000000101',
                renewalPrincipalMinor: 700_000,
            }),
        )

        await screen.getByRole('button', { name: 'Confirm renewal' }).click()
        const confirmation = screen.getByRole('alertdialog', {
            name: 'Confirm renewal and cash release?',
        })
        await confirmation
            .getByRole('button', { name: 'Confirm renewal' })
            .click()

        expect(mocks.create).toHaveBeenCalledWith(
            expect.objectContaining({
                idempotencyKey: '019936e2-b837-7000-8000-000000000401',
                renewalPrincipalMinor: 700_000,
            }),
        )
        await expect
            .poll(() => mocks.goto)
            .toHaveBeenCalledWith(
                '/app/owner/loans/019936e2-b837-7000-8000-000000000102',
            )
    })
})
