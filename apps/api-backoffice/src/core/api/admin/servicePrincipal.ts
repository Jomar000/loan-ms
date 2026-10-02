import { AppError, catalog, defineError } from '@loanms/errors'
import {
    API_KEY_AUDIENCE_NAMESPACES,
    hasApiKeyAudienceRootAccess,
    isApiKeyPermissionAllowedForAudience,
    type TApiKeyAudience,
    type TApiKeyPermissionRecord,
} from '@loanms/types/shared'
import {
    servicePrincipalCreateInputSchema,
    servicePrincipalCredentialCreateInputSchema,
    servicePrincipalCredentialReadManyInputSchema,
    servicePrincipalCredentialRevokeInputSchema,
    servicePrincipalEnableInputSchema,
    servicePrincipalReadManyInputSchema,
    servicePrincipalStatusInputSchema,
    servicePrincipalUpdateInputSchema,
} from '@loanms/validator/backoffice/admin/servicePrincipal'
import { isAPIError } from 'better-auth/api'
import {
    and,
    asc,
    count,
    desc,
    eq,
    gt,
    isNull,
    max,
    or,
    sql,
} from 'drizzle-orm'
import type { Context } from 'hono'
import { Hono } from 'hono'
import { v7 as uuidv7 } from 'uuid'

import type { THonoInstance } from '../../../types.js'
import {
    apiResponseOkWrapper,
    apiResponsePaginatedOkWrapper,
    auditTrailAfterChangeStatement,
    auditTrailLogger,
    getActiveOrganizationId,
    markAuditTrailRecorded,
} from '../../../utilities/helpers.js'
import { isAuthorized } from '../../middleware/isAuthorized.js'
import { validateRequest } from '../../middleware/validateRequest.js'

const servicePrincipalDeleteConflict = defineError(
    'API_KEY_SERVICE_PRINCIPAL_DELETE_CONFLICT',
    'CONFLICT',
    'The service principal changed while it was being deleted.',
)
const servicePrincipalUpdateConflict = defineError(
    'API_KEY_SERVICE_PRINCIPAL_UPDATE_CONFLICT',
    'CONFLICT',
    'The service principal changed while it was being updated.',
)

const MAX_ACTIVE_CREDENTIALS = 2
const SECONDS_PER_DAY = 86_400

type TPrincipalRow = {
    activeCredentialCount: number
    audience: string
    description: string | null
    enabled: boolean
    id: number
    lastVerifiedAt: Date | null
    name: string
    organizationId: string
    permissions: TApiKeyPermissionRecord
    publicId: string
}

function canonicalizePermissions(permissions: TApiKeyPermissionRecord) {
    return Object.fromEntries(
        Object.entries(permissions)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(
                ([
                    component,
                    actions,
                ]) => [
                    component,
                    [...actions].sort(),
                ],
            ),
    )
}

function normalizePermissions(
    audience: TApiKeyAudience,
    requested: TApiKeyPermissionRecord,
    assignable: TApiKeyPermissionRecord,
) {
    for (const [
        component,
        actions,
    ] of Object.entries(requested)) {
        if (
            actions.some(
                (action) =>
                    !isApiKeyPermissionAllowedForAudience(
                        audience,
                        component,
                        action,
                    ) || !assignable[component]?.includes(action),
            )
        ) {
            return null
        }
    }

    if (!hasApiKeyAudienceRootAccess(audience, requested)) return null

    const rootNamespace = API_KEY_AUDIENCE_NAMESPACES[audience]
    if (requested[rootNamespace]?.length !== 1) return null

    return canonicalizePermissions(requested)
}

function samePrincipalCreateRequest(
    row: {
        audience: string
        description: string | null
        name: string
        permissions: TApiKeyPermissionRecord
    },
    request: {
        audience: TApiKeyAudience
        description: string | null
        name: string
        permissions: TApiKeyPermissionRecord
    },
) {
    return (
        row.audience === request.audience &&
        row.description === request.description &&
        row.name === request.name &&
        JSON.stringify(canonicalizePermissions(row.permissions)) ===
            JSON.stringify(request.permissions)
    )
}

function projectPrincipal(row: TPrincipalRow) {
    return {
        publicId: row.publicId,
        name: row.name,
        description: row.description,
        audience: row.audience as TApiKeyAudience,
        enabled: row.enabled,
        permissions: row.permissions,
        activeCredentialCount: Number(row.activeCredentialCount),
        lastVerifiedAt: row.lastVerifiedAt,
    }
}

function projectCredential(credential: {
    createdAt: Date
    expiresAt: Date | null
    id: string
    lastRequest: Date | null
    name: string | null
    start: string | null
}) {
    return {
        id: credential.id,
        name: credential.name ?? 'Unnamed credential',
        start: credential.start,
        expiresAt: credential.expiresAt,
        createdAt: credential.createdAt,
        lastVerifiedAt: credential.lastRequest,
    }
}

async function credentialRequestFingerprint(input: {
    expiryDays: number | null
    name: string
}) {
    const digest = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(
            JSON.stringify([
                input.name,
                input.expiryDays,
            ]),
        ),
    )
    return Array.from(new Uint8Array(digest), (byte) =>
        byte.toString(16).padStart(2, '0'),
    ).join('')
}

