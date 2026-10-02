import { dbClient, dbSchema } from '@hyperion/database/d1'
import type { TApiResponseError } from '@hyperion/types/shared'
import { makeSignature } from 'better-auth/crypto'
import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { and, desc, eq, gt, inArray, like } from 'drizzle-orm'
import { nanoid } from 'nanoid'

import { getSessionCookieName } from '../src/auth/cookies.js'
import app from '../src/core/index.js'

type QueryValue =
    | string
    | number
    | boolean
    | readonly (string | number | boolean)[]
    | undefined

export const TEST_PRIMARY_ORGANIZATION_ID = '__TEST-ORG_PRIMARY'
export const TEST_PRIMARY_ORGANIZATION_SLUG = '__test-primary'
export const TEST_ISOLATED_ORGANIZATION_ID = '__TEST-ORG_ISOLATED'
export const TEST_ISOLATED_ORGANIZATION_SLUG = '__test-isolated'
export const TEST_SHARED_KEY_VALUE_NAME = '__TEST-tenantIsolation.sharedSetting'
export const TEST_TENANT_UPLOAD_ID = 'TESTTenantUploadIsolated001'
export const TEST_TENANT_OBJECT_STORAGE_ID = 'TESTTenantObjectIsolated000000001'
export const TEST_DEFAULT_CLIENT_IP = '192.0.2.1'

export const TEST_OWNER_USER_ID = '__TEST-USER_OWNER'
export const TEST_ADMINISTRATOR_USER_ID = '__TEST-USER_ADMIN'
export const TEST_MEMBER_USER_ID = '__TEST-USER_MEMBER'
export const TEST_AUTH_MUTABLE_USER_ID = '__TEST-USER_AUTH_MUTABLE'
export const TEST_PASSWORD_MUTABLE_USER_ID = '__TEST-USER_PASSWORD_MUTABLE'
export const TEST_NO_CREDENTIAL_USER_ID = '__TEST-USER_NO_CREDENTIAL'
export const TEST_LOCKED_USER_ID = '__TEST-USER_LOCKED'

export const TEST_OWNER_USER_PUBLIC_ID = '019936e2-b837-7000-8000-000000000101'
export const TEST_ADMINISTRATOR_USER_PUBLIC_ID =
    '019936e2-b837-7000-8000-000000000102'
export const TEST_MEMBER_USER_PUBLIC_ID = '019936e2-b837-7000-8000-000000000103'
export const TEST_AUTH_MUTABLE_USER_PUBLIC_ID =
    '019936e2-b837-7000-8000-000000000105'
export const TEST_PASSWORD_MUTABLE_USER_PUBLIC_ID =
    '019936e2-b837-7000-8000-000000000106'
export const TEST_NO_CREDENTIAL_USER_PUBLIC_ID =
    '019936e2-b837-7000-8000-000000000108'

export const TEST_OWNER_USERNAME = '__test_owner'
export const TEST_ADMINISTRATOR_USERNAME = '__test_admin'
export const TEST_MEMBER_USERNAME = '__test_member'
export const TEST_AUTH_MUTABLE_USERNAME = '__test_auth_mutable'
export const TEST_LOCKED_USERNAME = '__test_locked'
export const TEST_MULTI_ROLE_USERNAME = '__test_multi_role'
export const TEST_NO_ATTRIBUTE_USERNAME = '__test_no_attribute'
export const TEST_PASSWORD_MUTABLE_USERNAME = '__test_password_mutable'

export const TEST_OWNER_EMAIL = 'owner@test.hyperion.app'
export const TEST_MEMBER_EMAIL = 'member@test.hyperion.app'
export const TEST_AUTH_MUTABLE_EMAIL = 'auth.mutable@test.hyperion.app'
export const TEST_NO_ATTRIBUTE_EMAIL = 'no.attribute@test.hyperion.app'
export const TEST_LOCKED_EMAIL = 'locked@test.hyperion.app'

/**
 * @description
 * Builds a request path with URL-encoded query parameters. Array values are
 * appended as repeated query keys so GET endpoint tests match Hono's query
 * parser behavior.
 */
