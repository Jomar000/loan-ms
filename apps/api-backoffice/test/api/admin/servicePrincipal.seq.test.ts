import { dbClient, dbSchema } from '@loanms/database/d1'
import { env } from 'cloudflare:workers'
import { and, count, eq, isNull, like, sql } from 'drizzle-orm'
import { v7 as uuidv7 } from 'uuid'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import app from '../../../src/core/index.js'
import {
    postTestingRequest,
    queryTestingRequest,
    seedTestingCookies,
    TEST_ISOLATED_ORGANIZATION_ID,
    TEST_PRIMARY_ORGANIZATION_ID,
} from '../../utilities.js'

const TEST_NAME_PREFIX = '__TEST-SERVICE-PRINCIPAL-'

type TPrincipalData = {
    activeCredentialCount: number
    audience: 'public-v1' | 'backoffice-v1'
    enabled: boolean
    name: string
    publicId: string
}

type TCredentialData = {
    expiresAt: string | null
    id: string
    name: string
} & ({ key: string; outcome: 'issued' } | { outcome: 'alreadyIssued' })

type TCreatePrincipalResponse = {
    data: TPrincipalData
    success: true
}

type TCreateCredentialResponse = {
    data: TCredentialData
    success: true
}

type TPrincipalListResponse = {
    count: number
    data: TPrincipalData[]
    success: true
}

let db: ReturnType<typeof dbClient>
let ownerCookie: string
let memberCookie: string
let adminCookie: string

async function clearTestRecords() {
    await db
        .delete(dbSchema.apikey)
        .where(like(dbSchema.apikey.name, `${TEST_NAME_PREFIX}%`))
    await db
        .delete(dbSchema.servicePrincipal)
        .where(like(dbSchema.servicePrincipal.name, `${TEST_NAME_PREFIX}%`))
}

async function createPrincipal(
    cookie: string,
    audience: 'public-v1' | 'backoffice-v1',
    suffix: string,
    idempotencyKey = uuidv7(),
) {
    const response = await postTestingRequest(
        '/api/admin/servicePrincipal/create',
        {
            cookie,
            body: {
                audience,
                description: 'Automated integration test',
                idempotencyKey,
                name: `${TEST_NAME_PREFIX}${suffix}`,
                permissions:
                    audience === 'public-v1'
                        ? { 'api.public': ['access'] }
                        : { 'api.backoffice': ['access'] },
            },
        },
    )
    return {
        response,
        json: await response.json<TCreatePrincipalResponse>(),
    }
}

async function credentialFingerprint(input: {
    expiryDays: number | null
    name: string
}) {
    const digest = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(
            JSON.stringify([
                input.name,
                input.expiryDays,
            ]),
        ),
    )
    return Array.from(new Uint8Array(digest), (byte) =>
        byte.toString(16).padStart(2, '0'),
    ).join('')
}

beforeAll(async () => {
    db = dbClient(env.LOANMSBOFC_D1)
    ;[
        ownerCookie,
        memberCookie,
        adminCookie,
    ] = await seedTestingCookies()
    await clearTestRecords()
})

afterAll(async () => {
    try {
        await clearTestRecords()
    } finally {
        // D1 clients do not require teardown.
    }
})