function projectCompletedIssuance(issuance: {
    credentialCreatedAt: Date | null
    credentialExpiresAt: Date | null
    credentialId: string | null
    credentialName: string | null
    credentialStart: string | null
}) {
    if (
        !issuance.credentialCreatedAt ||
        !issuance.credentialId ||
        !issuance.credentialName
    ) {
        throw new AppError(catalog.credentialCreationConfirmationUnavailable)
    }

    return {
        createdAt: issuance.credentialCreatedAt,
        expiresAt: issuance.credentialExpiresAt,
        id: issuance.credentialId,
        lastVerifiedAt: null,
        name: issuance.credentialName,
        start: issuance.credentialStart,
    }
}

async function markCredentialIssuanceFailed(
    ctx: Context<THonoInstance>,
    input: {
        fingerprint: string
        idempotencyKey: string
        organizationId: string
        servicePrincipalId: number
    },
) {
    const { servicePrincipalCredentialIssuance } = ctx.get('dbSchema')
    await ctx
        .get('dbClient')
        .update(servicePrincipalCredentialIssuance)
        .set({ state: 'failed', updatedAt: new Date() })
        .where(
            and(
                eq(
                    servicePrincipalCredentialIssuance.organizationId,
                    input.organizationId,
                ),
                eq(
                    servicePrincipalCredentialIssuance.servicePrincipalId,
                    input.servicePrincipalId,
                ),
                eq(
                    servicePrincipalCredentialIssuance.idempotencyKey,
                    input.idempotencyKey,
                ),
                eq(
                    servicePrincipalCredentialIssuance.requestFingerprint,
                    input.fingerprint,
                ),
                eq(servicePrincipalCredentialIssuance.state, 'pending'),
            ),
        )
}

function pluginError(error: unknown): never {
    if (error instanceof AppError) throw error

    if (isAPIError(error) && error.status !== 'INTERNAL_SERVER_ERROR') {
        const status =
            error.status === 'FORBIDDEN'
                ? 403
                : error.status === 'NOT_FOUND'
                  ? 404
                  : 400
        throw new AppError(
            status === 403
                ? catalog.credentialManagementForbidden
                : status === 404
                  ? catalog.credentialManagementNotFound
                  : catalog.credentialManagementBadRequest,
        )
    }

    throw new AppError(catalog.credentialManagementUnavailable, {
        cause: error,
    })
}

async function readPrincipal(
    ctx: Context<THonoInstance>,
    publicId: string,
): Promise<TPrincipalRow | undefined> {
    const { apikey, servicePrincipal } = ctx.get('dbSchema')
    const organizationId = getActiveOrganizationId(ctx)
    const activeCredential = and(
        eq(apikey.enabled, true),
        or(isNull(apikey.expiresAt), gt(apikey.expiresAt, new Date())),
    )

    return (
        await ctx
            .get('dbClient')
            .select({
                activeCredentialCount:
                    sql<number>`count(${apikey.id}) filter (where ${activeCredential})`.mapWith(
                        Number,
                    ),
                audience: servicePrincipal.audience,
                description: servicePrincipal.description,
                enabled: servicePrincipal.enabled,
                id: servicePrincipal.id,
                lastVerifiedAt: max(apikey.lastRequest),
                name: servicePrincipal.name,
                organizationId: servicePrincipal.organizationId,
                permissions: servicePrincipal.permissions,
                publicId: servicePrincipal.publicId,
            })
            .from(servicePrincipal)
            .leftJoin(
                apikey,
                eq(apikey.servicePrincipalId, servicePrincipal.id),
            )
            .where(
                and(
                    eq(servicePrincipal.organizationId, organizationId),
                    eq(servicePrincipal.publicId, publicId),
                ),
            )
            .groupBy(servicePrincipal.id)
            .limit(1)
    )[0]
}

async function requirePrincipal(ctx: Context<THonoInstance>, publicId: string) {
    const principal = await readPrincipal(ctx, publicId)
    if (!principal) {
        throw new AppError(catalog.servicePrincipalNotFound)
    }
    return principal
}