export const buildQueryPath = (
    path: string,
    query?: Record<string, QueryValue>,
) => {
    const params = new URLSearchParams()

    for (const [
        key,
        value,
    ] of Object.entries(query ?? {})) {
        if (value === undefined) continue

        if (Array.isArray(value)) {
            for (const item of value) params.append(key, String(item))
            continue
        }

        params.set(key, String(value))
    }

    const queryString = params.toString()
    return queryString ? `${path}?${queryString}` : path
}
/**
 * @description
 * Generates a unique name by combining a prefix with the current timestamp
 * and a short random alphanumeric suffix. Useful for seeding test records
 * that must not collide across parallel test runs.
 */
export const generateUniqueName = (prefix: string): string =>
    `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`

/**
 * @description
 * Sends a GET request against the backoffice app with the configured frontend
 * origin header and optional session cookie.
 */
export const getTestingRequest = async (
    path: string,
    options: {
        cookie?: string
        query?: Record<string, QueryValue>
    } = {},
): Promise<Response> => {
    return app.request(
        buildQueryPath(path, options.query),
        {
            method: 'GET',
            headers: {
                origin: env.URL_FRONTEND,
                ...(options.cookie ? { cookie: options.cookie } : {}),
            },
        },
        env,
    )
}

/**
 * @description
 * Sends a JSON QUERY request against the backoffice app with the configured
 * frontend origin header and optional session cookie.
 */
export const queryTestingRequest = async (
    path: string,
    json: unknown,
    options: { cookie?: string } = {},
): Promise<Response> => {
    return app.request(
        path,
        {
            method: 'QUERY',
            headers: {
                origin: env.URL_FRONTEND,
                'content-type': 'application/json',
                ...(options.cookie ? { cookie: options.cookie } : {}),
            },
            body: JSON.stringify(json),
        },
        env,
    )
}

/**
 * @description
 * Sends a JSON POST request against the backoffice app with the configured
 * frontend origin header, optional session cookie, and optional trusted client
 * address for authentication policy coverage.
 */
export const postTestingRequest = async (
    path: string,
    options: {
        body?: Record<string, unknown>
        cookie?: string
        ipAddress?: string
        waitForCfExecutionContext?: boolean
    } = {},
): Promise<Response> => {
    const executionContext = options.waitForCfExecutionContext
        ? createExecutionContext()
        : undefined
    const response = await app.request(
        path,
        {
            method: 'POST',
            headers: {
                origin: env.URL_FRONTEND,
                'content-type': 'application/json',
                ...(options.cookie ? { cookie: options.cookie } : {}),
                'cf-connecting-ip': options.ipAddress ?? TEST_DEFAULT_CLIENT_IP,
            },
            body: JSON.stringify(options.body ?? {}),
        },
        env,
        executionContext,
    )
    if (executionContext) await waitOnExecutionContext(executionContext)
    return response
}

/**
 * @description
 * Intercepts a password reset token for the given user ID.
 *
 * Reads the newest unexpired matching D1 verification record.
 */
export const interceptPasswordResetToken = async (
    userId: string,
): Promise<string> => {
    const { verification } = dbSchema

    const db = dbClient(env.HYPERIONBOFC_D1)

    const records = await db
        .select({
            identifier: verification.identifier,
            value: verification.value,
        })
        .from(verification)
        .where(
            and(
                eq(verification.value, userId),
                like(verification.identifier, 'reset-password:%'),
                gt(verification.expiresAt, new Date()),
            ),
        )
        .orderBy(desc(verification.createdAt), desc(verification.id))
        .limit(1)

    if (records.length > 0) {
        return records[0].identifier.replace('reset-password:', '')
    }

    throw new Error(
        `No unexpired password reset token found for user "${userId}" in D1.`,
    )
}

/** Signs in one seeded identity for tests that exercise authentication itself. */
export const signInTestingUser = async (
    accountId:
        | typeof TEST_OWNER_USERNAME
        | typeof TEST_ADMINISTRATOR_USERNAME
        | typeof TEST_MEMBER_USERNAME = TEST_MEMBER_USERNAME,
) => {
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
                accountId,
                password: 'P@ssw0rd1234',
            }),
        },
        env,
    )

    return response.headers.getSetCookie().join('; ')
}

/**
 * Seeds a Better Auth D1 session for a specific organization.
 */
