import { describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-svelte'

import CompanyFundPage from './CompanyFundPage.svelte'

const mocks = vi.hoisted(() => ({
    inject: vi.fn(async () => undefined),
    manual: vi.fn(async () => undefined),
    setup: vi.fn(async () => undefined),
    summary: null as Record<string, unknown> | null,
    withdraw: vi.fn(async () => undefined),
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
    toast: { error: vi.fn(), success: vi.fn() },
}))
vi.mock('../queries', () => ({
    createCapitalInjectionMutation: () => ({ mutateAsync: mocks.inject }),
    createCapitalTransactionsQuery: () => ({
        data: { data: [] },
        isError: false,
        isPending: false,
        refetch: vi.fn(),
    }),
    createCapitalWithdrawalMutation: () => ({ mutateAsync: mocks.withdraw }),
    createCompanyFundSetupMutation: () => ({ mutateAsync: mocks.setup }),
    createCompanyFundSummaryQuery: () => ({
        get data() {
            return mocks.summary
        },
        isError: false,
        isPending: false,
        refetch: vi.fn(),
    }),
    createManualFundTransactionMutation: () => ({
        mutateAsync: mocks.manual,
    }),
}))

function configuredSummary() {
    return {
        additionalCapitalMinor: 0,
        availableCashMinor: 500_000,
        capitalWithdrawnMinor: 0,
        currency: 'PHP',
        expensesMinor: 0,
        fundPublicId: '019936e2-b837-7000-8000-000000000101',
        interestCollectedMinor: 0,
        netEarningsMinor: 0,
        openingCapitalMinor: 500_000,
        outstandingPrincipalMinor: 0,
        principalCollectedMinor: 0,
        principalReleasedMinor: 0,
        refundedMinor: 0,
        renewalReleasedMinor: 0,
        writeOffsMinor: 0,
    }
}

describe('Company fund page', () => {
    it('sets up opening capital with an idempotency key when the primary fund is absent', async () => {
        mocks.summary = null
        const screen = await render(CompanyFundPage, {
            props: { role: 'admin' },
        })

        await screen
            .getByRole('button', { name: 'Configure opening capital' })
            .click()
        await screen.getByLabelText('Fund name').fill('Operating Fund')
        await screen.getByLabelText('Opening capital (PHP)').fill('5000')
        await screen.getByRole('button', { name: 'Configure fund' }).click()

        await expect
            .poll(() => mocks.setup)
            .toHaveBeenCalledWith(
                expect.objectContaining({
                    fundName: 'Operating Fund',
                    idempotencyKey: '019936e2-b837-7000-8000-000000000401',
                    openingCapitalMinor: 500_000,
                }),
            )
    })

    it('allows a privileged administrator to inject capital but not withdraw it', async () => {
        mocks.summary = configuredSummary()
        const screen = await render(CompanyFundPage, {
            props: { role: 'admin' },
        })

        await expect
            .element(screen.getByRole('button', { name: 'Withdraw capital' }))
            .not.toBeInTheDocument()
        await screen.getByRole('button', { name: 'Inject capital' }).click()
        await screen.getByLabelText('Capital amount (PHP)').fill('2500')
        await screen.getByLabelText('Reason').fill('Owner contribution')
        await screen
            .getByRole('button', { name: 'Post capital injection' })
            .click()

        await expect
            .poll(() => mocks.inject)
            .toHaveBeenCalledWith(
                expect.objectContaining({
                    amountMinor: 250_000,
                    idempotencyKey: '019936e2-b837-7000-8000-000000000401',
                    reason: 'Owner contribution',
                }),
            )
    })

    it('renders the destructive withdrawal control only for owners', async () => {
        mocks.summary = configuredSummary()
        const screen = await render(CompanyFundPage, {
            props: { role: 'owner' },
        })

        await expect
            .element(screen.getByRole('button', { name: 'Withdraw capital' }))
            .toBeVisible()
    })
})