async function setPrincipalEnabled(
    ctx: Context<THonoInstance>,
    publicId: string,
    enabled: boolean,
) {
    const { servicePrincipal } = ctx.get('dbSchema')
    const organizationId = getActiveOrganizationId(ctx)

    const client = ctx.get('dbClient')
    const database = client.$client
    const [updateResult] = await database.batch([
        database
            .prepare(
                `UPDATE service_principal
                 SET enabled = ?, updated_at = ?
                 WHERE organization_id = ? AND public_id = ? AND enabled = ?`,
            )
            .bind(
                enabled ? 1 : 0,
                Date.now(),
                organizationId,
                publicId,
                enabled ? 0 : 1,
            ),
        auditTrailAfterChangeStatement(
            ctx,
            auditTrailLogger.prepare({
                component: 'admin.servicePrincipal',
                action: enabled ? 'enable' : 'disable',
                description: `Organization service principal ${
                    enabled ? 'enabled' : 'disabled'
                }`,
                records: {
                    table: 'service_principal',
                    id: publicId,
                    oldData: { enabled: !enabled },
                    newData: { enabled },
                },
            }),
            database,
        ),
    ])
    if (updateResult.meta.changes !== 1) {
        const [existing] = await client
            .select({ enabled: servicePrincipal.enabled })
            .from(servicePrincipal)
            .where(
                and(
                    eq(servicePrincipal.organizationId, organizationId),
                    eq(servicePrincipal.publicId, publicId),
                ),
            )
            .limit(1)
        if (!existing) {
            throw new AppError(catalog.servicePrincipalNotFound)
        }
        throw new AppError(
            enabled
                ? catalog.servicePrincipalAlreadyEnabled
                : catalog.servicePrincipalAlreadyDisabled,
        )
    }

    markAuditTrailRecorded(ctx)
    return projectPrincipal((await requirePrincipal(ctx, publicId))!)
}

