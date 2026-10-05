import { describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-svelte'

import FormulaProfilesPanel from './FormulaProfilesPanel.svelte'

const mocks = vi.hoisted(() => ({
    profile: {
        allowRenewalPrincipalChange: false,
        createdAt: '2026-10-05T00:00:00.000Z',
        effectiveDate: '2026-10-05',
        fixedInterestAmountMinor: null,
        installmentCount: 60,
        interestMethod: 'FLAT_PERCENTAGE',
        interestRateBasisPoints: 2_000,
        isActive: true,
        isDefault: true,
        minimumRenewalCompletedInstallments: 0,
        name: '__TEST-Standard Formula',
        partialCreditPolicy: 'CARRY_FORWARD',
        paymentFrequency: 'DAILY',
        publicId: '019936e2-b837-7000-8000-000000000601',
        renewalSettlementMethod: 'COMPLETED_INSTALLMENT_BALANCE',
        retiredAt: null,
        roundingMode: 'HALF_UP',
        termDays: 60,
        version: 1,
    },
    preview: vi.fn(async () => ({
        actualOutstandingBalanceMinor: 440_000,
        completedInstallmentCount: 28,
        dailyPaymentAmountMinor: 14_000,
        installmentAmountMinor: 14_000,
        installmentResidueMinor: 0,
        interestAmountMinor: 140_000,
        partialPaymentCreditMinor: 8_000,
        remainingInstallmentCount: 32,
        renewalCashReleaseMinor: 252_000,
        renewalSettlementBalanceMinor: 448_000,
        totalPayableMinor: 840_000,
    })),
    version: vi.fn(async () => ({ version: 2 })),
}))

vi.mock('$lib/states/session', () => ({
    useSessionContext: () => ({ data: { organizationSlug: 'alpha' } }),
}))
vi.mock('$lib/utilities/idempotencyKey', () => ({
    createIdempotencyKeyLifecycle: () => ({
        abandonAttempt: vi.fn(),
        claim: () => ({
            key: '019936e2-b837-7000-8000-000000000602',
            ok: true,
        }),
        confirmSuccess: vi.fn(),
    }),
}))
vi.mock('svelte-sonner', () => ({
    toast: { error: vi.fn(), success: vi.fn() },
}))
vi.mock('../queries', () => ({
    createFormulaProfileActivateMutation: () => ({ mutateAsync: vi.fn() }),
    createFormulaProfileCreateMutation: () => ({ mutateAsync: vi.fn() }),
    createFormulaProfilePreviewMutation: () => ({
        mutateAsync: mocks.preview,
    }),
    createFormulaProfileRetireMutation: () => ({ mutateAsync: vi.fn() }),
    createFormulaProfilesQuery: () => ({
        data: [mocks.profile],
        isError: false,
        isPending: false,
        refetch: vi.fn(),
    }),
    createFormulaProfileVersionMutation: () => ({
        mutateAsync: mocks.version,
    }),
}))

describe('Formula profiles panel', () => {
    it('provides an editable valid example for a new profile', async () => {
        const screen = await render(FormulaProfilesPanel)

        await screen.getByRole('button', { name: 'New profile' }).click()

        await expect
            .element(screen.getByText('Default example: 60-day daily loan'))
            .toBeInTheDocument()
        await expect
            .element(screen.getByLabelText('Profile name'))
            .toHaveValue('Sample daily loan')
        await expect
            .element(screen.getByLabelText('Minimum payments before renewal'))
            .toHaveValue(30)

        await screen.getByLabelText('Installment count').fill('12')

        await expect
            .element(screen.getByLabelText('Minimum payments before renewal'))
            .toHaveValue(12)
    })

    it('previews and creates the next immutable profile version', async () => {
        const screen = await render(FormulaProfilesPanel)

        await screen.getByRole('button', { name: 'New version' }).click()
        await expect
            .element(screen.getByRole('dialog'))
            .toHaveTextContent('Create formula version')

        await screen.getByRole('button', { name: 'Run preview' }).click()
        await expect.element(screen.getByText('₱4,480.00')).toBeInTheDocument()

        await screen
            .getByRole('button', { name: 'Save immutable version' })
            .click()

        await expect
            .poll(() => mocks.version)
            .toHaveBeenCalledWith({
                input: expect.objectContaining({
                    formulaProfile: expect.objectContaining({
                        name: '__TEST-Standard Formula',
                        version: 2,
                    }),
                    idempotencyKey: '019936e2-b837-7000-8000-000000000602',
                }),
                publicId: '019936e2-b837-7000-8000-000000000601',
            })
    })
})
