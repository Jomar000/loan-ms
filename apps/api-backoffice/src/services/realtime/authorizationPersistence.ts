import { dbClient, dbSchema } from '@hyperion/database/d1'
import { AppError, catalog } from '@hyperion/errors'
import { and, asc, eq, gt, isNull, lte, sql } from 'drizzle-orm'
import {
    validate as validateUuid,
    v7 as uuidv7,
    version as uuidVersion,
} from 'uuid'

const { member, websocketRevocationDelivery, websocketRevocationOperation } =
    dbSchema

const invalidRealtimeRevocationInput = (message: string) =>
    new AppError(catalog.realtimeRevocationInvalidInput, { cause: message })

export type TWebSocketRevocationDestination = {
    delivery: 'local' | 'remote'
    surface: 'backoffice' | 'public'
}

export type TMembershipAuthorizationMutation =
    | {
          kind: 'remove'
      }
    | {
          kind: 'rotate'
      }
    | {
          kind: 'set-role'
          role: string
      }

export type TCreateWebSocketRevocationInput = {
    client: ReturnType<typeof dbClient>
    destinations: readonly TWebSocketRevocationDestination[]
    mutation: TMembershipAuthorizationMutation
    operationId: string
    organizationId: string
    reason: string
    retainUntil?: Date
    userId: string
}

const assertCreateInput = (input: TCreateWebSocketRevocationInput) => {
    if (
        !validateUuid(input.operationId) ||
        uuidVersion(input.operationId) !== 7
    ) {
        throw invalidRealtimeRevocationInput(
            'WebSocket revocation operation ID must be a UUIDv7.',
        )
    }

    if (
        input.organizationId.length === 0 ||
        input.userId.length === 0 ||
        input.reason.length === 0 ||
        input.reason.length > 64 ||
        input.destinations.length === 0 ||
        (input.retainUntil !== undefined &&
            (!Number.isFinite(input.retainUntil.getTime()) ||
                input.retainUntil.getTime() <= Date.now()))
    ) {
        throw invalidRealtimeRevocationInput(
            'Invalid WebSocket revocation operation input.',
        )
    }

    for (const destination of input.destinations) {
        if (
            (destination.surface !== 'backoffice' &&
                destination.surface !== 'public') ||
            (destination.delivery !== 'local' &&
                destination.delivery !== 'remote')
        ) {
            throw invalidRealtimeRevocationInput(
                'Invalid WebSocket revocation destination.',
            )
        }
    }

    const destinationKeys = new Set(
        input.destinations.map(
            ({ surface }) => `${input.operationId}:${surface}`,
        ),
    )

    if (destinationKeys.size !== input.destinations.length) {
        throw invalidRealtimeRevocationInput(
            'WebSocket revocation destinations must be unique by surface.',
        )
    }

    if (
        input.mutation.kind === 'set-role' &&
        (input.mutation.role.length === 0 || input.mutation.role.length > 256)
    ) {
        throw invalidRealtimeRevocationInput(
            'Invalid replacement membership role.',
        )
    }
}

const normalizeDestinations = (
    destinations: readonly TWebSocketRevocationDestination[],
) =>
    [...destinations].sort(
        (left, right) =>
            left.surface.localeCompare(right.surface) ||
            left.delivery.localeCompare(right.delivery),
    )

const createRequestFingerprint = async (
    input: TCreateWebSocketRevocationInput,
) => {
    const canonicalRequest = JSON.stringify({
        destinations: normalizeDestinations(input.destinations),
        mutation:
            input.mutation.kind === 'set-role'
                ? {
                      kind: input.mutation.kind,
                      role: input.mutation.role,
                  }
                : { kind: input.mutation.kind },
        organizationId: input.organizationId,
        reason: input.reason,
        retention:
            input.retainUntil === undefined
                ? 'default:31d'
                : `explicit:${input.retainUntil.toISOString()}`,
        userId: input.userId,
    })
    const digest = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(canonicalRequest),
    )

    return [...new Uint8Array(digest)]
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('')
}

