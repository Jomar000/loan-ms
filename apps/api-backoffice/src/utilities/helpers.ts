import { dbSchema, type TAuditRecord } from '@loanms/database/d1'
import {
    AppError,
    catalog,
    serializeError,
    type TErrorDefinition,
} from '@loanms/errors'
import type {
    TApiResponseCursorPaginatedOk,
    TApiResponseError,
    TApiResponseOk,
    TApiResponsePaginatedOk,
    TValidatorIssue,
} from '@loanms/types/shared'
import {
    auditTrailActionSchema,
    auditTrailComponentSchema,
} from '@loanms/validator/backoffice/auditTrail'
import { sql } from 'drizzle-orm'
import type { Context, TypedResponse } from 'hono'
import { routePath } from 'hono/route'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import type { JSONParsed } from 'hono/utils/types'
import { customAlphabet } from 'nanoid'
import { v7 as uuidv7 } from 'uuid'
import type { z } from 'zod'

import {
    auditRecordPreparationError,
    projectAuditRecord,
    type TAuditRecordInput,
} from '../services/auditTrail/snapshots.js'
import type { THonoInstance } from '../types.js'

const AUDIT_EVENT_RECORDED_HEADER = 'Audit-Event-Recorded'
type TJsonResponse<T> = Response &
    TypedResponse<JSONParsed<T>, ContentfulStatusCode, 'json'>

/**
 * NanoID Custom Character Set
 *
 * @description
 * Generate NanoIDs with custom alphabet & length fit for use as identifiers.
 *
 * @link
 * https://zelark.github.io/nano-id-cc
 */
export const nanoidCustom = customAlphabet(
    '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
    12,
)

/**
 * Audit Trail Logger
 *
 * @description
 * Utility for logging activities.
 */
type TAuditActor =
    | {
          displayName: string
          identifier: string
          role?: string
          type: 'user'
          userId: string
      }
    | {
          credentialId: string
          displayName: string
          identifier: string
          servicePrincipalPublicId: string
          type: 'servicePrincipal'
      }
    | {
          displayName: 'Anonymous'
          type: 'anonymous'
      }
    | {
          displayName: string
          identifier?: string
          type: 'system'
      }

type TAuditData = {
    action: z.output<typeof auditTrailActionSchema>
    attribution?: {
        actor: TAuditActor
        organizationId: string
    }
    component: z.output<typeof auditTrailComponentSchema>
    description: string
    records?: TAuditRecord[]
}

type TAuditDataInput = Omit<TAuditData, 'records'> & {
    records?: TAuditRecordInput | TAuditRecordInput[]
}

function prepareAuditTrailData(data: TAuditDataInput): TAuditData | null {
    const { records, ...event } = data

    if (Array.isArray(records) && records.length === 0) return null

    const projectedRecords = records
        ? Array.isArray(records)
            ? records.map(projectAuditRecord)
            : [projectAuditRecord(records)]
        : undefined

    if (
        data.action === 'update' &&
        projectedRecords?.every((record) => !record.oldData && !record.newData)
    ) {
        return null
    }

    return {
        ...event,
        ...(projectedRecords ? { records: projectedRecords } : {}),
    }
}

function rejectAuditTrailPreparation(message: string): never {
    throw auditRecordPreparationError(new Error(message))
}

function parseAuditTrailTaxonomy(data: TAuditData) {
    try {
        return {
            action: auditTrailActionSchema.parse(data.action),
            component: auditTrailComponentSchema.parse(data.component),
        }
    } catch (error) {
        throw auditRecordPreparationError(error)
    }
}

function auditTrailValues(ctx: Context<THonoInstance>, data: TAuditData) {
    const serviceActor = ctx.get('apiKeyActor')
    const user = ctx.get('user')
    const attribution =
        data.attribution ??
        (user && ctx.get('session')?.activeOrganizationId
            ? {
                  actor: {
                      displayName: user.name,
                      identifier: user.username ?? user.email,
                      role:
                          ctx.get('role') === 'N/A'
                              ? undefined
                              : ctx.get('role'),
                      type: 'user' as const,
                      userId: user.id,
                  },
                  organizationId: ctx.get('session')!.activeOrganizationId!,
              }
            : serviceActor
              ? {
                    actor: {
                        credentialId: serviceActor.credentialId,
                        displayName: serviceActor.name,
                        identifier: serviceActor.principalPublicId,
                        servicePrincipalPublicId:
                            serviceActor.principalPublicId,
                        type: 'servicePrincipal' as const,
                    },
                    organizationId: serviceActor.organizationId,
                }
              : null)

    if (!attribution) {
        rejectAuditTrailPreparation('Audit trail attribution is required.')
    }

    const { action, component } = parseAuditTrailTaxonomy(data)
    const actor = attribution.actor

    if (!attribution.organizationId.trim()) {
        rejectAuditTrailPreparation('Audit trail organization is required.')
    }
    const actorDisplayName = actor.displayName.trim()
    const actorIdentifier =
        'identifier' in actor && typeof actor.identifier === 'string'
            ? actor.identifier.trim()
            : ''
    const actorRole =
        actor.type === 'user' && typeof actor.role === 'string'
            ? actor.role.trim()
            : ''
    if (!actorDisplayName) {
        rejectAuditTrailPreparation(
            'Audit trail actor display name is required.',
        )
    }
    if (!data.description.trim()) {
        rejectAuditTrailPreparation('Audit trail description is required.')
    }

    return {
        organizationId: attribution.organizationId,
        userId: actor.type === 'user' ? actor.userId : null,
        actorType: actor.type,
        actorDisplayName,
        actorIdentifier: actorIdentifier || null,
        actorRole: actorRole || null,
        servicePrincipalPublicId:
            actor.type === 'servicePrincipal'
                ? actor.servicePrincipalPublicId
                : null,
        credentialId:
            actor.type === 'servicePrincipal' ? actor.credentialId : null,
        component,
        action,
        description: data.description.trim(),
        records: data.records ?? null,
        ipAddress: ctx.get('ipAddress') ?? null,
        userAgent: ctx.get('userAgent') ?? null,
    }
}

