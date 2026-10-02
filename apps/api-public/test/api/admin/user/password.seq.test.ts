import { dbClient, dbSchema } from '@loanms/database/d1'
import type { TApiResponseError, TApiResponseOk } from '@loanms/types/shared'
import { env } from 'cloudflare:workers'
import { and, desc, eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'

import app from '../../../../src/core/index.js'
import {
    interceptPasswordResetToken,
    seedTestingCookies,
    TEST_DEFAULT_CLIENT_IP,
    TEST_NO_CREDENTIAL_USER_PUBLIC_ID,
    TEST_PASSWORD_MUTABLE_USERNAME,
    TEST_PASSWORD_MUTABLE_USER_ID,
    TEST_PASSWORD_MUTABLE_USER_PUBLIC_ID,
    TEST_PRIMARY_ORGANIZATION_SLUG,
} from '../../../utilities.js'

let privilegedCookie: string

let db: ReturnType<typeof dbClient>

beforeAll(async () => {
    db = dbClient(env.LOANMSPUB_D1)
    ;[privilegedCookie] = await seedTestingCookies()
})

/**
 * @description
 * Admin Password Endpoint
 *
 * Route: /api/admin/user/password
 *
 * Test accounts from test seed data:
 * - TEST_OWNER_USER_ID (owner) — privileged
 * - TEST_ADMINISTRATOR_USER_ID (admin)
 * - TEST_MEMBER_USER_ID (member) — standard
 * - TEST_LOCKED_USER_ID (locked member)
 */

describe('Admin User Password Endpoint', () => {
    describe('Sequential Tests', () => {
        /**
         * @description
         * Reset Request (Email OTP Flow)
         */
        describe('Reset Request Flow', () => {
            it('Reset request for a valid organization member should pass.', async () => {
                const response = await app.request(
                    '/api/admin/user/password/resetRequest',
                    {
                        method: 'POST',
                        headers: {
                            origin: env.URL_FRONTEND,
                            'content-type': 'application/json',
                            cookie: privilegedCookie,
                        },
                        body: JSON.stringify({
                            userPublicId: TEST_PASSWORD_MUTABLE_USER_PUBLIC_ID,
                        }),
                    },
                    env,
                )

                const responseData = await response.json<TApiResponseOk<null>>()

                expect(response.status).toBe(200)
                expect(response.headers.get('Audit-Event-Recorded')).toBe(
                    'true',
                )
                expect(responseData.success).toBe(true)
                expect(responseData.data).toBeNull()

                const [auditTrailEntry] = await db
                    .select({ records: dbSchema.auditTrail.records })
                    .from(dbSchema.auditTrail)
                    .where(
                        and(
                            eq(
                                dbSchema.auditTrail.component,
                                'admin.user.password',
                            ),
                            eq(dbSchema.auditTrail.action, 'resetRequest'),
                        ),
                    )
                    .orderBy(desc(dbSchema.auditTrail.id))
                    .limit(1)

                expect(auditTrailEntry.records).toEqual([
                    {
                        entityType: 'user',
                        id: TEST_PASSWORD_MUTABLE_USER_PUBLIC_ID,
                        table: 'user',
                    },
                ])
            })
        })

        /**
         * @description
         * Direct Reset (Admin sets password directly)
         */
        describe('Direct Reset Flow', () => {
            it('Direct password reset for a valid organization member should pass.', async () => {
                const response = await app.request(
                    '/api/admin/user/password/reset',
                    {
                        method: 'POST',
                        headers: {
                            origin: env.URL_FRONTEND,
                            'content-type': 'application/json',
                            cookie: privilegedCookie,
                        },
                        body: JSON.stringify({
                            userPublicId: TEST_PASSWORD_MUTABLE_USER_PUBLIC_ID,
                            newPassword: 'N3wP@ssw0rd1234',
                        }),
                    },
                    env,
                )

                const responseData = await response.json<TApiResponseOk<null>>()

                expect(response.status).toBe(200)
                expect(response.headers.get('Audit-Event-Recorded')).toBe(
                    'true',
                )
                expect(responseData.success).toBe(true)
                expect(responseData.data).toBeNull()
            })

            it('Direct password reset should write a safe account audit trail record.', async () => {
                const { account, auditTrail } = dbSchema

                const [credential] = await db
                    .select({ id: account.id })
                    .from(account)
                    .where(
                        and(
                            eq(account.userId, TEST_PASSWORD_MUTABLE_USER_ID),
                            eq(
                                account.accountId,
                                TEST_PASSWORD_MUTABLE_USER_ID,
                            ),
                            eq(account.providerId, 'credential'),
                        ),
                    )

                const [auditTrailEntry] = await db
                    .select({ records: auditTrail.records })
                    .from(auditTrail)
                    .where(
                        and(
                            eq(auditTrail.component, 'admin.user.password'),
                            eq(auditTrail.action, 'reset'),
                        ),
                    )
                    .orderBy(desc(auditTrail.id))
                    .limit(1)

                expect(credential).toBeTruthy()
                expect(auditTrailEntry.records).toEqual([
                    {
                        table: 'account',
                        entityType: 'account',
                        id: credential.id,
                    },
                ])
            })

            it('Sign-in with the new password after direct reset should pass.', async () => {
                const response = await app.request(
                    '/api/auth/signIn/username',
                    {
                        method: 'POST',
                        headers: {
                            origin: env.URL_FRONTEND,
                            'content-type': 'application/json',
                            'cf-connecting-ip': TEST_DEFAULT_CLIENT_IP,
                        },
                        body: JSON.stringify({
                            organizationId: TEST_PRIMARY_ORGANIZATION_SLUG,
                            accountId: TEST_PASSWORD_MUTABLE_USERNAME,
                            password: 'N3wP@ssw0rd1234',
                        }),
                    },
                    env,
                )

                const responseData =
                    await response.json<TApiResponseOk<unknown>>()

                expect(response.status).toBe(200)
                expect(response.headers.get('set-cookie')).toBeTruthy()
                expect(responseData).toHaveProperty('data')
            })

            it('Sign-in with the old password after direct reset should fail.', async () => {
                const response = await app.request(
                    '/api/auth/signIn/username',
                    {
                        method: 'POST',
                        headers: {
                            origin: env.URL_FRONTEND,
                            'content-type': 'application/json',
                            'cf-connecting-ip': TEST_DEFAULT_CLIENT_IP,
                        },
                        body: JSON.stringify({
                            organizationId: TEST_PRIMARY_ORGANIZATION_SLUG,
                            accountId: TEST_PASSWORD_MUTABLE_USERNAME,
                            password: 'P@ssw0rd1234',
                        }),
                    },
                    env,
                )

                const responseData = await response.json<TApiResponseError>()

                expect(response.status).toBe(422)
                expect(responseData).toHaveProperty('error')
                expect(responseData.error.message).toBe(
                    'Invalid credentials provided.',
                )
            })

            it('Restore original password after test.', async () => {
                const response = await app.request(
                    '/api/admin/user/password/reset',
                    {
                        method: 'POST',
                        headers: {
                            origin: env.URL_FRONTEND,
                            'content-type': 'application/json',
                            cookie: privilegedCookie,
                        },
                        body: JSON.stringify({
                            userPublicId: TEST_PASSWORD_MUTABLE_USER_PUBLIC_ID,
                            newPassword: 'P@ssw0rd1234',
                        }),
                    },
                    env,
                )

                const responseData = await response.json<TApiResponseOk<null>>()

                expect(response.status).toBe(200)
                expect(responseData.success).toBe(true)
            })

            it('Direct password reset for a user without credential account should return 404.', async () => {
                const response = await app.request(
                    '/api/admin/user/password/reset',
                    {
                        method: 'POST',
                        headers: {
                            origin: env.URL_FRONTEND,
                            'content-type': 'application/json',
                            cookie: privilegedCookie,
                        },
                        body: JSON.stringify({
                            userPublicId: TEST_NO_CREDENTIAL_USER_PUBLIC_ID,
                            newPassword: 'N3wP@ssw0rd1234',
                        }),
                    },
                    env,
                )

                const responseData = await response.json<TApiResponseError>()

                expect(response.status).toBe(404)
                expect(responseData.error.code).toBe(
                    'ACCOUNT_CREDENTIAL_NOT_FOUND',
                )
            })
        })

        describe('Full Password Reset Flow (OTP Interception)', () => {
            let interceptedToken: string

            beforeAll(async () => {
                const response = await app.request(
                    '/api/admin/user/password/resetRequest',
                    {
                        method: 'POST',
                        headers: {
                            origin: env.URL_FRONTEND,
                            'content-type': 'application/json',
                            cookie: privilegedCookie,
                        },
                        body: JSON.stringify({
                            userPublicId: TEST_PASSWORD_MUTABLE_USER_PUBLIC_ID,
                        }),
                    },
                    env,
                )

                const responseData = await response.json<TApiResponseOk<null>>()

                expect(response.status).toBe(200)
                expect(responseData.success).toBe(true)
                expect(responseData.data).toBeNull()

                interceptedToken = await interceptPasswordResetToken(
                    TEST_PASSWORD_MUTABLE_USER_ID,
                )
                expect(interceptedToken).toBeTruthy()
            })

            it('Step 1: Complete password reset using the intercepted token.', async () => {
                const response = await app.request(
                    '/api/auth/password/reset',
                    {
                        method: 'POST',
                        headers: {
                            origin: env.URL_FRONTEND,
                            'content-type': 'application/json',
                            'cf-connecting-ip': TEST_DEFAULT_CLIENT_IP,
                        },
                        body: JSON.stringify({
                            token: interceptedToken,
                            newPassword: 'R3set@P@ssw0rd5678',
                        }),
                    },
                    env,
                )

                const responseData = await response.json<TApiResponseOk<null>>()

                expect(response.status).toBe(200)
                expect(responseData.success).toBe(true)
                expect(responseData.data).toBeNull()
            })

            it('Step 2: Sign-in with the new password should pass.', async () => {
                const response = await app.request(
                    '/api/auth/signIn/username',
                    {
                        method: 'POST',
                        headers: {
                            origin: env.URL_FRONTEND,
                            'content-type': 'application/json',
                            'cf-connecting-ip': TEST_DEFAULT_CLIENT_IP,
                        },
                        body: JSON.stringify({
                            organizationId: TEST_PRIMARY_ORGANIZATION_SLUG,
                            accountId: TEST_PASSWORD_MUTABLE_USERNAME,
                            password: 'R3set@P@ssw0rd5678',
                        }),
                    },
                    env,
                )

                const responseData =
                    await response.json<TApiResponseOk<unknown>>()

                expect(response.status).toBe(200)
                expect(response.headers.get('set-cookie')).toBeTruthy()
                expect(responseData).toHaveProperty('data')
            })

            it('Step 3: Sign-in with the old password should fail.', async () => {
                const response = await app.request(
                    '/api/auth/signIn/username',
                    {
                        method: 'POST',
                        headers: {
                            origin: env.URL_FRONTEND,
                            'content-type': 'application/json',
                            'cf-connecting-ip': TEST_DEFAULT_CLIENT_IP,
                        },
                        body: JSON.stringify({
                            organizationId: TEST_PRIMARY_ORGANIZATION_SLUG,
                            accountId: TEST_PASSWORD_MUTABLE_USERNAME,
                            password: 'P@ssw0rd1234',
                        }),
                    },
                    env,
                )

                const responseData = await response.json<TApiResponseError>()

                expect(response.status).toBe(422)
                expect(responseData).toHaveProperty('error')
                expect(responseData.error.message).toBe(
                    'Invalid credentials provided.',
                )
            })

            it('Step 4: Restore original password.', async () => {
                /**
                 * @description
                 * Use admin direct reset to restore the original password
                 * so other tests are not affected.
                 */
                const response = await app.request(
                    '/api/admin/user/password/reset',
                    {
                        method: 'POST',
                        headers: {
                            origin: env.URL_FRONTEND,
                            'content-type': 'application/json',
                            cookie: privilegedCookie,
                        },
                        body: JSON.stringify({
                            userPublicId: TEST_PASSWORD_MUTABLE_USER_PUBLIC_ID,
                            newPassword: 'P@ssw0rd1234',
                        }),
                    },
                    env,
                )

                const responseData = await response.json<TApiResponseOk<null>>()

                expect(response.status).toBe(200)
                expect(responseData.success).toBe(true)
            })
        })
    })
})

// =============================================================================
// END OF BASE TEMPLATE TESTS - FORK-SPECIFIC TESTS MUST BE ADDED BELOW
// =============================================================================
