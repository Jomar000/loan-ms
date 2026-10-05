import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
    fetchCapitalTransactions: vi.fn(async () => ({ count: 0, data: [] })),
    fetchCompanyFundSummary: vi.fn(async () => ({})),
    fetchOverdueLoans: vi.fn(async () => ({ count: 0, data: [] })),
    fetchReportSummary: vi.fn(async () => ({})),
    injectCapital: vi.fn(async () => undefined),
    invalidateQueries: vi.fn(async () => undefined),
    setupCompanyFund: vi.fn(async () => undefined),
    withdrawCapital: vi.fn(async () => undefined),
}))

vi.mock('@tanstack/svelte-query', () => ({
    createMutation: (factory: () => unknown) => factory(),
    createQuery: (factory: () => unknown) => factory(),
    useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }),
}))
vi.mock('./api', () => mocks)

import {
    createCapitalInjectionMutation,
    createCapitalWithdrawalMutation,
    createCompanyFundSetupMutation,
} from './queries'

describe('Company fund query utilities', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('uses tenant-scoped write keys and refreshes the company fund hierarchy after writes', async () => {
        const scope = { organizationSlug: 'alpha' }
        const setup = createCompanyFundSetupMutation(scope) as unknown as {
            mutationFn: (value: unknown) => Promise<unknown>
            mutationKey: readonly unknown[]
            onSuccess: () => Promise<void>
        }
        const injection = createCapitalInjectionMutation(scope) as unknown as {
            mutationFn: (value: unknown) => Promise<unknown>
            mutationKey: readonly unknown[]
            onSuccess: () => Promise<void>
        }
        const withdrawal = createCapitalWithdrawalMutation(
            scope,
        ) as unknown as {
            mutationFn: (value: unknown) => Promise<unknown>
            mutationKey: readonly unknown[]
            onSuccess: () => Promise<void>
        }

        await setup.mutationFn({ fundName: 'Operating Fund' })
        await injection.mutationFn({ amountMinor: 500_000 })
        await withdrawal.mutationFn({ amountMinor: 100_000 })
        await Promise.all([
            setup.onSuccess(),
            injection.onSuccess(),
            withdrawal.onSuccess(),
        ])

        expect(setup.mutationKey).toEqual([
            'alpha',
            'companyFund',
            'setup',
        ])
        expect(injection.mutationKey).toEqual([
            'alpha',
            'companyFund',
            'capitalInjection',
        ])
        expect(withdrawal.mutationKey).toEqual([
            'alpha',
            'companyFund',
            'capitalWithdrawal',
        ])
        expect(mocks.invalidateQueries).toHaveBeenCalledTimes(3)
        expect(mocks.invalidateQueries).toHaveBeenCalledWith({
            queryKey: [
                'alpha',
                'companyFund',
            ],
        })
    })
})
