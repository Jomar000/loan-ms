import { defaultKeyHasher } from '@better-auth/api-key'
import { dbClient, dbSchema } from '@loanms/database/d1'
import { env } from 'cloudflare:workers'
import { eq, like } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import app from '../../../src/core/index.js'
import { TEST_PRIMARY_ORGANIZATION_ID } from '../../utilities.js'

const TEST_ID_PREFIX = '__TEST-API-KEY-V1-BACKOFFICE-'
const TEST_CLIENT_IP = '198.51.100.92'
const rawKeys = {
    disabled: `bof_${'D'.repeat(64)}`,
    expired: `bof_${'E'.repeat(64)}`,
    live: `bof_${'L'.repeat(64)}`,
    revoked: `bof_${'R'.repeat(64)}`,
    wrongConfiguration: `bof_${'W'.repeat(64)}`,
}

let db: ReturnType<typeof dbClient>

const requestWithApiKey = (key: string) =>
    app.request(
        '/api/v1/unknown',
        {
            headers: {
                'cf-connecting-ip': TEST_CLIENT_IP,
                'x-api-key': key,
            },
        },
        env,
    )

const readLastRequest = async (id: string) =>
    (
        await db
            .select({ lastRequest: dbSchema.apikey.lastRequest })
            .from(dbSchema.apikey)
            .where(eq(dbSchema.apikey.id, id))
            .limit(1)
    )[0]?.lastRequest ?? null

async function clearTestApiKeys() {
    await db
        .delete(dbSchema.apikey)
        .where(like(dbSchema.apikey.id, `${TEST_ID_PREFIX}%`))
    await db
        .delete(dbSchema.servicePrincipal)
        .where(like(dbSchema.servicePrincipal.name, `${TEST_ID_PREFIX}%`))
}

beforeAll(async () => {
    db = dbClient(env.LOANMSBOFC_D1)
    await clearTestApiKeys()
    const [
        principal,
        wrongAudiencePrincipal,
    ] = await db
        .insert(dbSchema.servicePrincipal)
        .values([
            {
                audience: 'backoffice-v1',
                name: `${TEST_ID_PREFIX}PRINCIPAL`,
                organizationId: TEST_PRIMARY_ORGANIZATION_ID,
                permissions: { 'api.backoffice': ['access'] },
            },
            {
                audience: 'public-v1',
                name: `${TEST_ID_PREFIX}WRONG-PRINCIPAL`,
                organizationId: TEST_PRIMARY_ORGANIZATION_ID,
                permissions: { 'api.public': ['access'] },
            },
        ])
        .returning({
            audience: dbSchema.servicePrincipal.audience,
            id: dbSchema.servicePrincipal.id,
        })
    await db.insert(dbSchema.apikey).values(
        await Promise.all(
            [
                {
                    configId: 'backoffice-v1' as const,
                    enabled: true,
                    id: `${TEST_ID_PREFIX}LIVE`,
                    key: rawKeys.live,
                    name: `${TEST_ID_PREFIX}LIVE`,
                },
                {
                    configId: 'backoffice-v1' as const,
                    enabled: false,
                    id: `${TEST_ID_PREFIX}DISABLED`,
                    key: rawKeys.disabled,
                    name: `${TEST_ID_PREFIX}DISABLED`,
                },
                {
                    configId: 'backoffice-v1' as const,
                    enabled: true,
                    expiresAt: new Date(Date.now() - 60_000),
                    id: `${TEST_ID_PREFIX}EXPIRED`,
                    key: rawKeys.expired,
                    name: `${TEST_ID_PREFIX}EXPIRED`,
                },
                {
                    configId: 'public-v1' as const,
                    enabled: true,
                    id: `${TEST_ID_PREFIX}WRONG-CONFIGURATION`,
                    key: rawKeys.wrongConfiguration,
                    name: `${TEST_ID_PREFIX}WRONG-CONFIGURATION`,
                },
                {
                    configId: 'backoffice-v1' as const,
                    enabled: true,
                    id: `${TEST_ID_PREFIX}REVOKED`,
                    key: rawKeys.revoked,
                    name: `${TEST_ID_PREFIX}REVOKED`,
                },
            ].map(async (row) => ({
                ...row,
                key: await defaultKeyHasher(row.key),
                referenceId: TEST_PRIMARY_ORGANIZATION_ID,
                servicePrincipalId:
                    row.configId === 'backoffice-v1'
                        ? principal!.id
                        : wrongAudiencePrincipal!.id,
            })),
        ),
    )
    await db
        .delete(dbSchema.apikey)
        .where(eq(dbSchema.apikey.id, `${TEST_ID_PREFIX}REVOKED`))
})

afterAll(async () => {
    try {
        await clearTestApiKeys()
    } finally {
        // D1 clients do not require teardown.
    }
})

describe('Backoffice v1 API-key state', () => {
    it('passes a live audience key through every guard to the empty router.', async () => {
        const response = await requestWithApiKey(rawKeys.live)

        expect(response.status).toBe(404)
        await expect(
            readLastRequest(`${TEST_ID_PREFIX}LIVE`),
        ).resolves.toBeInstanceOf(Date)
    })

    it.each([
        [
            'expired',
            rawKeys.expired,
            `${TEST_ID_PREFIX}EXPIRED`,
        ],
        [
            'disabled',
            rawKeys.disabled,
            `${TEST_ID_PREFIX}DISABLED`,
        ],
        [
            'wrong-configuration',
            rawKeys.wrongConfiguration,
            `${TEST_ID_PREFIX}WRONG-CONFIGURATION`,
        ],
        [
            'revoked',
            rawKeys.revoked,
            `${TEST_ID_PREFIX}REVOKED`,
        ],
    ])('rejects a %s key uniformly.', async (_state, key, id) => {
        const response = await requestWithApiKey(key)

        expect(response.status).toBe(401)
        await expect(response.json()).resolves.toMatchObject({
            error: { code: 'UNAUTHORIZED', message: 'Invalid API key.' },
            success: false,
        })
        await expect(readLastRequest(id)).resolves.toBeNull()
    })
})

// =============================================================================
// END OF BASE TEMPLATE TESTS - FORK-SPECIFIC TESTS MUST BE ADDED BELOW
// =============================================================================
