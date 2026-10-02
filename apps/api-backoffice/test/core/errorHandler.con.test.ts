import { AppError, BaseError, catalog } from '@loanms/errors'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { errorHandler } from '../../src/core/errorHandler.js'
import { requestTimer } from '../../src/core/middleware/requestTimer.js'
import type { THonoInstance } from '../../src/types.js'
import { apiResponseErrorWrapper } from '../../src/utilities/helpers.js'

const throwUnknown = (value: unknown): never => {
    throw value
}

const createDatabaseFailure = () =>
    Object.assign(
        new Error(
            'Failed query: select "id" from "missing"."table" where "id" = $1\nparams: PRIVATE_PARAMETER',
            {
                cause: Object.assign(
                    new Error('relation "missing.table" does not exist'),
                    { name: 'PostgresError', code: '42P01' },
                ),
            },
        ),
        {
            name: 'DrizzleQueryError',
            query: 'select "id" from "missing"."table" where "id" = $1',
            params: ['PRIVATE_PARAMETER'],
        },
    )

const createTestApp = () =>
    new Hono<THonoInstance>()
        .onError(errorHandler)
        .use('*', async (ctx, next) => {
            ctx.set('requestId', '01900000-0000-7000-8000-000000000001')
            ctx.set('correlationId', 'test-correlation')
            await next()
        })
        .use('*', requestTimer)
        .get('/appError', () => {
            throw new AppError(catalog.userNotFound)
        })
        .get('/serverAppError', () => {
            throw new AppError(catalog.serviceUnavailable)
        })
        .get('/direct', (ctx) =>
            apiResponseErrorWrapper(ctx, catalog.signInInvalidCredentials),
        )
        .get('/validation', (ctx) =>
            apiResponseErrorWrapper(ctx, catalog.dataValidation, {
                validatorIssues: [
                    {
                        code: 'invalid_type',
                        message: 'Expected a string.',
                        path: ['name'],
                    },
                ],
            }),
        )
        .get('/httpException', () => {
            throw new HTTPException(404, {
                message: 'Private framework detail.',
            })
        })
        .get('/baseError', () => {
            throw new BaseError({
                category: 'lifecycle',
                id: 'TEST_BASE_ERROR',
                message: 'Private base error detail.',
                retryable: false,
            })
        })
        .get('/unexpectedError', () => {
            throw new Error('Private unexpected detail.')
        })
        .get('/errorAfterAudit', (ctx) => {
            ctx.header('Audit-Event-Recorded', 'true')
            throw new Error('Failure after the audit insert.')
        })
        .get('/unexpectedValue', () => {
            return throwUnknown('Private non-Error detail.')
        })
        .get('/databaseFailure', () => {
            throw new AppError(catalog.internalServerError, {
                cause: createDatabaseFailure(),
            })
        })
        .get('/unexpectedErrorWithCause', () => {
            throw new Error('Wrapper failure.', {
                cause: createDatabaseFailure(),
            })
        })
        .get('/ws/:stream/:target', () => {
            throw new Error('Path failure.')
        })

const request = (path: string) =>
    createTestApp().request(`http://localhost${path}`, {}, {
        ENVIRONMENT: 'test',
    } as THonoInstance['Bindings'])

const readLogs = (spy: ReturnType<typeof vi.spyOn>) =>
    spy.mock.calls.map(
        ([entry]: unknown[]) =>
            JSON.parse(String(entry)) as Record<string, unknown>,
    )

afterEach(() => {
    vi.restoreAllMocks()
})

