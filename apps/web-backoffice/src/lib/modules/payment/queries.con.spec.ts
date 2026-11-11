import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
    createPayment: vi.fn(async () => ({ publicId: 'payment-id' })),
    fetchCollectionsForDate: vi.fn(async () => []),
    fetchCollectionsForBorrower: vi.fn(async () => []),
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
    createCollectionsBorrowerQuery,
    createPaymentCreateMutation,
    createPaymentListQuery,
    createPaymentReverseMutation,
} from './queries'

describe('Payment query utilities', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('scopes covered-date schedules to the active tenant and borrower', async () => {
        const query = createCollectionsBorrowerQuery(
            { organizationSlug: 'alpha' },
            { borrowerPublicId: 'borrower-id' },
        ) as unknown as {
            enabled: boolean
            queryFn: () => Promise<unknown>
            queryKey: readonly unknown[]
        }
        expect(query.enabled).toBe(true)
        expect(query.queryKey).toEqual([
            'alpha',
            'collection',
            'borrower',
            'borrower-id',
        ])
        await query.queryFn()
        expect(mocks.fetchCollectionsForBorrower).toHaveBeenCalledWith(
            'borrower-id',
        )
        const disabled = createCollectionsBorrowerQuery(
            { organizationSlug: '' },
            { borrowerPublicId: 'borrower-id' },
        ) as unknown as { enabled: boolean }
        expect(disabled.enabled).toBe(false)
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

    it.each([
        createPaymentCreateMutation,
        createPaymentReverseMutation,
    ])(
        'refreshes each affected tenant cache once after posting or reversing',
        async (factory) => {
            const create = factory({
                organizationSlug: 'alpha',
            }) as unknown as {
                mutationFn: (value: unknown) => Promise<unknown>
                onSuccess: () => Promise<void>
            }

            await create.mutationFn({ amountReceivedMinor: 14_000 })
            await create.onSuccess()

            expect(
                factory === createPaymentCreateMutation
                    ? mocks.createPayment
                    : mocks.reversePayment,
            ).toHaveBeenCalledWith({ amountReceivedMinor: 14_000 })
            const families = [
                'borrower',
                'collection',
                'companyFund',
                'loan',
                'overdue',
                'payment',
                'report',
            ]
            expect(mocks.invalidateQueries).toHaveBeenCalledTimes(
                families.length,
            )
            for (const family of families) {
                expect(mocks.invalidateQueries).toHaveBeenCalledWith({
                    queryKey: [
                        'alpha',
                        family,
                    ],
                })
            }
        },
    )
})
