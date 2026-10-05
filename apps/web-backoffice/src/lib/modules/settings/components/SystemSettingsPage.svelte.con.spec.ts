import { describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-svelte'

import SystemSettingsPage from './SystemSettingsPage.svelte'

const mocks = vi.hoisted(() => ({
    settings: null as Record<string, unknown> | null,
    update: vi.fn(async (input) => ({
        ...input,
        version: 1,
    })),
}))

vi.mock('$lib/states/session', () => ({
    useSessionContext: () => ({ data: { organizationSlug: 'alpha' } }),
}))
vi.mock('$lib/utilities/idempotencyKey', () => ({
    createIdempotencyKeyLifecycle: () => ({
        abandonAttempt: vi.fn(),
        claim: () => ({
            key: '019936e2-b837-7000-8000-000000000501',
            ok: true,
        }),
        confirmSuccess: vi.fn(),
    }),
}))
vi.mock('svelte-sonner', () => ({
    toast: { error: vi.fn(), success: vi.fn() },
}))
vi.mock('../queries', () => ({
    createSystemSettingsQuery: () => ({
        get data() {
            return mocks.settings
        },
        isError: false,
        isPending: false,
        refetch: vi.fn(),
    }),
    createSystemSettingsUpdateMutation: () => ({
        mutateAsync: mocks.update,
    }),
}))

function createSettings() {
    return {
        allowAdvancePayments: true,
        allowPartialPayments: true,
        borrowerTagPolicy: {
            allowManualOverride: true,
            automaticTaggingEnabled: true,
            blockNewLoanForScammer: false,
            daily: {
                badPayerMaximumMissedInstallments: 6,
                goodPayerMaximumMissedInstallments: 2,
                scammerMinimumMissedInstallments: 7,
            },
            monthly: {
                badPayerMaximumMissedInstallments: 6,
                goodPayerMaximumMissedInstallments: 2,
                scammerMinimumMissedInstallments: 7,
            },
            requireBadPayerRenewalApproval: true,
            requireOverrideReason: true,
            requireScammerRenewalApproval: true,
            showHistoricalWorstTag: true,
            weekly: {
                badPayerMaximumMissedInstallments: 6,
                goodPayerMaximumMissedInstallments: 2,
                scammerMinimumMissedInstallments: 7,
            },
        },
        defaultLoanProductPublicId: null,
        defaultPaymentFrequency: 'DAILY',
        enabledPaymentFrequencies: [
            'DAILY',
            'WEEKLY',
            'MONTHLY',
        ],
        requireRenewalApproval: true,
        version: 0,
    }
}

describe('System settings page', () => {
    it('saves a privileged user update with an idempotency key and expected version', async () => {
        mocks.settings = createSettings()
        const screen = await render(SystemSettingsPage, {
            props: { role: 'admin' },
        })

        await screen.getByRole('button', { name: 'Save settings' }).click()
        await screen.getByRole('button', { name: 'Save new version' }).click()

        await expect
            .poll(() => mocks.update)
            .toHaveBeenCalledWith(
                expect.objectContaining({
                    expectedVersion: 0,
                    idempotencyKey: '019936e2-b837-7000-8000-000000000501',
                }),
            )
    })
})
