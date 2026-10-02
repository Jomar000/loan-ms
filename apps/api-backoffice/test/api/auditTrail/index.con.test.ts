import type { TApiResponseError } from '@loanms/types/shared'
import * as auditTrail from '@loanms/validator/backoffice/auditTrail'
import { env } from 'cloudflare:workers'
import { beforeAll, describe, expect, it } from 'vitest'

import app from '../../../src/core/index.js'
import { queryTestingRequest, seedTestingCookies } from '../../utilities.js'

let ownerCookie: string
let memberCookie: string
let adminCookie: string

beforeAll(async () => {
    ;[
        ownerCookie,
        memberCookie,
        adminCookie,
    ] = await seedTestingCookies()
})

describe.concurrent('Audit Trail contracts and access', () => {
    it('defaults to the runtime-local current day and validates filter ordering', () => {
        const now = new Date()
        const parsed = auditTrail.auditTrailReadManyInputSchema.parse({})

        expect(parsed).toMatchObject({
            filters: { group: 'all' },
            limit: 25,
            offset: 0,
            sortOrder: 'desc',
        })
        const dateFrom = new Date(parsed.filters.dateFrom)
        const dateTo = new Date(parsed.filters.dateTo)
        expect([
            dateFrom.getFullYear(),
            dateFrom.getMonth(),
            dateFrom.getDate(),
            dateFrom.getHours(),
            dateFrom.getMinutes(),
            dateFrom.getSeconds(),
            dateFrom.getMilliseconds(),
        ]).toEqual([
            now.getFullYear(),
            now.getMonth(),
            now.getDate(),
            0,
            0,
            0,
            0,
        ])
        expect([
            dateTo.getFullYear(),
            dateTo.getMonth(),
            dateTo.getDate(),
            dateTo.getHours(),
            dateTo.getMinutes(),
            dateTo.getSeconds(),
            dateTo.getMilliseconds(),
        ]).toEqual([
            now.getFullYear(),
            now.getMonth(),
            now.getDate(),
            23,
            59,
            59,
            999,
        ])
        expect(
            auditTrail.auditTrailReadManyInputSchema.safeParse({
                filters: {
                    dateFrom: '2026-09-03T00:00:00.000Z',
                    dateTo: '2026-09-02T00:00:00.000Z',
                },
            }).success,
        ).toBe(false)
    })

    it('keeps component, action, actor, and entity registries closed', () => {
        expect(
            auditTrail.auditTrailComponentSchema.safeParse('test.audit')
                .success,
        ).toBe(false)
        expect(
            auditTrail.auditTrailActionSchema.safeParse('completed').success,
        ).toBe(false)
        expect(
            auditTrail.auditTrailActorTypeSchema.safeParse('robot').success,
        ).toBe(false)
        expect(
            auditTrail.auditTrailEntityTypeSchema.safeParse('secret').success,
        ).toBe(false)

        for (const registry of [
            auditTrail.auditTrailActions,
            auditTrail.auditTrailComponents,
            auditTrail.auditTrailEntityTypes,
        ]) {
            expect(registry).toEqual([...registry].sort())
        }
    })

    it('accepts incomplete legacy actor snapshots without fabricating identity', () => {
        expect(
            auditTrail.auditTrailReadManyOutputSchema.safeParse({
                count: 1,
                data: [
                    {
                        action: 'verifyEmail',
                        actor: {
                            displayName: null,
                            identifier: null,
                            role: null,
                            type: null,
                        },
                        component: 'auth',
                        description: 'Email address verified',
                        ipAddress: null,
                        loggedAt: '2026-09-04T00:00:00.000Z',
                        publicId: '019fc1a5-caf8-76f1-8f19-e873e77f86ec',
                        records: [],
                        sourceChannel: 'Unknown',
                    },
                ],
                limit: 25,
                offset: 0,
                success: true,
            }).success,
        ).toBe(true)
    })

    it('allows owner and admin reads while denying members and unauthenticated requests', async () => {
        const requests = await Promise.all([
            queryTestingRequest(
                '/api/auditTrail/readMany',
                {},
                { cookie: ownerCookie },
            ),
            queryTestingRequest(
                '/api/auditTrail/summary',
                {},
                { cookie: adminCookie },
            ),
            queryTestingRequest(
                '/api/auditTrail/readMany',
                {},
                { cookie: memberCookie },
            ),
            queryTestingRequest('/api/auditTrail/readMany', {}),
        ])

        expect(requests.map((response) => response.status)).toEqual([
            200,
            200,
            403,
            401,
        ])
        const denied = await requests[2].json<TApiResponseError>()
        expect(denied.error.code).toBe('FORBIDDEN')
    })

    it('does not accept a management API credential in place of a session', async () => {
        const response = await app.request(
            '/api/auditTrail/readMany',
            {
                method: 'QUERY',
                headers: {
                    origin: env.URL_FRONTEND,
                    'content-type': 'application/json',
                    'x-api-key': `bof_${'A'.repeat(64)}`,
                },
                body: JSON.stringify({}),
            },
            env,
        )

        expect(response.status).toBe(401)
    })

    it('allows QUERY CORS preflight', async () => {
        const response = await app.request(
            '/api/auditTrail/readMany',
            {
                method: 'OPTIONS',
                headers: {
                    origin: env.URL_FRONTEND,
                    'access-control-request-method': 'QUERY',
                    'access-control-request-headers': 'content-type',
                },
            },
            env,
        )

        expect(response.status).toBe(204)
        expect(response.headers.get('access-control-allow-methods')).toContain(
            'QUERY',
        )
    })

    it('rejects invalid date ordering and malformed QUERY JSON', async () => {
        const invalidRange = await queryTestingRequest(
            '/api/auditTrail/readMany',
            {
                filters: {
                    dateFrom: '2026-09-04T00:00:00.000Z',
                    dateTo: '2026-09-03T00:00:00.000Z',
                },
            },
            { cookie: ownerCookie },
        )
        const malformedJson = await app.request(
            '/api/auditTrail/readMany',
            {
                body: '{',
                headers: {
                    'content-type': 'application/json',
                    cookie: ownerCookie,
                    origin: env.URL_FRONTEND,
                },
                method: 'QUERY',
            },
            env,
        )

        expect(invalidRange.status).toBe(400)
        expect(malformedJson.status).toBe(400)
    })
})

// =============================================================================
// END OF BASE TEMPLATE TESTS - FORK-SPECIFIC TESTS MUST BE ADDED BELOW
// =============================================================================