describe('central error boundary', () => {
    it('serializes thrown AppErrors from their catalog definition', async () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
        const response = await request('/appError')

        expect(response.status).toBe(404)
        await expect(response.json()).resolves.toEqual({
            success: false,
            error: {
                requestId: '01900000-0000-7000-8000-000000000001',
                code: 'NOT_FOUND',
                message: 'User ID not found.',
            },
        })
        expect(errorSpy).not.toHaveBeenCalled()
    })

    it('serializes direct catalog responses and validation issues', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {})

        const directResponse = await request('/direct')
        expect(directResponse.status).toBe(422)
        await expect(directResponse.json()).resolves.toMatchObject({
            success: false,
            error: {
                code: 'UNPROCESSABLE_CONTENT',
                message: 'Invalid credentials provided.',
            },
        })

        const validationResponse = await request('/validation')
        expect(validationResponse.status).toBe(400)
        await expect(validationResponse.json()).resolves.toMatchObject({
            success: false,
            error: {
                code: 'DATA_VALIDATION',
                validatorIssues: [
                    {
                        code: 'invalid_type',
                        message: 'Expected a string.',
                        path: ['name'],
                    },
                ],
            },
        })
    })

    it('maps known HTTPExceptions without exposing framework messages', async () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
        const response = await request('/httpException')
        const body = await response.json()

        expect(response.status).toBe(404)
        expect(body).toMatchObject({
            success: false,
            error: { code: 'NOT_FOUND', message: 'Not Found' },
        })
        expect(JSON.stringify(body)).not.toContain('Private framework detail.')
        expect(errorSpy).not.toHaveBeenCalled()
    })

    it('removes a prepared audit marker from failed responses', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {})

        const response = await request('/errorAfterAudit')

        expect(response.status).toBe(500)
        expect(response.headers.has('Audit-Event-Recorded')).toBe(false)
    })

    it.each([
        [
            '/baseError',
            'Private base error detail.',
        ],
        [
            '/unexpectedError',
            'Private unexpected detail.',
        ],
        [
            '/unexpectedValue',
            'Private non-Error detail.',
        ],
    ])('masks unexpected failure at %s', async (path, privateMessage) => {
        vi.spyOn(console, 'error').mockImplementation(() => {})
        const response = await request(path)
        const body = await response.json()

        expect(response.status).toBe(500)
        expect(body).toMatchObject({
            success: false,
            error: {
                code: 'INTERNAL_SERVER_ERROR',
                message: 'An unknown error occurred, please try again later.',
            },
        })
        expect(JSON.stringify(body)).not.toContain(privateMessage)
    })

    it('logs the full redacted cause chain while clients keep the catalog error', async () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
        const response = await request('/databaseFailure')
        const body = await response.json()

        expect(response.status).toBe(500)
        expect(body).toEqual({
            success: false,
            error: {
                requestId: '01900000-0000-7000-8000-000000000001',
                code: 'INTERNAL_SERVER_ERROR',
                message: 'An unknown error occurred, please try again later.',
            },
        })

        const logged = readLogs(errorSpy).at(-1) as {
            method: string
            path: string
            causes: Array<Record<string, unknown>>
        }
        expect(logged).toMatchObject({
            type: 'ERROR',
            method: 'GET',
            path: '/databaseFailure',
        })
        expect(logged.causes).toMatchObject([
            {
                name: 'DrizzleQueryError',
                sql: 'select "id" from "missing"."table" where "id" = $1',
                paramCount: 1,
                paramTypes: ['string'],
            },
            { name: 'PostgresError', code: '42P01' },
        ])
        expect(JSON.stringify(logged)).not.toContain('PRIVATE_PARAMETER')
    })

    it('logs the cause of unexpected plain errors', async () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

        await request('/unexpectedErrorWithCause')

        const logged = readLogs(errorSpy).at(-1) as {
            causes: Array<{ code?: string }>
        }
        expect(logged.causes.map((cause) => cause.code)).toContain('42P01')
    })

    it('logs the matched route pattern instead of user-controlled path segments', async () => {
        const requestSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

        await request(`/ws/orders/PRIVATE_${'s'.repeat(5_000)}`)

        const errorLog = readLogs(errorSpy).at(-1)
        const requestLog = readLogs(requestSpy).at(-1)
        expect(errorLog).toMatchObject({
            type: 'ERROR',
            method: 'GET',
            path: '/ws/:stream/:target',
        })
        expect(requestLog).toMatchObject({
            type: 'REQUEST',
            method: 'GET',
            path: '/ws/:stream/:target',
            status: 500,
        })
        expect(
            JSON.stringify([
                errorLog,
                requestLog,
            ]),
        ).not.toContain('PRIVATE_')
    })

    it('logs no requested path for an unmatched request', async () => {
        const requestSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        const response = await request(`/PRIVATE_${'s'.repeat(5_000)}`)

        expect(response.status).toBe(404)
        const requestLog = readLogs(requestSpy).at(-1)
        expect(requestLog).toMatchObject({ type: 'REQUEST', status: 404 })
        expect(String(requestLog?.path).length).toBeLessThanOrEqual(256)
        expect(JSON.stringify(requestLog)).not.toContain('PRIVATE_')
    })

    it('records structured error metadata without duplicate expected-4xx error logs', async () => {
        const requestSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

        await request('/appError')
        const expectedRequestLog = readLogs(requestSpy).at(-1)
        expect(expectedRequestLog).toMatchObject({
            type: 'REQUEST',
            internalErrorId: 'USER_NOT_FOUND',
            publicCode: 'NOT_FOUND',
            category: 'not_found',
            retryable: false,
            status: 404,
        })
        expect(errorSpy).not.toHaveBeenCalled()

        await request('/serverAppError')
        expect(readLogs(errorSpy).at(-1)).toMatchObject({
            type: 'ERROR',
            internalErrorId: 'COMMON_SERVICE_UNAVAILABLE',
            publicCode: 'SERVICE_UNAVAILABLE',
            category: 'lifecycle',
            retryable: true,
            status: 503,
        })

        await request('/baseError')
        expect(readLogs(errorSpy).at(-1)).toMatchObject({
            type: 'ERROR',
            internalErrorId: 'TEST_BASE_ERROR',
            publicCode: 'INTERNAL_SERVER_ERROR',
            category: 'lifecycle',
            retryable: false,
            status: 500,
        })
        expect(readLogs(requestSpy).at(-1)).toMatchObject({
            type: 'REQUEST',
            internalErrorId: 'TEST_BASE_ERROR',
            publicCode: 'INTERNAL_SERVER_ERROR',
            category: 'lifecycle',
            retryable: false,
            status: 500,
        })

        await request('/unexpectedError')
        expect(readLogs(errorSpy).at(-1)).toMatchObject({
            type: 'ERROR',
            internalErrorId: 'COMMON_INTERNAL_SERVER_ERROR',
            publicCode: 'INTERNAL_SERVER_ERROR',
            category: 'internal',
            retryable: true,
            status: 500,
        })

        await request('/unexpectedValue')
        expect(readLogs(errorSpy).at(-1)).toMatchObject({
            type: 'ERROR',
            internalErrorId: 'UNEXPECTED_THROWN_VALUE',
            publicCode: 'INTERNAL_SERVER_ERROR',
            category: 'internal',
            retryable: true,
            status: 500,
        })
    })
})

// =============================================================================
// END OF BASE TEMPLATE TESTS - FORK-SPECIFIC TESTS MUST BE ADDED BELOW
// =============================================================================
