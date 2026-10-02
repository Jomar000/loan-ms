import { dbClient, dbSchema } from '@hyperion/database/d1'
import type {
    TApiResponseOk,
    TApiResponsePaginatedOk,
} from '@hyperion/types/shared'
import { env } from 'cloudflare:workers'
import { inArray } from 'drizzle-orm'
import { v7 as uuidv7 } from 'uuid'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import app from '../../../src/core/index.js'
import {
    queryTestingRequest,
    seedTestingCookieForOrganization,
    seedTestingCookies,
    TEST_ISOLATED_ORGANIZATION_ID,
    TEST_OWNER_USER_ID,
    TEST_PRIMARY_ORGANIZATION_ID,
} from '../../utilities.js'

type TAuditListRecord = {
    actor: { role: string | null }
    publicId: string
    component: string
    description: string
    records: { entityType: string; id: string; label: string | null }[]
}

type TAuditDetailRecord = TAuditListRecord & {
    records: {
        changes: {
            after?: boolean | null | number | string
            before?: boolean | null | number | string
            field: string
        }[]
        entityType: string
        id: string
        snapshot: { field: string; value: unknown }[]
        snapshotRecorded: boolean
    }[]
}

const publicIds = [
    uuidv7(),
    uuidv7(),
    uuidv7(),
    uuidv7(),
    uuidv7(),
]
const prefix = '__TEST-AUDIT-TRAIL'
let db: ReturnType<typeof dbClient>
let ownerCookie: string
let isolatedOwnerCookie: string
let seededAt: Date

beforeAll(async () => {
    db = dbClient(env.HYPERIONBOFC_D1)
    ;[ownerCookie] = await seedTestingCookies()
    isolatedOwnerCookie = await seedTestingCookieForOrganization(
        TEST_OWNER_USER_ID,
        TEST_ISOLATED_ORGANIZATION_ID,
        { db },
    )

    const now = new Date()
    seededAt = now
    const sameTimestamp = new Date(now.getTime() - 60_000)
    await db.insert(dbSchema.auditTrail).values([
        {
            publicId: publicIds[0],
            organizationId: TEST_PRIMARY_ORGANIZATION_ID,
            userId: TEST_OWNER_USER_ID,
            actorType: 'user',
            actorDisplayName: 'Test Owner',
            actorIdentifier: 'owner@test.hyperion.app',
            actorRole: 'owner',
            component: 'user.profile',
            action: 'update',
            description: `${prefix} company updated`,
            ipAddress: '203.0.113.254',
            records: [
                {
                    entityType: 'user_profile',
                    table: 'user_profile',
                    id: 'profile-public-id',
                    label: 'Updated Profile',
                    context: {
                        correlationId: '__TEST-INTERNAL-CONTEXT',
                    },
                    oldData: {
                        firstName: 'Before',
                        unknownField: '__TEST-UNKNOWN-SNAPSHOT-BEFORE',
                    },
                    newData: {
                        firstName: 'Updated',
                        unknownField: '__TEST-UNKNOWN-SNAPSHOT-AFTER',
                    },
                },
                {
                    entityType: 'user_address',
                    table: 'user_address',
                    id: 'legacy-empty-snapshot',
                    oldData: {},
                    newData: {},
                },
            ],
            loggedAt: sameTimestamp,
        },
        {
            publicId: publicIds[1],
            organizationId: TEST_PRIMARY_ORGANIZATION_ID,
            userId: TEST_OWNER_USER_ID,
            actorType: 'user',
            actorDisplayName: 'Test Owner',
            component: 'objectStorage.upload',
            action: 'commit',
            description: `${prefix} stock received`,
            ipAddress: '198.51.100.20',
            records: [
                {
                    entityType: 'upload',
                    table: 'upload',
                    id: 'upload-public-id',
                    oldData: { status: 'pending' },
                    newData: { status: 'committed' },
                },
            ],
            loggedAt: sameTimestamp,
        },
        {
            publicId: publicIds[2],
            organizationId: TEST_PRIMARY_ORGANIZATION_ID,
            actorType: 'anonymous',
            actorDisplayName: 'Anonymous',
            component: 'auth',
            action: 'password.resetRequest',
            description: `${prefix} password reset requested`,
            loggedAt: new Date(now.getTime() - 120_000),
        },
        {
            publicId: publicIds[3],
            organizationId: TEST_PRIMARY_ORGANIZATION_ID,
            actorType: 'system',
            actorDisplayName: 'Hyperion System',
            component: 'auth',
            action: 'verifyEmail',
            description: `${prefix} old event`,
            loggedAt: new Date(now.getTime() - 31 * 24 * 60 * 60 * 1_000),
        },
        {
            publicId: publicIds[4],
            organizationId: TEST_ISOLATED_ORGANIZATION_ID,
            actorType: 'system',
            actorDisplayName: 'Hyperion System',
            component: 'auth',
            action: 'verifyEmail',
            description: `${prefix} isolated event`,
            loggedAt: now,
        },
    ])
})