describe('Service principal management', () => {
    it('separates principal lifecycle from immutable Better Auth credentials.', async () => {
        const { response: principalResponse, json: principalJson } =
            await createPrincipal(ownerCookie, 'backoffice-v1', 'LIFECYCLE')
        expect(principalResponse.status).toBe(201)
        expect(principalJson.data).toMatchObject({
            activeCredentialCount: 0,
            audience: 'backoffice-v1',
            enabled: true,
            name: `${TEST_NAME_PREFIX}LIFECYCLE`,
        })
        expect(principalJson.data).not.toHaveProperty('id')
        expect(principalJson.data).not.toHaveProperty('organizationId')

        const credentialResponse = await postTestingRequest(
            '/api/admin/servicePrincipal/credential/create',
            {
                cookie: ownerCookie,
                body: {
                    idempotencyKey: uuidv7(),
                    name: `${TEST_NAME_PREFIX}LIFECYCLE-CREDENTIAL`,
                    principalPublicId: principalJson.data.publicId,
                },
            },
        )
        const credentialJson =
            await credentialResponse.json<TCreateCredentialResponse>()

        expect(credentialResponse.status).toBe(201)
        expect(credentialResponse.headers.get('cache-control')).toBe('no-store')
        if (credentialJson.data.outcome !== 'issued') {
            throw new Error('Expected a newly issued credential.')
        }
        expect(credentialJson.data.key).toMatch(/^bof_[A-Za-z]{64}$/)
        expect(credentialJson.data.expiresAt).not.toBeNull()
        const defaultExpiryDays =
            (new Date(credentialJson.data.expiresAt!).getTime() - Date.now()) /
            86_400_000
        expect(defaultExpiryDays).toBeGreaterThan(89)
        expect(defaultExpiryDays).toBeLessThanOrEqual(90)

        const [storedCredential] = await db
            .select({
                key: dbSchema.apikey.key,
                servicePrincipalId: dbSchema.apikey.servicePrincipalId,
            })
            .from(dbSchema.apikey)
            .where(eq(dbSchema.apikey.id, credentialJson.data.id))
        expect(storedCredential?.key).not.toBe(credentialJson.data.key)
        expect(storedCredential?.key).not.toContain(credentialJson.data.key)
        expect(storedCredential?.servicePrincipalId).not.toBeNull()

        const listedCredentials = await queryTestingRequest(
            '/api/admin/servicePrincipal/credential/readMany',
            {
                filters: {
                    principalPublicId: principalJson.data.publicId,
                },
                limit: 10,
                offset: 0,
                sortOrder: 'desc',
            },
            { cookie: ownerCookie },
        )
        const listedCredentialJson = await listedCredentials.json<{
            data: Record<string, unknown>[]
            success: true
        }>()
        expect(listedCredentials.status).toBe(200)
        expect(listedCredentialJson.data[0]).not.toHaveProperty('key')
        expect(listedCredentialJson.data[0]).not.toHaveProperty(
            'servicePrincipalId',
        )

        const accepted = await app.request(
            '/api/v1/unknown',
            {
                headers: {
                    'cf-connecting-ip': '198.51.100.31',
                    'x-api-key': credentialJson.data.key,
                },
            },
            env,
        )
        expect(accepted.status).toBe(404)

        const disabled = await postTestingRequest(
            '/api/admin/servicePrincipal/disable',
            {
                cookie: ownerCookie,
                body: { publicId: principalJson.data.publicId },
            },
        )
        expect(disabled.status).toBe(200)

        const deniedWhileDisabled = await app.request(
            '/api/v1/unknown',
            {
                headers: {
                    'cf-connecting-ip': '198.51.100.32',
                    'x-api-key': credentialJson.data.key,
                },
            },
            env,
        )
        expect(deniedWhileDisabled.status).toBe(401)

        const issueWhileDisabled = await postTestingRequest(
            '/api/admin/servicePrincipal/credential/create',
            {
                cookie: ownerCookie,
                body: {
                    expiryDays: 30,
                    idempotencyKey: uuidv7(),
                    name: `${TEST_NAME_PREFIX}DISABLED-CREDENTIAL`,
                    principalPublicId: principalJson.data.publicId,
                },
            },
        )
        expect(issueWhileDisabled.status).toBe(409)

        const enabled = await postTestingRequest(
            '/api/admin/servicePrincipal/enable',
            {
                cookie: ownerCookie,
                body: {
                    confirmed: true,
                    publicId: principalJson.data.publicId,
                },
            },
        )
        expect(enabled.status).toBe(200)

        const update = await postTestingRequest(
            '/api/admin/servicePrincipal/update',
            {
                cookie: ownerCookie,
                body: {
                    description: null,
                    name: `${TEST_NAME_PREFIX}LIFECYCLE-UPDATED`,
                    permissions: { 'api.backoffice': ['access'] },
                    publicId: principalJson.data.publicId,
                },
            },
        )
        expect(update.status).toBe(200)

        const revoke = await postTestingRequest(
            '/api/admin/servicePrincipal/credential/revoke',
            {
                cookie: ownerCookie,
                body: {
                    credentialId: credentialJson.data.id,
                    principalPublicId: principalJson.data.publicId,
                },
            },
        )
        expect(revoke.status).toBe(200)

        const revoked = await app.request(
            '/api/v1/unknown',
            {
                headers: {
                    'cf-connecting-ip': '198.51.100.33',
                    'x-api-key': credentialJson.data.key,
                },
            },
            env,
        )
        expect(revoked.status).toBe(401)

        await postTestingRequest('/api/admin/servicePrincipal/disable', {
            cookie: ownerCookie,
            body: { publicId: principalJson.data.publicId },
        })
        const deleted = await postTestingRequest(
            '/api/admin/servicePrincipal/delete',
            {
                cookie: ownerCookie,
                body: { publicId: principalJson.data.publicId },
            },
        )
        expect(deleted.status).toBe(200)
    })

    it('replays matching UUIDv7 creates and rejects conflicting reuse.', async () => {
        const idempotencyKey = uuidv7()
        const [
            first,
            replay,
        ] = await Promise.all([
            createPrincipal(
                ownerCookie,
                'public-v1',
                'IDEMPOTENT',
                idempotencyKey,
            ),
            createPrincipal(
                ownerCookie,
                'public-v1',
                'IDEMPOTENT',
                idempotencyKey,
            ),
        ])
        const conflict = await createPrincipal(
            ownerCookie,
            'public-v1',
            'IDEMPOTENT-DIFFERENT',
            idempotencyKey,
        )

        expect(first.response.status).toBe(201)
        expect(replay.response.status).toBe(201)
        expect(replay.json.data.publicId).toBe(first.json.data.publicId)
        expect(conflict.response.status).toBe(409)

        const rows = await db
            .select({ id: dbSchema.servicePrincipal.id })
            .from(dbSchema.servicePrincipal)
            .where(
                and(
                    eq(
                        dbSchema.servicePrincipal.organizationId,
                        TEST_PRIMARY_ORGANIZATION_ID,
                    ),
                    eq(
                        dbSchema.servicePrincipal.idempotencyKey,
                        idempotencyKey,
                    ),
                ),
            )
        expect(rows).toHaveLength(1)

        const [auditCount] = await db
            .select({ value: count() })
            .from(dbSchema.auditTrail)
            .where(
                and(
                    eq(dbSchema.auditTrail.component, 'admin.servicePrincipal'),
                    eq(dbSchema.auditTrail.action, 'create'),
                    sqlPublicIdRecord(first.json.data.publicId),
                ),
            )
        expect(auditCount?.value).toBe(1)
    })

    it('returns safe metadata for a lost-response replay without issuing or auditing again.', async () => {
        const principal = await createPrincipal(
            ownerCookie,
            'backoffice-v1',
            'CREDENTIAL-REPLAY',
        )
        const idempotencyKey = uuidv7()
        const body = {
            expiryDays: 30,
            idempotencyKey,
            name: `${TEST_NAME_PREFIX}CREDENTIAL-REPLAY`,
            principalPublicId: principal.json.data.publicId,
        }
        const loggedEntries: string[] = []
        const logSpy = vi.spyOn(console, 'log').mockImplementation((entry) => {
            loggedEntries.push(String(entry))
        })
        const errorSpy = vi
            .spyOn(console, 'error')
            .mockImplementation((entry) => {
                loggedEntries.push(String(entry))
            })
        const { first, firstJson } = await (async () => {
            try {
                const first = await postTestingRequest(
                    '/api/admin/servicePrincipal/credential/create',
                    { cookie: ownerCookie, body },
                )
                return {
                    first,
                    firstJson: await first.json<TCreateCredentialResponse>(),
                }
            } finally {
                logSpy.mockRestore()
                errorSpy.mockRestore()
            }
        })()
        if (firstJson.data.outcome !== 'issued') {
            throw new Error('Expected the first request to issue a credential.')
        }
        const rawKey = firstJson.data.key
        expect(loggedEntries.some((entry) => entry.includes(rawKey))).toBe(
            false,
        )

        const replay = await postTestingRequest(
            '/api/admin/servicePrincipal/credential/create',
            { cookie: ownerCookie, body },
        )
        const replayJson = await replay.json<TCreateCredentialResponse>()
        const conflict = await postTestingRequest(
            '/api/admin/servicePrincipal/credential/create',
            {
                cookie: ownerCookie,
                body: { ...body, name: `${body.name}-CHANGED` },
            },
        )

        expect(first.status).toBe(201)
        expect(replay.status).toBe(200)
        expect(replay.headers.get('cache-control')).toBe('no-store')
        expect(replayJson.data).toMatchObject({
            id: firstJson.data.id,
            outcome: 'alreadyIssued',
        })
        expect(replayJson.data).not.toHaveProperty('key')
        expect(conflict.status).toBe(409)

        const [issuance] = await db
            .select()
            .from(dbSchema.servicePrincipalCredentialIssuance)
            .where(
                eq(
                    dbSchema.servicePrincipalCredentialIssuance.idempotencyKey,
                    idempotencyKey,
                ),
            )
        expect(issuance).toMatchObject({
            credentialId: firstJson.data.id,
            requestFingerprint: await credentialFingerprint(body),
            state: 'completed',
        })
        expect(JSON.stringify(issuance)).not.toContain(firstJson.data.key)

        const [auditCount] = await db
            .select({ value: count() })
            .from(dbSchema.auditTrail)
            .where(
                and(
                    eq(dbSchema.auditTrail.action, 'credential.create'),
                    sqlCredentialRecord(firstJson.data.id),
                ),
            )
        expect(auditCount?.value).toBe(1)

        const revoked = await postTestingRequest(
            '/api/admin/servicePrincipal/credential/revoke',
            {
                cookie: ownerCookie,
                body: {
                    credentialId: firstJson.data.id,
                    principalPublicId: principal.json.data.publicId,
                },
            },
        )
        const replayAfterRevoke = await postTestingRequest(
            '/api/admin/servicePrincipal/credential/create',
            { cookie: ownerCookie, body },
        )
        const replayAfterRevokeJson =
            await replayAfterRevoke.json<TCreateCredentialResponse>()

        expect(revoked.status).toBe(200)
        expect(replayAfterRevoke.status).toBe(200)
        expect(replayAfterRevokeJson.data).toMatchObject({
            id: firstJson.data.id,
            outcome: 'alreadyIssued',
        })
        expect(
            await db
                .select({ id: dbSchema.apikey.id })
                .from(dbSchema.apikey)
                .where(eq(dbSchema.apikey.id, firstJson.data.id)),
        ).toEqual([])
    })

    it('never reopens pending or failed credential issuance claims.', async () => {
        const principal = await createPrincipal(
            ownerCookie,
            'public-v1',
            'CREDENTIAL-TERMINAL',
        )
        const [principalRow] = await db
            .select({ id: dbSchema.servicePrincipal.id })
            .from(dbSchema.servicePrincipal)
            .where(
                and(
                    eq(
                        dbSchema.servicePrincipal.organizationId,
                        TEST_PRIMARY_ORGANIZATION_ID,
                    ),
                    eq(
                        dbSchema.servicePrincipal.publicId,
                        principal.json.data.publicId,
                    ),
                ),
            )
        const request = {
            expiryDays: 30,
            idempotencyKey: uuidv7(),
            name: `${TEST_NAME_PREFIX}CREDENTIAL-TERMINAL`,
            principalPublicId: principal.json.data.publicId,
        }
        await db.insert(dbSchema.servicePrincipalCredentialIssuance).values({
            idempotencyKey: request.idempotencyKey,
            organizationId: TEST_PRIMARY_ORGANIZATION_ID,
            requestFingerprint: await credentialFingerprint(request),
            servicePrincipalId: principalRow!.id,
            state: 'pending',
        })

        const pending = await postTestingRequest(
            '/api/admin/servicePrincipal/credential/create',
            { cookie: ownerCookie, body: request },
        )
        await db
            .update(dbSchema.servicePrincipalCredentialIssuance)
            .set({ state: 'failed' })
            .where(
                eq(
                    dbSchema.servicePrincipalCredentialIssuance.idempotencyKey,
                    request.idempotencyKey,
                ),
            )
        const failed = await postTestingRequest(
            '/api/admin/servicePrincipal/credential/create',
            { cookie: ownerCookie, body: request },
        )

        expect(pending.status).toBe(409)
        expect(failed.status).toBe(409)
        expect(
            await db
                .select({ id: dbSchema.apikey.id })
                .from(dbSchema.apikey)
                .where(eq(dbSchema.apikey.name, request.name)),
        ).toEqual([])
    })

    it('rolls back credential linking and removes the orphan when issuance auditing fails.', async () => {
        const principal = await createPrincipal(
            ownerCookie,
            'backoffice-v1',
            'AUDIT-ROLLBACK',
        )
        const request = {
            expiryDays: 30,
            idempotencyKey: uuidv7(),
            name: `${TEST_NAME_PREFIX}AUDIT-ROLLBACK-CREDENTIAL`,
            principalPublicId: principal.json.data.publicId,
        }
        await env.LOANMSBOFC_D1.prepare(
            `CREATE TRIGGER test_credential_audit_failure
             BEFORE INSERT ON audit_trail
             WHEN NEW.component = 'admin.servicePrincipal'
                  AND NEW.action = 'credential.create'
             BEGIN
                 SELECT RAISE(ABORT, 'test credential audit failure');
             END`,
        ).run()
        try {
            const response = await postTestingRequest(
                '/api/admin/servicePrincipal/credential/create',
                { cookie: ownerCookie, body: request },
            )
            expect(response.status).toBe(503)
            const credentials = await db
                .select()
                .from(dbSchema.apikey)
                .where(eq(dbSchema.apikey.name, request.name))
            expect(credentials).toHaveLength(0)
            const [claim] = await db
                .select()
                .from(dbSchema.servicePrincipalCredentialIssuance)
                .where(
                    eq(
                        dbSchema.servicePrincipalCredentialIssuance
                            .idempotencyKey,
                        request.idempotencyKey,
                    ),
                )
            expect(claim).toMatchObject({
                state: 'failed',
                credentialId: null,
                credentialStart: null,
            })
            const replay = await postTestingRequest(
                '/api/admin/servicePrincipal/credential/create',
                { cookie: ownerCookie, body: request },
            )
            expect(replay.status).toBe(409)
        } finally {
            await env.LOANMSBOFC_D1.exec(
                'DROP TRIGGER IF EXISTS test_credential_audit_failure',
            )
        }
    })

    it('allows only one concurrent winner for a duplicated credential request.', async () => {
        const principal = await createPrincipal(
            ownerCookie,
            'public-v1',
            'CREDENTIAL-CONCURRENT',
        )
        const body = {
            expiryDays: 30,
            idempotencyKey: uuidv7(),
            name: `${TEST_NAME_PREFIX}CREDENTIAL-CONCURRENT`,
            principalPublicId: principal.json.data.publicId,
        }
        const responses = await Promise.all([
            postTestingRequest(
                '/api/admin/servicePrincipal/credential/create',
                { cookie: ownerCookie, body },
            ),
            postTestingRequest(
                '/api/admin/servicePrincipal/credential/create',
                { cookie: ownerCookie, body },
            ),
        ])
        const replay = await postTestingRequest(
            '/api/admin/servicePrincipal/credential/create',
            { cookie: ownerCookie, body },
        )
        const replayJson = await replay.json<TCreateCredentialResponse>()

        expect(responses.filter(({ status }) => status === 201)).toHaveLength(1)
        expect(
            responses.every(({ status }) =>
                [
                    200,
                    201,
                    409,
                ].includes(status),
            ),
        ).toBe(true)
        expect(replay.status).toBe(200)
        expect(replayJson.data.outcome).toBe('alreadyIssued')
        expect(
            await db
                .select({ id: dbSchema.apikey.id })
                .from(dbSchema.apikey)
                .where(eq(dbSchema.apikey.name, body.name)),
        ).toHaveLength(1)
    })

    it('enforces two active credentials and supports an explicit permanent credential.', async () => {
        const principal = await createPrincipal(
            ownerCookie,
            'public-v1',
            'CREDENTIAL-LIMIT',
        )

        const first = await postTestingRequest(
            '/api/admin/servicePrincipal/credential/create',
            {
                cookie: ownerCookie,
                body: {
                    expiryDays: null,
                    idempotencyKey: uuidv7(),
                    name: `${TEST_NAME_PREFIX}PERMANENT`,
                    principalPublicId: principal.json.data.publicId,
                },
            },
        )
        const firstJson = await first.json<TCreateCredentialResponse>()
        const [
            second,
            third,
        ] = await Promise.all([
            postTestingRequest(
                '/api/admin/servicePrincipal/credential/create',
                {
                    cookie: ownerCookie,
                    body: {
                        expiryDays: 30,
                        idempotencyKey: uuidv7(),
                        name: `${TEST_NAME_PREFIX}ROTATION-A`,
                        principalPublicId: principal.json.data.publicId,
                    },
                },
            ),
            postTestingRequest(
                '/api/admin/servicePrincipal/credential/create',
                {
                    cookie: ownerCookie,
                    body: {
                        expiryDays: 30,
                        idempotencyKey: uuidv7(),
                        name: `${TEST_NAME_PREFIX}ROTATION-B`,
                        principalPublicId: principal.json.data.publicId,
                    },
                },
            ),
        ])

        expect(first.status).toBe(201)
        expect(firstJson.data.expiresAt).toBeNull()
        expect(
            [
                second.status,
                third.status,
            ].sort(),
        ).toEqual([
            201,
            409,
        ])

        const [storedPrincipal] = await db
            .select({ id: dbSchema.servicePrincipal.id })
            .from(dbSchema.servicePrincipal)
            .where(
                eq(
                    dbSchema.servicePrincipal.publicId,
                    principal.json.data.publicId,
                ),
            )
        const credentials = await db
            .select({
                id: dbSchema.apikey.id,
                name: dbSchema.apikey.name,
                servicePrincipalId: dbSchema.apikey.servicePrincipalId,
            })
            .from(dbSchema.apikey)
            .where(like(dbSchema.apikey.name, `${TEST_NAME_PREFIX}%`))
        const linked = credentials.filter(
            ({ servicePrincipalId }) =>
                servicePrincipalId === storedPrincipal!.id,
        )
        const abandonedRotation = await db
            .select({ id: dbSchema.apikey.id })
            .from(dbSchema.apikey)
            .where(
                and(
                    like(dbSchema.apikey.name, `${TEST_NAME_PREFIX}ROTATION-%`),
                    isNull(dbSchema.apikey.servicePrincipalId),
                ),
            )
        expect(linked).toHaveLength(2)
        expect(abandonedRotation).toEqual([])
    })

    it('serializes status transitions and cascades credentials only after disable.', async () => {
        const principal = await createPrincipal(
            ownerCookie,
            'public-v1',
            'STATUS-CONCURRENCY',
        )
        const credentialResponse = await postTestingRequest(
            '/api/admin/servicePrincipal/credential/create',
            {
                cookie: ownerCookie,
                body: {
                    expiryDays: 30,
                    idempotencyKey: uuidv7(),
                    name: `${TEST_NAME_PREFIX}STATUS-CREDENTIAL`,
                    principalPublicId: principal.json.data.publicId,
                },
            },
        )
        const credential =
            await credentialResponse.json<TCreateCredentialResponse>()

        const disableResponses = await Promise.all([
            postTestingRequest('/api/admin/servicePrincipal/disable', {
                cookie: ownerCookie,
                body: { publicId: principal.json.data.publicId },
            }),
            postTestingRequest('/api/admin/servicePrincipal/disable', {
                cookie: ownerCookie,
                body: { publicId: principal.json.data.publicId },
            }),
        ])
        expect(disableResponses.map(({ status }) => status).sort()).toEqual([
            200,
            409,
        ])

        const repeatedDisable = await postTestingRequest(
            '/api/admin/servicePrincipal/disable',
            {
                cookie: ownerCookie,
                body: { publicId: principal.json.data.publicId },
            },
        )
        expect(repeatedDisable.status).toBe(409)

        const enableResponses = await Promise.all([
            postTestingRequest('/api/admin/servicePrincipal/enable', {
                cookie: ownerCookie,
                body: {
                    confirmed: true,
                    publicId: principal.json.data.publicId,
                },
            }),
            postTestingRequest('/api/admin/servicePrincipal/enable', {
                cookie: ownerCookie,
                body: {
                    confirmed: true,
                    publicId: principal.json.data.publicId,
                },
            }),
        ])
        expect(enableResponses.map(({ status }) => status).sort()).toEqual([
            200,
            409,
        ])

        const enabledDelete = await postTestingRequest(
            '/api/admin/servicePrincipal/delete',
            {
                cookie: ownerCookie,
                body: { publicId: principal.json.data.publicId },
            },
        )
        expect(enabledDelete.status).toBe(409)

        const disabled = await postTestingRequest(
            '/api/admin/servicePrincipal/disable',
            {
                cookie: ownerCookie,
                body: { publicId: principal.json.data.publicId },
            },
        )
        expect(disabled.status).toBe(200)

        const deleted = await postTestingRequest(
            '/api/admin/servicePrincipal/delete',
            {
                cookie: ownerCookie,
                body: { publicId: principal.json.data.publicId },
            },
        )
        expect(deleted.status).toBe(200)
        await expect(
            db
                .select({ id: dbSchema.apikey.id })
                .from(dbSchema.apikey)
                .where(eq(dbSchema.apikey.id, credential.data.id)),
        ).resolves.toEqual([])
    })

    it('enforces tenant, role, permission namespace, and strict input boundaries.', async () => {
        const unauthenticated = await postTestingRequest(
            '/api/admin/servicePrincipal/create',
            {
                body: {
                    audience: 'public-v1',
                    idempotencyKey: uuidv7(),
                    name: `${TEST_NAME_PREFIX}UNAUTHENTICATED`,
                    permissions: { 'api.public': ['access'] },
                },
            },
        )
        const member = await postTestingRequest(
            '/api/admin/servicePrincipal/create',
            {
                cookie: memberCookie,
                body: {
                    audience: 'public-v1',
                    idempotencyKey: uuidv7(),
                    name: `${TEST_NAME_PREFIX}MEMBER`,
                    permissions: { 'api.public': ['access'] },
                },
            },
        )
        const crossAudience = await postTestingRequest(
            '/api/admin/servicePrincipal/create',
            {
                cookie: ownerCookie,
                body: {
                    audience: 'public-v1',
                    idempotencyKey: uuidv7(),
                    name: `${TEST_NAME_PREFIX}CROSS-AUDIENCE`,
                    permissions: { 'api.backoffice': ['access'] },
                },
            },
        )
        const pluginField = await postTestingRequest(
            '/api/admin/servicePrincipal/create',
            {
                cookie: ownerCookie,
                body: {
                    audience: 'public-v1',
                    idempotencyKey: uuidv7(),
                    metadata: { prohibited: true },
                    name: `${TEST_NAME_PREFIX}PLUGIN-FIELD`,
                    permissions: { 'api.public': ['access'] },
                },
            },
        )
        const systemPermission = await postTestingRequest(
            '/api/admin/servicePrincipal/create',
            {
                cookie: ownerCookie,
                body: {
                    audience: 'public-v1',
                    idempotencyKey: uuidv7(),
                    name: `${TEST_NAME_PREFIX}SYSTEM-PERMISSION`,
                    permissions: { SYSOWNER: ['ANY'] },
                },
            },
        )
        const unassignableDomain = await postTestingRequest(
            '/api/admin/servicePrincipal/create',
            {
                cookie: ownerCookie,
                body: {
                    audience: 'public-v1',
                    idempotencyKey: uuidv7(),
                    name: `${TEST_NAME_PREFIX}UNKNOWN-DOMAIN`,
                    permissions: {
                        'api.public': ['access'],
                        'api.public.unknown': ['read'],
                    },
                },
            },
        )
        const extraRootAction = await postTestingRequest(
            '/api/admin/servicePrincipal/create',
            {
                cookie: ownerCookie,
                body: {
                    audience: 'public-v1',
                    idempotencyKey: uuidv7(),
                    name: `${TEST_NAME_PREFIX}ROOT-ACTION`,
                    permissions: {
                        'api.public': [
                            'access',
                            'read',
                        ],
                    },
                },
            },
        )
        const nestedAccess = await postTestingRequest(
            '/api/admin/servicePrincipal/create',
            {
                cookie: ownerCookie,
                body: {
                    audience: 'public-v1',
                    idempotencyKey: uuidv7(),
                    name: `${TEST_NAME_PREFIX}NESTED-ACCESS`,
                    permissions: {
                        'api.public': ['access'],
                        'api.public.jobs': ['access'],
                    },
                },
            },
        )
        const managementPermission = await postTestingRequest(
            '/api/admin/servicePrincipal/create',
            {
                cookie: ownerCookie,
                body: {
                    audience: 'public-v1',
                    idempotencyKey: uuidv7(),
                    name: `${TEST_NAME_PREFIX}MANAGEMENT-PERMISSION`,
                    permissions: {
                        'api.public': ['access'],
                        apiKey: ['read'],
                    },
                },
            },
        )
        const adminList = await queryTestingRequest(
            '/api/admin/servicePrincipal/readMany',
            {
                filters: { audience: 'public-v1' },
                limit: 1,
                offset: 0,
                sortOrder: 'desc',
            },
            { cookie: adminCookie },
        )

        expect(unauthenticated.status).toBe(401)
        expect(member.status).toBe(403)
        expect(crossAudience.status).toBe(400)
        expect(pluginField.status).toBe(400)
        expect(systemPermission.status).toBe(400)
        expect(unassignableDomain.status).toBe(400)
        expect(extraRootAction.status).toBe(400)
        expect(nestedAccess.status).toBe(400)
        expect(managementPermission.status).toBe(400)
        expect(adminList.status).toBe(200)
    })

    it('does not expose or mutate a principal owned by another organization.', async () => {
        const [crossTenantPrincipal] = await db
            .insert(dbSchema.servicePrincipal)
            .values({
                audience: 'public-v1',
                name: `${TEST_NAME_PREFIX}CROSS-TENANT`,
                organizationId: TEST_ISOLATED_ORGANIZATION_ID,
                permissions: { 'api.public': ['access'] },
            })
            .returning({ publicId: dbSchema.servicePrincipal.publicId })

        const update = await postTestingRequest(
            '/api/admin/servicePrincipal/update',
            {
                cookie: ownerCookie,
                body: {
                    name: `${TEST_NAME_PREFIX}CROSS-TENANT-UPDATED`,
                    publicId: crossTenantPrincipal.publicId,
                },
            },
        )
        const credentialList = await queryTestingRequest(
            '/api/admin/servicePrincipal/credential/readMany',
            {
                filters: {
                    principalPublicId: crossTenantPrincipal.publicId,
                },
                limit: 10,
                offset: 0,
                sortOrder: 'desc',
            },
            { cookie: ownerCookie },
        )

        expect(update.status).toBe(404)
        expect(credentialList.status).toBe(404)
    })

    it('lists only safe principal metadata and audited user attribution.', async () => {
        const created = await createPrincipal(
            adminCookie,
            'backoffice-v1',
            'ADMIN-LIST',
        )
        const listed = await queryTestingRequest(
            '/api/admin/servicePrincipal/readMany',
            {
                filters: { audience: 'backoffice-v1' },
                limit: 100,
                offset: 0,
                sortOrder: 'desc',
            },
            { cookie: adminCookie },
        )
        const listJson = await listed.json<TPrincipalListResponse>()
        const principal = listJson.data.find(
            ({ publicId }) => publicId === created.json.data.publicId,
        )
        const [audit] = await db
            .select({
                actorType: dbSchema.auditTrail.actorType,
                credentialId: dbSchema.auditTrail.credentialId,
                servicePrincipalPublicId:
                    dbSchema.auditTrail.servicePrincipalPublicId,
            })
            .from(dbSchema.auditTrail)
            .where(
                and(
                    eq(dbSchema.auditTrail.component, 'admin.servicePrincipal'),
                    eq(dbSchema.auditTrail.action, 'create'),
                    sqlPublicIdRecord(created.json.data.publicId),
                ),
            )
            .limit(1)

        expect(listed.status).toBe(200)
        expect(principal).toBeDefined()
        expect(principal).not.toHaveProperty('id')
        expect(principal).not.toHaveProperty('organizationId')
        expect(principal).not.toHaveProperty('idempotencyKey')
        expect(audit).toMatchObject({
            actorType: 'user',
            credentialId: null,
            servicePrincipalPublicId: null,
        })
    })
})

function sqlPublicIdRecord(publicId: string) {
    return sql`EXISTS (
        SELECT 1 FROM json_each(${dbSchema.auditTrail.records})
        WHERE json_extract(value, '$.id') = ${publicId}
          AND json_extract(value, '$.table') = 'service_principal'
    )`
}

function sqlCredentialRecord(credentialId: string) {
    return sql`EXISTS (
        SELECT 1 FROM json_each(${dbSchema.auditTrail.records})
        WHERE json_extract(value, '$.id') = ${credentialId}
          AND json_extract(value, '$.table') = 'apikey'
    )`
}

// =============================================================================
// END OF BASE TEMPLATE TESTS - FORK-SPECIFIC TESTS MUST BE ADDED BELOW
// =============================================================================
