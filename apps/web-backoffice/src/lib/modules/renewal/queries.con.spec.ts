import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
    createRenewal: vi.fn(async () => ({ publicId: 'renewal-id' })),
    fetchRenewals: vi.fn(async () => ({
        count: 0,
        data: [],
        limit: 25,
        offset: 0,
    })),
    invalidateQueries: vi.fn(async () => undefined),
    quoteRenewal: vi.fn(async () => ({ cashReleaseAmountMinor: 252_000 })),
}))

vi.mock('@tanstack/svelte-query', () => ({
    createMutation: (factory: () => unknown) => factory(),
    createQuery: (factory: () => unknown) => factory(),
    useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }),
}))

vi.mock('./api', () => mocks)

import { createRenewalCreateMutation, createRenewalListQuery } from './queries'

describe('Renewal query utilities', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('scopes a renewal history query to its tenant and applied status', async () => {
        const query = createRenewalListQuery(
            { organizationSlug: 'alpha' },
            {
                request: {
                    filters: { status: 'RELEASED' },
                    limit: 25,
                    offset: 0,
                    sortOrder: 'desc',
                },
            },
        ) as unknown as {
            queryFn: () => Promise<unknown>
            queryKey: readonly unknown[]
        }

        await expect(query.queryFn()).resolves.toEqual({
            count: 0,
            data: [],
            limit: 25,
            offset: 0,
        })
        expect(query.queryKey).toEqual([
            'alpha',
            'renewal',
            'readMany',
            {
                filters: { status: 'RELEASED' },
                limit: 25,
                offset: 0,
                sortOrder: 'desc',
            },
        ])
    })

    it('invalidates renewal, loan, collection, and borrower data after confirmation', async () => {
        const create = createRenewalCreateMutation({
            organizationSlug: 'alpha',
        }) as unknown as {
            mutationFn: (value: unknown) => Promise<unknown>
            onSuccess: () => Promise<void>
        }

        await create.mutationFn({ renewalPrincipalMinor: 700_000 })
        await create.onSuccess()

        expect(mocks.createRenewal).toHaveBeenCalledWith({
            renewalPrincipalMinor: 700_000,
        })
        for (const family of [
            'renewal',
            'loan',
            'collection',
            'borrower',
        ]) {
            expect(mocks.invalidateQueries).toHaveBeenCalledWith({
                queryKey: [
                    'alpha',
                    family,
                ],
            })
        }
    })
})