export const seedTestingCookieForOrganization = async (
    userId: string,
    organizationId: string,
    options: {
        db?: ReturnType<typeof dbClient>
        sessionAgeSeconds?: number
    } = {},
): Promise<string> => {
    const db = options.db ?? dbClient(env.HYPERIONBOFC_D1)
    const { organization, session: sessionTable, user } = dbSchema

    const [seededUser] = await db.select().from(user).where(eq(user.id, userId))
    const [activeOrganization] = await db
        .select({ id: organization.id })
        .from(organization)
        .where(eq(organization.id, organizationId))

    if (!seededUser || !activeOrganization) {
        throw new Error(
            `Authentication seed data is incomplete for "${userId}" in "${organizationId}".`,
        )
    }

    const expiresIn = Number(env.SESSION_EXPIRATION)
    const cookieName = getSessionCookieName(env.ENVIRONMENT)
    const now = new Date()
    const sessionTime = new Date(
        now.getTime() - (options.sessionAgeSeconds ?? 0) * 1000,
    )
    const expiresAt = new Date(sessionTime.getTime() + expiresIn * 1000)
    const token = nanoid(32)
    const sessionRecord = {
        id: nanoid(),
        token,
        userId,
        expiresAt,
        ipAddress: '',
        userAgent: '',
        activeOrganizationId: activeOrganization.id,
        createdAt: sessionTime,
        updatedAt: sessionTime,
    }

    await db.insert(sessionTable).values(sessionRecord)

    const signature = await makeSignature(token, env.BETTER_AUTH_SECRET)
    const signedToken = encodeURIComponent(`${token}.${signature}`)

    return `${cookieName}=${signedToken}`
}

/**
 * Seeds Better Auth D1 sessions for the shared owner, member, and
 * administrator identities. The tuple order is owner, member, administrator.
 */
export const seedTestingCookies = async (): Promise<
    readonly [
        string,
        string,
        string,
    ]
> => {
    const db = dbClient(env.HYPERIONBOFC_D1)
    const { organization, session: sessionTable, user } = dbSchema

    try {
        const users = await db
            .select()
            .from(user)
            .where(
                inArray(user.id, [
                    TEST_OWNER_USER_ID,
                    TEST_ADMINISTRATOR_USER_ID,
                    TEST_MEMBER_USER_ID,
                ]),
            )
        const [activeOrganization] = await db
            .select({ id: organization.id })
            .from(organization)
            .where(eq(organization.id, TEST_PRIMARY_ORGANIZATION_ID))

        if (users.length !== 3 || !activeOrganization)
            throw new Error('Shared authentication seed data is incomplete.')

        const usersById = new Map(
            users.map((record) => [
                record.id,
                record,
            ]),
        )
        const expiresIn = Number(env.SESSION_EXPIRATION)
        const cookieName = getSessionCookieName(env.ENVIRONMENT)

        const cookies = await Promise.all(
            [
                TEST_OWNER_USER_ID,
                TEST_MEMBER_USER_ID,
                TEST_ADMINISTRATOR_USER_ID,
            ].map(async (userId) => {
                const seededUser = usersById.get(userId)
                if (!seededUser)
                    throw new Error(`Seeded user "${userId}" was not found.`)

                const now = new Date()
                const expiresAt = new Date(now.getTime() + expiresIn * 1000)
                const token = nanoid(32)
                const sessionRecord = {
                    id: nanoid(),
                    token,
                    userId,
                    expiresAt,
                    ipAddress: '',
                    userAgent: '',
                    activeOrganizationId: activeOrganization.id,
                    createdAt: now,
                    updatedAt: now,
                }

                await db.insert(sessionTable).values(sessionRecord)

                const signature = await makeSignature(
                    token,
                    env.BETTER_AUTH_SECRET,
                )
                const signedToken = encodeURIComponent(`${token}.${signature}`)

                return `${cookieName}=${signedToken}`
            }),
        )

        return [
            cookies[0],
            cookies[1],
            cookies[2],
        ]
    } finally {
        // D1 clients do not require teardown.
    }
}

/**
 * @description
 * Extract the first error message from validatorIssues for DATA_VALIDATION errors.
 */
export const unpackError = (responseData: TApiResponseError): string => {
    if (
        responseData.error.code === 'DATA_VALIDATION' &&
        responseData.error.validatorIssues?.length
    ) {
        return responseData.error.validatorIssues[0].message
    }

    return responseData.error.message
}
