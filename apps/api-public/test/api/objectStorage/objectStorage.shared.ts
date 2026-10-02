import { dbClient, dbSchema } from '@hyperion/database/d1'
import type {
    TApiResponseError,
    TApiResponseOk,
    TApiResponsePaginatedOk,
} from '@hyperion/types/shared'
import { env } from 'cloudflare:workers'
import { eq } from 'drizzle-orm'
import { v7 as uuidv7 } from 'uuid'
import { beforeAll, describe, expect, it } from 'vitest'

import app from '../../../src/core/index.js'
import {
    getTestingRequest,
    postTestingRequest,
    queryTestingRequest,
    seedTestingCookieForOrganization,
    seedTestingCookies,
    TEST_ISOLATED_ORGANIZATION_ID,
    TEST_OWNER_USER_ID,
    TEST_TENANT_OBJECT_STORAGE_ID,
    TEST_TENANT_UPLOAD_ID,
} from '../../utilities.js'

let privilegedCookie: string
let standardCookie: string

type TObjectStorageRoute = 'download' | 'upload' | 'uploadAttachment'

const routeIt = (
    activeRoute: TObjectStorageRoute,
    ownerRoute: TObjectStorageRoute,
    name: string,
    handler: () => Promise<void>,
) => {
    if (activeRoute === ownerRoute) it(name, handler)
}

const routeDescribe = (
    activeRoute: TObjectStorageRoute,
    ownerRoute: TObjectStorageRoute,
    name: string,
    handler: () => void,
) => {
    if (activeRoute === ownerRoute) describe(name, handler)
}

beforeAll(async () => {
    ;[
        privilegedCookie,
        standardCookie,
    ] = await seedTestingCookies()
})

const createHashSha256 = () => crypto.randomUUID().replaceAll('-', '').repeat(2)
const TEST_MISSING_ATTACHMENT_ID = 'TESTMissingAttachment'.padEnd(32, '0')
const TEST_MISSING_UPLOAD_ID = 'TESTMissingUpload'

const isolatedOrganizationFixture = {
    objectStorageId: TEST_TENANT_OBJECT_STORAGE_ID,
    uploadId: TEST_TENANT_UPLOAD_ID,
}

const createUpload = async (cookie = privilegedCookie) => {
    const response = await app.request(
        '/api/objectStorage/upload/create',
        {
            method: 'POST',
            headers: {
                origin: env.URL_FRONTEND,
                'content-type': 'application/json',
                cookie,
            },
            body: JSON.stringify({
                idempotencyKey: uuidv7(),
            }),
        },
        env,
    )

    const responseData =
        await response.json<TApiResponseOk<{ uploadId: string }>>()
    expect(response.status).toBe(200)
    return responseData.data.uploadId
}

const requestUploadAttachment = (
    uploadId: string,
    cookie = privilegedCookie,
    isPublic = false,
) =>
    app.request(
        '/api/objectStorage/upload/attachment/create',
        {
            method: 'POST',
            headers: {
                origin: env.URL_FRONTEND,
                'content-type': 'application/json',
                cookie,
            },
            body: JSON.stringify({
                idempotencyKey: uuidv7(),
                uploadId,
                attachments: [
                    {
                        size: 1024,
                        hashSha256: createHashSha256(),
                        isPublic,
                    },
                ],
            }),
        },
        env,
    )

const createUploadAttachment = async (
    uploadId: string,
    cookie = privilegedCookie,
    isPublic = false,
) => {
    const response = await requestUploadAttachment(uploadId, cookie, isPublic)

    const responseData = await response.json<
        TApiResponseOk<{
            signedUrls: { id: string }[]
        }>
    >()
    expect(response.status).toBe(200)
    return responseData.data.signedUrls[0].id
}

const commitUploadAttachment = async (uploadId: string, attachmentId: string) =>
    await app.request(
        '/api/objectStorage/upload/attachment/commit',
        {
            method: 'POST',
            headers: {
                origin: env.URL_FRONTEND,
                'content-type': 'application/json',
                cookie: privilegedCookie,
            },
            body: JSON.stringify({
                uploadId,
                attachments: [attachmentId],
            }),
        },
        env,
    )

const commitUpload = async (uploadId: string, attachments?: string[]) =>
    await app.request(
        '/api/objectStorage/upload/commit',
        {
            method: 'POST',
            headers: {
                origin: env.URL_FRONTEND,
                'content-type': 'application/json',
                cookie: privilegedCookie,
            },
            body: JSON.stringify(
                attachments === undefined
                    ? { uploadId }
                    : {
                          uploadId,
                          attachments,
                      },
            ),
        },
        env,
    )