export const auditTrailAfterChangeStatement = (
    ctx: Context<THonoInstance>,
    data: TAuditData | null,
    database: D1Database,
    expectedChanges = 1,
) => {
    if (!data) return database.prepare('SELECT 1 WHERE 0')

    const values = auditTrailValues(ctx, data)

    return database
        .prepare(
            `INSERT INTO audit_trail (
                 public_id, organization_id, user_id, actor_type,
                 actor_display_name, actor_identifier, actor_role,
                 service_principal_public_id, credential_id,
                 component, action, description, records,
                 ip_address, user_agent, logged_at
             )
             SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
             WHERE changes() >= ?`,
        )
        .bind(
            uuidv7(),
            values.organizationId,
            values.userId,
            values.actorType,
            values.actorDisplayName,
            values.actorIdentifier,
            values.actorRole,
            values.servicePrincipalPublicId,
            values.credentialId,
            values.component,
            values.action,
            values.description,
            values.records ? JSON.stringify(values.records) : null,
            values.ipAddress,
            values.userAgent,
            Date.now(),
            expectedChanges,
        )
}

export const auditTrailQuery = (
    ctx: Context<THonoInstance>,
    data: TAuditData,
    client: Pick<typeof ctx.var.dbClient, 'insert'>,
) => {
    const values = auditTrailValues(ctx, data)

    return client.insert(ctx.get('dbSchema').auditTrail).values(values)
}

async function persistAuditTrailQuery(
    ctx: Context<THonoInstance>,
    data: TAuditData,
    client: Pick<typeof ctx.var.dbClient, 'insert'>,
) {
    try {
        await auditTrailQuery(ctx, data, client)
    } catch (error) {
        if (
            error instanceof AppError &&
            error.code === 'AUDIT_TRAIL_RECORD_PREPARATION_FAILED'
        ) {
            throw error
        }
        throw new AppError(catalog.auditTrailWriteFailed, { cause: error })
    }
}

export const markAuditTrailRecorded = (ctx: Context<THonoInstance>) => {
    ctx.header(AUDIT_EVENT_RECORDED_HEADER, 'true')
}

export async function auditTrailLogger(
    ctx: Context<THonoInstance>,
    data: TAuditData | null,
    client?: Pick<typeof ctx.var.dbClient, 'insert'>,
) {
    if (!data) return

    if (client) {
        await persistAuditTrailQuery(ctx, data, client)
        markAuditTrailRecorded(ctx)
        return
    }

    try {
        await persistAuditTrailQuery(ctx, data, ctx.get('dbClient'))
        markAuditTrailRecorded(ctx)
    } catch (error) {
        const isPreparationFailure =
            error instanceof AppError &&
            error.code === 'AUDIT_TRAIL_RECORD_PREPARATION_FAILED'
        console.error(
            JSON.stringify({
                ...serializeError(error),
                type: isPreparationFailure
                    ? 'AUDIT_TRAIL_RECORD_PREPARATION_ERROR'
                    : 'AUDIT_TRAIL_WRITE_ERROR',
                requestId: ctx.get('requestId'),
                correlationId: ctx.get('correlationId') ?? 'N/A',
                environment: ctx.env.ENVIRONMENT,
                component: data.component,
                action: data.action,
                ...(error instanceof AppError
                    ? {
                          publicCode: error.code,
                          retryable: error.retryable,
                          status: error.status,
                      }
                    : {}),
            }),
        )
    }
}

auditTrailLogger.prepare = prepareAuditTrailData

export const getActiveOrganizationId = (ctx: Context<THonoInstance>) =>
    ctx.get('session')!.activeOrganizationId!

