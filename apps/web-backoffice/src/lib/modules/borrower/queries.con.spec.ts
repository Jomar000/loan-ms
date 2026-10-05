import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
    archiveBorrower: vi.fn(async () => undefined),
    createBorrower: vi.fn(async () => ({
        borrower: { publicId: '019936e2-b837-7000-8000-000000000001' },
        duplicateCandidates: [],
    })),
    fetchBorrower: vi.fn(async () => ({ publicId: 'borrower-id' })),
    fetchBorrowerDocuments: vi.fn(async () => []),
    fetchBorrowerPaymentTag: vi.fn(async () => ({ currentTag: 'GOOD_PAYER' })),
    fetchBorrowers: vi.fn(async () => ({
        count: 0,
        data: [],
        limit: 25,
        offset: 0,
    })),
    invalidateQueries: vi.fn(async () => undefined),
    overrideBorrowerPaymentTag: vi.fn(async () => ({
        publicId: 'borrower-id',
    })),
    resetBorrowerPaymentTag: vi.fn(async () => ({ publicId: 'borrower-id' })),
    updateBorrower: vi.fn(async () => ({ publicId: 'borrower-id' })),
}))

vi.mock('@tanstack/svelte-query', () => ({
    createMutation: (factory: () => unknown) => factory(),
    createQuery: (factory: () => unknown) => factory(),
    useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }),
}))

vi.mock('./api', () => ({
    archiveBorrower: mocks.archiveBorrower,
    createBorrower: mocks.createBorrower,
    fetchBorrower: mocks.fetchBorrower,
    fetchBorrowerDocuments: mocks.fetchBorrowerDocuments,
    fetchBorrowerPaymentTag: mocks.fetchBorrowerPaymentTag,
    fetchBorrowers: mocks.fetchBorrowers,
    overrideBorrowerPaymentTag: mocks.overrideBorrowerPaymentTag,
    resetBorrowerPaymentTag: mocks.resetBorrowerPaymentTag,
    updateBorrower: mocks.updateBorrower,
}))

import {
    createBorrowerArchiveMutation,
    createBorrowerDetailQuery,
    createBorrowerDocumentsQuery,
    createBorrowerListQuery,
    createBorrowerPaymentTagOverrideMutation,
    createBorrowerPaymentTagQuery,
    createBorrowerPaymentTagResetMutation,
} from './queries'

describe('Borrower query utilities', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('uses tenant-scoped query keys for every borrower read family', async () => {
        const scope = { organizationSlug: 'alpha' }
        const list = createBorrowerListQuery(scope, {
            request: {
                filters: { paymentTag: 'GOOD_PAYER', search: 'Maria' },
                limit: 25,
                offset: 50,
                sortOrder: 'asc',
            },
        }) as unknown as {
            queryFn: () => Promise<unknown>
            queryKey: readonly unknown[]
        }
        const detail = createBorrowerDetailQuery(scope, {
            publicId: 'borrower-id',
        }) as unknown as { queryKey: readonly unknown[] }
        const documents = createBorrowerDocumentsQuery(scope, {
            publicId: 'borrower-id',
        }) as unknown as { queryKey: readonly unknown[] }
        const tag = createBorrowerPaymentTagQuery(scope, {
            publicId: 'borrower-id',
        }) as unknown as { queryKey: readonly unknown[] }

        await expect(list.queryFn()).resolves.toEqual({
            count: 0,
            data: [],
            limit: 25,
            offset: 0,
        })
        expect(list.queryKey).toEqual([
            'alpha',
            'borrower',
            'readMany',
            {
                filters: { paymentTag: 'GOOD_PAYER', search: 'Maria' },
                limit: 25,
                offset: 50,
                sortOrder: 'asc',
            },
        ])
        expect(detail.queryKey).toEqual([
            'alpha',
            'borrower',
            'read',
            'borrower-id',
        ])
        expect(documents.queryKey).toEqual([
            'alpha',
            'borrower',
            'borrower-id',
            'document',
            'readMany',
        ])
        expect(tag.queryKey).toEqual([
            'alpha',
            'borrower',
            'borrower-id',
            'paymentTag',
            'read',
        ])
    })

    it('invalidates the tenant borrower hierarchy after archive and tag changes', async () => {
        const scope = { organizationSlug: 'alpha' }
        const archive = createBorrowerArchiveMutation(scope) as unknown as {
            mutationFn: (publicId: string) => Promise<void>
            onSuccess: () => Promise<void>
        }
        const override = createBorrowerPaymentTagOverrideMutation(
            scope,
        ) as unknown as {
            mutationFn: (input: {
                paymentTag: 'BAD_PAYER'
                publicId: string
                reason: string
            }) => Promise<unknown>
            onSuccess: () => Promise<void>
        }
        const reset = createBorrowerPaymentTagResetMutation(
            scope,
        ) as unknown as {
            mutationFn: (publicId: string) => Promise<unknown>
            onSuccess: () => Promise<void>
        }

        await archive.mutationFn('borrower-id')
        await override.mutationFn({
            paymentTag: 'BAD_PAYER',
            publicId: 'borrower-id',
            reason: 'Verified payment history correction.',
        })
        await reset.mutationFn('borrower-id')
        await archive.onSuccess()
        await override.onSuccess()
        await reset.onSuccess()

        expect(mocks.archiveBorrower).toHaveBeenCalledWith('borrower-id')
        expect(mocks.overrideBorrowerPaymentTag).toHaveBeenCalledWith({
            paymentTag: 'BAD_PAYER',
            publicId: 'borrower-id',
            reason: 'Verified payment history correction.',
        })
        expect(mocks.resetBorrowerPaymentTag).toHaveBeenCalledWith(
            'borrower-id',
        )
        expect(mocks.invalidateQueries).toHaveBeenCalledWith({
            queryKey: [
                'alpha',
                'borrower',
            ],
        })
    })
})