export const registerConcurrentObjectStorageTests = (
    activeRoute: TObjectStorageRoute,
) =>
    describe('Object Storage Endpoint', () => {
        describe.concurrent('Concurrent Tests', () => {
            /**
             * @description
             * Authentication Guard
             */
            describe.concurrent('Authentication Guard', () => {
                routeIt(
                    activeRoute,
                    'upload',
                    'Unauthenticated request to /upload/create should return 401.',
                    async () => {
                        const response = await app.request(
                            '/api/objectStorage/upload/create',
                            {
                                method: 'POST',
                                headers: {
                                    origin: env.URL_FRONTEND,
                                    'content-type': 'application/json',
                                },
                                body: JSON.stringify({
                                    idempotencyKey: uuidv7(),
                                }),
                            },
                            env,
                        )

                        const responseData =
                            await response.json<TApiResponseError>()

                        expect(response.status).toBe(401)
                        expect(responseData).toHaveProperty('error')
                        expect(responseData.error.code).toBe('UNAUTHORIZED')
                    },
                )

                routeIt(
                    activeRoute,
                    'download',
                    'Unauthenticated request to /download/link/create should return 401.',
                    async () => {
                        const response = await getTestingRequest(
                            '/api/objectStorage/download/link/create',
                            {
                                query: {
                                    uploadId: 'a1b2c3d4e5f6g7h8',
                                },
                            },
                        )

                        const responseData =
                            await response.json<TApiResponseError>()

                        expect(response.status).toBe(401)
                        expect(responseData).toHaveProperty('error')
                        expect(responseData.error.code).toBe('UNAUTHORIZED')
                    },
                )

                routeIt(
                    activeRoute,
                    'download',
                    'Unauthenticated request to /download/readMany should return 401.',
                    async () => {
                        const response = await queryTestingRequest(
                            '/api/objectStorage/download/readMany',
                            {},
                        )

                        const responseData =
                            await response.json<TApiResponseError>()

                        expect(response.status).toBe(401)
                        expect(responseData).toHaveProperty('error')
                        expect(responseData.error.code).toBe('UNAUTHORIZED')
                    },
                )

                routeIt(
                    activeRoute,
                    'upload',
                    'Unauthenticated request to /upload/commit should return 401.',
                    async () => {
                        const response = await app.request(
                            '/api/objectStorage/upload/commit',
                            {
                                method: 'POST',
                                headers: {
                                    origin: env.URL_FRONTEND,
                                    'content-type': 'application/json',
                                },
                                body: JSON.stringify({
                                    uploadId: 'a1b2c3d4e5f6g7h8',
                                }),
                            },
                            env,
                        )

                        const responseData =
                            await response.json<TApiResponseError>()

                        expect(response.status).toBe(401)
                        expect(responseData).toHaveProperty('error')
                        expect(responseData.error.code).toBe('UNAUTHORIZED')
                    },
                )

                routeIt(
                    activeRoute,
                    'uploadAttachment',
                    'Unauthenticated request to /upload/attachment/create should return 401.',
                    async () => {
                        const response = await app.request(
                            '/api/objectStorage/upload/attachment/create',
                            {
                                method: 'POST',
                                headers: {
                                    origin: env.URL_FRONTEND,
                                    'content-type': 'application/json',
                                },
                                body: JSON.stringify({
                                    idempotencyKey: uuidv7(),
                                    uploadId: 'a1b2c3d4e5f6g7h8',
                                    attachments: [],
                                }),
                            },
                            env,
                        )

                        const responseData =
                            await response.json<TApiResponseError>()

                        expect(response.status).toBe(401)
                        expect(responseData).toHaveProperty('error')
                        expect(responseData.error.code).toBe('UNAUTHORIZED')
                    },
                )

                routeIt(
                    activeRoute,
                    'uploadAttachment',
                    'Unauthenticated request to /upload/attachment/retry should return 401.',
                    async () => {
                        const response = await app.request(
                            '/api/objectStorage/upload/attachment/retry',
                            {
                                method: 'QUERY',
                                headers: {
                                    origin: env.URL_FRONTEND,
                                    'content-type': 'application/json',
                                },
                                body: JSON.stringify({
                                    uploadId: 'a1b2c3d4e5f6g7h8',
                                    attachments: [],
                                }),
                            },
                            env,
                        )

                        const responseData =
                            await response.json<TApiResponseError>()

                        expect(response.status).toBe(401)
                        expect(responseData).toHaveProperty('error')
                        expect(responseData.error.code).toBe('UNAUTHORIZED')
                    },
                )

                routeIt(
                    activeRoute,
                    'uploadAttachment',
                    'Unauthenticated request to /upload/attachment/commit should return 401.',
                    async () => {
                        const response = await app.request(
                            '/api/objectStorage/upload/attachment/commit',
                            {
                                method: 'POST',
                                headers: {
                                    origin: env.URL_FRONTEND,
                                    'content-type': 'application/json',
                                },
                                body: JSON.stringify({
                                    uploadId: 'a1b2c3d4e5f6g7h8',
                                    attachments: [],
                                }),
                            },
                            env,
                        )

                        const responseData =
                            await response.json<TApiResponseError>()

                        expect(response.status).toBe(401)
                        expect(responseData).toHaveProperty('error')
                        expect(responseData.error.code).toBe('UNAUTHORIZED')
                    },
                )
            })

            /**
             * @description
             * Basic Validation (Independent)
             */
            describe.concurrent('Basic Validation', () => {
                routeIt(
                    activeRoute,
                    'download',
                    'Should apply defaults and validate /download/readMany input.',
                    async () => {
                        const defaultResponse = await queryTestingRequest(
                            '/api/objectStorage/download/readMany',
                            {},
                            { cookie: privilegedCookie },
                        )
                        const defaultResponseData =
                            await defaultResponse.json<
                                TApiResponsePaginatedOk<unknown[]>
                            >()
                        const invalidResponse = await queryTestingRequest(
                            '/api/objectStorage/download/readMany',
                            { limit: 101 },
                            { cookie: privilegedCookie },
                        )

                        expect(defaultResponse.status).toBe(200)
                        expect(defaultResponseData.limit).toBe(100)
                        expect(defaultResponseData.offset).toBe(0)
                        expect(invalidResponse.status).toBe(400)
                    },
                )

                routeIt(
                    activeRoute,
                    'download',
                    'Should allow QUERY preflight for /download/readMany.',
                    async () => {
                        const preflightResponse = await app.request(
                            '/api/objectStorage/download/readMany',
                            {
                                method: 'OPTIONS',
                                headers: {
                                    origin: env.URL_FRONTEND,
                                    'access-control-request-method': 'QUERY',
                                    'access-control-request-headers':
                                        'content-type',
                                },
                            },
                            env,
                        )

                        expect(preflightResponse.status).toBe(204)
                        expect(
                            preflightResponse.headers.get(
                                'access-control-allow-methods',
                            ),
                        ).toContain('QUERY')
                    },
                )

                routeIt(
                    activeRoute,
                    'uploadAttachment',
                    'Should allow QUERY preflight for attachment retry.',
                    async () => {
                        const response = await app.request(
                            '/api/objectStorage/upload/attachment/retry',
                            {
                                method: 'OPTIONS',
                                headers: {
                                    origin: env.URL_FRONTEND,
                                    'access-control-request-method': 'QUERY',
                                    'access-control-request-headers':
                                        'content-type',
                                },
                            },
                            env,
                        )

                        expect(response.status).toBe(204)
                        expect(
                            response.headers.get(
                                'access-control-allow-methods',
                            ),
                        ).toContain('QUERY')
                    },
                )

                routeIt(
                    activeRoute,
                    'uploadAttachment',
                    'Should reject malformed and invalid attachment retry queries.',
                    async () => {
                        const malformedResponse = await app.request(
                            '/api/objectStorage/upload/attachment/retry',
                            {
                                method: 'QUERY',
                                headers: {
                                    origin: env.URL_FRONTEND,
                                    'content-type': 'application/json',
                                    cookie: privilegedCookie,
                                },
                                body: '{',
                            },
                            env,
                        )
                        const invalidResponse = await queryTestingRequest(
                            '/api/objectStorage/upload/attachment/retry',
                            { uploadId: '', attachments: [] },
                            { cookie: privilegedCookie },
                        )

                        expect(malformedResponse.status).toBe(400)
                        expect(invalidResponse.status).toBe(400)
                    },
                )

                routeIt(
                    activeRoute,
                    'uploadAttachment',
                    'Should reject attachment with invalid upload ID.',
                    async () => {
                        const response = await app.request(
                            '/api/objectStorage/upload/attachment/create',
                            {
                                method: 'POST',
                                headers: {
                                    origin: env.URL_FRONTEND,
                                    'content-type': 'application/json',
                                    cookie: privilegedCookie,
                                },
                                body: JSON.stringify({
                                    idempotencyKey: uuidv7(),
                                    uploadId: TEST_MISSING_UPLOAD_ID,
                                    attachments: [
                                        {
                                            size: 1024,
                                            hashSha256: 'b'.repeat(64),
                                            isPublic: false,
                                        },
                                    ],
                                }),
                            },
                            env,
                        )

                        const responseData =
                            await response.json<TApiResponseError>()

                        expect(response.status).toBe(404)
                        expect(responseData).toHaveProperty('error')
                        expect(responseData.error.message).toBe(
                            'Upload ID not found or is already committed.',
                        )
                    },
                )

                routeIt(
                    activeRoute,
                    'upload',
                    'Should reject commit for non-existent upload ID.',
                    async () => {
                        const response = await app.request(
                            '/api/objectStorage/upload/attachment/commit',
                            {
                                method: 'POST',
                                headers: {
                                    origin: env.URL_FRONTEND,
                                    'content-type': 'application/json',
                                    cookie: privilegedCookie,
                                },
                                body: JSON.stringify({
                                    uploadId: TEST_MISSING_UPLOAD_ID,
                                    attachments: [TEST_MISSING_ATTACHMENT_ID],
                                }),
                            },
                            env,
                        )

                        const responseData =
                            await response.json<TApiResponseError>()

                        expect(response.status).toBe(404)
                        expect(responseData).toHaveProperty('error')
                        expect(responseData.error.message).toBe(
                            'Upload ID not found or is already committed.',
                        )
                    },
                )

                routeIt(
                    activeRoute,
                    'download',
                    'Should fail with non-existent upload ID (Download Link).',
                    async () => {
                        const response = await getTestingRequest(
                            '/api/objectStorage/download/link/create',
                            {
                                cookie: privilegedCookie,
                                query: {
                                    uploadId: TEST_MISSING_UPLOAD_ID,
                                },
                            },
                        )

                        const responseData =
                            await response.json<TApiResponseError>()

                        expect(response.status).toBe(404)
                        expect(responseData).toHaveProperty('error')
                        expect(responseData.error.message).toBe(
                            'Upload ID not found.',
                        )
                    },
                )

                routeIt(
                    activeRoute,
                    'download',
                    'Should reject invalid upload ID format (Download Link).',
                    async () => {
                        const response = await getTestingRequest(
                            '/api/objectStorage/download/link/create',
                            {
                                cookie: privilegedCookie,
                                query: {
                                    uploadId: 'short',
                                },
                            },
                        )

                        const responseData =
                            await response.json<TApiResponseError>()

                        expect(response.status).toBe(400)
                        expect(responseData).toHaveProperty('error')
                    },
                )
            })

            /**
             * @description
             * Tenant Isolation
             */
            if (activeRoute !== 'upload')
                describe.concurrent('Tenant Isolation', () => {
                    let isolatedOrganizationCookie: string

                    beforeAll(async () => {
                        isolatedOrganizationCookie =
                            await seedTestingCookieForOrganization(
                                TEST_OWNER_USER_ID,
                                TEST_ISOLATED_ORGANIZATION_ID,
                            )
                    })

                    routeIt(
                        activeRoute,
                        'download',
                        'Isolated organization can download its own seeded upload attachments.',
                        async () => {
                            const response = await getTestingRequest(
                                '/api/objectStorage/download/link/create',
                                {
                                    cookie: isolatedOrganizationCookie,
                                    query: {
                                        uploadId:
                                            isolatedOrganizationFixture.uploadId,
                                    },
                                },
                            )

                            expect(response.status).toBe(200)
                        },
                    )

                    routeIt(
                        activeRoute,
                        'download',
                        'Primary organization cannot download isolated organization upload attachments.',
                        async () => {
                            const response = await getTestingRequest(
                                '/api/objectStorage/download/link/create',
                                {
                                    cookie: privilegedCookie,
                                    query: {
                                        uploadId:
                                            isolatedOrganizationFixture.uploadId,
                                    },
                                },
                            )

                            expect(response.status).toBe(404)
                        },
                    )

                    routeIt(
                        activeRoute,
                        'download',
                        'Primary organization cannot list isolated organization committed attachments.',
                        async () => {
                            const response = await queryTestingRequest(
                                '/api/objectStorage/download/readMany',
                                {
                                    limit: 100,
                                    offset: 0,
                                    sortOrder: 'desc',
                                },
                                { cookie: privilegedCookie },
                            )
                            const responseData = await response.json<
                                TApiResponsePaginatedOk<
                                    {
                                        objectStorageId: string
                                        uploadId: string
                                    }[]
                                >
                            >()

                            expect(response.status).toBe(200)
                            expect(
                                responseData.data.some(
                                    (row) =>
                                        row.objectStorageId ===
                                            isolatedOrganizationFixture.objectStorageId ||
                                        row.uploadId ===
                                            isolatedOrganizationFixture.uploadId,
                                ),
                            ).toBe(false)
                        },
                    )

                    routeIt(
                        activeRoute,
                        'uploadAttachment',
                        'Primary organization cannot attach objects to isolated organization uploads.',
                        async () => {
                            const response = await postTestingRequest(
                                '/api/objectStorage/upload/attachment/create',
                                {
                                    cookie: privilegedCookie,
                                    body: {
                                        idempotencyKey: uuidv7(),
                                        uploadId:
                                            isolatedOrganizationFixture.uploadId,
                                        attachments: [
                                            {
                                                size: 64,
                                                hashSha256:
                                                    'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
                                                isPublic: false,
                                            },
                                        ],
                                    },
                                },
                            )

                            expect(response.status).toBe(404)
                        },
                    )

                    routeIt(
                        activeRoute,
                        'uploadAttachment',
                        'Primary organization cannot retry isolated organization upload attachments.',
                        async () => {
                            const response = await queryTestingRequest(
                                '/api/objectStorage/upload/attachment/retry',
                                {
                                    uploadId:
                                        isolatedOrganizationFixture.uploadId,
                                    attachments: [
                                        isolatedOrganizationFixture.objectStorageId,
                                    ],
                                },
                                {
                                    cookie: privilegedCookie,
                                },
                            )

                            expect(response.status).toBe(404)
                        },
                    )

                    routeIt(
                        activeRoute,
                        'uploadAttachment',
                        'Primary organization cannot commit isolated organization upload attachments.',
                        async () => {
                            const response = await postTestingRequest(
                                '/api/objectStorage/upload/attachment/commit',
                                {
                                    cookie: privilegedCookie,
                                    body: {
                                        uploadId:
                                            isolatedOrganizationFixture.uploadId,
                                        attachments: [
                                            isolatedOrganizationFixture.objectStorageId,
                                        ],
                                    },
                                },
                            )

                            expect(response.status).toBe(404)
                        },
                    )
                })
        })
    })