const matchesExistingOperation = (
    operation: {
        requestFingerprint: null | string
    },
    requestFingerprint: string,
) => operation.requestFingerprint === requestFingerprint

/**
 * Rotates or removes one membership and records the immutable revocation
 * operation plus its topology-derived delivery rows in one D1 batch.
 * A caller-supplied UUIDv7 makes retries safe.
 */
export const createMembershipWebSocketRevocation = async (
    input: TCreateWebSocketRevocationInput,
) => {
    assertCreateInput(input)
    const destinations = normalizeDestinations(input.destinations)
    const requestFingerprint = await createRequestFingerprint(input)

    const findOperation = async () =>
        (
            await input.client
                .select()
                .from(websocketRevocationOperation)
                .where(eq(websocketRevocationOperation.id, input.operationId))
                .limit(1)
        )[0]
    const existingOperation = await findOperation()

    if (existingOperation) {
        if (!matchesExistingOperation(existingOperation, requestFingerprint)) {
            throw new AppError(catalog.realtimeRevocationOperationConflict)
        }
        return { operation: existingOperation, replayed: true }
    }

    const existingMember = (
        await input.client
            .select({
                authorizationVersion: member.websocketAuthorizationVersion,
                id: member.id,
            })
            .from(member)
            .where(
                and(
                    eq(member.organizationId, input.organizationId),
                    eq(member.userId, input.userId),
                ),
            )
            .limit(1)
    )[0]
    if (!existingMember) {
        throw new AppError(catalog.realtimeRevocationMembershipConflict)
    }

    const replacementAuthorizationVersion =
        input.mutation.kind === 'remove' ? null : uuidv7()
    const now = Date.now()
    const retainUntil =
        input.retainUntil?.getTime() ?? now + 31 * 24 * 60 * 60 * 1000
    const database = input.client.$client
    const operationInsert = database
        .prepare(
            `INSERT INTO websocket_revocation_operation (
                 id, organization_id, user_id, revoked_authorization_version,
                 replacement_authorization_version, reason,
                 request_fingerprint, retain_until, created_at
             )
             SELECT ?, ?, ?, websocket_authorization_version, ?, ?, ?, ?, ?
             FROM member
             WHERE id = ?
               AND organization_id = ?
               AND user_id = ?
               AND websocket_authorization_version = ?
             ON CONFLICT(id) DO NOTHING`,
        )
        .bind(
            input.operationId,
            input.organizationId,
            input.userId,
            replacementAuthorizationVersion,
            input.reason,
            requestFingerprint,
            retainUntil,
            now,
            existingMember.id,
            input.organizationId,
            input.userId,
            existingMember.authorizationVersion,
        )
    const operationGuard =
        `EXISTS (SELECT 1 FROM websocket_revocation_operation ` +
        `WHERE id = ? AND request_fingerprint = ? ` +
        `AND replacement_authorization_version IS ?)`
    const membershipMutation =
        input.mutation.kind === 'remove'
            ? database
                  .prepare(
                      `DELETE FROM member WHERE id = ? AND ${operationGuard}`,
                  )
                  .bind(
                      existingMember.id,
                      input.operationId,
                      requestFingerprint,
                      replacementAuthorizationVersion,
                  )
            : database
                  .prepare(
                      `UPDATE member
                       SET ${
                           input.mutation.kind === 'set-role'
                               ? 'role = ?, '
                               : ''
                       }websocket_authorization_version = ?, updated_at = ?
                       WHERE id = ? AND ${operationGuard}`,
                  )
                  .bind(
                      ...(input.mutation.kind === 'set-role'
                          ? [input.mutation.role]
                          : []),
                      replacementAuthorizationVersion,
                      now,
                      existingMember.id,
                      input.operationId,
                      requestFingerprint,
                      replacementAuthorizationVersion,
                  )
    const deliveryStatements = destinations.map((destination) =>
        database
            .prepare(
                `INSERT INTO websocket_revocation_delivery (
                     operation_id, organization_id, surface, delivery,
                     next_attempt_at, created_at, updated_at
                 )
                 SELECT ?, ?, ?, ?, ?, ?, ? WHERE ${operationGuard}
                 ON CONFLICT(operation_id, surface) DO NOTHING`,
            )
            .bind(
                input.operationId,
                input.organizationId,
                destination.surface,
                destination.delivery,
                now + 5 * 60 * 1000,
                now,
                now,
                input.operationId,
                requestFingerprint,
                replacementAuthorizationVersion,
            ),
    )

    const [insertResult] = await database.batch([
        operationInsert,
        membershipMutation,
        ...deliveryStatements,
    ])
    const operation = await findOperation()
    if (!operation) {
        throw new AppError(catalog.realtimeRevocationMembershipConflict)
    }
    if (!matchesExistingOperation(operation, requestFingerprint)) {
        throw new AppError(catalog.realtimeRevocationOperationConflict)
    }
    return { operation, replayed: insertResult.meta.changes === 0 }
}

