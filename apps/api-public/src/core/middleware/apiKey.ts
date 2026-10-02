import { AppError, catalog } from '@hyperion/errors'
import {
    API_KEY_AUDIENCE_ROOT_PERMISSIONS,
    type TApiKeyAudience,
    type TApiKeyPermissionRecord,
} from '@hyperion/types/shared'
import { and, eq } from 'drizzle-orm'
import type { Context } from 'hono'
import { createMiddleware } from 'hono/factory'

import type { THonoInstance } from '../../types.js'
import { apiResponseErrorWrapper } from '../../utilities/helpers.js'
import {
    authRateLimitGuard,
    normalizeAuthRateLimitClientNetwork,
} from './authRateLimit.js'

type TStatements = Record<string, readonly string[]>

const API_KEY_PATTERNS: Record<TApiKeyAudience, RegExp> = {
    'backoffice-v1': /^bof_[A-Za-z]{64}$/,
    'public-v1': /^pub_[A-Za-z]{64}$/,
}

function logApiKeyEvent(
    ctx: Context<THonoInstance>,
    type: 'API_KEY_AUTHORIZATION' | 'API_KEY_VERIFICATION',
    outcome: string,
    surface: TApiKeyAudience,
    actor?: {
        credentialId: string
        principalPublicId: string
    },
) {
    console.log(
        JSON.stringify({
            type,
            requestId: ctx.get('requestId'),
            correlationId: ctx.get('correlationId') ?? 'N/A',
            environment: ctx.env.ENVIRONMENT,
            outcome,
            ...(actor
                ? {
                      credentialId: actor.credentialId,
                      principalPublicId: actor.principalPublicId,
                  }
                : {}),
            scopes: [
                'v1.api-key-network',
                'v1.api-key-presented',
            ],
            surface,
        }),
    )
}

function hasPermissions(
    permissions: TApiKeyPermissionRecord,
    required: TStatements,
) {
    return Object.entries(required).every(
        ([
            component,
            actions,
        ]) =>
            actions.every((action) => permissions[component]?.includes(action)),
    )
}

function intersectPermissions(
    stored: TApiKeyPermissionRecord | null | undefined,
    assignable: TApiKeyPermissionRecord,
) {
    const effective: TApiKeyPermissionRecord = {}
    if (!stored) return effective

    for (const [
        component,
        actions,
    ] of Object.entries(stored)) {
        const allowed = assignable[component]
        if (!allowed) continue

        const intersection = actions.filter((action) =>
            allowed.includes(action),
        )
        if (intersection.length > 0) effective[component] = intersection
    }

    return effective
}

export const apiKeyHeaderGuard = (surface: TApiKeyAudience) =>
    createMiddleware<THonoInstance>(async (ctx, next) => {
        const key = ctx.req.header('x-api-key')
        if (!key) {
            logApiKeyEvent(ctx, 'API_KEY_VERIFICATION', 'missing', surface)
            return apiResponseErrorWrapper(ctx, catalog.apiKeyInvalid)
        }

        if (!API_KEY_PATTERNS[surface].test(key)) {
            logApiKeyEvent(ctx, 'API_KEY_VERIFICATION', 'malformed', surface)
            return apiResponseErrorWrapper(ctx, catalog.apiKeyInvalid)
        }

        ctx.set('presentedApiKey', key)
        await next()
    })

export const apiKeyRateLimitGuard = (surface: TApiKeyAudience) =>
    authRateLimitGuard({
        action: 'v1.apiKey',
        keys: (ctx) => [
            {
                action: 'v1-api-key-presented',
                keyParts: [
                    surface,
                    ctx.get('presentedApiKey')!,
                ],
            },
            {
                action: 'v1-api-key-network',
                keyParts: [
                    surface,
                    normalizeAuthRateLimitClientNetwork(ctx.get('ipAddress')),
                ],
            },
        ],
        definition: catalog.apiKeyRateLimited,
    })

