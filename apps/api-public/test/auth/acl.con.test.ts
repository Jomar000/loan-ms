import { dbSchema } from '@hyperion/database/d1'
import { describe, expect, it, vi } from 'vitest'

import { aclBuilder } from '../../src/auth/acl.js'

const databaseRows = [
    {
        action: 'read',
        apiKeyAssignable: true,
        component: 'testComponent',
        role: 'testRole',
    },
]

function createDatabase(rows = databaseRows) {
    const innerJoin = vi.fn().mockResolvedValue(rows)
    const from = vi.fn(() => ({ innerJoin }))
    const select = vi.fn(() => ({ from }))

    return {
        client: { select } as unknown as Parameters<typeof aclBuilder>[0],
        select,
    }
}

function createKv(storedValue: string | null) {
    const get = vi.fn().mockResolvedValue(storedValue)
    const put = vi.fn().mockResolvedValue(undefined)
    const deleteValue = vi.fn().mockResolvedValue(undefined)

    return {
        client: {
            get,
            put,
            delete: deleteValue,
        } as unknown as KVNamespace,
        deleteValue,
        get,
        put,
    }
}

describe.concurrent('ACL cache', () => {
    it('uses a structurally valid versioned cache entry.', async () => {
        const cachedAcl = {
            apiKeyAssignablePermissions: { testComponent: ['read'] },
            permissions: { testComponent: ['read'] },
            roles: { testRole: { testComponent: ['read'] } },
        }
        const database = createDatabase()
        const kv = createKv(JSON.stringify(cachedAcl))

        await expect(
            aclBuilder(database.client, dbSchema, kv.client),
        ).resolves.toEqual(cachedAcl)
        expect(database.select).not.toHaveBeenCalled()
        expect(kv.put).not.toHaveBeenCalled()
        expect(kv.deleteValue).not.toHaveBeenCalled()
    })

    it.each([
        [
            'missing',
            null,
        ],
        [
            'expired',
            null,
        ],
    ])('rebuilds a %s cache entry.', async (_state, storedValue) => {
        const database = createDatabase()
        const kv = createKv(storedValue)

        const acl = await aclBuilder(database.client, dbSchema, kv.client)

        expect(acl.roles.testRole?.testComponent).toEqual(['read'])
        expect(database.select).toHaveBeenCalledOnce()
        expect(kv.put).toHaveBeenCalledWith(
            'api-public:cache:acl:v20260825',
            expect.any(String),
            { expirationTtl: 300 },
        )
    })

    it.each([
        [
            'malformed JSON',
            '{invalid',
        ],
        [
            'array-shaped permissions',
            JSON.stringify({ permissions: [], roles: {} }),
        ],
        [
            'array-shaped roles',
            JSON.stringify({ permissions: {}, roles: [] }),
        ],
        [
            'empty component',
            JSON.stringify({
                permissions: { '': ['read'] },
                roles: {},
            }),
        ],
        [
            'empty action',
            JSON.stringify({
                permissions: { testComponent: [''] },
                roles: {},
            }),
        ],
        [
            'empty role',
            JSON.stringify({
                permissions: {},
                roles: { '': { testComponent: ['read'] } },
            }),
        ],
    ])(
        'deletes and rebuilds a %s cache entry.',
        async (_state, storedValue) => {
            const database = createDatabase()
            const kv = createKv(storedValue)

            const acl = await aclBuilder(database.client, dbSchema, kv.client)

            expect(acl.roles.testRole?.testComponent).toEqual(['read'])
            expect(kv.deleteValue).toHaveBeenCalledWith(
                'api-public:cache:acl:v20260825',
            )
            expect(database.select).toHaveBeenCalledOnce()
            expect(kv.put).toHaveBeenCalledOnce()
        },
    )

    it('collapses concurrent initialization for one KV binding.', async () => {
        const database = createDatabase()
        const kv = createKv(null)

        const [
            first,
            second,
        ] = await Promise.all([
            aclBuilder(database.client, dbSchema, kv.client),
            aclBuilder(database.client, dbSchema, kv.client),
        ])

        expect(first).toEqual(second)
        expect(database.select).toHaveBeenCalledOnce()
        expect(kv.put).toHaveBeenCalledOnce()
    })

    it('rejects conflicting API-key assignability for one permission tuple.', async () => {
        const database = createDatabase([
            ...databaseRows,
            { ...databaseRows[0]!, apiKeyAssignable: false },
        ])
        const kv = createKv(null)

        await expect(
            aclBuilder(database.client, dbSchema, kv.client),
        ).rejects.toMatchObject({
            cause: {
                message:
                    'Conflicting API-key assignability for testComponent:read.',
            },
            code: 'AUTHENTICATION_UNAVAILABLE',
            message: 'Authentication is temporarily unavailable.',
            status: 503,
        })
        expect(kv.put).not.toHaveBeenCalled()
    })
})

// =============================================================================
// END OF BASE TEMPLATE TESTS - FORK-SPECIFIC TESTS MUST BE ADDED BELOW
// =============================================================================