export const listPendingWebSocketRevocationDeliveries = (
    client: ReturnType<typeof dbClient>,
    input: {
        limit: number
        surface: 'backoffice' | 'public'
    },
) => {
    if (
        !Number.isInteger(input.limit) ||
        input.limit < 1 ||
        input.limit > 100
    ) {
        throw invalidRealtimeRevocationInput(
            'Invalid WebSocket revocation recovery batch size.',
        )
    }

    return client
        .select({
            delivery: websocketRevocationDelivery.delivery,
            operationId: websocketRevocationOperation.id,
            organizationId: websocketRevocationOperation.organizationId,
            reason: websocketRevocationOperation.reason,
            replacementAuthorizationVersion:
                websocketRevocationOperation.replacementAuthorizationVersion,
            retainUntil: websocketRevocationOperation.retainUntil,
            revokedAuthorizationVersion:
                websocketRevocationOperation.revokedAuthorizationVersion,
            surface: websocketRevocationDelivery.surface,
            userId: websocketRevocationOperation.userId,
        })
        .from(websocketRevocationDelivery)
        .innerJoin(
            websocketRevocationOperation,
            and(
                eq(
                    websocketRevocationOperation.id,
                    websocketRevocationDelivery.operationId,
                ),
                eq(
                    websocketRevocationOperation.organizationId,
                    websocketRevocationDelivery.organizationId,
                ),
            ),
        )
        .where(
            and(
                eq(websocketRevocationDelivery.surface, input.surface),
                isNull(websocketRevocationDelivery.acceptedAt),
                lte(websocketRevocationDelivery.nextAttemptAt, new Date()),
                gt(websocketRevocationOperation.retainUntil, new Date()),
            ),
        )
        .orderBy(
            asc(websocketRevocationDelivery.nextAttemptAt),
            asc(websocketRevocationDelivery.createdAt),
            asc(websocketRevocationDelivery.operationId),
        )
        .limit(input.limit)
}

