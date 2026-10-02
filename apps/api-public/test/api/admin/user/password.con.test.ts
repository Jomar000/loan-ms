import type { TApiResponseError } from '@loanms/types/shared'
import { env } from 'cloudflare:workers'
import { beforeAll, describe, expect, it } from 'vitest'

import app from '../../../../src/core/index.js'
import {
    seedTestingCookies,
    TEST_MEMBER_USER_PUBLIC_ID,
} from '../../../utilities.js'

const TEST_MISSING_USER_PUBLIC_ID = '019936e2-b837-7000-8000-fffffffffffe'

let privilegedCookie: string
let standardCookie: string

beforeAll(async () => {
    ;[
        privilegedCookie,
        standardCookie,
    ] = await seedTestingCookies()
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
    describe('Concurrent-project tests', () => {
        /**
         * @description
         * Authentication & Authorization Guard
         */
        describe('Authentication & Authorization Guard', () => {
            it('Unauthenticated request to /resetRequest should return 401.', async () => {
                const response = await app.request(
                    '/api/admin/user/password/resetRequest',
                    {
                        method: 'POST',
                        headers: {
                            origin: env.URL_FRONTEND,
                            'content-type': 'application/json',
                        },
                        body: JSON.stringify({
                            userPublicId: TEST_MEMBER_USER_PUBLIC_ID,
                        }),
                    },
                    env,
                )

                const responseData = await response.json<TApiResponseError>()

                expect(response.status).toBe(401)
                expect(responseData).toHaveProperty('error')
                expect(responseData.error.code).toBe('UNAUTHORIZED')
            })

            it('Unauthenticated request to /reset should return 401.', async () => {
                const response = await app.request(
                    '/api/admin/user/password/reset',
                    {
                        method: 'POST',
                        headers: {
                            origin: env.URL_FRONTEND,
                            'content-type': 'application/json',
                        },
                        body: JSON.stringify({
                            userPublicId: TEST_MEMBER_USER_PUBLIC_ID,
                            newPassword: 'N3wP@ssw0rd1234',
                        }),
                    },
                    env,
                )

                const responseData = await response.json<TApiResponseError>()

                expect(response.status).toBe(401)
                expect(responseData).toHaveProperty('error')
                expect(responseData.error.code).toBe('UNAUTHORIZED')
            })

            it('Non-admin request to /resetRequest should return 403.', async () => {
                const response = await app.request(
                    '/api/admin/user/password/resetRequest',
                    {
                        method: 'POST',
                        headers: {
                            origin: env.URL_FRONTEND,
                            'content-type': 'application/json',
                            cookie: standardCookie,
                        },
                        body: JSON.stringify({
                            userPublicId: TEST_MEMBER_USER_PUBLIC_ID,
                        }),
                    },
                    env,
                )

                const responseData = await response.json<TApiResponseError>()

                expect(response.status).toBe(403)
                expect(responseData).toHaveProperty('error')
                expect(responseData.error.code).toBe('FORBIDDEN')
            })

            it('Non-admin request to /reset should return 403.', async () => {
                const response = await app.request(
                    '/api/admin/user/password/reset',
                    {
                        method: 'POST',
                        headers: {
                            origin: env.URL_FRONTEND,
                            'content-type': 'application/json',
                            cookie: standardCookie,
                        },
                        body: JSON.stringify({
                            userPublicId: TEST_MEMBER_USER_PUBLIC_ID,
                            newPassword: 'N3wP@ssw0rd1234',
                        }),
                    },
                    env,
                )

                const responseData = await response.json<TApiResponseError>()

                expect(response.status).toBe(403)
                expect(responseData).toHaveProperty('error')
                expect(responseData.error.code).toBe('FORBIDDEN')
            })
        })

        /**
         * @description
         * Validation
         */
        describe('Validation', () => {
            it.each([
                '/api/admin/user/password/resetRequest',
                '/api/admin/user/password/reset',
            ])('Rejects an internal user ID for %s.', async (path) => {
                const response = await app.request(
                    path,
                    {
                        method: 'POST',
                        headers: {
                            origin: env.URL_FRONTEND,
                            'content-type': 'application/json',
                            cookie: privilegedCookie,
                        },
                        body: JSON.stringify({
                            userPublicId: '__TEST-USER_MEMBER',
                            newPassword: 'N3wP@ssw0rd1234',
                        }),
                    },
                    env,
                )

                expect(response.status).toBe(400)
            })

            it('Reset request with missing userPublicId should return 400.', async () => {
                const response = await app.request(
                    '/api/admin/user/password/resetRequest',
                    {
                        method: 'POST',
                        headers: {
                            origin: env.URL_FRONTEND,
                            'content-type': 'application/json',
                            cookie: privilegedCookie,
                        },
                        body: JSON.stringify({}),
                    },
                    env,
                )

                const responseData = await response.json<TApiResponseError>()

                expect(response.status).toBe(400)
                expect(responseData).toHaveProperty('error')
            })

            it('Reset with missing userPublicId should return 400.', async () => {
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
                            newPassword: 'N3wP@ssw0rd1234',
                        }),
                    },
                    env,
                )

                const responseData = await response.json<TApiResponseError>()

                expect(response.status).toBe(400)
                expect(responseData).toHaveProperty('error')
            })

            it('Reset with missing newPassword should return 400.', async () => {
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
                            userPublicId: TEST_MEMBER_USER_PUBLIC_ID,
                        }),
                    },
                    env,
                )

                const responseData = await response.json<TApiResponseError>()

                expect(response.status).toBe(400)
                expect(responseData).toHaveProperty('error')
            })

            it('Reset with weak newPassword should return 400.', async () => {
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
                            userPublicId: TEST_MEMBER_USER_PUBLIC_ID,
                            newPassword: 'weak',
                        }),
                    },
                    env,
                )

                const responseData = await response.json<TApiResponseError>()

                expect(response.status).toBe(400)
                expect(responseData).toHaveProperty('error')
            })
        })

        /**
         * @description
         * Reset Request Validations
         */
        describe('Reset Request Validations', () => {
            it('Reset request for a non-existent user should return 404.', async () => {
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
                            userPublicId: TEST_MISSING_USER_PUBLIC_ID,
                        }),
                    },
                    env,
                )

                const responseData = await response.json<TApiResponseError>()

                expect(response.status).toBe(404)
                expect(responseData).toHaveProperty('error')
                expect(responseData.error.message).toBe('User ID not found.')
            })
        })

        /**
         * @description
         * Direct Reset Validations
         */
        describe('Direct Reset Validations', () => {
            it('Direct reset for a non-existent user should return 404.', async () => {
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
                            userPublicId: TEST_MISSING_USER_PUBLIC_ID,
                            newPassword: 'N3wP@ssw0rd1234',
                        }),
                    },
                    env,
                )

                const responseData = await response.json<TApiResponseError>()

                expect(response.status).toBe(404)
                expect(responseData).toHaveProperty('error')
                expect(responseData.error.message).toBe('User ID not found.')
            })
        })
    })
})

// =============================================================================
// END OF BASE TEMPLATE TESTS - FORK-SPECIFIC TESTS MUST BE ADDED BELOW
// =============================================================================
