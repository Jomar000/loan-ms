import { dbClient, dbSchema } from '@loanms/database/d1'
import type { TApiResponseError, TApiResponseOk } from '@loanms/types/shared'
import { env } from 'cloudflare:workers'
import { and, eq } from 'drizzle-orm'
import { v7 as uuidv7 } from 'uuid'
import { beforeAll, describe, expect, it } from 'vitest'

import {
    getTestingRequest,
    postTestingRequest,
    seedTestingCookieForOrganization,
    seedTestingCookies,
    TEST_ISOLATED_ORGANIZATION_ID,
    TEST_OWNER_USER_ID,
    TEST_PRIMARY_ORGANIZATION_ID,
} from '../utilities.js'

type TSystemSettings = {
    allowAdvancePayments: boolean
    borrowerTagPolicy: {
        daily: { scammerMinimumMissedInstallments: number }
    }
    defaultLoanProductPublicId: string | null
    defaultPaymentFrequency: 'DAILY' | 'MONTHLY' | 'WEEKLY'
    enabledPaymentFrequencies: ('DAILY' | 'MONTHLY' | 'WEEKLY')[]
    version: number
}

let isolatedOwnerCookie: string
let memberCookie: string
let ownerCookie: string

const updateBody = (idempotencyKey: string, expectedVersion = 0) => ({
    allowAdvancePayments: false,
    allowPartialPayments: true,
    borrowerTagPolicy: {
        allowManualOverride: true,
        automaticTaggingEnabled: true,
        blockNewLoanForScammer: true,
        daily: {
            badPayerMaximumMissedInstallments: 5,
            goodPayerMaximumMissedInstallments: 1,
            scammerMinimumMissedInstallments: 6,
        },
        monthly: {
            badPayerMaximumMissedInstallments: 6,
            goodPayerMaximumMissedInstallments: 2,
            scammerMinimumMissedInstallments: 7,
        },
        requireBadPayerRenewalApproval: true,
        requireOverrideReason: true,
        requireScammerRenewalApproval: true,
        showHistoricalWorstTag: true,
        weekly: {
            badPayerMaximumMissedInstallments: 6,
            goodPayerMaximumMissedInstallments: 2,
            scammerMinimumMissedInstallments: 7,
        },
    },
    defaultLoanProductPublicId: null,
    defaultPaymentFrequency: 'DAILY' as const,
    enabledPaymentFrequencies: [
        'DAILY',
        'WEEKLY',
    ] as const,
    expectedVersion,
    idempotencyKey,
    requireRenewalApproval: true,
})

beforeAll(async () => {
    ;[
        ownerCookie,
        memberCookie,
    ] = await seedTestingCookies()
    isolatedOwnerCookie = await seedTestingCookieForOrganization(
        TEST_OWNER_USER_ID,
        TEST_ISOLATED_ORGANIZATION_ID,
        { db: dbClient(env.LOANMSBOFC_D1) },
    )
})

describe('System settings API', () => {
    it('returns safe virtual defaults until an owner saves the first version', async () => {
        const [
            owner,
            member,
        ] = await Promise.all([
            getTestingRequest('/api/settings/current', { cookie: ownerCookie }),
            getTestingRequest('/api/settings/current', {
                cookie: memberCookie,
            }),
        ])
        const ownerJson = await owner.json<TApiResponseOk<TSystemSettings>>()

        expect(owner.status).toBe(200)
        expect(ownerJson.data).toMatchObject({
            defaultLoanProductPublicId: null,
            defaultPaymentFrequency: 'DAILY',
            version: 0,
        })
        expect(member.status).toBe(403)
    })

    it('saves one audited version, replays safely, and rejects stale or changed retries', async () => {
        const idempotencyKey = uuidv7()
        const body = updateBody(idempotencyKey)
        const first = await postTestingRequest('/api/settings/update', {
            body,
            cookie: ownerCookie,
        })
        const firstJson = await first.json<TApiResponseOk<TSystemSettings>>()
        const replay = await postTestingRequest('/api/settings/update', {
            body,
            cookie: ownerCookie,
        })
        const changedReplay = await postTestingRequest('/api/settings/update', {
            body: {
                ...body,
                allowAdvancePayments: true,
            },
            cookie: ownerCookie,
        })
        const stale = await postTestingRequest('/api/settings/update', {
            body: updateBody(uuidv7()),
            cookie: ownerCookie,
        })
        const persisted = await dbClient(env.LOANMSBOFC_D1)
            .select({
                current: dbSchema.systemSettings.isCurrent,
                version: dbSchema.systemSettings.version,
            })
            .from(dbSchema.systemSettings)
            .where(
                and(
                    eq(
                        dbSchema.systemSettings.organizationId,
                        TEST_PRIMARY_ORGANIZATION_ID,
                    ),
                    eq(dbSchema.systemSettings.version, 1),
                ),
            )

        expect(first.status).toBe(200)
        expect(first.headers.get('audit-event-recorded')).toBe('true')
        expect(firstJson.data).toMatchObject({
            allowAdvancePayments: false,
            borrowerTagPolicy: {
                daily: { scammerMinimumMissedInstallments: 6 },
            },
            enabledPaymentFrequencies: [
                'DAILY',
                'WEEKLY',
            ],
            version: 1,
        })
        expect(replay.status).toBe(200)
        expect(replay.headers.get('audit-event-recorded')).toBeNull()
        expect(changedReplay.status).toBe(409)
        expect(stale.status).toBe(409)
        expect(persisted).toEqual([
            {
                current: true,
                version: 1,
            },
        ])
    })

    it('keeps settings scoped to the active organization', async () => {
        const isolated = await getTestingRequest('/api/settings/current', {
            cookie: isolatedOwnerCookie,
        })
        const isolatedJson =
            await isolated.json<TApiResponseOk<TSystemSettings>>()
        const staleError = await postTestingRequest('/api/settings/update', {
            body: updateBody(uuidv7()),
            cookie: ownerCookie,
        })
        const staleErrorJson = await staleError.json<TApiResponseError>()

        expect(isolated.status).toBe(200)
        expect(isolatedJson.data.version).toBe(0)
        expect(staleError.status).toBe(409)
        expect(staleErrorJson.error.code).toBe('CONFLICT')
    })
})