/**
 * The matched route pattern, such as `/api/ws/:stream/:target`, for request and
 * error logs. The URL pathname is never logged because its segments are user
 * input; an unmatched request logs its catch-all pattern.
 */
export const getRequestLogPath = (ctx: Context<THonoInstance>) => {
    try {
        return routePath(ctx, -1).slice(0, 256) || 'unmatched'
    } catch {
        return 'unmatched'
    }
}

/**
 * Atomic Key Counter Incrementer
 *
 * @description
 * Creates a key counter at the increment step when missing, otherwise atomically increments it.
 * Include this statement and its guarded consumer in one predeclared D1 batch
 * when the caller must couple both effects atomically.
 */
export const incrementKeyCounter = async (
    client: Pick<THonoInstance['Variables']['dbClient'], 'insert'>,
    organizationId: string,
    counterKey: string,
    incrementStep = 1,
) => {
    const { keyCounter } = dbSchema

    const [row] = await client
        .insert(keyCounter)
        .values({
            organizationId,
            key: counterKey,
            counter: incrementStep,
        })
        .onConflictDoUpdate({
            target: [
                keyCounter.organizationId,
                keyCounter.key,
            ],
            set: {
                counter: sql<number>`${keyCounter.counter} + ${incrementStep}`,
            },
        })
        .returning({
            counter: keyCounter.counter,
        })

    return row.counter
}

/**
 * API Response Error Wrapper
 *
 * @description
 * Wrapper for failed API responses.
 */
export const apiResponseErrorWrapper = (
    ctx: Context<THonoInstance>,
    definition: TErrorDefinition,
    options: {
        validatorIssues?: TValidatorIssue[]
    } = {},
): TJsonResponse<TApiResponseError> => {
    ctx.set('responseError', definition)
    return ctx.json<TApiResponseError>(
        {
            success: false,
            error: {
                requestId: ctx.get('requestId'),
                code: definition.code,
                message: definition.message,
                ...(options.validatorIssues
                    ? { validatorIssues: options.validatorIssues }
                    : {}),
            },
        },
        definition.status,
    )
}

/**
 * API Response Success Wrapper
 *
 * @description
 * Wrapper for successful API responses.
 */
export const apiResponseOkWrapper = <T = unknown>(
    ctx: Context<THonoInstance>,
    {
        data,
        status = 200,
    }: {
        data: T
        status?: ContentfulStatusCode
    },
): TJsonResponse<TApiResponseOk<T>> => {
    return ctx.json<TApiResponseOk<T>>(
        {
            success: true,
            data,
        },
        status,
    )
}

/**
 * API Cursor Paginated Response Success Wrapper
 *
 * @description
 * Wrapper for successful cursor-paginated API responses.
 */
export const apiResponseCursorPaginatedOkWrapper = <T = unknown>(
    ctx: Context<THonoInstance>,
    {
        data,
        limit,
        nextCursor,
        status = 200,
    }: {
        data: T
        limit: number
        nextCursor: string | null
        status?: ContentfulStatusCode
    },
): TJsonResponse<TApiResponseCursorPaginatedOk<T>> => {
    return ctx.json<TApiResponseCursorPaginatedOk<T>>(
        {
            success: true,
            data,
            limit,
            nextCursor,
        },
        status,
    )
}

/**
 * API Paginated Response Success Wrapper
 *
 * @description
 * Wrapper for successful paginated API responses.
 */
export const apiResponsePaginatedOkWrapper = <T = unknown>(
    ctx: Context<THonoInstance>,
    {
        data,
        count,
        limit,
        offset,
        status = 200,
    }: {
        data: T
        count: number
        limit: number
        offset: number
        status?: ContentfulStatusCode
    },
): TJsonResponse<TApiResponsePaginatedOk<T>> => {
    return ctx.json<TApiResponsePaginatedOk<T>>(
        {
            success: true,
            data,
            count,
            limit,
            offset,
        },
        status,
    )
}

/**
 * Parse Better Auth organization role strings.
 *
 * @description
 * Better Auth may store one or more organization roles as a comma-separated
 * string in `member.role`.
 */
export const parseAuthRoles = (role: string) => {
    const roles = role.split(',').map((value) => value.trim())
    if (roles.some((value) => value.length === 0)) return []

    return [...new Set(roles)]
}

/**
 * Checks whether any parsed Better Auth organization role can login.
 */
export const canLoginAuthRole = (
    role: string,
    allowedRoles: readonly string[] = [],
) => {
    const parsedRoles = parseAuthRoles(role)
    return (
        parsedRoles.length > 0 &&
        (allowedRoles.length === 0 ||
            parsedRoles.some((value) => allowedRoles.includes(value)))
    )
}

/**
 * Checks whether any parsed Better Auth organization role is privileged.
 */
export const hasPrivilegedAuthRole = (role: string) =>
    parseAuthRoles(role).some((value) =>
        [
            'admin',
            'owner',
        ].includes(value),
    )