afterAll(async () => {
    await db
        .delete(dbSchema.auditTrail)
        .where(inArray(dbSchema.auditTrail.publicId, publicIds))
})

describe('Audit Trail read API', () => {
    it('defaults to today and orders equal timestamps by descending ID', async () => {
        const response = await queryTestingRequest(
            '/api/auditTrail/readMany',
            { filters: { searchFilter: prefix }, limit: 2 },
            { cookie: ownerCookie },
        )
        const json =
            await response.json<TApiResponsePaginatedOk<TAuditListRecord[]>>()
        const repeatedResponse = await queryTestingRequest(
            '/api/auditTrail/readMany',
            { filters: { searchFilter: prefix }, limit: 2 },
            { cookie: ownerCookie },
        )
        const repeatedJson =
            await repeatedResponse.json<
                TApiResponsePaginatedOk<TAuditListRecord[]>
            >()

        expect(response.status).toBe(200)
        expect(json.count).toBe(3)
        expect(new Set(json.data.map((record) => record.publicId))).toEqual(
            new Set([
                publicIds[0],
                publicIds[1],
            ]),
        )
        expect(repeatedJson.data.map((record) => record.publicId)).toEqual(
            json.data.map((record) => record.publicId),
        )
        expect(json.data.map((record) => record.publicId)).toEqual([
            publicIds[1],
            publicIds[0],
        ])
        const contextualRecord = json.data.find(
            (record) => record.publicId === publicIds[0],
        )?.records[0]
        expect(
            json.data.find((record) => record.publicId === publicIds[0])?.actor
                .role,
        ).toBe('owner')
        expect(contextualRecord).toBeDefined()
        expect(contextualRecord).not.toHaveProperty('context')
        expect(contextualRecord).not.toHaveProperty('oldData')
        expect(contextualRecord).not.toHaveProperty('newData')
        expect(
            json.data.some((record) => record.publicId === publicIds[3]),
        ).toBe(false)
    })

    it('filters every detail field and paginates in stable ascending order', async () => {
        const requests = await Promise.all([
            queryTestingRequest(
                '/api/auditTrail/readMany',
                {
                    filters: {
                        components: { include: ['user.profile'] },
                        searchFilter: prefix,
                    },
                },
                { cookie: ownerCookie },
            ),
            queryTestingRequest(
                '/api/auditTrail/readMany',
                {
                    filters: {
                        actions: { exclude: ['update'] },
                        searchFilter: prefix,
                    },
                },
                { cookie: ownerCookie },
            ),
            queryTestingRequest(
                '/api/auditTrail/readMany',
                {
                    filters: {
                        actorTypes: { include: ['anonymous'] },
                        searchFilter: prefix,
                    },
                },
                { cookie: ownerCookie },
            ),
            queryTestingRequest(
                '/api/auditTrail/readMany',
                {
                    filters: {
                        entityTypes: { include: ['user_profile'] },
                        searchFilter: prefix,
                    },
                },
                { cookie: ownerCookie },
            ),
            queryTestingRequest(
                '/api/auditTrail/readMany',
                {
                    filters: {
                        entityTypes: { exclude: ['user_profile'] },
                        searchFilter: prefix,
                    },
                },
                { cookie: ownerCookie },
            ),
            queryTestingRequest(
                '/api/auditTrail/readMany',
                {
                    filters: {
                        searchFilter: '203.0.113.254',
                    },
                },
                { cookie: ownerCookie },
            ),
            queryTestingRequest(
                '/api/auditTrail/readMany',
                {
                    filters: { searchFilter: prefix },
                    limit: 1,
                    offset: 1,
                    sortOrder: 'asc',
                },
                { cookie: ownerCookie },
            ),
            queryTestingRequest(
                '/api/auditTrail/readMany',
                {
                    filters: {
                        dateFrom: new Date(
                            seededAt.getTime() - 150_000,
                        ).toISOString(),
                        dateTo: new Date(
                            seededAt.getTime() - 90_000,
                        ).toISOString(),
                        searchFilter: prefix,
                    },
                },
                { cookie: ownerCookie },
            ),
        ])
        const pages = await Promise.all(
            requests.map((response) =>
                response.json<TApiResponsePaginatedOk<TAuditListRecord[]>>(),
            ),
        )

        expect(requests.every((response) => response.status === 200)).toBe(true)
        expect(pages[0].data.map((record) => record.publicId)).toEqual([
            publicIds[0],
        ])
        expect(new Set(pages[1].data.map((record) => record.publicId))).toEqual(
            new Set([
                publicIds[1],
                publicIds[2],
            ]),
        )
        expect(pages[2].data.map((record) => record.publicId)).toEqual([
            publicIds[2],
        ])
        expect(pages[3].data.map((record) => record.publicId)).toEqual([
            publicIds[0],
        ])
        expect(new Set(pages[4].data.map((record) => record.publicId))).toEqual(
            new Set([
                publicIds[1],
                publicIds[2],
            ]),
        )
        expect(pages[5].data.map((record) => record.publicId)).toEqual([
            publicIds[0],
        ])
        expect(pages[6]).toMatchObject({
            count: 3,
            limit: 1,
            offset: 1,
        })
        expect(pages[6].data.map((record) => record.publicId)).toEqual([
            publicIds[0],
        ])
        expect(pages[7].data.map((record) => record.publicId)).toEqual([
            publicIds[2],
        ])
    })

    it('searches tenant-scoped Event IDs in lists and summaries', async () => {
        const searchFilter = publicIds[0].slice(-12).toUpperCase()
        const [
            listResponse,
            summaryResponse,
            isolatedResponse,
        ] = await Promise.all([
            queryTestingRequest(
                '/api/auditTrail/readMany',
                { filters: { searchFilter } },
                { cookie: ownerCookie },
            ),
            queryTestingRequest(
                '/api/auditTrail/summary',
                { filters: { searchFilter } },
                { cookie: ownerCookie },
            ),
            queryTestingRequest(
                '/api/auditTrail/readMany',
                { filters: { searchFilter } },
                { cookie: isolatedOwnerCookie },
            ),
        ])
        const listJson =
            await listResponse.json<
                TApiResponsePaginatedOk<TAuditListRecord[]>
            >()
        const summaryJson = await summaryResponse.json<
            TApiResponseOk<{
                accessSecurity: number
                all: number
                accountProfile: number
                storageNotifications: number
            }>
        >()
        const isolatedJson =
            await isolatedResponse.json<
                TApiResponsePaginatedOk<TAuditListRecord[]>
            >()

        expect(listResponse.status).toBe(200)
        expect(listJson.data.map((record) => record.publicId)).toEqual([
            publicIds[0],
        ])
        expect(summaryResponse.status).toBe(200)
        expect(summaryJson.data).toEqual({
            accessSecurity: 0,
            all: 1,
            accountProfile: 1,
            storageNotifications: 0,
        })
        expect(isolatedResponse.status).toBe(200)
        expect(isolatedJson.data).toEqual([])
    })

    it('filters groups and summarizes while ignoring only the selected group', async () => {
        const profileResponse = await queryTestingRequest(
            '/api/auditTrail/readMany',
            { filters: { group: 'accountProfile', searchFilter: prefix } },
            { cookie: ownerCookie },
        )
        const profileJson =
            await profileResponse.json<
                TApiResponsePaginatedOk<TAuditListRecord[]>
            >()
        const summaryResponse = await queryTestingRequest(
            '/api/auditTrail/summary',
            { filters: { group: 'accountProfile', searchFilter: prefix } },
            { cookie: ownerCookie },
        )
        const summaryJson = await summaryResponse.json<
            TApiResponseOk<{
                accessSecurity: number
                all: number
                accountProfile: number
                storageNotifications: number
            }>
        >()
        const actorSummaryResponse = await queryTestingRequest(
            '/api/auditTrail/summary',
            {
                filters: {
                    actorTypes: { include: ['user'] },
                    group: 'accessSecurity',
                    searchFilter: prefix,
                },
            },
            { cookie: ownerCookie },
        )
        const actorSummaryJson = await actorSummaryResponse.json<
            TApiResponseOk<{
                accessSecurity: number
                all: number
                accountProfile: number
                storageNotifications: number
            }>
        >()

        expect(profileJson.data).toHaveLength(1)
        expect(profileJson.data[0].component).toBe('user.profile')
        expect(summaryJson.data).toEqual({
            accessSecurity: 1,
            all: 3,
            accountProfile: 1,
            storageNotifications: 1,
        })
        expect(actorSummaryJson.data).toEqual({
            accessSecurity: 0,
            all: 2,
            accountProfile: 1,
            storageNotifications: 1,
        })
    })

    it('formats allowlisted detail changes without returning raw snapshots', async () => {
        const response = await app.request(
            `/api/auditTrail/${publicIds[0]}`,
            { headers: { origin: env.URL_FRONTEND, cookie: ownerCookie } },
            env,
        )
        const json = await response.json<TApiResponseOk<TAuditDetailRecord>>()

        expect(response.status).toBe(200)
        expect(json.data.records[0]).toMatchObject({
            entityType: 'user_profile',
            id: 'profile-public-id',
            snapshotRecorded: true,
            changes: [
                {
                    before: 'Before',
                    after: 'Updated',
                    field: 'firstName',
                },
            ],
        })
        expect(json.data.records[0]).not.toHaveProperty('context')
        expect(json.data.records[0]).not.toHaveProperty('oldData')
        expect(json.data.records[0]).not.toHaveProperty('newData')
        expect(json.data.records[0].changes).not.toEqual(
            expect.arrayContaining([
                expect.objectContaining({ field: 'unknownField' }),
            ]),
        )
        expect(json.data.records[0].snapshot).not.toEqual(
            expect.arrayContaining([
                expect.objectContaining({ field: 'unknownField' }),
            ]),
        )
        expect(json.data.records[1]).toMatchObject({
            id: 'legacy-empty-snapshot',
            snapshotRecorded: false,
        })
    })

    it('does not search audit context or unknown snapshot fields', async () => {
        for (const searchFilter of [
            '__TEST-INTERNAL-CONTEXT',
            '__TEST-UNKNOWN-SNAPSHOT-AFTER',
        ]) {
            const response = await queryTestingRequest(
                '/api/auditTrail/readMany',
                { filters: { searchFilter } },
                { cookie: ownerCookie },
            )
            const json =
                await response.json<
                    TApiResponsePaginatedOk<TAuditListRecord[]>
                >()

            expect(response.status).toBe(200)
            expect(json.data).toHaveLength(0)
        }
    })

    it('returns not found for a different tenant event', async () => {
        const response = await app.request(
            `/api/auditTrail/${publicIds[0]}`,
            {
                headers: {
                    origin: env.URL_FRONTEND,
                    cookie: isolatedOwnerCookie,
                },
            },
            env,
        )

        expect(response.status).toBe(404)
    })
})

// =============================================================================
// END OF BASE TEMPLATE TESTS - FORK-SPECIFIC TESTS MUST BE ADDED BELOW
// =============================================================================
