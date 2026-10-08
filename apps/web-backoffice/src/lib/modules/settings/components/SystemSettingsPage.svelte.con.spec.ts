import { describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-svelte'
import { page } from 'vitest/browser'

import '../../../../app.css'
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
    createFormulaProfileActivateMutation: () => ({ mutateAsync: vi.fn() }),
    createFormulaProfileCreateMutation: () => ({ mutateAsync: vi.fn() }),
    createFormulaProfileDeleteMutation: () => ({ mutateAsync: vi.fn() }),
    createFormulaProfilePreviewMutation: () => ({ mutateAsync: vi.fn() }),
    createFormulaProfileRetireMutation: () => ({ mutateAsync: vi.fn() }),
    createFormulaProfileVersionMutation: () => ({ mutateAsync: vi.fn() }),
    createFormulaProfilesQuery: () => ({
        data: [],
        isError: false,
        isPending: false,
        refetch: vi.fn(),
    }),
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

describe('Settings page scrolling', () => {
    for (const viewport of [
        { name: 'mobile', width: 375, height: 560 },
        { name: 'tablet', width: 768, height: 650 },
        { name: 'desktop', width: 1440, height: 800 },
    ]) {
        it(`${
            viewport.name
        } keeps stacked settings and the save action reachable`, async () => {
            mocks.settings = createSettings()
            await page.viewport(viewport.width, viewport.height)
            const screen = await render(SystemSettingsPage, {
                props: { role: 'admin' },
            })
            screen.container.style.cssText =
                'display: flex; flex-direction: column; height: calc(100dvh - 80px); width: 100%;'
            const pageRoot = screen.container.querySelector('section')!
            const control = screen
                .getByRole('checkbox', {
                    name: 'Show historical worst tag',
                })
                .element()
            const saveButton = screen
                .getByRole('button', { name: 'Save settings' })
                .element()
            await expect
                .poll(() => pageRoot.scrollHeight)
                .toBeGreaterThan(pageRoot.clientHeight)
            expect(screen.container.scrollWidth).toBeLessThanOrEqual(
                screen.container.clientWidth,
            )
            pageRoot.scrollTop = pageRoot.scrollHeight
            await expect
                .poll(() => control.getBoundingClientRect().bottom)
                .toBeLessThanOrEqual(pageRoot.getBoundingClientRect().bottom)
            expect(control.getBoundingClientRect().top).toBeGreaterThanOrEqual(
                pageRoot.getBoundingClientRect().top,
            )
            expect(
                saveButton.getBoundingClientRect().bottom,
            ).toBeLessThanOrEqual(pageRoot.getBoundingClientRect().bottom)
            await screen.unmount()
        })
    }
})
