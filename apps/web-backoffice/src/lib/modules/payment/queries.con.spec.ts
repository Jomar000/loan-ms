import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
    createPayment: vi.fn(async () => ({ publicId: 'payment-id' })),
    fetchCollectionsForDate: vi.fn(async () => []),
    fetchPayments: vi.fn(async () => ({
        count: 0,
        data: [],
        limit: 100,
        offset: 0,
    })),
    invalidateQueries: vi.fn(async () => undefined),
    quotePayment: vi.fn(async () => ({ amountAllocatedMinor: 14_000 })),
    reversePayment: vi.fn(async () => ({ publicId: 'payment-id' })),
}))

vi.mock('@tanstack/svelte-query', () => ({
    createMutation: (factory: () => unknown) => factory(),
    createQuery: (factory: () => unknown) => factory(),
    useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }),
}))

vi.mock('./api', () => mocks)

import {
    createCollectionsDateQuery,
    createPaymentCreateMutation,
    createPaymentListQuery,
} from './queries'

describe('Payment query utilities', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('scopes payment history and a dated collection schedule to the active organization', async () => {
        const scope = { organizationSlug: 'alpha' }
        const payments = createPaymentListQuery(scope, {
            request: {
                filters: { borrowerPublicId: 'borrower-id' },
                limit: 100,
                offset: 0,
                sortOrder: 'desc',
            },
        }) as unknown as {
            queryFn: () => Promise<unknown>
            queryKey: readonly unknown[]
        }
        const collections = createCollectionsDateQuery(scope, {
            date: '2026-10-03',
        }) as unknown as {
            queryFn: () => Promise<unknown>
            queryKey: readonly unknown[]
        }

        await expect(payments.queryFn()).resolves.toEqual({
            count: 0,
            data: [],
            limit: 100,
            offset: 0,
        })
        await expect(collections.queryFn()).resolves.toEqual([])
        expect(payments.queryKey).toEqual([
            'alpha',
            'payment',
            'readMany',
            {
                filters: { borrowerPublicId: 'borrower-id' },
                limit: 100,
                offset: 0,
                sortOrder: 'desc',
            },
        ])
        expect(collections.queryKey).toEqual([
            'alpha',
            'collection',
            'date',
            '2026-10-03',
        ])
    })

    it('invalidates the related payment, collection, borrower, and loan families after posting', async () => {
        const create = createPaymentCreateMutation({
            organizationSlug: 'alpha',
        }) as unknown as {
            mutationFn: (value: unknown) => Promise<unknown>
            onSuccess: () => Promise<void>
        }

        await create.mutationFn({ amountReceivedMinor: 14_000 })
        await create.onSuccess()

        expect(mocks.createPayment).toHaveBeenCalledWith({
            amountReceivedMinor: 14_000,
        })
        expect(mocks.invalidateQueries).toHaveBeenCalledWith({
            queryKey: [
                'alpha',
                'payment',
            ],
        })
        expect(mocks.invalidateQueries).toHaveBeenCalledWith({
            queryKey: [
                'alpha',
                'collection',
            ],
        })
        expect(mocks.invalidateQueries).toHaveBeenCalledWith({
            queryKey: [
                'alpha',
                'loan',
            ],
        })
        expect(mocks.invalidateQueries).toHaveBeenCalledWith({
            queryKey: [
                'alpha',
                'borrower',
            ],
        })
    })
})