export const apiKeyVerificationGuard = (surface: TApiKeyAudience) =>
    createMiddleware<THonoInstance>(async (ctx, next) => {
        let verification: Awaited<
            ReturnType<typeof ctx.var.auth.api.verifyApiKey>
        >

        try {
            verification = await ctx.get('auth').api.verifyApiKey({
                body: {
                    configId: surface,
                    key: ctx.get('presentedApiKey')!,
                },
            })
        } catch (error) {
            throw new AppError(catalog.apiKeyVerificationUnavailable, {
                cause: error,
            })
        } finally {
            ctx.set('presentedApiKey', null)
        }

        if (!verification.valid || !verification.key) {
            logApiKeyEvent(ctx, 'API_KEY_VERIFICATION', 'invalid', surface)
            return apiResponseErrorWrapper(ctx, catalog.apiKeyInvalid)
        }

        const { apikey, servicePrincipal } = ctx.get('dbSchema')
        let actor:
            | {
                  audience: string
                  credentialId: string
                  enabled: boolean
                  name: string
                  organizationId: string
                  permissions: TApiKeyPermissionRecord
                  principalPublicId: string
              }
            | undefined
        try {
            ;[actor] = await ctx
                .get('dbClient')
                .select({
                    audience: servicePrincipal.audience,
                    credentialId: apikey.id,
                    enabled: servicePrincipal.enabled,
                    name: servicePrincipal.name,
                    organizationId: servicePrincipal.organizationId,
                    permissions: servicePrincipal.permissions,
                    principalPublicId: servicePrincipal.publicId,
                })
                .from(apikey)
                .innerJoin(
                    servicePrincipal,
                    and(
                        eq(apikey.servicePrincipalId, servicePrincipal.id),
                        eq(apikey.referenceId, servicePrincipal.organizationId),
                    ),
                )
                .where(
                    and(
                        eq(apikey.id, verification.key.id),
                        eq(apikey.configId, surface),
                        eq(servicePrincipal.audience, surface),
                    ),
                )
                .limit(1)
        } catch (error) {
            throw new AppError(catalog.apiKeyAuthorizationUnavailable, {
                cause: error,
            })
        }

        if (!actor?.enabled) {
            logApiKeyEvent(ctx, 'API_KEY_VERIFICATION', 'unlinked', surface)
            return apiResponseErrorWrapper(ctx, catalog.apiKeyInvalid)
        }

        const permissions = intersectPermissions(
            actor.permissions,
            ctx.get('acl').apiKeyAssignablePermissions,
        )
        if (
            !hasPermissions(
                permissions,
                API_KEY_AUDIENCE_ROOT_PERMISSIONS[surface],
            )
        ) {
            logApiKeyEvent(
                ctx,
                'API_KEY_AUTHORIZATION',
                'forbidden',
                surface,
                actor,
            )
            return apiResponseErrorWrapper(ctx, catalog.authenticationForbidden)
        }

        ctx.set('apiKeyActor', {
            audience: surface,
            credentialId: actor.credentialId,
            name: actor.name,
            organizationId: actor.organizationId,
            principalPublicId: actor.principalPublicId,
        })
        ctx.set('apiKeyPermissions', permissions)
        logApiKeyEvent(ctx, 'API_KEY_VERIFICATION', 'valid', surface, actor)
        await next()
    })

export const apiKeyPermissionGuard = (required: TStatements) =>
    createMiddleware<THonoInstance>(async (ctx, next) => {
        if (!hasPermissions(ctx.get('apiKeyPermissions') ?? {}, required)) {
            const actor = ctx.get('apiKeyActor')
            if (actor) {
                logApiKeyEvent(
                    ctx,
                    'API_KEY_AUTHORIZATION',
                    'forbidden',
                    actor.audience,
                    actor,
                )
            }
            return apiResponseErrorWrapper(ctx, catalog.authenticationForbidden)
        }
        await next()
    })
