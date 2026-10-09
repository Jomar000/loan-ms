import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-svelte'

import FormulaProfilesPanel from './FormulaProfilesPanel.svelte'

const mocks = vi.hoisted(() => ({
    create: vi.fn(async () => ({ version: 1 })),
    delete: vi.fn(async () => undefined),
    profile: {
        allowRenewalPrincipalChange: false,
        collectionAmountMinor: null as number | null,
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
    createFormulaProfileCreateMutation: () => ({ mutateAsync: mocks.create }),
    createFormulaProfileDeleteMutation: () => ({ mutateAsync: mocks.delete }),
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
    beforeEach(() => {
        mocks.create.mockClear()
        mocks.delete.mockClear()
        mocks.preview.mockClear()
        mocks.version.mockClear()
        mocks.profile.isActive = true
        mocks.profile.collectionAmountMinor = null
        mocks.profile.isDefault = true
        mocks.profile.installmentCount = 60
        mocks.profile.paymentFrequency = 'DAILY'
        mocks.profile.roundingMode = 'HALF_UP'
        mocks.profile.termDays = 60
    })

    it('provides an editable valid example for a new profile', async () => {
        const screen = await render(FormulaProfilesPanel)

        await screen.getByRole('button', { name: 'New profile' }).click()

        await expect
            .element(screen.getByText('60-day daily loan'))
            .toBeInTheDocument()
        await expect
            .element(screen.getByLabelText('Profile name'))
            .toHaveValue('Sample daily loan')
        await expect
            .element(
                screen.getByLabelText('Minimum payments before renewal', {
                    exact: true,
                }),
            )
            .toHaveValue(30)

        await screen.getByLabelText('Installment count').fill('12')

        await expect
            .element(
                screen.getByLabelText('Minimum payments before renewal', {
                    exact: true,
                }),
            )
            .toHaveValue(12)
    })

    it.each([
        [
            'WEEKLY',
            'Term weeks',
            'Weekly installments',
            21,
        ],
        [
            'MONTHLY',
            'Term months',
            'Monthly installments',
            90,
        ],
    ] as const)(
        'uses %s term units and matching installments when creating a profile',
        async (frequency, termLabel, installmentLabel, termDays) => {
            const screen = await render(FormulaProfilesPanel)

            await screen.getByRole('button', { name: 'New profile' }).click()
            await screen
                .getByLabelText('Payment frequency')
                .selectOptions(frequency)
            await screen.getByLabelText(termLabel, { exact: true }).fill('3')

            await expect
                .element(screen.getByLabelText(installmentLabel))
                .toHaveValue(3)
            await expect
                .element(
                    screen.getByText(
                        `3 ${frequency === 'WEEKLY' ? 'weeks' : 'months'}`,
                        { exact: false },
                    ),
                )
                .toBeInTheDocument()

            await screen
                .getByRole('button', { name: 'Save immutable version' })
                .click()

            await expect
                .poll(() => mocks.create)
                .toHaveBeenCalledWith({
                    formulaProfile: expect.objectContaining({
                        installmentCount: 3,
                        paymentFrequency: frequency,
                        termDays,
                    }),
                    idempotencyKey: '019936e2-b837-7000-8000-000000000602',
                })
        },
    )

    it.each([
        [
            'DAILY',
            'Term days',
            'Installment count',
            60,
        ],
        [
            'WEEKLY',
            'Term weeks',
            'Weekly installments',
            420,
        ],
        [
            'MONTHLY',
            'Term months',
            'Monthly installments',
            1800,
        ],
    ] as const)(
        'calculates and locks the %s schedule from collection per payment',
        async (frequency, termLabel, installmentLabel, termDays) => {
            const screen = await render(FormulaProfilesPanel)
            await screen.getByRole('button', { name: 'New profile' }).click()
            await screen
                .getByLabelText('Payment frequency')
                .selectOptions(frequency)
            await screen
                .getByLabelText('Set repayment schedule by')
                .selectOptions('COLLECTION')
            await screen
                .getByLabelText('Collection per payment (PHP)', { exact: true })
                .fill('140')

            await expect
                .element(screen.getByLabelText(termLabel, { exact: true }))
                .toHaveValue(60)
            await expect
                .element(screen.getByLabelText(termLabel, { exact: true }))
                .toBeDisabled()
            await expect
                .element(screen.getByLabelText(installmentLabel))
                .toHaveValue(60)
            await expect
                .element(screen.getByLabelText(installmentLabel))
                .toBeDisabled()
            await expect
                .element(
                    screen.getByText(new RegExp(`${termDays} accounting days`)),
                )
                .toBeVisible()

            await screen.getByLabelText('Interest rate (%)').fill('40')
            await expect
                .element(screen.getByLabelText(termLabel, { exact: true }))
                .toHaveValue(70)

            await screen
                .getByRole('button', { name: 'Save immutable version' })
                .click()
            await expect
                .poll(() => mocks.create)
                .toHaveBeenCalledWith({
                    formulaProfile: expect.objectContaining({
                        collectionAmountMinor: 14_000,
                        installmentCount: 70,
                        termDays: (termDays / 60) * 70,
                    }),
                    idempotencyKey: '019936e2-b837-7000-8000-000000000602',
                })
        },
    )

    it.each([
        '3.5',
        '123',
    ])(
        'does not preview an invalid monthly term of %s months',
        async (term) => {
            const screen = await render(FormulaProfilesPanel)

            await screen.getByRole('button', { name: 'New profile' }).click()
            await screen
                .getByLabelText('Payment frequency')
                .selectOptions('MONTHLY')
            await screen
                .getByLabelText('Term months', { exact: true })
                .fill(term)
            await screen.getByRole('button', { name: 'Run preview' }).click()

            expect(mocks.preview).not.toHaveBeenCalled()
        },
    )

    it('preserves an existing nonstandard monthly term when creating a version', async () => {
        mocks.profile.installmentCount = 2
        mocks.profile.paymentFrequency = 'MONTHLY'
        mocks.profile.termDays = 61
        const screen = await render(FormulaProfilesPanel)

        await screen.getByRole('button', { name: 'New version' }).click()
        await expect
            .element(screen.getByLabelText('Term days', { exact: true }))
            .toHaveValue(61)

        await screen
            .getByRole('button', { name: 'Save immutable version' })
            .click()

        await expect
            .poll(() => mocks.version)
            .toHaveBeenCalledWith({
                input: expect.objectContaining({
                    formulaProfile: expect.objectContaining({
                        installmentCount: 2,
                        paymentFrequency: 'MONTHLY',
                        termDays: 61,
                    }),
                }),
                publicId: '019936e2-b837-7000-8000-000000000601',
            })
    })

    it('previews and creates the next immutable profile version', async () => {
        mocks.profile.roundingMode = 'DOWN'
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
                        roundingMode: 'DOWN',
                        version: 2,
                    }),
                    idempotencyKey: '019936e2-b837-7000-8000-000000000602',
                }),
                publicId: '019936e2-b837-7000-8000-000000000601',
            })
        await expect.element(screen.getByRole('dialog')).not.toBeInTheDocument()
    })

    it('explains the renewal choices and uses standard rounding for new profiles', async () => {
        const screen = await render(FormulaProfilesPanel)

        await screen.getByRole('button', { name: 'New profile' }).click()
        await expect
            .element(screen.getByLabelText('Rounding'))
            .not.toBeInTheDocument()
        await expect
            .element(
                screen.getByLabelText('Old loan balance to settle', {
                    exact: true,
                }),
            )
            .toHaveValue('COMPLETED_INSTALLMENT_BALANCE')
        await expect
            .element(
                screen.getByRole('option', { name: 'Actual unpaid balance' }),
            )
            .toBeInTheDocument()
        await expect
            .element(
                screen.getByRole('option', { name: 'Refund to the borrower' }),
            )
            .toBeInTheDocument()
        await screen
            .getByRole('button', { name: 'Old loan balance to settle help' })
            .click()
        await expect
            .element(
                screen.getByRole('dialog', {
                    name: 'Old loan balance to settle help',
                }),
            )
            .toHaveTextContent(/Counts the full amount of each installment/)
        await screen
            .getByRole('button', { name: 'Old loan balance to settle help' })
            .click()

        await screen
            .getByRole('button', { name: 'Save immutable version' })
            .click()

        await expect
            .poll(() => mocks.create)
            .toHaveBeenCalledWith({
                formulaProfile: expect.objectContaining({
                    roundingMode: 'HALF_UP',
                    roundingPrecision: 0,
                }),
                idempotencyKey: '019936e2-b837-7000-8000-000000000602',
            })
        await expect.element(screen.getByRole('dialog')).not.toBeInTheDocument()
    })

    it('shows contextual help for formula fields when the question mark is clicked', async () => {
        const screen = await render(FormulaProfilesPanel)

        await screen.getByRole('button', { name: 'New profile' }).click()
        for (const name of [
            'Term days',
            'Minimum payments before renewal',
            'Old loan balance to settle',
            'What to do with a partial payment',
            'Allow renewal principal changes',
        ]) {
            await expect
                .element(screen.getByRole('button', { name: `${name} help` }))
                .toBeInTheDocument()
        }

        await screen
            .getByRole('button', {
                name: 'Allow renewal principal changes help',
            })
            .click()
        await expect
            .element(
                screen.getByRole('dialog', {
                    name: 'Allow renewal principal changes help',
                }),
            )
            .toHaveTextContent(/Permit the renewed loan principal to differ/)
        await screen
            .getByRole('button', {
                name: 'Allow renewal principal changes help',
            })
            .click()

        await screen
            .getByLabelText('Set repayment schedule by')
            .selectOptions('COLLECTION')
        await expect
            .element(
                screen.getByRole('button', {
                    name: 'Collection per payment (PHP) help',
                }),
            )
            .toBeInTheDocument()
        await screen
            .getByRole('button', { name: 'Collection per payment (PHP) help' })
            .click()
        await expect
            .element(
                screen.getByRole('dialog', {
                    name: 'Collection per payment (PHP) help',
                }),
            )
            .toHaveTextContent(
                /Each new loan uses its own principal and interest/,
            )
        expect(mocks.create).not.toHaveBeenCalled()
    })

    it('preserves collection per payment when creating a new version', async () => {
        mocks.profile.collectionAmountMinor = 14_000
        const screen = await render(FormulaProfilesPanel)

        await screen.getByRole('button', { name: 'New version' }).click()
        await expect
            .element(screen.getByLabelText('Set repayment schedule by'))
            .toHaveValue('COLLECTION')
        await expect
            .element(
                screen.getByLabelText('Collection per payment (PHP)', {
                    exact: true,
                }),
            )
            .toHaveValue(140)
        await screen
            .getByRole('button', { name: 'Save immutable version' })
            .click()
        await expect
            .poll(() => mocks.version)
            .toHaveBeenCalledWith({
                input: expect.objectContaining({
                    formulaProfile: expect.objectContaining({
                        collectionAmountMinor: 14_000,
                    }),
                }),
                publicId: mocks.profile.publicId,
            })
    })

    it('shows a plain-language save error in a dialog and keeps the draft', async () => {
        mocks.create.mockRejectedValueOnce(
            new Error('[{"code":"custom","path":["name"]}]'),
        )
        const screen = await render(FormulaProfilesPanel)

        await screen.getByRole('button', { name: 'New profile' }).click()
        await screen.getByLabelText('Profile name').fill('Custom profile')
        await screen
            .getByRole('button', { name: 'Save immutable version' })
            .click()

        await expect
            .element(
                screen.getByRole('dialog', {
                    name: 'Formula profile could not be saved',
                }),
            )
            .toBeVisible()
        await expect
            .element(
                screen.getByText(
                    'Please review the formula profile details and try again.',
                ),
            )
            .toBeVisible()
        await screen.getByRole('button', { name: 'Back to profile' }).click()
        await expect
            .element(screen.getByLabelText('Profile name'))
            .toHaveValue('Custom profile')
    })

    it.each([
        false,
        true,
    ])('confirms deletion when isActive is %s', async (isActive) => {
        mocks.profile.isActive = isActive
        mocks.profile.isDefault = isActive
        const screen = await render(FormulaProfilesPanel)

        await screen
            .getByRole('button', { name: 'Delete', exact: true })
            .click()
        await expect
            .element(screen.getByRole('alertdialog'))
            .toHaveTextContent('__TEST-Standard Formula')
        expect(mocks.delete).not.toHaveBeenCalled()

        await screen.getByRole('button', { name: 'Cancel' }).click()
        expect(mocks.delete).not.toHaveBeenCalled()

        await screen
            .getByRole('button', { name: 'Delete', exact: true })
            .click()
        await screen.getByRole('button', { name: 'Delete profile' }).click()
        await expect
            .poll(() => mocks.delete)
            .toHaveBeenCalledWith('019936e2-b837-7000-8000-000000000601')
        await expect
            .element(screen.getByRole('alertdialog'))
            .not.toBeInTheDocument()
    })
})
