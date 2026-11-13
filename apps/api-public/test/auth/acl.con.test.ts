import { dbSchema } from '@loanms/database/d1'
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

    it('keeps concurrent initialization on each invocation database client.', async () => {
        const database = createDatabase()
        const otherDatabase = createDatabase()
        const kv = createKv(null)

        const [
            first,
            second,
        ] = await Promise.all([
            aclBuilder(otherDatabase.client, dbSchema, kv.client),
            aclBuilder(database.client, dbSchema, kv.client),
        ])

        expect(first).toEqual(second)
        expect(database.select).toHaveBeenCalledOnce()
        expect(otherDatabase.select).toHaveBeenCalledOnce()
    })

    it.each([
        'read',
        'write',
        'delete',
    ] as const)(
        'uses authoritative database grants when the cache %s fails.',
        async (operation) => {
            const database = createDatabase()
            const kv = createKv(operation === 'delete' ? '{invalid' : null)
            const failure = new Error('Injected cache outage.')
            if (operation === 'read') kv.get.mockRejectedValue(failure)
            if (operation === 'write') kv.put.mockRejectedValue(failure)
            if (operation === 'delete')
                kv.deleteValue.mockRejectedValue(failure)

            const acl = await aclBuilder(database.client, dbSchema, kv.client)

            expect(acl.roles.testRole?.testComponent).toEqual(['read'])
            expect(database.select).toHaveBeenCalledOnce()
            // Completed grants stay cached even if persistence is unavailable.
            await expect(
                aclBuilder(database.client, dbSchema, kv.client),
            ).resolves.toEqual(acl)
            expect(database.select).toHaveBeenCalledOnce()
        },
    )

    it('still rejects an unavailable authoritative database.', async () => {
        const database = createDatabase()
        database.select.mockImplementationOnce(() => {
            throw new Error('Injected database outage.')
        })
        const kv = createKv(null)
        await expect(
            aclBuilder(database.client, dbSchema, kv.client),
        ).rejects.toThrow('Injected database outage.')
        expect(kv.put).not.toHaveBeenCalled()
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