export const servicePrincipalRoute = new Hono<THonoInstance>()
    .on(
        'QUERY',
        '/readMany',
        isAuthorized({ servicePrincipal: ['read'] }),
        validateRequest('json', servicePrincipalReadManyInputSchema),
        async (ctx) => {
            const input = ctx.req.valid('json')
            const { apikey, servicePrincipal } = ctx.get('dbSchema')
            const organizationId = getActiveOrganizationId(ctx)
            const activeCredential = and(
                eq(apikey.enabled, true),
                or(isNull(apikey.expiresAt), gt(apikey.expiresAt, new Date())),
            )
            const orderBy = input.sortOrder === 'asc' ? asc : desc

            const [
                rows,
                countRows,
            ] = await Promise.all([
                ctx
                    .get('dbClient')
                    .select({
                        activeCredentialCount:
                            sql<number>`count(${apikey.id}) filter (where ${activeCredential})`.mapWith(
                                Number,
                            ),
                        audience: servicePrincipal.audience,
                        description: servicePrincipal.description,
                        enabled: servicePrincipal.enabled,
                        id: servicePrincipal.id,
                        lastVerifiedAt: max(apikey.lastRequest),
                        name: servicePrincipal.name,
                        organizationId: servicePrincipal.organizationId,
                        permissions: servicePrincipal.permissions,
                        publicId: servicePrincipal.publicId,
                    })
                    .from(servicePrincipal)
                    .leftJoin(
                        apikey,
                        eq(apikey.servicePrincipalId, servicePrincipal.id),
                    )
                    .where(
                        and(
                            eq(servicePrincipal.organizationId, organizationId),
                            eq(
                                servicePrincipal.audience,
                                input.filters.audience,
                            ),
                        ),
                    )
                    .groupBy(servicePrincipal.id)
                    .orderBy(
                        orderBy(servicePrincipal.createdAt),
                        orderBy(servicePrincipal.id),
                    )
                    .limit(input.limit)
                    .offset(input.offset),
                ctx
                    .get('dbClient')
                    .select({ value: count() })
                    .from(servicePrincipal)
                    .where(
                        and(
                            eq(servicePrincipal.organizationId, organizationId),
                            eq(
                                servicePrincipal.audience,
                                input.filters.audience,
                            ),
                        ),
                    ),
            ])

            return apiResponsePaginatedOkWrapper(ctx, {
                data: rows.map(projectPrincipal),
                count: countRows[0]?.value ?? 0,
                limit: input.limit,
                offset: input.offset,
            })
        },
    )
    .post(
        '/create',
        isAuthorized({ servicePrincipal: ['create'] }),
        validateRequest('json', servicePrincipalCreateInputSchema),
        async (ctx) => {
            const input = ctx.req.valid('json')
            const organizationId = getActiveOrganizationId(ctx)
            const { servicePrincipal } = ctx.get('dbSchema')
            const permissions = normalizePermissions(
                input.audience,
                input.permissions,
                ctx.get('acl').apiKeyAssignablePermissions,
            )
            if (!permissions) {
                throw new AppError(catalog.servicePrincipalInvalidPermissions)
            }

            const description = input.description ?? null
            const client = ctx.get('dbClient')
            const findExisting = async () =>
                (
                    await client
                        .select({
                            audience: servicePrincipal.audience,
                            description: servicePrincipal.description,
                            name: servicePrincipal.name,
                            permissions: servicePrincipal.permissions,
                            publicId: servicePrincipal.publicId,
                        })
                        .from(servicePrincipal)
                        .where(
                            and(
                                eq(
                                    servicePrincipal.organizationId,
                                    organizationId,
                                ),
                                eq(
                                    servicePrincipal.idempotencyKey,
                                    input.idempotencyKey,
                                ),
                            ),
                        )
                        .limit(1)
                )[0]
            const replay = await findExisting()
            if (replay) {
                if (
                    !samePrincipalCreateRequest(replay, {
                        audience: input.audience,
                        description,
                        name: input.name,
                        permissions,
                    })
                ) {
                    throw new AppError(
                        catalog.servicePrincipalIdempotencyConflict,
                    )
                }
                return apiResponseOkWrapper(ctx, {
                    data: projectPrincipal(
                        (await requirePrincipal(ctx, replay.publicId))!,
                    ),
                    status: 201,
                })
            }

            const result = uuidv7()
            const database = client.$client
            const now = Date.now()
            try {
                await database.batch([
                    database
                        .prepare(
                            `INSERT INTO service_principal (
                                 public_id, organization_id, name, description,
                                 audience, enabled, permissions,
                                 idempotency_key, created_at, updated_at
                             ) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`,
                        )
                        .bind(
                            result,
                            organizationId,
                            input.name,
                            description,
                            input.audience,
                            JSON.stringify(permissions),
                            input.idempotencyKey,
                            now,
                            now,
                        ),
                    auditTrailAfterChangeStatement(
                        ctx,
                        auditTrailLogger.prepare({
                            component: 'admin.servicePrincipal',
                            action: 'create',
                            description:
                                'Organization service principal created',
                            records: {
                                table: 'service_principal',
                                id: result,
                                newData: {
                                    audience: input.audience,
                                    description,
                                    name: input.name,
                                    permissions,
                                },
                            },
                        }),
                        database,
                    ),
                ])
            } catch (error) {
                const concurrentReplay = await findExisting()
                if (!concurrentReplay) throw error
                if (
                    !samePrincipalCreateRequest(concurrentReplay, {
                        audience: input.audience,
                        description,
                        name: input.name,
                        permissions,
                    })
                ) {
                    throw new AppError(
                        catalog.servicePrincipalIdempotencyConflict,
                    )
                }
                return apiResponseOkWrapper(ctx, {
                    data: projectPrincipal(
                        (await requirePrincipal(
                            ctx,
                            concurrentReplay.publicId,
                        ))!,
                    ),
                    status: 201,
                })
            }

            markAuditTrailRecorded(ctx)
            return apiResponseOkWrapper(ctx, {
                data: projectPrincipal((await requirePrincipal(ctx, result))!),
                status: 201,
            })
        },
    )
    .post(
        '/update',
        isAuthorized({ servicePrincipal: ['update'] }),
        validateRequest('json', servicePrincipalUpdateInputSchema),
        async (ctx) => {
            const input = ctx.req.valid('json')
            const organizationId = getActiveOrganizationId(ctx)
            const { servicePrincipal } = ctx.get('dbSchema')
            const permissions =
                input.permissions === undefined
                    ? undefined
                    : normalizePermissions(
                          (await requirePrincipal(ctx, input.publicId))
                              .audience as TApiKeyAudience,
                          input.permissions,
                          ctx.get('acl').apiKeyAssignablePermissions,
                      )
            if (permissions === null) {
                throw new AppError(catalog.servicePrincipalInvalidPermissions)
            }

            const client = ctx.get('dbClient')
            const [existing] = await client
                .select({
                    description: servicePrincipal.description,
                    id: servicePrincipal.id,
                    name: servicePrincipal.name,
                    permissions: servicePrincipal.permissions,
                    updatedAt: servicePrincipal.updatedAt,
                })
                .from(servicePrincipal)
                .where(
                    and(
                        eq(servicePrincipal.organizationId, organizationId),
                        eq(servicePrincipal.publicId, input.publicId),
                    ),
                )
                .limit(1)
            if (!existing) {
                throw new AppError(catalog.servicePrincipalNotFound)
            }

            const setClauses: string[] = []
            const values: unknown[] = []
            if (input.name !== undefined) {
                setClauses.push('name = ?')
                values.push(input.name)
            }
            if (input.description !== undefined) {
                setClauses.push('description = ?')
                values.push(input.description)
            }
            if (permissions !== undefined) {
                setClauses.push('permissions = ?')
                values.push(JSON.stringify(permissions))
            }
            const updated = {
                description:
                    input.description === undefined
                        ? existing.description
                        : input.description,
                name: input.name ?? existing.name,
                permissions: permissions ?? existing.permissions,
            }
            const database = client.$client
            const now = Date.now()
            const auditData = auditTrailLogger.prepare({
                component: 'admin.servicePrincipal',
                action: 'update',
                description: 'Organization service principal updated',
                records: {
                    table: 'service_principal',
                    id: input.publicId,
                    oldData: existing,
                    newData: updated,
                },
            })
            const [updateResult] = await database.batch([
                database
                    .prepare(
                        `UPDATE service_principal
                         SET ${setClauses.length > 0 ? `${setClauses.join(', ')}, ` : ''}updated_at = ?
                         WHERE id = ? AND updated_at = ?`,
                    )
                    .bind(
                        ...values,
                        now,
                        existing.id,
                        existing.updatedAt.getTime(),
                    ),
                auditTrailAfterChangeStatement(ctx, auditData, database),
            ])
            if (updateResult.meta.changes !== 1) {
                throw new AppError(servicePrincipalUpdateConflict)
            }
            if (auditData) markAuditTrailRecorded(ctx)

            return apiResponseOkWrapper(ctx, {
                data: projectPrincipal(
                    (await requirePrincipal(ctx, input.publicId))!,
                ),
            })
        },
    )
    .post(
        '/disable',
        isAuthorized({ servicePrincipal: ['update'] }),
        validateRequest('json', servicePrincipalStatusInputSchema),
        async (ctx) =>
            apiResponseOkWrapper(ctx, {
                data: await setPrincipalEnabled(
                    ctx,
                    ctx.req.valid('json').publicId,
                    false,
                ),
            }),
    )
    .post(
        '/enable',
        isAuthorized({ servicePrincipal: ['update'] }),
        validateRequest('json', servicePrincipalEnableInputSchema),
        async (ctx) =>
            apiResponseOkWrapper(ctx, {
                data: await setPrincipalEnabled(
                    ctx,
                    ctx.req.valid('json').publicId,
                    true,
                ),
            }),
    )
    .post(
        '/delete',
        isAuthorized({ servicePrincipal: ['delete'] }),
        validateRequest('json', servicePrincipalStatusInputSchema),
        async (ctx) => {
            const input = ctx.req.valid('json')
            const organizationId = getActiveOrganizationId(ctx)
            const { servicePrincipal } = ctx.get('dbSchema')

            const client = ctx.get('dbClient')
            const [existing] = await client
                .select({
                    audience: servicePrincipal.audience,
                    description: servicePrincipal.description,
                    enabled: servicePrincipal.enabled,
                    id: servicePrincipal.id,
                    name: servicePrincipal.name,
                    permissions: servicePrincipal.permissions,
                })
                .from(servicePrincipal)
                .where(
                    and(
                        eq(servicePrincipal.organizationId, organizationId),
                        eq(servicePrincipal.publicId, input.publicId),
                    ),
                )
                .limit(1)
            if (!existing) {
                throw new AppError(catalog.servicePrincipalNotFound)
            }
            if (existing.enabled) {
                throw new AppError(
                    catalog.servicePrincipalDeleteRequiresDisabled,
                )
            }

            const database = client.$client
            const [deleteResult] = await database.batch([
                database
                    .prepare(
                        `DELETE FROM service_principal
                         WHERE id = ? AND organization_id = ? AND enabled = 0`,
                    )
                    .bind(existing.id, organizationId),
                auditTrailAfterChangeStatement(
                    ctx,
                    auditTrailLogger.prepare({
                        component: 'admin.servicePrincipal',
                        action: 'delete',
                        description: 'Organization service principal deleted',
                        records: {
                            table: 'service_principal',
                            id: input.publicId,
                            oldData: existing,
                        },
                    }),
                    database,
                ),
            ])
            if (deleteResult.meta.changes < 1) {
                throw new AppError(servicePrincipalDeleteConflict)
            }
            markAuditTrailRecorded(ctx)

            return apiResponseOkWrapper(ctx, { data: null })
        },
    )
    .on(
        'QUERY',
        '/credential/readMany',
        isAuthorized({
            apiKey: ['read'],
            servicePrincipal: ['read'],
        }),
        validateRequest('json', servicePrincipalCredentialReadManyInputSchema),
        async (ctx) => {
            const input = ctx.req.valid('json')
            const principal = await requirePrincipal(
                ctx,
                input.filters.principalPublicId,
            )
            const { apikey } = ctx.get('dbSchema')
            const orderBy = input.sortOrder === 'asc' ? asc : desc
            const where = and(
                eq(apikey.referenceId, principal.organizationId),
                eq(apikey.servicePrincipalId, principal.id),
                eq(apikey.configId, principal.audience),
            )
            const [
                credentials,
                countRows,
            ] = await Promise.all([
                ctx
                    .get('dbClient')
                    .select({
                        createdAt: apikey.createdAt,
                        expiresAt: apikey.expiresAt,
                        id: apikey.id,
                        lastRequest: apikey.lastRequest,
                        name: apikey.name,
                        start: apikey.start,
                    })
                    .from(apikey)
                    .where(where)
                    .orderBy(orderBy(apikey.createdAt), orderBy(apikey.id))
                    .limit(input.limit)
                    .offset(input.offset),
                ctx
                    .get('dbClient')
                    .select({ value: count() })
                    .from(apikey)
                    .where(where),
            ])

            return apiResponsePaginatedOkWrapper(ctx, {
                data: credentials.map(projectCredential),
                count: countRows[0]?.value ?? 0,
                limit: input.limit,
                offset: input.offset,
            })
        },
    )
    .post(
        '/credential/create',
        isAuthorized({
            apiKey: ['create'],
            servicePrincipal: ['read'],
        }),
        validateRequest('json', servicePrincipalCredentialCreateInputSchema),
        async (ctx) => {
            const input = ctx.req.valid('json')
            const organizationId = getActiveOrganizationId(ctx)
            const fingerprint = await credentialRequestFingerprint(input)
            const principal = await requirePrincipal(
                ctx,
                input.principalPublicId,
            )
            const {
                apikey,
                servicePrincipal,
                servicePrincipalCredentialIssuance,
            } = ctx.get('dbSchema')
            const [existingIssuance] = await ctx
                .get('dbClient')
                .select({
                    credentialCreatedAt:
                        servicePrincipalCredentialIssuance.credentialCreatedAt,
                    credentialExpiresAt:
                        servicePrincipalCredentialIssuance.credentialExpiresAt,
                    credentialId:
                        servicePrincipalCredentialIssuance.credentialId,
                    credentialName:
                        servicePrincipalCredentialIssuance.credentialName,
                    credentialStart:
                        servicePrincipalCredentialIssuance.credentialStart,
                    requestFingerprint:
                        servicePrincipalCredentialIssuance.requestFingerprint,
                    state: servicePrincipalCredentialIssuance.state,
                })
                .from(servicePrincipalCredentialIssuance)
                .where(
                    and(
                        eq(
                            servicePrincipalCredentialIssuance.organizationId,
                            organizationId,
                        ),
                        eq(
                            servicePrincipalCredentialIssuance.servicePrincipalId,
                            principal.id,
                        ),
                        eq(
                            servicePrincipalCredentialIssuance.idempotencyKey,
                            input.idempotencyKey,
                        ),
                    ),
                )
                .limit(1)

            if (existingIssuance) {
                if (existingIssuance.requestFingerprint !== fingerprint) {
                    throw new AppError(
                        catalog.credentialIssuanceIdempotencyConflict,
                    )
                }
                if (existingIssuance.state === 'completed') {
                    ctx.header('Cache-Control', 'no-store')
                    return apiResponseOkWrapper(ctx, {
                        data: {
                            ...projectCompletedIssuance(existingIssuance),
                            outcome: 'alreadyIssued' as const,
                        },
                    })
                }
                throw new AppError(
                    existingIssuance.state === 'pending'
                        ? catalog.credentialIssuancePending
                        : catalog.credentialIssuanceFailed,
                )
            }

            if (!principal.enabled) {
                throw new AppError(catalog.credentialIssuePrincipalDisabled)
            }
            const [activeCredentialsBeforeClaim] = await ctx
                .get('dbClient')
                .select({ value: count() })
                .from(apikey)
                .where(
                    and(
                        eq(apikey.referenceId, organizationId),
                        eq(apikey.servicePrincipalId, principal.id),
                        eq(apikey.configId, principal.audience),
                        eq(apikey.enabled, true),
                        or(
                            isNull(apikey.expiresAt),
                            gt(apikey.expiresAt, new Date()),
                        ),
                    ),
                )
            if (
                (activeCredentialsBeforeClaim?.value ?? 0) >=
                MAX_ACTIVE_CREDENTIALS
            ) {
                throw new AppError(catalog.servicePrincipalMaxCredentials)
            }

            const database = ctx.get('dbClient').$client
            const claimResult = await database
                .prepare(
                    `INSERT INTO service_principal_credential_issuance (
                         organization_id, service_principal_id, idempotency_key,
                         request_fingerprint, state
                     )
                     VALUES (?, ?, ?, ?, 'pending')
                     ON CONFLICT (organization_id, service_principal_id, idempotency_key)
                     DO NOTHING`,
                )
                .bind(
                    organizationId,
                    principal.id,
                    input.idempotencyKey,
                    fingerprint,
                )
                .run()

            if (claimResult.meta.changes !== 1) {
                const [existing] = await ctx
                    .get('dbClient')
                    .select({
                        credentialCreatedAt:
                            servicePrincipalCredentialIssuance.credentialCreatedAt,
                        credentialExpiresAt:
                            servicePrincipalCredentialIssuance.credentialExpiresAt,
                        credentialId:
                            servicePrincipalCredentialIssuance.credentialId,
                        credentialName:
                            servicePrincipalCredentialIssuance.credentialName,
                        credentialStart:
                            servicePrincipalCredentialIssuance.credentialStart,
                        requestFingerprint:
                            servicePrincipalCredentialIssuance.requestFingerprint,
                        state: servicePrincipalCredentialIssuance.state,
                    })
                    .from(servicePrincipalCredentialIssuance)
                    .where(
                        and(
                            eq(
                                servicePrincipalCredentialIssuance.organizationId,
                                organizationId,
                            ),
                            eq(
                                servicePrincipalCredentialIssuance.servicePrincipalId,
                                principal.id,
                            ),
                            eq(
                                servicePrincipalCredentialIssuance.idempotencyKey,
                                input.idempotencyKey,
                            ),
                        ),
                    )
                    .limit(1)

                if (!existing) {
                    throw new AppError(
                        catalog.credentialCreationConfirmationUnavailable,
                    )
                }
                if (existing.requestFingerprint !== fingerprint) {
                    throw new AppError(
                        catalog.credentialIssuanceIdempotencyConflict,
                    )
                }
                if (existing.state === 'completed') {
                    ctx.header('Cache-Control', 'no-store')
                    return apiResponseOkWrapper(ctx, {
                        data: {
                            ...projectCompletedIssuance(existing),
                            outcome: 'alreadyIssued' as const,
                        },
                    })
                }
                throw new AppError(
                    existing.state === 'pending'
                        ? catalog.credentialIssuancePending
                        : catalog.credentialIssuanceFailed,
                )
            }

            let created: Awaited<
                ReturnType<typeof ctx.var.auth.api.createApiKey>
            >
            try {
                created = await ctx.get('auth').api.createApiKey({
                    body: {
                        configId: principal.audience as TApiKeyAudience,
                        expiresIn:
                            input.expiryDays === null
                                ? null
                                : input.expiryDays * SECONDS_PER_DAY,
                        name: input.name,
                        organizationId,
                        userId: ctx.get('user')!.id,
                    },
                })
            } catch (error) {
                await markCredentialIssuanceFailed(ctx, {
                    fingerprint,
                    idempotencyKey: input.idempotencyKey,
                    organizationId,
                    servicePrincipalId: principal.id,
                })
                pluginError(error)
            }

            let linked = false
            try {
                const now = Date.now()
                const auditData = auditTrailLogger.prepare({
                    component: 'admin.servicePrincipal',
                    action: 'credential.create',
                    description:
                        input.expiryDays === null
                            ? 'Permanent service credential created'
                            : 'Service credential created',
                    records: {
                        table: 'apikey',
                        id: created.id,
                        newData: {
                            expiresAt: created.expiresAt,
                            name: input.name,
                            principalPublicId: input.principalPublicId,
                        },
                    },
                })!
                const [
                    linkResult,
                    auditResult,
                    completionResult,
                ] = await database.batch([
                    database
                        .prepare(
                            `UPDATE apikey
                             SET service_principal_id = ?, updated_at = ?
                             WHERE id = ?
                               AND reference_id = ?
                               AND config_id = ?
                               AND service_principal_id IS NULL
                               AND EXISTS (
                                   SELECT 1
                                   FROM service_principal_credential_issuance issuance
                                   WHERE issuance.organization_id = ?
                                     AND issuance.service_principal_id = ?
                                     AND issuance.idempotency_key = ?
                                     AND issuance.request_fingerprint = ?
                                     AND issuance.state = 'pending'
                               )
                               AND EXISTS (
                                   SELECT 1 FROM service_principal sp
                                   WHERE sp.id = ?
                                     AND sp.organization_id = ?
                                     AND sp.public_id = ?
                                     AND sp.enabled = 1
                                     AND sp.audience = ?
                               )
                               AND (
                                   SELECT count(*) FROM apikey active
                                   WHERE active.service_principal_id = ?
                                     AND active.reference_id = ?
                                     AND active.config_id = ?
                                     AND active.enabled = 1
                                     AND (active.expires_at IS NULL OR active.expires_at > ?)
                               ) < ?`,
                        )
                        .bind(
                            principal.id,
                            now,
                            created.id,
                            organizationId,
                            principal.audience,
                            organizationId,
                            principal.id,
                            input.idempotencyKey,
                            fingerprint,
                            principal.id,
                            organizationId,
                            input.principalPublicId,
                            principal.audience,
                            principal.id,
                            organizationId,
                            principal.audience,
                            now,
                            MAX_ACTIVE_CREDENTIALS,
                        ),
                    auditTrailAfterChangeStatement(ctx, auditData, database),
                    database
                        .prepare(
                            `UPDATE service_principal_credential_issuance
                                 SET state = 'completed', credential_id = ?,
                                     credential_name = ?, credential_start = ?,
                                     credential_expires_at = ?,
                                     credential_created_at = ?, updated_at = ?
                                 WHERE organization_id = ?
                                   AND service_principal_id = ?
                                   AND idempotency_key = ?
                                   AND request_fingerprint = ?
                                   AND state = 'pending'
                                   AND changes() >= 1
                                   AND EXISTS (
                                       SELECT 1 FROM apikey
                                       WHERE id = ?
                                         AND reference_id = ?
                                         AND config_id = ?
                                         AND service_principal_id = ?
                                   )`,
                        )
                        .bind(
                            created.id,
                            input.name,
                            created.start,
                            created.expiresAt?.getTime() ?? null,
                            created.createdAt.getTime(),
                            now,
                            organizationId,
                            principal.id,
                            input.idempotencyKey,
                            fingerprint,
                            created.id,
                            organizationId,
                            principal.audience,
                            principal.id,
                        ),
                ])
                if (
                    linkResult.meta.changes !== 1 ||
                    auditResult.meta.changes !== 1 ||
                    completionResult.meta.changes !== 1
                ) {
                    const [current] = await ctx
                        .get('dbClient')
                        .select({
                            audience: servicePrincipal.audience,
                            enabled: servicePrincipal.enabled,
                        })
                        .from(servicePrincipal)
                        .where(
                            and(
                                eq(servicePrincipal.id, principal.id),
                                eq(
                                    servicePrincipal.organizationId,
                                    principal.organizationId,
                                ),
                            ),
                        )
                        .limit(1)
                    if (!current) {
                        throw new AppError(catalog.servicePrincipalNotFound)
                    }
                    if (
                        !current.enabled ||
                        current.audience !== principal.audience
                    ) {
                        throw new AppError(
                            catalog.credentialIssuePrincipalChanged,
                        )
                    }
                    const [activeCredentials] = await ctx
                        .get('dbClient')
                        .select({ value: count() })
                        .from(apikey)
                        .where(
                            and(
                                eq(apikey.referenceId, organizationId),
                                eq(apikey.servicePrincipalId, principal.id),
                                eq(apikey.configId, principal.audience),
                                eq(apikey.enabled, true),
                                or(
                                    isNull(apikey.expiresAt),
                                    gt(apikey.expiresAt, new Date()),
                                ),
                            ),
                        )
                    throw new AppError(
                        (activeCredentials?.value ?? 0) >=
                            MAX_ACTIVE_CREDENTIALS
                            ? catalog.servicePrincipalMaxCredentials
                            : catalog.credentialCreationConfirmationUnavailable,
                    )
                }
                markAuditTrailRecorded(ctx)
                linked = true
            } catch (error) {
                let pluginCleanupError: unknown
                try {
                    await ctx.get('auth').api.deleteApiKey({
                        body: {
                            configId: principal.audience as TApiKeyAudience,
                            keyId: created.id,
                        },
                        headers: ctx.req.raw.headers,
                    })
                } catch (cleanupError) {
                    pluginCleanupError = cleanupError
                    console.error(
                        JSON.stringify({
                            type: 'UNLINKED_API_KEY_CLEANUP_ERROR',
                            requestId: ctx.get('requestId'),
                            correlationId: ctx.get('correlationId') ?? 'N/A',
                            environment: ctx.env.ENVIRONMENT,
                            credentialId: created.id,
                            error:
                                cleanupError instanceof Error
                                    ? cleanupError.message
                                    : String(cleanupError),
                        }),
                    )
                }

                try {
                    await ctx
                        .get('dbClient')
                        .delete(apikey)
                        .where(
                            and(
                                eq(apikey.id, created.id),
                                eq(
                                    apikey.referenceId,
                                    principal.organizationId,
                                ),
                                eq(apikey.configId, principal.audience),
                                isNull(apikey.servicePrincipalId),
                            ),
                        )
                } catch (directCleanupError) {
                    await markCredentialIssuanceFailed(ctx, {
                        fingerprint,
                        idempotencyKey: input.idempotencyKey,
                        organizationId,
                        servicePrincipalId: principal.id,
                    })
                    throw new AppError(
                        catalog.credentialCreationRollbackUnavailable,
                        {
                            cause: new AggregateError(
                                [
                                    pluginCleanupError,
                                    directCleanupError,
                                ],
                                'Credential cleanup failed.',
                            ),
                        },
                    )
                }
                await markCredentialIssuanceFailed(ctx, {
                    fingerprint,
                    idempotencyKey: input.idempotencyKey,
                    organizationId,
                    servicePrincipalId: principal.id,
                })
                pluginError(error)
            }

            if (!linked) {
                throw new AppError(
                    catalog.credentialCreationConfirmationUnavailable,
                )
            }

            ctx.header('Cache-Control', 'no-store')
            return apiResponseOkWrapper(ctx, {
                data: {
                    ...projectCredential(created),
                    key: created.key,
                    outcome: 'issued' as const,
                },
                status: 201,
            })
        },
    )
    .post(
        '/credential/revoke',
        isAuthorized({
            apiKey: ['delete'],
            servicePrincipal: ['read'],
        }),
        validateRequest('json', servicePrincipalCredentialRevokeInputSchema),
        async (ctx) => {
            const input = ctx.req.valid('json')
            const principal = await requirePrincipal(
                ctx,
                input.principalPublicId,
            )
            const { apikey } = ctx.get('dbSchema')
            const [credential] = await ctx
                .get('dbClient')
                .select({
                    createdAt: apikey.createdAt,
                    expiresAt: apikey.expiresAt,
                    id: apikey.id,
                    lastRequest: apikey.lastRequest,
                    name: apikey.name,
                    start: apikey.start,
                })
                .from(apikey)
                .where(
                    and(
                        eq(apikey.id, input.credentialId),
                        eq(apikey.referenceId, principal.organizationId),
                        eq(apikey.servicePrincipalId, principal.id),
                        eq(apikey.configId, principal.audience),
                    ),
                )
                .limit(1)
            if (!credential) {
                throw new AppError(catalog.credentialNotFound)
            }

            try {
                await ctx.get('auth').api.deleteApiKey({
                    body: {
                        configId: principal.audience as TApiKeyAudience,
                        keyId: credential.id,
                    },
                    headers: ctx.req.raw.headers,
                })
            } catch (error) {
                pluginError(error)
            }

            await auditTrailLogger(
                ctx,
                auditTrailLogger.prepare({
                    component: 'admin.servicePrincipal',
                    action: 'credential.revoke',
                    description: 'Service credential revoked',
                    records: {
                        table: 'apikey',
                        id: credential.id,
                        oldData: {
                            expiresAt: credential.expiresAt,
                            name: credential.name,
                            principalPublicId: input.principalPublicId,
                        },
                    },
                }),
            )

            return apiResponseOkWrapper(ctx, { data: null })
        },
    )

export default servicePrincipalRoute
