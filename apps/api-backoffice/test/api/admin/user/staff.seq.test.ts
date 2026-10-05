import { dbClient, dbSchema } from '@loanms/database/d1'
import type { TApiResponseOk } from '@loanms/types/shared'
import { env } from 'cloudflare:workers'
import { and, eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'

import {
    postTestingRequest,
    queryTestingRequest,
    seedTestingCookies,
    TEST_MEMBER_USER_ID,
    TEST_MEMBER_USER_PUBLIC_ID,
    TEST_PRIMARY_ORGANIZATION_ID,
} from '../../../utilities.js'

type TStaff = {
    isLocked: boolean
    roles: string[]
    userPublicId: string
}

let memberCookie: string
let ownerCookie: string

beforeAll(async () => {
    ;[
        ownerCookie,
        memberCookie,
    ] = await seedTestingCookies()
})

describe('Staff administration API', () => {
    it('allows only an owner to change a tenant-local staff role and access state', async () => {
        const denied = await queryTestingRequest(
            '/api/admin/user/staff/readMany',
            {},
            { cookie: memberCookie },
        )
        const list = await queryTestingRequest(
            '/api/admin/user/staff/readMany',
            {},
            { cookie: ownerCookie },
        )
        const listJson = await list.json<TApiResponseOk<TStaff[]>>()
        const role = await postTestingRequest('/api/admin/user/staff/role', {
            body: {
                role: 'admin',
                userPublicId: TEST_MEMBER_USER_PUBLIC_ID,
            },
            cookie: ownerCookie,
        })
        const access = await postTestingRequest(
            '/api/admin/user/staff/access',
            {
                body: {
                    isLocked: true,
                    userPublicId: TEST_MEMBER_USER_PUBLIC_ID,
                },
                cookie: ownerCookie,
            },
        )
        const db = dbClient(env.LOANMSBOFC_D1)
        const [membership] = await db
            .select({ role: dbSchema.member.role })
            .from(dbSchema.member)
            .where(
                and(
                    eq(
                        dbSchema.member.organizationId,
                        TEST_PRIMARY_ORGANIZATION_ID,
                    ),
                    eq(dbSchema.member.userId, TEST_MEMBER_USER_ID),
                ),
            )
        const [attribute] = await db
            .select({ isLocked: dbSchema.userAttribute.isLocked })
            .from(dbSchema.userAttribute)
            .where(eq(dbSchema.userAttribute.userId, TEST_MEMBER_USER_ID))

        expect(denied.status).toBe(403)
        expect(list.status).toBe(200)
        expect(listJson.data).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    isLocked: false,
                    userPublicId: TEST_MEMBER_USER_PUBLIC_ID,
                }),
            ]),
        )
        expect(role.status).toBe(200)
        expect(role.headers.get('audit-event-recorded')).toBe('true')
        expect(access.status).toBe(200)
        expect(access.headers.get('audit-event-recorded')).toBe('true')
        expect(membership).toEqual({ role: 'admin' })
        expect(attribute).toEqual({ isLocked: true })
    })
})
