import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
    approveLoan: vi.fn(async () => undefined),
    createLoan: vi.fn(async () => ({ publicId: 'loan-id' })),
    createLoanProduct: vi.fn(async () => ({ publicId: 'product-id' })),
    fetchLoan: vi.fn(async () => ({ publicId: 'loan-id' })),
    fetchLoanProducts: vi.fn(async () => []),
    fetchLoans: vi.fn(async () => ({
        count: 0,
        data: [],
        limit: 25,
        offset: 0,
    })),
    invalidateQueries: vi.fn(async () => undefined),
    quoteLoan: vi.fn(async () => ({ totalPayableMinor: 840_000 })),
    releaseLoan: vi.fn(async () => undefined),
}))

vi.mock('@tanstack/svelte-query', () => ({
    createMutation: (factory: () => unknown) => factory(),
    createQuery: (factory: () => unknown) => factory(),
    useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }),
}))

vi.mock('./api', () => mocks)

import {
    createLoanCreateMutation,
    createLoanDetailQuery,
    createLoanListQuery,
    createLoanProductsQuery,
} from './queries'

describe('Loan query utilities', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('uses organization-scoped keys for product, list, and detail reads', async () => {
        const scope = { organizationSlug: 'alpha' }
        const product = createLoanProductsQuery(scope) as unknown as {
            queryFn: () => Promise<unknown>
            queryKey: readonly unknown[]
        }
        const list = createLoanListQuery(scope, {
            request: {
                filters: { status: 'PENDING_APPROVAL' },
                limit: 25,
                offset: 50,
                sortOrder: 'desc',
            },
        }) as unknown as { queryKey: readonly unknown[] }
        const detail = createLoanDetailQuery(scope, {
            publicId: 'loan-id',
        }) as unknown as { queryKey: readonly unknown[] }

        await expect(product.queryFn()).resolves.toEqual([])
        expect(product.queryKey).toEqual([
            'alpha',
            'loanProduct',
            'readMany',
        ])
        expect(list.queryKey).toEqual([
            'alpha',
            'loan',
            'readMany',
            {
                filters: { status: 'PENDING_APPROVAL' },
                limit: 25,
                offset: 50,
                sortOrder: 'desc',
            },
        ])
        expect(detail.queryKey).toEqual([
            'alpha',
            'loan',
            'read',
            'loan-id',
        ])
    })

    it('invalidates the tenant loan hierarchy after an accepted create', async () => {
        const create = createLoanCreateMutation({
            organizationSlug: 'alpha',
        }) as unknown as {
            mutationFn: (value: unknown) => Promise<unknown>
            onSuccess: () => Promise<void>
        }

        await create.mutationFn({ principalMinor: 700_000 })
        await create.onSuccess()

        expect(mocks.createLoan).toHaveBeenCalledWith({
            principalMinor: 700_000,
        })
        expect(mocks.invalidateQueries).toHaveBeenCalledWith({
            queryKey: [
                'alpha',
                'loan',
            ],
        })
    })
})