export const registerSequentialObjectStorageTests = (
    activeRoute: TObjectStorageRoute,
) =>
    describe('Object Storage Endpoint', () => {
        describe('Sequential Tests', () => {
            /**
             * @description
             * Upload Flow
             */
            if (activeRoute !== 'download')
                describe('Upload Flow', () => {
                    routeDescribe(
                        activeRoute,
                        'upload',
                        'Create Upload',
                        () => {
                            it('Should reject upload creation without an idempotency key.', async () => {
                                const response = await app.request(
                                    '/api/objectStorage/upload/create',
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

                                const responseData =
                                    await response.json<TApiResponseError>()

                                expect(response.status).toBe(400)
                                expect(responseData.error.code).toBe(
                                    'DATA_VALIDATION',
                                )
                            })

                            it('Should reject upload creation with a non-v7 idempotency key.', async () => {
                                const response = await app.request(
                                    '/api/objectStorage/upload/create',
                                    {
                                        method: 'POST',
                                        headers: {
                                            origin: env.URL_FRONTEND,
                                            'content-type': 'application/json',
                                            cookie: privilegedCookie,
                                        },
                                        body: JSON.stringify({
                                            idempotencyKey: crypto.randomUUID(),
                                        }),
                                    },
                                    env,
                                )

                                const responseData =
                                    await response.json<TApiResponseError>()

                                expect(response.status).toBe(400)
                                expect(responseData.error.code).toBe(
                                    'DATA_VALIDATION',
                                )
                            })

                            it('Privileged user should be able to create an upload.', async () => {
                                const response = await app.request(
                                    '/api/objectStorage/upload/create',
                                    {
                                        method: 'POST',
                                        headers: {
                                            origin: env.URL_FRONTEND,
                                            'content-type': 'application/json',
                                            cookie: privilegedCookie,
                                        },
                                        body: JSON.stringify({
                                            idempotencyKey: uuidv7(),
                                        }),
                                    },
                                    env,
                                )

                                const responseData =
                                    await response.json<
                                        TApiResponseOk<{ uploadId: string }>
                                    >()

                                expect(response.status).toBe(200)
                                expect(responseData.success).toBe(true)
                                expect(responseData.data.uploadId).toBeDefined()
                                expect(responseData.data.uploadId).toHaveLength(
                                    16,
                                )
                            })

                            it('Standard user should be able to create an upload.', async () => {
                                const response = await app.request(
                                    '/api/objectStorage/upload/create',
                                    {
                                        method: 'POST',
                                        headers: {
                                            origin: env.URL_FRONTEND,
                                            'content-type': 'application/json',
                                            cookie: standardCookie,
                                        },
                                        body: JSON.stringify({
                                            idempotencyKey: uuidv7(),
                                        }),
                                    },
                                    env,
                                )

                                const responseData =
                                    await response.json<
                                        TApiResponseOk<{ uploadId: string }>
                                    >()

                                expect(response.status).toBe(200)
                                expect(responseData.success).toBe(true)
                                expect(responseData.data.uploadId).toBeDefined()
                                expect(responseData.data.uploadId).toHaveLength(
                                    16,
                                )
                            })

                            it('Should return the same upload for a repeated idempotency key.', async () => {
                                const idempotencyKey = uuidv7()

                                const responses = await Promise.all([
                                    app.request(
                                        '/api/objectStorage/upload/create',
                                        {
                                            method: 'POST',
                                            headers: {
                                                origin: env.URL_FRONTEND,
                                                'content-type':
                                                    'application/json',
                                                cookie: privilegedCookie,
                                            },
                                            body: JSON.stringify({
                                                idempotencyKey,
                                            }),
                                        },
                                        env,
                                    ),
                                    app.request(
                                        '/api/objectStorage/upload/create',
                                        {
                                            method: 'POST',
                                            headers: {
                                                origin: env.URL_FRONTEND,
                                                'content-type':
                                                    'application/json',
                                                cookie: privilegedCookie,
                                            },
                                            body: JSON.stringify({
                                                idempotencyKey,
                                            }),
                                        },
                                        env,
                                    ),
                                ])

                                const responseData = await Promise.all(
                                    responses.map((response) =>
                                        response.json<
                                            TApiResponseOk<{ uploadId: string }>
                                        >(),
                                    ),
                                )

                                expect(
                                    responses.map(({ status }) => status),
                                ).toEqual([
                                    200,
                                    200,
                                ])
                                expect(responseData[0].data.uploadId).toBe(
                                    responseData[1].data.uploadId,
                                )
                            })

                            it('Should reject idempotency key reuse by another user.', async () => {
                                const idempotencyKey = uuidv7()

                                const firstResponse = await app.request(
                                    '/api/objectStorage/upload/create',
                                    {
                                        method: 'POST',
                                        headers: {
                                            origin: env.URL_FRONTEND,
                                            'content-type': 'application/json',
                                            cookie: privilegedCookie,
                                        },
                                        body: JSON.stringify({
                                            idempotencyKey,
                                        }),
                                    },
                                    env,
                                )

                                expect(firstResponse.status).toBe(200)

                                const response = await app.request(
                                    '/api/objectStorage/upload/create',
                                    {
                                        method: 'POST',
                                        headers: {
                                            origin: env.URL_FRONTEND,
                                            'content-type': 'application/json',
                                            cookie: standardCookie,
                                        },
                                        body: JSON.stringify({
                                            idempotencyKey,
                                        }),
                                    },
                                    env,
                                )

                                const responseData =
                                    await response.json<TApiResponseError>()

                                expect(response.status).toBe(409)
                                expect(responseData.error.code).toBe(
                                    'IDEMPOTENCY_KEY_CONFLICT',
                                )
                            })
                        },
                    )

                    routeDescribe(
                        activeRoute,
                        'uploadAttachment',
                        'Create Upload Attachment',
                        () => {
                            it('Should create attachment with valid input and return signed URLs.', async () => {
                                // Step 1: Create an upload
                                const uploadResponse = await app.request(
                                    '/api/objectStorage/upload/create',
                                    {
                                        method: 'POST',
                                        headers: {
                                            origin: env.URL_FRONTEND,
                                            'content-type': 'application/json',
                                            cookie: privilegedCookie,
                                        },
                                        body: JSON.stringify({
                                            idempotencyKey: uuidv7(),
                                        }),
                                    },
                                    env,
                                )

                                const uploadData =
                                    await uploadResponse.json<
                                        TApiResponseOk<{ uploadId: string }>
                                    >()
                                const uploadId = uploadData.data.uploadId

                                // Step 2: Create attachment
                                const response = await app.request(
                                    '/api/objectStorage/upload/attachment/create',
                                    {
                                        method: 'POST',
                                        headers: {
                                            origin: env.URL_FRONTEND,
                                            'content-type': 'application/json',
                                            cookie: privilegedCookie,
                                        },
                                        body: JSON.stringify({
                                            idempotencyKey: uuidv7(),
                                            uploadId,
                                            attachments: [
                                                {
                                                    size: 1024,
                                                    hashSha256:
                                                        createHashSha256(),
                                                    isPublic: false,
                                                },
                                            ],
                                        }),
                                    },
                                    env,
                                )

                                const responseData = await response.json<
                                    TApiResponseOk<{
                                        uploadId: string
                                        signedUrls: {
                                            id: string
                                            hashSha256: string
                                            encodedHash: string | null
                                            signedUrl: string | null
                                            status: number
                                        }[]
                                    }>
                                >()

                                expect(response.status).toBe(200)
                                expect(responseData.success).toBe(true)
                                expect(
                                    responseData.data?.signedUrls,
                                    'Expected signedUrls to be present in the response',
                                ).toBeDefined()
                                expect(responseData.data.uploadId).toBe(
                                    uploadId,
                                )
                                expect(
                                    responseData.data.signedUrls,
                                ).toHaveLength(1)
                                expect(
                                    responseData.data.signedUrls[0].status,
                                ).toBe(201)
                                expect(
                                    responseData.data.signedUrls[0].signedUrl,
                                ).toBeTruthy()
                                expect(
                                    responseData.data.signedUrls[0].encodedHash,
                                ).toBeTruthy()
                            })

                            it('Should create the 25-attachment contract maximum below D1 parameter limits.', async () => {
                                const uploadId = await createUpload()
                                const response = await app.request(
                                    '/api/objectStorage/upload/attachment/create',
                                    {
                                        method: 'POST',
                                        headers: {
                                            origin: env.URL_FRONTEND,
                                            'content-type': 'application/json',
                                            cookie: privilegedCookie,
                                        },
                                        body: JSON.stringify({
                                            idempotencyKey: uuidv7(),
                                            uploadId,
                                            attachments: Array.from(
                                                { length: 25 },
                                                () => ({
                                                    size: 1024,
                                                    hashSha256:
                                                        createHashSha256(),
                                                    isPublic: false,
                                                }),
                                            ),
                                        }),
                                    },
                                    env,
                                )
                                const responseData = await response.json<
                                    TApiResponseOk<{
                                        signedUrls: { status: number }[]
                                    }>
                                >()

                                expect(response.status).toBe(200)
                                expect(
                                    responseData.data.signedUrls,
                                ).toHaveLength(25)
                                expect(
                                    responseData.data.signedUrls.every(
                                        ({ status }) => status === 201,
                                    ),
                                ).toBe(true)
                            })

                            it('Should replay the exact attachment batch response.', async () => {
                                const uploadId = await createUpload()
                                const idempotencyKey = uuidv7()
                                const payload = {
                                    idempotencyKey,
                                    uploadId,
                                    attachments: [
                                        {
                                            size: 1024,
                                            hashSha256: createHashSha256(),
                                            isPublic: false,
                                        },
                                    ],
                                }
                                const request = () =>
                                    app.request(
                                        '/api/objectStorage/upload/attachment/create',
                                        {
                                            method: 'POST',
                                            headers: {
                                                origin: env.URL_FRONTEND,
                                                'content-type':
                                                    'application/json',
                                                cookie: privilegedCookie,
                                            },
                                            body: JSON.stringify(payload),
                                        },
                                        env,
                                    )

                                const firstResponse = await request()
                                const secondResponse = await request()
                                const firstBody = await firstResponse.json()
                                const secondBody = await secondResponse.json()

                                expect(firstResponse.status).toBe(200)
                                expect(secondResponse.status).toBe(200)
                                expect(secondBody).toEqual(firstBody)
                            })

                            it('Should reject attachment-batch replay by another user.', async () => {
                                const uploadId =
                                    await createUpload(standardCookie)
                                const idempotencyKey = uuidv7()
                                const payload = {
                                    idempotencyKey,
                                    uploadId,
                                    attachments: [
                                        {
                                            size: 1024,
                                            hashSha256: createHashSha256(),
                                            isPublic: false,
                                        },
                                    ],
                                }
                                const request = (cookie: string) =>
                                    app.request(
                                        '/api/objectStorage/upload/attachment/create',
                                        {
                                            method: 'POST',
                                            headers: {
                                                origin: env.URL_FRONTEND,
                                                'content-type':
                                                    'application/json',
                                                cookie,
                                            },
                                            body: JSON.stringify(payload),
                                        },
                                        env,
                                    )

                                const firstResponse =
                                    await request(standardCookie)
                                const conflictResponse =
                                    await request(privilegedCookie)
                                const conflictBody =
                                    await conflictResponse.json<TApiResponseError>()

                                expect(firstResponse.status).toBe(200)
                                expect(conflictResponse.status).toBe(409)
                                expect(conflictBody.error.code).toBe(
                                    'IDEMPOTENCY_KEY_CONFLICT',
                                )
                            })

                            it('Should reject attachment-batch key reuse with a different request.', async () => {
                                const uploadId = await createUpload()
                                const idempotencyKey = uuidv7()
                                const request = (hashSha256: string) =>
                                    app.request(
                                        '/api/objectStorage/upload/attachment/create',
                                        {
                                            method: 'POST',
                                            headers: {
                                                origin: env.URL_FRONTEND,
                                                'content-type':
                                                    'application/json',
                                                cookie: privilegedCookie,
                                            },
                                            body: JSON.stringify({
                                                idempotencyKey,
                                                uploadId,
                                                attachments: [
                                                    {
                                                        size: 1024,
                                                        hashSha256,
                                                        isPublic: false,
                                                    },
                                                ],
                                            }),
                                        },
                                        env,
                                    )

                                const firstResponse =
                                    await request(createHashSha256())
                                const conflictResponse =
                                    await request(createHashSha256())
                                const conflictBody =
                                    await conflictResponse.json<TApiResponseError>()

                                expect(firstResponse.status).toBe(200)
                                expect(conflictResponse.status).toBe(409)
                                expect(conflictBody.error.code).toBe(
                                    'IDEMPOTENCY_KEY_CONFLICT',
                                )
                            })

                            it('Should converge concurrent attachment creates with the same hash.', async () => {
                                const uploadId = await createUpload()
                                const hashSha256 = createHashSha256()

                                const attachmentPayload = {
                                    uploadId,
                                    attachments: [
                                        {
                                            size: 1024,
                                            hashSha256,
                                            isPublic: false,
                                        },
                                    ],
                                }

                                const responses = await Promise.all([
                                    app.request(
                                        '/api/objectStorage/upload/attachment/create',
                                        {
                                            method: 'POST',
                                            headers: {
                                                origin: env.URL_FRONTEND,
                                                'content-type':
                                                    'application/json',
                                                cookie: privilegedCookie,
                                            },
                                            body: JSON.stringify({
                                                ...attachmentPayload,
                                                idempotencyKey: uuidv7(),
                                            }),
                                        },
                                        env,
                                    ),
                                    app.request(
                                        '/api/objectStorage/upload/attachment/create',
                                        {
                                            method: 'POST',
                                            headers: {
                                                origin: env.URL_FRONTEND,
                                                'content-type':
                                                    'application/json',
                                                cookie: privilegedCookie,
                                            },
                                            body: JSON.stringify({
                                                ...attachmentPayload,
                                                idempotencyKey: uuidv7(),
                                            }),
                                        },
                                        env,
                                    ),
                                ])

                                const responseData = await Promise.all(
                                    responses.map((response) =>
                                        response.json<
                                            TApiResponseOk<{
                                                signedUrls: {
                                                    id: string
                                                    status: number
                                                }[]
                                            }>
                                        >(),
                                    ),
                                )

                                expect(
                                    responses.map(({ status }) => status),
                                ).toEqual([
                                    200,
                                    200,
                                ])
                                expect(
                                    responseData[0].data.signedUrls[0].id,
                                ).toBe(responseData[1].data.signedUrls[0].id)
                                expect(
                                    responseData.map(
                                        ({ data }) => data.signedUrls[0].status,
                                    ),
                                ).toEqual([
                                    201,
                                    201,
                                ])
                            })

                            it('Should reject attachment with empty attachments array.', async () => {
                                const uploadResponse = await app.request(
                                    '/api/objectStorage/upload/create',
                                    {
                                        method: 'POST',
                                        headers: {
                                            origin: env.URL_FRONTEND,
                                            'content-type': 'application/json',
                                            cookie: privilegedCookie,
                                        },
                                        body: JSON.stringify({
                                            idempotencyKey: uuidv7(),
                                        }),
                                    },
                                    env,
                                )

                                const uploadData =
                                    await uploadResponse.json<
                                        TApiResponseOk<{ uploadId: string }>
                                    >()

                                const response = await app.request(
                                    '/api/objectStorage/upload/attachment/create',
                                    {
                                        method: 'POST',
                                        headers: {
                                            origin: env.URL_FRONTEND,
                                            'content-type': 'application/json',
                                            cookie: privilegedCookie,
                                        },
                                        body: JSON.stringify({
                                            idempotencyKey: uuidv7(),
                                            uploadId: uploadData.data.uploadId,
                                            attachments: [],
                                        }),
                                    },
                                    env,
                                )

                                const responseData =
                                    await response.json<TApiResponseError>()

                                expect(response.status).toBe(400)
                                expect(responseData).toHaveProperty('error')
                            })

                            it.each([
                                [
                                    'uppercase',
                                    'A'.repeat(64),
                                ],
                                [
                                    'short',
                                    'a'.repeat(63),
                                ],
                                [
                                    'non-hex',
                                    'g'.repeat(64),
                                ],
                            ])(
                                'Should reject attachment with %s SHA-256 hash.',
                                async (_case, hashSha256) => {
                                    const uploadResponse = await app.request(
                                        '/api/objectStorage/upload/create',
                                        {
                                            method: 'POST',
                                            headers: {
                                                origin: env.URL_FRONTEND,
                                                'content-type':
                                                    'application/json',
                                                cookie: privilegedCookie,
                                            },
                                            body: JSON.stringify({
                                                idempotencyKey: uuidv7(),
                                            }),
                                        },
                                        env,
                                    )

                                    const uploadData =
                                        await uploadResponse.json<
                                            TApiResponseOk<{ uploadId: string }>
                                        >()

                                    const response = await app.request(
                                        '/api/objectStorage/upload/attachment/create',
                                        {
                                            method: 'POST',
                                            headers: {
                                                origin: env.URL_FRONTEND,
                                                'content-type':
                                                    'application/json',
                                                cookie: privilegedCookie,
                                            },
                                            body: JSON.stringify({
                                                idempotencyKey: uuidv7(),
                                                uploadId:
                                                    uploadData.data.uploadId,
                                                attachments: [
                                                    {
                                                        size: 1024,
                                                        hashSha256,
                                                        isPublic: false,
                                                    },
                                                ],
                                            }),
                                        },
                                        env,
                                    )

                                    const responseData =
                                        await response.json<TApiResponseError>()

                                    expect(response.status).toBe(400)
                                    expect(responseData).toHaveProperty('error')
                                },
                            )

                            it('Should reject attachment with duplicate SHA-256 hashes.', async () => {
                                const uploadResponse = await app.request(
                                    '/api/objectStorage/upload/create',
                                    {
                                        method: 'POST',
                                        headers: {
                                            origin: env.URL_FRONTEND,
                                            'content-type': 'application/json',
                                            cookie: privilegedCookie,
                                        },
                                        body: JSON.stringify({
                                            idempotencyKey: uuidv7(),
                                        }),
                                    },
                                    env,
                                )

                                const uploadData =
                                    await uploadResponse.json<
                                        TApiResponseOk<{ uploadId: string }>
                                    >()

                                const duplicateHash = 'c'.repeat(64)

                                const response = await app.request(
                                    '/api/objectStorage/upload/attachment/create',
                                    {
                                        method: 'POST',
                                        headers: {
                                            origin: env.URL_FRONTEND,
                                            'content-type': 'application/json',
                                            cookie: privilegedCookie,
                                        },
                                        body: JSON.stringify({
                                            idempotencyKey: uuidv7(),
                                            uploadId: uploadData.data.uploadId,
                                            attachments: [
                                                {
                                                    size: 1024,
                                                    hashSha256: duplicateHash,
                                                    isPublic: false,
                                                },
                                                {
                                                    size: 2048,
                                                    hashSha256: duplicateHash,
                                                    isPublic: false,
                                                },
                                            ],
                                        }),
                                    },
                                    env,
                                )

                                const responseData =
                                    await response.json<TApiResponseError>()

                                expect(response.status).toBe(400)
                                expect(responseData).toHaveProperty('error')
                            })

                            it("Standard user should not access another user's upload.", async () => {
                                // Create upload as privileged user
                                const uploadResponse = await app.request(
                                    '/api/objectStorage/upload/create',
                                    {
                                        method: 'POST',
                                        headers: {
                                            origin: env.URL_FRONTEND,
                                            'content-type': 'application/json',
                                            cookie: privilegedCookie,
                                        },
                                        body: JSON.stringify({
                                            idempotencyKey: uuidv7(),
                                        }),
                                    },
                                    env,
                                )

                                const uploadData =
                                    await uploadResponse.json<
                                        TApiResponseOk<{ uploadId: string }>
                                    >()

                                // Attempt to attach as standard user
                                const response = await app.request(
                                    '/api/objectStorage/upload/attachment/create',
                                    {
                                        method: 'POST',
                                        headers: {
                                            origin: env.URL_FRONTEND,
                                            'content-type': 'application/json',
                                            cookie: standardCookie,
                                        },
                                        body: JSON.stringify({
                                            idempotencyKey: uuidv7(),
                                            uploadId: uploadData.data.uploadId,
                                            attachments: [
                                                {
                                                    size: 1024,
                                                    hashSha256:
                                                        createHashSha256(),
                                                    isPublic: false,
                                                },
                                            ],
                                        }),
                                    },
                                    env,
                                )

                                const responseData =
                                    await response.json<TApiResponseError>()

                                expect(response.status).toBe(404)
                                expect(responseData).toHaveProperty('error')
                                expect(responseData.error.message).toBe(
                                    'Upload ID not found or is already committed.',
                                )
                            })

                            it('Should return 409 for already uploaded (deduplicated) attachment.', async () => {
                                // Step 1: Create first upload and add attachment
                                const upload1Response = await app.request(
                                    '/api/objectStorage/upload/create',
                                    {
                                        method: 'POST',
                                        headers: {
                                            origin: env.URL_FRONTEND,
                                            'content-type': 'application/json',
                                            cookie: privilegedCookie,
                                        },
                                        body: JSON.stringify({
                                            idempotencyKey: uuidv7(),
                                        }),
                                    },
                                    env,
                                )

                                const upload1Data =
                                    await upload1Response.json<
                                        TApiResponseOk<{ uploadId: string }>
                                    >()
                                const uploadId1 = upload1Data.data.uploadId

                                const sharedHash = createHashSha256()

                                const attach1Response = await app.request(
                                    '/api/objectStorage/upload/attachment/create',
                                    {
                                        method: 'POST',
                                        headers: {
                                            origin: env.URL_FRONTEND,
                                            'content-type': 'application/json',
                                            cookie: privilegedCookie,
                                        },
                                        body: JSON.stringify({
                                            idempotencyKey: uuidv7(),
                                            uploadId: uploadId1,
                                            attachments: [
                                                {
                                                    size: 1024,
                                                    hashSha256: sharedHash,
                                                    isPublic: false,
                                                },
                                            ],
                                        }),
                                    },
                                    env,
                                )

                                const attach1Data = await attach1Response.json<
                                    TApiResponseOk<{
                                        uploadId: string
                                        signedUrls: {
                                            id: string
                                            status: number
                                        }[]
                                    }>
                                >()

                                expect(
                                    attach1Data.data?.signedUrls,
                                    'Expected signedUrls to be present in the response',
                                ).toBeDefined()

                                // Step 2: Mark the attachment as uploaded
                                await app.request(
                                    '/api/objectStorage/upload/attachment/commit',
                                    {
                                        method: 'POST',
                                        headers: {
                                            origin: env.URL_FRONTEND,
                                            'content-type': 'application/json',
                                            cookie: privilegedCookie,
                                        },
                                        body: JSON.stringify({
                                            uploadId: uploadId1,
                                            attachments: [
                                                attach1Data.data.signedUrls[0]
                                                    .id,
                                            ],
                                        }),
                                    },
                                    env,
                                )

                                // Step 3: Create second upload and try the same hash
                                const upload2Response = await app.request(
                                    '/api/objectStorage/upload/create',
                                    {
                                        method: 'POST',
                                        headers: {
                                            origin: env.URL_FRONTEND,
                                            'content-type': 'application/json',
                                            cookie: privilegedCookie,
                                        },
                                        body: JSON.stringify({
                                            idempotencyKey: uuidv7(),
                                        }),
                                    },
                                    env,
                                )

                                const upload2Data =
                                    await upload2Response.json<
                                        TApiResponseOk<{ uploadId: string }>
                                    >()

                                const response = await app.request(
                                    '/api/objectStorage/upload/attachment/create',
                                    {
                                        method: 'POST',
                                        headers: {
                                            origin: env.URL_FRONTEND,
                                            'content-type': 'application/json',
                                            cookie: privilegedCookie,
                                        },
                                        body: JSON.stringify({
                                            idempotencyKey: uuidv7(),
                                            uploadId: upload2Data.data.uploadId,
                                            attachments: [
                                                {
                                                    size: 1024,
                                                    hashSha256: sharedHash,
                                                    isPublic: false,
                                                },
                                            ],
                                        }),
                                    },
                                    env,
                                )

                                const responseData = await response.json<
                                    TApiResponseOk<{
                                        uploadId: string
                                        signedUrls: {
                                            id: string
                                            hashSha256: string
                                            signedUrl: string | null
                                            status: number
                                        }[]
                                    }>
                                >()

                                expect(response.status).toBe(200)
                                expect(
                                    responseData.data?.signedUrls,
                                    'Expected signedUrls to be present in the response',
                                ).toBeDefined()
                                expect(
                                    responseData.data.signedUrls[0].status,
                                ).toBe(409)
                                expect(
                                    responseData.data.signedUrls[0].signedUrl,
                                ).toBeNull()
                            })

                            it('Should create a public object for the same hash as an existing private object.', async () => {
                                const sharedHash = createHashSha256()
                                const privateUploadId = await createUpload()

                                const privateAttachResponse = await app.request(
                                    '/api/objectStorage/upload/attachment/create',
                                    {
                                        method: 'POST',
                                        headers: {
                                            origin: env.URL_FRONTEND,
                                            'content-type': 'application/json',
                                            cookie: privilegedCookie,
                                        },
                                        body: JSON.stringify({
                                            idempotencyKey: uuidv7(),
                                            uploadId: privateUploadId,
                                            attachments: [
                                                {
                                                    size: 1024,
                                                    hashSha256: sharedHash,
                                                    isPublic: false,
                                                },
                                            ],
                                        }),
                                    },
                                    env,
                                )

                                const privateAttachData =
                                    await privateAttachResponse.json<
                                        TApiResponseOk<{
                                            signedUrls: {
                                                id: string
                                                status: number
                                            }[]
                                        }>
                                    >()
                                const privateObjectId =
                                    privateAttachData.data.signedUrls[0].id

                                expect(privateAttachResponse.status).toBe(200)
                                expect(
                                    (
                                        await commitUploadAttachment(
                                            privateUploadId,
                                            privateObjectId,
                                        )
                                    ).status,
                                ).toBe(200)

                                const publicUploadId = await createUpload()
                                const publicAttachResponse = await app.request(
                                    '/api/objectStorage/upload/attachment/create',
                                    {
                                        method: 'POST',
                                        headers: {
                                            origin: env.URL_FRONTEND,
                                            'content-type': 'application/json',
                                            cookie: privilegedCookie,
                                        },
                                        body: JSON.stringify({
                                            idempotencyKey: uuidv7(),
                                            uploadId: publicUploadId,
                                            attachments: [
                                                {
                                                    size: 1024,
                                                    hashSha256: sharedHash,
                                                    isPublic: true,
                                                },
                                            ],
                                        }),
                                    },
                                    env,
                                )

                                const publicAttachData =
                                    await publicAttachResponse.json<
                                        TApiResponseOk<{
                                            signedUrls: {
                                                id: string
                                                signedUrl: string | null
                                                status: number
                                            }[]
                                        }>
                                    >()

                                expect(publicAttachResponse.status).toBe(200)
                                expect(
                                    publicAttachData.data.signedUrls[0].status,
                                ).toBe(201)
                                expect(
                                    publicAttachData.data.signedUrls[0].id,
                                ).not.toBe(privateObjectId)
                                expect(
                                    publicAttachData.data.signedUrls[0]
                                        .signedUrl,
                                ).toContain(`/${env.CF_R2_BUCKET_PUBLIC}/`)
                            })
                        },
                    )

                    routeDescribe(
                        activeRoute,
                        'uploadAttachment',
                        'Retry Upload Attachment',
                        () => {
                            it('Should regenerate signed URLs for non-uploaded attachments.', async () => {
                                // Create upload and attachment
                                const uploadResponse = await app.request(
                                    '/api/objectStorage/upload/create',
                                    {
                                        method: 'POST',
                                        headers: {
                                            origin: env.URL_FRONTEND,
                                            'content-type': 'application/json',
                                            cookie: privilegedCookie,
                                        },
                                        body: JSON.stringify({
                                            idempotencyKey: uuidv7(),
                                        }),
                                    },
                                    env,
                                )

                                const uploadData =
                                    await uploadResponse.json<
                                        TApiResponseOk<{ uploadId: string }>
                                    >()
                                const uploadId = uploadData.data.uploadId

                                const attachResponse = await app.request(
                                    '/api/objectStorage/upload/attachment/create',
                                    {
                                        method: 'POST',
                                        headers: {
                                            origin: env.URL_FRONTEND,
                                            'content-type': 'application/json',
                                            cookie: privilegedCookie,
                                        },
                                        body: JSON.stringify({
                                            idempotencyKey: uuidv7(),
                                            uploadId,
                                            attachments: [
                                                {
                                                    size: 512,
                                                    hashSha256:
                                                        createHashSha256(),
                                                    isPublic: false,
                                                },
                                            ],
                                        }),
                                    },
                                    env,
                                )

                                const attachData = await attachResponse.json<
                                    TApiResponseOk<{
                                        uploadId: string
                                        signedUrls: {
                                            id: string
                                            status: number
                                        }[]
                                    }>
                                >()

                                expect(
                                    attachData.data?.signedUrls,
                                    'Expected signedUrls to be present in the response',
                                ).toBeDefined()
                                const attachmentId =
                                    attachData.data.signedUrls[0].id

                                // Retry the attachment
                                const response = await app.request(
                                    '/api/objectStorage/upload/attachment/retry',
                                    {
                                        method: 'QUERY',
                                        headers: {
                                            origin: env.URL_FRONTEND,
                                            'content-type': 'application/json',
                                            cookie: privilegedCookie,
                                        },
                                        body: JSON.stringify({
                                            uploadId,
                                            attachments: [attachmentId],
                                        }),
                                    },
                                    env,
                                )

                                const responseData = await response.json<
                                    TApiResponseOk<{
                                        uploadId: string
                                        signedUrls: {
                                            id: string
                                            signedUrl: string | null
                                            status: number
                                        }[]
                                    }>
                                >()

                                expect(response.status).toBe(200)
                                expect(
                                    responseData.data?.signedUrls,
                                    'Expected signedUrls to be present in the response',
                                ).toBeDefined()
                                expect(
                                    responseData.data.signedUrls,
                                ).toHaveLength(1)
                                expect(
                                    responseData.data.signedUrls[0].status,
                                ).toBe(200)
                                expect(
                                    responseData.data.signedUrls[0].signedUrl,
                                ).toBeTruthy()
                            })

                            it('Should return 404 for non-existent attachment IDs.', async () => {
                                const uploadResponse = await app.request(
                                    '/api/objectStorage/upload/create',
                                    {
                                        method: 'POST',
                                        headers: {
                                            origin: env.URL_FRONTEND,
                                            'content-type': 'application/json',
                                            cookie: privilegedCookie,
                                        },
                                        body: JSON.stringify({
                                            idempotencyKey: uuidv7(),
                                        }),
                                    },
                                    env,
                                )

                                const uploadData =
                                    await uploadResponse.json<
                                        TApiResponseOk<{ uploadId: string }>
                                    >()

                                const response = await app.request(
                                    '/api/objectStorage/upload/attachment/retry',
                                    {
                                        method: 'QUERY',
                                        headers: {
                                            origin: env.URL_FRONTEND,
                                            'content-type': 'application/json',
                                            cookie: privilegedCookie,
                                        },
                                        body: JSON.stringify({
                                            uploadId: uploadData.data.uploadId,
                                            attachments: [
                                                TEST_MISSING_ATTACHMENT_ID,
                                            ],
                                        }),
                                    },
                                    env,
                                )

                                const responseData = await response.json<
                                    TApiResponseOk<{
                                        uploadId: string
                                        signedUrls: {
                                            id: string
                                            signedUrl: string | null
                                            status: number
                                        }[]
                                    }>
                                >()

                                expect(response.status).toBe(200)
                                expect(
                                    responseData.data?.signedUrls,
                                    'Expected signedUrls to be present in the response',
                                ).toBeDefined()
                                expect(
                                    responseData.data.signedUrls[0].status,
                                ).toBe(404)
                                expect(
                                    responseData.data.signedUrls[0].signedUrl,
                                ).toBeNull()
                            })

                            it('Should return 409 for already uploaded attachments.', async () => {
                                // Create upload, attach, and commit
                                const uploadResponse = await app.request(
                                    '/api/objectStorage/upload/create',
                                    {
                                        method: 'POST',
                                        headers: {
                                            origin: env.URL_FRONTEND,
                                            'content-type': 'application/json',
                                            cookie: privilegedCookie,
                                        },
                                        body: JSON.stringify({
                                            idempotencyKey: uuidv7(),
                                        }),
                                    },
                                    env,
                                )

                                const uploadData =
                                    await uploadResponse.json<
                                        TApiResponseOk<{ uploadId: string }>
                                    >()
                                const uploadId = uploadData.data.uploadId

                                const attachResponse = await app.request(
                                    '/api/objectStorage/upload/attachment/create',
                                    {
                                        method: 'POST',
                                        headers: {
                                            origin: env.URL_FRONTEND,
                                            'content-type': 'application/json',
                                            cookie: privilegedCookie,
                                        },
                                        body: JSON.stringify({
                                            idempotencyKey: uuidv7(),
                                            uploadId,
                                            attachments: [
                                                {
                                                    size: 256,
                                                    hashSha256:
                                                        createHashSha256(),
                                                    isPublic: false,
                                                },
                                            ],
                                        }),
                                    },
                                    env,
                                )

                                const attachData = await attachResponse.json<
                                    TApiResponseOk<{
                                        uploadId: string
                                        signedUrls: {
                                            id: string
                                            status: number
                                        }[]
                                    }>
                                >()

                                expect(
                                    attachData.data?.signedUrls,
                                    'Expected signedUrls to be present in the response',
                                ).toBeDefined()
                                const attachmentId =
                                    attachData.data.signedUrls[0].id

                                // Mark as uploaded
                                await app.request(
                                    '/api/objectStorage/upload/attachment/commit',
                                    {
                                        method: 'POST',
                                        headers: {
                                            origin: env.URL_FRONTEND,
                                            'content-type': 'application/json',
                                            cookie: privilegedCookie,
                                        },
                                        body: JSON.stringify({
                                            uploadId,
                                            attachments: [attachmentId],
                                        }),
                                    },
                                    env,
                                )

                                // Retry should return 409
                                const response = await app.request(
                                    '/api/objectStorage/upload/attachment/retry',
                                    {
                                        method: 'QUERY',
                                        headers: {
                                            origin: env.URL_FRONTEND,
                                            'content-type': 'application/json',
                                            cookie: privilegedCookie,
                                        },
                                        body: JSON.stringify({
                                            uploadId,
                                            attachments: [attachmentId],
                                        }),
                                    },
                                    env,
                                )

                                const responseData = await response.json<
                                    TApiResponseOk<{
                                        uploadId: string
                                        signedUrls: {
                                            id: string
                                            signedUrl: string | null
                                            status: number
                                        }[]
                                    }>
                                >()

                                expect(response.status).toBe(200)
                                expect(
                                    responseData.data?.signedUrls,
                                    'Expected signedUrls to be present in the response',
                                ).toBeDefined()
                                expect(
                                    responseData.data.signedUrls[0].status,
                                ).toBe(409)
                                expect(
                                    responseData.data.signedUrls[0].signedUrl,
                                ).toBeNull()
                            })

                            it('Should reject attachment retry after upload commit.', async () => {
                                const uploadId = await createUpload()
                                const attachmentId =
                                    await createUploadAttachment(uploadId)

                                expect(
                                    (await commitUpload(uploadId)).status,
                                ).toBe(200)

                                const response = await app.request(
                                    '/api/objectStorage/upload/attachment/retry',
                                    {
                                        method: 'QUERY',
                                        headers: {
                                            origin: env.URL_FRONTEND,
                                            'content-type': 'application/json',
                                            cookie: privilegedCookie,
                                        },
                                        body: JSON.stringify({
                                            uploadId,
                                            attachments: [attachmentId],
                                        }),
                                    },
                                    env,
                                )

                                const responseData =
                                    await response.json<TApiResponseError>()

                                expect(response.status).toBe(404)
                                expect(responseData.error.code).toBe(
                                    'NOT_FOUND',
                                )
                            })
                        },
                    )

                    routeDescribe(
                        activeRoute,
                        'uploadAttachment',
                        'Commit Upload Attachment',
                        () => {
                            it('Should mark attachments as uploaded.', async () => {
                                const uploadResponse = await app.request(
                                    '/api/objectStorage/upload/create',
                                    {
                                        method: 'POST',
                                        headers: {
                                            origin: env.URL_FRONTEND,
                                            'content-type': 'application/json',
                                            cookie: privilegedCookie,
                                        },
                                        body: JSON.stringify({
                                            idempotencyKey: uuidv7(),
                                        }),
                                    },
                                    env,
                                )

                                const uploadData =
                                    await uploadResponse.json<
                                        TApiResponseOk<{ uploadId: string }>
                                    >()
                                const uploadId = uploadData.data.uploadId

                                const attachResponse = await app.request(
                                    '/api/objectStorage/upload/attachment/create',
                                    {
                                        method: 'POST',
                                        headers: {
                                            origin: env.URL_FRONTEND,
                                            'content-type': 'application/json',
                                            cookie: privilegedCookie,
                                        },
                                        body: JSON.stringify({
                                            idempotencyKey: uuidv7(),
                                            uploadId,
                                            attachments: [
                                                {
                                                    size: 2048,
                                                    hashSha256:
                                                        createHashSha256(),
                                                    isPublic: false,
                                                },
                                            ],
                                        }),
                                    },
                                    env,
                                )

                                const attachData = await attachResponse.json<
                                    TApiResponseOk<{
                                        uploadId: string
                                        signedUrls: {
                                            id: string
                                            status: number
                                        }[]
                                    }>
                                >()

                                expect(
                                    attachData.data?.signedUrls,
                                    'Expected signedUrls to be present in the response',
                                ).toBeDefined()
                                const attachmentId =
                                    attachData.data.signedUrls[0].id

                                const response = await app.request(
                                    '/api/objectStorage/upload/attachment/commit',
                                    {
                                        method: 'POST',
                                        headers: {
                                            origin: env.URL_FRONTEND,
                                            'content-type': 'application/json',
                                            cookie: privilegedCookie,
                                        },
                                        body: JSON.stringify({
                                            uploadId,
                                            attachments: [attachmentId],
                                        }),
                                    },
                                    env,
                                )

                                const responseData = await response.json<
                                    TApiResponseOk<{
                                        uploadId: string
                                        attachments: string[]
                                    }>
                                >()

                                expect(response.status).toBe(200)
                                expect(responseData.success).toBe(true)
                                expect(responseData.data.uploadId).toBe(
                                    uploadId,
                                )
                                expect(responseData.data.attachments).toContain(
                                    attachmentId,
                                )
                            })

                            it('Should reject repeated attachment commit.', async () => {
                                const uploadId = await createUpload()
                                const attachmentId =
                                    await createUploadAttachment(uploadId)

                                expect(
                                    (
                                        await commitUploadAttachment(
                                            uploadId,
                                            attachmentId,
                                        )
                                    ).status,
                                ).toBe(200)

                                const response = await commitUploadAttachment(
                                    uploadId,
                                    attachmentId,
                                )
                                const responseData =
                                    await response.json<TApiResponseError>()

                                expect(response.status).toBe(409)
                                expect(responseData.error.code).toBe(
                                    'UPLOAD_ATTACHMENTS_ALREADY_COMMITTED',
                                )
                            })

                            it('Should allow only one concurrent attachment commit.', async () => {
                                const uploadId = await createUpload()
                                const attachmentId =
                                    await createUploadAttachment(uploadId)

                                const responses = await Promise.all([
                                    commitUploadAttachment(
                                        uploadId,
                                        attachmentId,
                                    ),
                                    commitUploadAttachment(
                                        uploadId,
                                        attachmentId,
                                    ),
                                ])

                                expect(
                                    responses
                                        .map(({ status }) => status)
                                        .sort(),
                                ).toEqual([
                                    200,
                                    409,
                                ])
                            })

                            it('Should reject partial attachment commit with unknown IDs.', async () => {
                                const uploadId = await createUpload()
                                const attachmentId =
                                    await createUploadAttachment(uploadId)

                                const response = await app.request(
                                    '/api/objectStorage/upload/attachment/commit',
                                    {
                                        method: 'POST',
                                        headers: {
                                            origin: env.URL_FRONTEND,
                                            'content-type': 'application/json',
                                            cookie: privilegedCookie,
                                        },
                                        body: JSON.stringify({
                                            uploadId,
                                            attachments: [
                                                attachmentId,
                                                'a'.repeat(32),
                                            ],
                                        }),
                                    },
                                    env,
                                )

                                const responseData =
                                    await response.json<TApiResponseError>()

                                expect(response.status).toBe(404)
                                expect(responseData.error.code).toBe(
                                    'UPLOAD_ATTACHMENTS_NOT_FOUND',
                                )
                                expect(
                                    (
                                        await commitUploadAttachment(
                                            uploadId,
                                            attachmentId,
                                        )
                                    ).status,
                                ).toBe(200)
                            })

                            it('Should reject partial attachment commit with already committed IDs.', async () => {
                                const uploadId = await createUpload()
                                const committedAttachmentId =
                                    await createUploadAttachment(uploadId)
                                const pendingAttachmentId =
                                    await createUploadAttachment(uploadId)

                                expect(
                                    (
                                        await commitUploadAttachment(
                                            uploadId,
                                            committedAttachmentId,
                                        )
                                    ).status,
                                ).toBe(200)

                                const response = await app.request(
                                    '/api/objectStorage/upload/attachment/commit',
                                    {
                                        method: 'POST',
                                        headers: {
                                            origin: env.URL_FRONTEND,
                                            'content-type': 'application/json',
                                            cookie: privilegedCookie,
                                        },
                                        body: JSON.stringify({
                                            uploadId,
                                            attachments: [
                                                committedAttachmentId,
                                                pendingAttachmentId,
                                            ],
                                        }),
                                    },
                                    env,
                                )

                                const responseData =
                                    await response.json<TApiResponseError>()

                                expect(response.status).toBe(409)
                                expect(responseData.error.code).toBe(
                                    'UPLOAD_ATTACHMENTS_ALREADY_COMMITTED',
                                )
                                expect(
                                    (
                                        await commitUploadAttachment(
                                            uploadId,
                                            pendingAttachmentId,
                                        )
                                    ).status,
                                ).toBe(200)
                            })

                            it('Should reject attachment commit after upload commit.', async () => {
                                const uploadId = await createUpload()
                                const attachmentId =
                                    await createUploadAttachment(uploadId)

                                expect(
                                    (await commitUpload(uploadId)).status,
                                ).toBe(200)

                                const response = await commitUploadAttachment(
                                    uploadId,
                                    attachmentId,
                                )
                                const responseData =
                                    await response.json<TApiResponseError>()

                                expect(response.status).toBe(409)
                                expect(responseData.error.code).toBe(
                                    'UPLOAD_ALREADY_COMMITTED',
                                )
                            })
                        },
                    )

                    routeDescribe(
                        activeRoute,
                        'upload',
                        'Commit Upload',
                        () => {
                            it('Should commit an upload with attachments.', async () => {
                                // Full flow: create → attach → attachment commit → upload commit
                                const uploadResponse = await app.request(
                                    '/api/objectStorage/upload/create',
                                    {
                                        method: 'POST',
                                        headers: {
                                            origin: env.URL_FRONTEND,
                                            'content-type': 'application/json',
                                            cookie: privilegedCookie,
                                        },
                                        body: JSON.stringify({
                                            idempotencyKey: uuidv7(),
                                        }),
                                    },
                                    env,
                                )

                                const uploadData =
                                    await uploadResponse.json<
                                        TApiResponseOk<{ uploadId: string }>
                                    >()
                                const uploadId = uploadData.data.uploadId

                                const attachResponse = await app.request(
                                    '/api/objectStorage/upload/attachment/create',
                                    {
                                        method: 'POST',
                                        headers: {
                                            origin: env.URL_FRONTEND,
                                            'content-type': 'application/json',
                                            cookie: privilegedCookie,
                                        },
                                        body: JSON.stringify({
                                            idempotencyKey: uuidv7(),
                                            uploadId,
                                            attachments: [
                                                {
                                                    size: 4096,
                                                    hashSha256:
                                                        createHashSha256(),
                                                    isPublic: false,
                                                },
                                            ],
                                        }),
                                    },
                                    env,
                                )

                                const attachData = await attachResponse.json<
                                    TApiResponseOk<{
                                        uploadId: string
                                        signedUrls: {
                                            id: string
                                            status: number
                                        }[]
                                    }>
                                >()

                                expect(
                                    attachData.data?.signedUrls,
                                    'Expected signedUrls to be present in the response',
                                ).toBeDefined()
                                const attachmentId =
                                    attachData.data.signedUrls[0].id

                                // Mark attachment as uploaded
                                await app.request(
                                    '/api/objectStorage/upload/attachment/commit',
                                    {
                                        method: 'POST',
                                        headers: {
                                            origin: env.URL_FRONTEND,
                                            'content-type': 'application/json',
                                            cookie: privilegedCookie,
                                        },
                                        body: JSON.stringify({
                                            uploadId,
                                            attachments: [attachmentId],
                                        }),
                                    },
                                    env,
                                )

                                // Commit the upload
                                const response = await app.request(
                                    '/api/objectStorage/upload/commit',
                                    {
                                        method: 'POST',
                                        headers: {
                                            origin: env.URL_FRONTEND,
                                            'content-type': 'application/json',
                                            cookie: privilegedCookie,
                                        },
                                        body: JSON.stringify({
                                            uploadId,
                                            attachments: [attachmentId],
                                        }),
                                    },
                                    env,
                                )

                                const responseData = await response.json<
                                    TApiResponseOk<{
                                        uploadId: string
                                        attachments: string[]
                                    }>
                                >()

                                expect(response.status).toBe(200)
                                expect(responseData.success).toBe(true)
                                expect(responseData.data.uploadId).toBe(
                                    uploadId,
                                )
                                expect(responseData.data.attachments).toContain(
                                    attachmentId,
                                )
                            })

                            it('Should allow commit for an empty upload.', async () => {
                                const uploadId = await createUpload()

                                const response = await app.request(
                                    '/api/objectStorage/upload/commit',
                                    {
                                        method: 'POST',
                                        headers: {
                                            origin: env.URL_FRONTEND,
                                            'content-type': 'application/json',
                                            cookie: privilegedCookie,
                                        },
                                        body: JSON.stringify({ uploadId }),
                                    },
                                    env,
                                )

                                const responseData = await response.json<
                                    TApiResponseOk<{
                                        uploadId: string
                                        attachments: string[]
                                    }>
                                >()

                                expect(response.status).toBe(200)
                                expect(responseData.data.uploadId).toBe(
                                    uploadId,
                                )
                                expect(responseData.data.attachments).toEqual(
                                    [],
                                )
                            })

                            it('Should reject upload commit with pending selected attachments.', async () => {
                                const uploadId = await createUpload()
                                const attachmentId =
                                    await createUploadAttachment(uploadId)

                                const response = await app.request(
                                    '/api/objectStorage/upload/commit',
                                    {
                                        method: 'POST',
                                        headers: {
                                            origin: env.URL_FRONTEND,
                                            'content-type': 'application/json',
                                            cookie: privilegedCookie,
                                        },
                                        body: JSON.stringify({
                                            uploadId,
                                            attachments: [attachmentId],
                                        }),
                                    },
                                    env,
                                )

                                const responseData =
                                    await response.json<TApiResponseError>()

                                expect(response.status).toBe(409)
                                expect(responseData.error.code).toBe(
                                    'UPLOAD_ATTACHMENTS_NOT_COMMITTED',
                                )
                            })

                            it('Should reject upload commit with unknown selected attachments.', async () => {
                                const uploadId = await createUpload()

                                const response = await app.request(
                                    '/api/objectStorage/upload/commit',
                                    {
                                        method: 'POST',
                                        headers: {
                                            origin: env.URL_FRONTEND,
                                            'content-type': 'application/json',
                                            cookie: privilegedCookie,
                                        },
                                        body: JSON.stringify({
                                            uploadId,
                                            attachments: ['a'.repeat(32)],
                                        }),
                                    },
                                    env,
                                )

                                const responseData =
                                    await response.json<TApiResponseError>()

                                expect(response.status).toBe(404)
                                expect(responseData.error.code).toBe(
                                    'UPLOAD_ATTACHMENTS_NOT_FOUND',
                                )
                            })

                            it('Should reject commit for already committed upload.', async () => {
                                // Create and commit an upload first
                                const uploadResponse = await app.request(
                                    '/api/objectStorage/upload/create',
                                    {
                                        method: 'POST',
                                        headers: {
                                            origin: env.URL_FRONTEND,
                                            'content-type': 'application/json',
                                            cookie: privilegedCookie,
                                        },
                                        body: JSON.stringify({
                                            idempotencyKey: uuidv7(),
                                        }),
                                    },
                                    env,
                                )

                                const uploadData =
                                    await uploadResponse.json<
                                        TApiResponseOk<{ uploadId: string }>
                                    >()
                                const uploadId = uploadData.data.uploadId

                                // Commit with no attachments
                                await app.request(
                                    '/api/objectStorage/upload/commit',
                                    {
                                        method: 'POST',
                                        headers: {
                                            origin: env.URL_FRONTEND,
                                            'content-type': 'application/json',
                                            cookie: privilegedCookie,
                                        },
                                        body: JSON.stringify({ uploadId }),
                                    },
                                    env,
                                )

                                // Try to commit again
                                const response = await app.request(
                                    '/api/objectStorage/upload/commit',
                                    {
                                        method: 'POST',
                                        headers: {
                                            origin: env.URL_FRONTEND,
                                            'content-type': 'application/json',
                                            cookie: privilegedCookie,
                                        },
                                        body: JSON.stringify({ uploadId }),
                                    },
                                    env,
                                )

                                const responseData =
                                    await response.json<TApiResponseError>()

                                expect(response.status).toBe(409)
                                expect(responseData).toHaveProperty('error')
                                expect(responseData.error.code).toBe(
                                    'UPLOAD_ALREADY_COMMITTED',
                                )
                            })

                            it('Should allow only one concurrent upload commit.', async () => {
                                const uploadId = await createUpload()

                                const responses = await Promise.all([
                                    commitUpload(uploadId),
                                    commitUpload(uploadId),
                                ])

                                expect(
                                    responses
                                        .map(({ status }) => status)
                                        .sort(),
                                ).toEqual([
                                    200,
                                    409,
                                ])
                            })

                            it('Should serialize attachment creation against upload commit.', async () => {
                                const uploadId = await createUpload()
                                const [
                                    attachmentResponse,
                                    commitResponse,
                                ] = await Promise.all([
                                    requestUploadAttachment(uploadId),
                                    commitUpload(uploadId, []),
                                ])
                                const database = dbClient(env.HYPERIONPUB_D1)
                                const [uploadRow] = await database
                                    .select({
                                        isCommitted:
                                            dbSchema.upload.isCommitted,
                                    })
                                    .from(dbSchema.upload)
                                    .where(eq(dbSchema.upload.id, uploadId))
                                const attachments = await database
                                    .select({
                                        id: dbSchema.uploadAttachment
                                            .objectStorageId,
                                    })
                                    .from(dbSchema.uploadAttachment)
                                    .where(
                                        eq(
                                            dbSchema.uploadAttachment.uploadId,
                                            uploadId,
                                        ),
                                    )

                                if (commitResponse.status === 200) {
                                    expect(uploadRow?.isCommitted).toBe(true)
                                    expect(attachments).toHaveLength(0)
                                    expect([
                                        200,
                                        409,
                                    ]).toContain(attachmentResponse.status)
                                } else {
                                    expect(commitResponse.status).toBe(409)
                                    expect(attachmentResponse.status).toBe(200)
                                    expect(uploadRow?.isCommitted).toBe(false)
                                    expect(attachments).toHaveLength(1)
                                }
                            })

                            it('Should purge unselected attachments on commit.', async () => {
                                const uploadResponse = await app.request(
                                    '/api/objectStorage/upload/create',
                                    {
                                        method: 'POST',
                                        headers: {
                                            origin: env.URL_FRONTEND,
                                            'content-type': 'application/json',
                                            cookie: privilegedCookie,
                                        },
                                        body: JSON.stringify({
                                            idempotencyKey: uuidv7(),
                                        }),
                                    },
                                    env,
                                )

                                const uploadData =
                                    await uploadResponse.json<
                                        TApiResponseOk<{ uploadId: string }>
                                    >()
                                const uploadId = uploadData.data.uploadId

                                // Add two attachments
                                const attachResponse = await app.request(
                                    '/api/objectStorage/upload/attachment/create',
                                    {
                                        method: 'POST',
                                        headers: {
                                            origin: env.URL_FRONTEND,
                                            'content-type': 'application/json',
                                            cookie: privilegedCookie,
                                        },
                                        body: JSON.stringify({
                                            idempotencyKey: uuidv7(),
                                            uploadId,
                                            attachments: [
                                                {
                                                    size: 1024,
                                                    hashSha256:
                                                        createHashSha256(),
                                                    isPublic: false,
                                                },
                                                {
                                                    size: 2048,
                                                    hashSha256:
                                                        createHashSha256(),
                                                    isPublic: false,
                                                },
                                            ],
                                        }),
                                    },
                                    env,
                                )

                                const attachData = await attachResponse.json<
                                    TApiResponseOk<{
                                        uploadId: string
                                        signedUrls: {
                                            id: string
                                            status: number
                                        }[]
                                    }>
                                >()

                                expect(
                                    attachData.data?.signedUrls,
                                    'Expected signedUrls to be present in the response',
                                ).toBeDefined()
                                const keepAttachmentId =
                                    attachData.data.signedUrls[0].id

                                await app.request(
                                    '/api/objectStorage/upload/attachment/commit',
                                    {
                                        method: 'POST',
                                        headers: {
                                            origin: env.URL_FRONTEND,
                                            'content-type': 'application/json',
                                            cookie: privilegedCookie,
                                        },
                                        body: JSON.stringify({
                                            uploadId,
                                            attachments: [keepAttachmentId],
                                        }),
                                    },
                                    env,
                                )

                                // Commit with only the first attachment (purge the second)
                                const response = await app.request(
                                    '/api/objectStorage/upload/commit',
                                    {
                                        method: 'POST',
                                        headers: {
                                            origin: env.URL_FRONTEND,
                                            'content-type': 'application/json',
                                            cookie: privilegedCookie,
                                        },
                                        body: JSON.stringify({
                                            uploadId,
                                            attachments: [keepAttachmentId],
                                        }),
                                    },
                                    env,
                                )

                                const responseData = await response.json<
                                    TApiResponseOk<{
                                        uploadId: string
                                        attachments: string[]
                                    }>
                                >()

                                expect(response.status).toBe(200)
                                expect(
                                    responseData.data.attachments,
                                ).toHaveLength(1)
                                expect(responseData.data.attachments).toContain(
                                    keepAttachmentId,
                                )
                            })

                            it("Standard user should not commit another user's upload.", async () => {
                                // Create upload as privileged user
                                const uploadResponse = await app.request(
                                    '/api/objectStorage/upload/create',
                                    {
                                        method: 'POST',
                                        headers: {
                                            origin: env.URL_FRONTEND,
                                            'content-type': 'application/json',
                                            cookie: privilegedCookie,
                                        },
                                        body: JSON.stringify({
                                            idempotencyKey: uuidv7(),
                                        }),
                                    },
                                    env,
                                )

                                const uploadData =
                                    await uploadResponse.json<
                                        TApiResponseOk<{ uploadId: string }>
                                    >()

                                // Attempt commit as standard user
                                const response = await app.request(
                                    '/api/objectStorage/upload/commit',
                                    {
                                        method: 'POST',
                                        headers: {
                                            origin: env.URL_FRONTEND,
                                            'content-type': 'application/json',
                                            cookie: standardCookie,
                                        },
                                        body: JSON.stringify({
                                            uploadId: uploadData.data.uploadId,
                                        }),
                                    },
                                    env,
                                )

                                const responseData =
                                    await response.json<TApiResponseError>()

                                expect(response.status).toBe(404)
                                expect(responseData).toHaveProperty('error')
                                expect(responseData.error.message).toBe(
                                    'Upload ID not found or is already committed.',
                                )
                            })
                        },
                    )
                })

            /**
             * @description
             * Download Flow
             */
            if (activeRoute === 'download')
                describe('Download Flow', () => {
                    routeDescribe(
                        activeRoute,
                        'download',
                        'Read Download List',
                        () => {
                            it('Should list committed uploaded objects and skip pending objects.', async () => {
                                const committedUploadId =
                                    await createUpload(standardCookie)
                                const committedAttachmentId =
                                    await createUploadAttachment(
                                        committedUploadId,
                                        standardCookie,
                                    )

                                expect(
                                    (
                                        await commitUploadAttachment(
                                            committedUploadId,
                                            committedAttachmentId,
                                        )
                                    ).status,
                                ).toBe(200)
                                expect(
                                    (
                                        await commitUpload(committedUploadId, [
                                            committedAttachmentId,
                                        ])
                                    ).status,
                                ).toBe(200)

                                const pendingUploadId =
                                    await createUpload(standardCookie)
                                const pendingAttachmentId =
                                    await createUploadAttachment(
                                        pendingUploadId,
                                        standardCookie,
                                    )

                                const response = await queryTestingRequest(
                                    '/api/objectStorage/download/readMany',
                                    {
                                        limit: 100,
                                        offset: 0,
                                        sortOrder: 'desc',
                                    },
                                    { cookie: standardCookie },
                                )

                                const responseData = await response.json<
                                    TApiResponsePaginatedOk<
                                        {
                                            uploadId: string
                                            objectStorageId: string
                                        }[]
                                    >
                                >()

                                expect(response.status).toBe(200)
                                expect(responseData.success).toBe(true)
                                expect(
                                    responseData.data.some(
                                        ({ objectStorageId, uploadId }) =>
                                            uploadId === committedUploadId &&
                                            objectStorageId ===
                                                committedAttachmentId,
                                    ),
                                ).toBe(true)
                                expect(
                                    responseData.data.some(
                                        ({ objectStorageId, uploadId }) =>
                                            uploadId === pendingUploadId &&
                                            objectStorageId ===
                                                pendingAttachmentId,
                                    ),
                                ).toBe(false)
                            })
                        },
                    )

                    routeDescribe(
                        activeRoute,
                        'download',
                        'Create Download Link',
                        () => {
                            it('Should reject download links before upload commit.', async () => {
                                const uploadId =
                                    await createUpload(standardCookie)
                                const attachmentId =
                                    await createUploadAttachment(
                                        uploadId,
                                        standardCookie,
                                    )

                                await app.request(
                                    '/api/objectStorage/upload/attachment/commit',
                                    {
                                        method: 'POST',
                                        headers: {
                                            origin: env.URL_FRONTEND,
                                            'content-type': 'application/json',
                                            cookie: standardCookie,
                                        },
                                        body: JSON.stringify({
                                            uploadId,
                                            attachments: [attachmentId],
                                        }),
                                    },
                                    env,
                                )

                                const response = await getTestingRequest(
                                    '/api/objectStorage/download/link/create',
                                    {
                                        cookie: standardCookie,
                                        query: { uploadId },
                                    },
                                )

                                const responseData =
                                    await response.json<TApiResponseError>()

                                expect(response.status).toBe(404)
                                expect(responseData.error.message).toBe(
                                    'Upload ID not found.',
                                )
                            })

                            it('Should reject download links for pending attachments.', async () => {
                                const uploadId =
                                    await createUpload(standardCookie)
                                await createUploadAttachment(
                                    uploadId,
                                    standardCookie,
                                )

                                const response = await getTestingRequest(
                                    '/api/objectStorage/download/link/create',
                                    {
                                        cookie: standardCookie,
                                        query: { uploadId },
                                    },
                                )

                                const responseData =
                                    await response.json<TApiResponseError>()

                                expect(response.status).toBe(404)
                                expect(responseData.error.message).toBe(
                                    'Upload ID not found.',
                                )
                            })

                            it('Should create download links for own upload.', async () => {
                                // Full upload flow first
                                const uploadResponse = await app.request(
                                    '/api/objectStorage/upload/create',
                                    {
                                        method: 'POST',
                                        headers: {
                                            origin: env.URL_FRONTEND,
                                            'content-type': 'application/json',
                                            cookie: standardCookie,
                                        },
                                        body: JSON.stringify({
                                            idempotencyKey: uuidv7(),
                                        }),
                                    },
                                    env,
                                )

                                const uploadData =
                                    await uploadResponse.json<
                                        TApiResponseOk<{ uploadId: string }>
                                    >()
                                const uploadId = uploadData.data.uploadId

                                const attachResponse = await app.request(
                                    '/api/objectStorage/upload/attachment/create',
                                    {
                                        method: 'POST',
                                        headers: {
                                            origin: env.URL_FRONTEND,
                                            'content-type': 'application/json',
                                            cookie: standardCookie,
                                        },
                                        body: JSON.stringify({
                                            idempotencyKey: uuidv7(),
                                            uploadId,
                                            attachments: [
                                                {
                                                    size: 1024,
                                                    hashSha256:
                                                        createHashSha256(),
                                                    isPublic: false,
                                                },
                                            ],
                                        }),
                                    },
                                    env,
                                )

                                const attachData = await attachResponse.json<
                                    TApiResponseOk<{
                                        uploadId: string
                                        signedUrls: {
                                            id: string
                                            status: number
                                        }[]
                                    }>
                                >()

                                expect(
                                    attachData.data?.signedUrls,
                                    'Expected signedUrls to be present in the response',
                                ).toBeDefined()
                                const attachmentId =
                                    attachData.data.signedUrls[0].id

                                // Mark as uploaded and commit
                                await app.request(
                                    '/api/objectStorage/upload/attachment/commit',
                                    {
                                        method: 'POST',
                                        headers: {
                                            origin: env.URL_FRONTEND,
                                            'content-type': 'application/json',
                                            cookie: standardCookie,
                                        },
                                        body: JSON.stringify({
                                            uploadId,
                                            attachments: [attachmentId],
                                        }),
                                    },
                                    env,
                                )

                                await app.request(
                                    '/api/objectStorage/upload/commit',
                                    {
                                        method: 'POST',
                                        headers: {
                                            origin: env.URL_FRONTEND,
                                            'content-type': 'application/json',
                                            cookie: standardCookie,
                                        },
                                        body: JSON.stringify({
                                            uploadId,
                                            attachments: [attachmentId],
                                        }),
                                    },
                                    env,
                                )

                                // Request download links
                                const response = await getTestingRequest(
                                    '/api/objectStorage/download/link/create',
                                    {
                                        cookie: standardCookie,
                                        query: { uploadId },
                                    },
                                )

                                const responseData = await response.json<
                                    TApiResponseOk<{
                                        downloadUrls: {
                                            objectStorageId: string
                                            downloadUrl: string | null
                                            status: number
                                        }[]
                                    }>
                                >()

                                expect(response.status).toBe(200)
                                expect(responseData.success).toBe(true)
                                expect(
                                    responseData.data.downloadUrls,
                                ).toHaveLength(1)
                                expect(
                                    responseData.data.downloadUrls[0]
                                        .downloadUrl,
                                ).toBeTruthy()
                            })

                            it("Standard user should not access another user's upload download links.", async () => {
                                // Create upload as privileged user
                                const uploadResponse = await app.request(
                                    '/api/objectStorage/upload/create',
                                    {
                                        method: 'POST',
                                        headers: {
                                            origin: env.URL_FRONTEND,
                                            'content-type': 'application/json',
                                            cookie: privilegedCookie,
                                        },
                                        body: JSON.stringify({
                                            idempotencyKey: uuidv7(),
                                        }),
                                    },
                                    env,
                                )

                                const uploadData =
                                    await uploadResponse.json<
                                        TApiResponseOk<{ uploadId: string }>
                                    >()
                                const uploadId = uploadData.data.uploadId

                                const attachResponse = await app.request(
                                    '/api/objectStorage/upload/attachment/create',
                                    {
                                        method: 'POST',
                                        headers: {
                                            origin: env.URL_FRONTEND,
                                            'content-type': 'application/json',
                                            cookie: privilegedCookie,
                                        },
                                        body: JSON.stringify({
                                            idempotencyKey: uuidv7(),
                                            uploadId,
                                            attachments: [
                                                {
                                                    size: 1024,
                                                    hashSha256:
                                                        createHashSha256(),
                                                    isPublic: false,
                                                },
                                            ],
                                        }),
                                    },
                                    env,
                                )

                                const attachData = await attachResponse.json<
                                    TApiResponseOk<{
                                        uploadId: string
                                        signedUrls: {
                                            id: string
                                            status: number
                                        }[]
                                    }>
                                >()

                                expect(
                                    attachData.data?.signedUrls,
                                    'Expected signedUrls to be present in the response',
                                ).toBeDefined()
                                const attachmentId =
                                    attachData.data.signedUrls[0].id

                                await app.request(
                                    '/api/objectStorage/upload/attachment/commit',
                                    {
                                        method: 'POST',
                                        headers: {
                                            origin: env.URL_FRONTEND,
                                            'content-type': 'application/json',
                                            cookie: privilegedCookie,
                                        },
                                        body: JSON.stringify({
                                            uploadId,
                                            attachments: [attachmentId],
                                        }),
                                    },
                                    env,
                                )

                                await app.request(
                                    '/api/objectStorage/upload/commit',
                                    {
                                        method: 'POST',
                                        headers: {
                                            origin: env.URL_FRONTEND,
                                            'content-type': 'application/json',
                                            cookie: privilegedCookie,
                                        },
                                        body: JSON.stringify({
                                            uploadId,
                                            attachments: [attachmentId],
                                        }),
                                    },
                                    env,
                                )

                                // Standard user tries to get download links
                                const response = await getTestingRequest(
                                    '/api/objectStorage/download/link/create',
                                    {
                                        cookie: standardCookie,
                                        query: { uploadId },
                                    },
                                )

                                const responseData =
                                    await response.json<TApiResponseError>()

                                expect(response.status).toBe(404)
                                expect(responseData).toHaveProperty('error')
                                expect(responseData.error.message).toBe(
                                    'Upload ID not found.',
                                )
                            })

                            it("Privileged user should access any user's upload download links.", async () => {
                                // Create upload as standard user
                                const uploadResponse = await app.request(
                                    '/api/objectStorage/upload/create',
                                    {
                                        method: 'POST',
                                        headers: {
                                            origin: env.URL_FRONTEND,
                                            'content-type': 'application/json',
                                            cookie: standardCookie,
                                        },
                                        body: JSON.stringify({
                                            idempotencyKey: uuidv7(),
                                        }),
                                    },
                                    env,
                                )

                                const uploadData =
                                    await uploadResponse.json<
                                        TApiResponseOk<{ uploadId: string }>
                                    >()
                                const uploadId = uploadData.data.uploadId

                                const attachResponse = await app.request(
                                    '/api/objectStorage/upload/attachment/create',
                                    {
                                        method: 'POST',
                                        headers: {
                                            origin: env.URL_FRONTEND,
                                            'content-type': 'application/json',
                                            cookie: standardCookie,
                                        },
                                        body: JSON.stringify({
                                            idempotencyKey: uuidv7(),
                                            uploadId,
                                            attachments: [
                                                {
                                                    size: 1024,
                                                    hashSha256:
                                                        createHashSha256(),
                                                    isPublic: false,
                                                },
                                            ],
                                        }),
                                    },
                                    env,
                                )

                                const attachData = await attachResponse.json<
                                    TApiResponseOk<{
                                        uploadId: string
                                        signedUrls: {
                                            id: string
                                            status: number
                                        }[]
                                    }>
                                >()

                                expect(
                                    attachData.data?.signedUrls,
                                    'Expected signedUrls to be present in the response',
                                ).toBeDefined()
                                const attachmentId =
                                    attachData.data.signedUrls[0].id

                                await app.request(
                                    '/api/objectStorage/upload/attachment/commit',
                                    {
                                        method: 'POST',
                                        headers: {
                                            origin: env.URL_FRONTEND,
                                            'content-type': 'application/json',
                                            cookie: standardCookie,
                                        },
                                        body: JSON.stringify({
                                            uploadId,
                                            attachments: [attachmentId],
                                        }),
                                    },
                                    env,
                                )

                                await app.request(
                                    '/api/objectStorage/upload/commit',
                                    {
                                        method: 'POST',
                                        headers: {
                                            origin: env.URL_FRONTEND,
                                            'content-type': 'application/json',
                                            cookie: standardCookie,
                                        },
                                        body: JSON.stringify({
                                            uploadId,
                                            attachments: [attachmentId],
                                        }),
                                    },
                                    env,
                                )

                                // Privileged user requests download links
                                const response = await getTestingRequest(
                                    '/api/objectStorage/download/link/create',
                                    {
                                        cookie: privilegedCookie,
                                        query: { uploadId },
                                    },
                                )

                                const responseData = await response.json<
                                    TApiResponseOk<{
                                        downloadUrls: {
                                            objectStorageId: string
                                            downloadUrl: string | null
                                            status: number
                                        }[]
                                    }>
                                >()

                                expect(response.status).toBe(200)
                                expect(responseData.success).toBe(true)
                                expect(
                                    responseData.data.downloadUrls,
                                ).toHaveLength(1)
                                expect(
                                    responseData.data.downloadUrls[0]
                                        .downloadUrl,
                                ).toBeTruthy()
                            })

                            it('Should return public URL for public objects.', async () => {
                                const uploadResponse = await app.request(
                                    '/api/objectStorage/upload/create',
                                    {
                                        method: 'POST',
                                        headers: {
                                            origin: env.URL_FRONTEND,
                                            'content-type': 'application/json',
                                            cookie: standardCookie,
                                        },
                                        body: JSON.stringify({
                                            idempotencyKey: uuidv7(),
                                        }),
                                    },
                                    env,
                                )

                                const uploadData =
                                    await uploadResponse.json<
                                        TApiResponseOk<{ uploadId: string }>
                                    >()
                                const uploadId = uploadData.data.uploadId

                                const attachResponse = await app.request(
                                    '/api/objectStorage/upload/attachment/create',
                                    {
                                        method: 'POST',
                                        headers: {
                                            origin: env.URL_FRONTEND,
                                            'content-type': 'application/json',
                                            cookie: standardCookie,
                                        },
                                        body: JSON.stringify({
                                            idempotencyKey: uuidv7(),
                                            uploadId,
                                            attachments: [
                                                {
                                                    size: 1024,
                                                    hashSha256:
                                                        createHashSha256(),
                                                    isPublic: true,
                                                },
                                            ],
                                        }),
                                    },
                                    env,
                                )

                                const attachData = await attachResponse.json<
                                    TApiResponseOk<{
                                        uploadId: string
                                        signedUrls: {
                                            id: string
                                            status: number
                                        }[]
                                    }>
                                >()

                                expect(
                                    attachData.data?.signedUrls,
                                    'Expected signedUrls to be present in the response',
                                ).toBeDefined()
                                const attachmentId =
                                    attachData.data.signedUrls[0].id

                                await app.request(
                                    '/api/objectStorage/upload/attachment/commit',
                                    {
                                        method: 'POST',
                                        headers: {
                                            origin: env.URL_FRONTEND,
                                            'content-type': 'application/json',
                                            cookie: standardCookie,
                                        },
                                        body: JSON.stringify({
                                            uploadId,
                                            attachments: [attachmentId],
                                        }),
                                    },
                                    env,
                                )

                                await app.request(
                                    '/api/objectStorage/upload/commit',
                                    {
                                        method: 'POST',
                                        headers: {
                                            origin: env.URL_FRONTEND,
                                            'content-type': 'application/json',
                                            cookie: standardCookie,
                                        },
                                        body: JSON.stringify({
                                            uploadId,
                                            attachments: [attachmentId],
                                        }),
                                    },
                                    env,
                                )

                                const response = await getTestingRequest(
                                    '/api/objectStorage/download/link/create',
                                    {
                                        cookie: standardCookie,
                                        query: { uploadId },
                                    },
                                )

                                const responseData = await response.json<
                                    TApiResponseOk<{
                                        downloadUrls: {
                                            objectStorageId: string
                                            downloadUrl: string | null
                                            status: number
                                        }[]
                                    }>
                                >()

                                expect(response.status).toBe(200)
                                expect(
                                    responseData.data.downloadUrls,
                                ).toHaveLength(1)
                                expect(
                                    responseData.data.downloadUrls[0].status,
                                ).toBe(201)
                                expect(
                                    responseData.data.downloadUrls[0]
                                        .downloadUrl,
                                ).toBeTruthy()
                                // Public objects use the public bucket URL (not a signed URL)
                                expect(
                                    responseData.data.downloadUrls[0]
                                        .downloadUrl,
                                ).not.toContain('X-Amz')
                            })
                        },
                    )
                })
        })
    })
