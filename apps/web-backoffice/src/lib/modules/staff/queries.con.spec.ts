import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
    fetchStaff: vi.fn(async () => ({
        count: 1,
        data: [],
        limit: 25,
        offset: 0,
        success: true as const,
    })),
    invalidateQueries: vi.fn(async () => undefined),
    updateStaffAccess: vi.fn(async () => ({ userPublicId: 'staff-id' })),
    updateStaffRole: vi.fn(async () => ({ userPublicId: 'staff-id' })),
}))

vi.mock('@tanstack/svelte-query', () => ({
    createMutation: (factory: () => unknown) => factory(),
    createQuery: (factory: () => unknown) => factory(),
    useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }),
}))

vi.mock('./api', () => mocks)

import {
    createStaffAccessMutation,
    createStaffQuery,
    createStaffRoleMutation,
} from './queries'

describe('Staff query utilities', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('uses a tenant-scoped key for the paginated staff list', async () => {
        const query = createStaffQuery(
            { organizationSlug: 'alpha' },
            { request: { limit: 25, offset: 50 } },
        ) as unknown as {
            queryFn: () => Promise<unknown>
            queryKey: readonly unknown[]
        }

        await expect(query.queryFn()).resolves.toEqual({
            count: 1,
            data: [],
            limit: 25,
            offset: 0,
            success: true,
        })
        expect(query.queryKey).toEqual([
            'alpha',
            'staff',
            'readMany',
            { limit: 25, offset: 50 },
        ])
    })

    it('invalidates only the active tenant staff hierarchy after mutations', async () => {
        const scope = { organizationSlug: 'alpha' }
        const access = createStaffAccessMutation(scope) as unknown as {
            mutationFn: (input: {
                isLocked: boolean
                userPublicId: string
            }) => Promise<unknown>
            onSuccess: () => Promise<void>
        }
        const role = createStaffRoleMutation(scope) as unknown as {
            mutationFn: (input: {
                role: 'admin'
                userPublicId: string
            }) => Promise<unknown>
            onSuccess: () => Promise<void>
        }

        await access.mutationFn({ isLocked: true, userPublicId: 'staff-id' })
        await role.mutationFn({ role: 'admin', userPublicId: 'staff-id' })
        await access.onSuccess()
        await role.onSuccess()

        expect(mocks.updateStaffAccess).toHaveBeenCalledWith({
            isLocked: true,
            userPublicId: 'staff-id',
        })
        expect(mocks.updateStaffRole).toHaveBeenCalledWith({
            role: 'admin',
            userPublicId: 'staff-id',
        })
        expect(mocks.invalidateQueries).toHaveBeenCalledWith({
            queryKey: [
                'alpha',
                'staff',
            ],
        })
    })
})
