import { dbSchema } from '@hyperion/database/d1'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { aclBuilder } from '../../src/auth/acl.js'

const cachedAcl = {
    apiKeyAssignablePermissions: { testComponent: ['read'] },
    permissions: { testComponent: ['read'] },
    roles: { testRole: { testComponent: ['read'] } },
}

describe('ACL memory-cache expiry', () => {
    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('does not renew the fixed expiry while serving memory-cache hits.', async () => {
        const now = vi.spyOn(Date, 'now').mockReturnValue(1_000)
        const get = vi.fn().mockResolvedValue(JSON.stringify(cachedAcl))
        const kv = {
            delete: vi.fn(),
            get,
            put: vi.fn(),
        } as unknown as KVNamespace
        const db = {
            select: vi.fn(),
        } as unknown as Parameters<typeof aclBuilder>[0]

        await expect(aclBuilder(db, dbSchema, kv)).resolves.toEqual(cachedAcl)

        now.mockReturnValue(30_999)
        await expect(aclBuilder(db, dbSchema, kv)).resolves.toEqual(cachedAcl)

        now.mockReturnValue(31_001)
        await expect(aclBuilder(db, dbSchema, kv)).resolves.toEqual(cachedAcl)

        expect(get).toHaveBeenCalledTimes(2)
    })
})

// =============================================================================
// END OF BASE TEMPLATE TESTS - FORK-SPECIFIC TESTS MUST BE ADDED BELOW
// =============================================================================
