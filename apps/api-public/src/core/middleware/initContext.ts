import { dbClient, dbSchema } from '@loanms/database/d1'
import { AppError, catalog } from '@loanms/errors'
import { AwsClient } from 'aws4fetch'
import { createMiddleware } from 'hono/factory'

import { aclBuilder } from '../../auth/acl.js'
import { auth } from '../../auth/index.js'
import { getObjectStorageConfiguration } from '../../config/objectStorage.js'
import type { THonoInstance } from '../../types.js'
import { resolveTrustedClientIpAddress } from './authRateLimit.js'

export const initRequestContext = () => {
    return createMiddleware<THonoInstance>(async (ctx, next) => {
        ctx.set(
            'correlationId',
            ctx.req.header('cf-ray') ?? ctx.req.header('x-request-id') ?? null,
        )
        ctx.set('authRateLimitDecision', null)
        ctx.set('apiKeyActor', null)
        ctx.set('apiKeyPermissions', null)
        ctx.set('doWssClient', ctx.env.LOANMSPUB_DO_WSS)
        ctx.set(
            'ipAddress',
            resolveTrustedClientIpAddress(
                ctx.req.header('cf-connecting-ipv6'),
                ctx.req.header('cf-connecting-ip'),
            ),
        )
        ctx.set('isPrivilegedRole', false)
        ctx.set('kvClient', ctx.env.LOANMSPUB_KV)
        ctx.set('passwordResetEmailError', null)
        ctx.set('passwordResetEmailSent', false)
        ctx.set('presentedApiKey', null)
        ctx.set('responseError', null)
        ctx.set('responseErrorLogDetail', null)
        ctx.set('role', 'N/A')
        ctx.set('session', null)
        ctx.set('sessionResponseHeaders', null)
        ctx.set('user', null)
        ctx.set('userAgent', ctx.req.header('user-agent') || 'N/A')

        await next()
    })
}

export const initDatabaseContext = () => {
    return createMiddleware<THonoInstance>(async (ctx, next) => {
        const initDbClient = dbClient(ctx.env.LOANMSPUB_D1)

        ctx.set('dbClient', initDbClient)
        ctx.set('dbSchema', dbSchema)

        await next()
    })
}

export const initAuthContext = () => {
    return createMiddleware<THonoInstance>(async (ctx, next) => {
        const initAcl = await aclBuilder(
            ctx.get('dbClient'),
            dbSchema,
            ctx.get('kvClient'),
        )

        ctx.set('acl', initAcl)
        ctx.set(
            'auth',
            await auth({
                db: ctx.get('dbClient'),
                dbSchema,
                env: ctx.env,
                acl: initAcl,
                onPasswordResetEmailFailed: (error) => {
                    ctx.set('passwordResetEmailError', error)
                },
                onPasswordResetEmailSent: () => {
                    ctx.set('passwordResetEmailSent', true)
                },
            }),
        )

        await next()
    })
}

export const initObjectStorageContext = () => {
    return createMiddleware<THonoInstance>(async (ctx, next) => {
        const configuration = getObjectStorageConfiguration(ctx.env)

        if (!configuration.enabled) {
            throw new AppError(catalog.featureNotFound)
        }

        ctx.set('objectStorageConfiguration', configuration)
        ctx.set(
            'aws4FetchClient',
            new AwsClient({
                accessKeyId: configuration.accessKeyId,
                secretAccessKey: configuration.secretAccessKey,
            }),
        )

        await next()
    })
}