export const recordWebSocketRevocationDeliveryAttempt = async (
    client: ReturnType<typeof dbClient>,
    input: {
        accepted: boolean
        error?: string
        operationId: string
        organizationId: string
        surface: 'backoffice' | 'public'
    },
) => {
    const now = new Date()
    const [updatedDelivery] = await client
        .update(websocketRevocationDelivery)
        .set({
            acceptedAt: input.accepted ? now : undefined,
            attemptCount: sql`${websocketRevocationDelivery.attemptCount} + 1`,
            lastAttemptAt: now,
            lastError: input.accepted
                ? null
                : (input.error ?? 'Realtime revocation delivery failed.').slice(
                      0,
                      512,
                  ),
            nextAttemptAt: input.accepted
                ? undefined
                : sql`${now.getTime()} + CASE
                    WHEN ${websocketRevocationDelivery.attemptCount} = 0 THEN 300000
                    WHEN ${websocketRevocationDelivery.attemptCount} = 1 THEN 600000
                    WHEN ${websocketRevocationDelivery.attemptCount} = 2 THEN 1200000
                    WHEN ${websocketRevocationDelivery.attemptCount} = 3 THEN 2400000
                    ELSE 3600000
                END`,
            updatedAt: now,
        })
        .where(
            and(
                eq(websocketRevocationDelivery.operationId, input.operationId),
                eq(
                    websocketRevocationDelivery.organizationId,
                    input.organizationId,
                ),
                eq(websocketRevocationDelivery.surface, input.surface),
                isNull(websocketRevocationDelivery.acceptedAt),
            ),
        )
        .returning({
            operationId: websocketRevocationDelivery.operationId,
            surface: websocketRevocationDelivery.surface,
        })

    if (!updatedDelivery) {
        throw new AppError(catalog.realtimeRevocationDeliveryConflict)
    }

    return updatedDelivery
}

export const purgeExpiredWebSocketRevocations = async (
    client: ReturnType<typeof dbClient>,
    input: {
        limit: number
        now?: Date
        surface: 'backoffice' | 'public'
    },
) => {
    const now = input.now ?? new Date()

    if (
        !Number.isInteger(input.limit) ||
        input.limit < 1 ||
        input.limit > 100 ||
        !Number.isFinite(now.getTime())
    ) {
        throw invalidRealtimeRevocationInput(
            'Invalid WebSocket revocation cleanup input.',
        )
    }

    const expiredDeliveries = await client
        .select({
            operationId: websocketRevocationDelivery.operationId,
        })
        .from(websocketRevocationDelivery)
        .innerJoin(
            websocketRevocationOperation,
            and(
                eq(
                    websocketRevocationOperation.id,
                    websocketRevocationDelivery.operationId,
                ),
                eq(
                    websocketRevocationOperation.organizationId,
                    websocketRevocationDelivery.organizationId,
                ),
            ),
        )
        .where(
            and(
                eq(websocketRevocationDelivery.surface, input.surface),
                lte(websocketRevocationOperation.retainUntil, now),
            ),
        )
        .orderBy(
            asc(websocketRevocationOperation.retainUntil),
            asc(websocketRevocationDelivery.operationId),
        )
        .limit(input.limit)

    if (expiredDeliveries.length === 0) return 0

    const operationIds = expiredDeliveries.map(({ operationId }) => operationId)

    const database = client.$client
    const cleanupStatements = Array.from(
        { length: Math.ceil(operationIds.length / 95) },
        (_, chunkIndex) =>
            operationIds.slice(chunkIndex * 95, (chunkIndex + 1) * 95),
    ).flatMap((chunk) => {
        const placeholders = chunk.map(() => '?').join(', ')

        return [
            database
                .prepare(
                    `DELETE FROM websocket_revocation_delivery
                     WHERE surface = ?
                       AND operation_id IN (${placeholders})`,
                )
                .bind(input.surface, ...chunk),
            database
                .prepare(
                    `DELETE FROM websocket_revocation_operation
                     WHERE id IN (${placeholders})
                       AND NOT EXISTS (
                           SELECT 1
                           FROM websocket_revocation_delivery
                           WHERE operation_id = websocket_revocation_operation.id
                       )`,
                )
                .bind(...chunk),
        ]
    })
    const cleanupResults = await database.batch(cleanupStatements)

    return cleanupResults.reduce<number>(
        (
            deletedCount: number,
            result: { meta: { changes: number } },
            statementIndex: number,
        ) =>
            statementIndex % 2 === 0
                ? deletedCount + result.meta.changes
                : deletedCount,
        0,
    )
}
