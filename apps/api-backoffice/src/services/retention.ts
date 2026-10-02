import { dbSchema } from '@hyperion/database/d1'
import { and, asc, inArray, isNull, lte, or, sql } from 'drizzle-orm'

import type { THonoVariables } from '../types.js'

const CLEANUP_BATCH_SIZE = 100
const CLEANUP_MAX_BATCHES = 10

type TRetentionClient = THonoVariables['dbClient']
type TAuthenticationRecordType = 'apikey' | 'session' | 'verification'
type TRetentionOptions = {
    batchSize?: number
    maxBatches?: number
}

const retentionOptions = (options: TRetentionOptions = {}) => {
    const batchSize = options.batchSize ?? CLEANUP_BATCH_SIZE
    const maxBatches = options.maxBatches ?? CLEANUP_MAX_BATCHES

    if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 100)
        throw new RangeError('Retention batchSize must be from 1 through 100.')
    if (!Number.isInteger(maxBatches) || maxBatches < 1)
        throw new RangeError('Retention maxBatches must be a positive integer.')

    return { batchSize, maxBatches }
}

const cleanupResult = (
    recordType: TAuthenticationRecordType | 'audit',
    cutoffAt: Date,
    deletedCount: number,
    capReached: boolean,
) => {
    const result = { capReached, cutoffAt, deletedCount, recordType }
    console.log(
        JSON.stringify({
            type: capReached
                ? 'AUTH_RECORD_CLEANUP_CAP_REACHED'
                : 'AUTH_RECORD_CLEANUP_COMPLETED',
            ...result,
        }),
    )
    return result
}

export const purgeAuditTrail = async (
    client: TRetentionClient,
    now = new Date(),
    options?: TRetentionOptions,
) => {
    const { batchSize, maxBatches } = retentionOptions(options)
    const cutoffAt = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
    let deletedCount = 0

    for (let batch = 0; batch < maxBatches; batch += 1) {
        const candidates = client
            .select({ id: dbSchema.auditTrail.id })
            .from(dbSchema.auditTrail)
            .where(lte(dbSchema.auditTrail.loggedAt, cutoffAt))
            .orderBy(
                asc(dbSchema.auditTrail.loggedAt),
                asc(dbSchema.auditTrail.id),
            )
            .limit(batchSize)
        const deleted = await client
            .delete(dbSchema.auditTrail)
            .where(inArray(dbSchema.auditTrail.id, candidates))
            .returning({ id: dbSchema.auditTrail.id })
        deletedCount += deleted.length
        if (deleted.length < batchSize)
            return cleanupResult('audit', cutoffAt, deletedCount, false)
    }

    const [remaining] = await client
        .select({ id: dbSchema.auditTrail.id })
        .from(dbSchema.auditTrail)
        .where(lte(dbSchema.auditTrail.loggedAt, cutoffAt))
        .limit(1)
    return cleanupResult('audit', cutoffAt, deletedCount, Boolean(remaining))
}

export const purgeExpiredAuthenticationRecords = async (
    client: TRetentionClient,
    recordType: TAuthenticationRecordType,
    now = new Date(),
    options?: TRetentionOptions,
) => {
    const { batchSize, maxBatches } = retentionOptions(options)
    const cutoffAt = now
    let deletedCount = 0

    for (let batch = 0; batch < maxBatches; batch += 1) {
        let deleted: { id: string }[]
        if (recordType === 'session') {
            const candidates = client
                .select({ id: dbSchema.session.id })
                .from(dbSchema.session)
                .where(lte(dbSchema.session.expiresAt, cutoffAt))
                .orderBy(
                    asc(dbSchema.session.expiresAt),
                    asc(dbSchema.session.id),
                )
                .limit(batchSize)
            deleted = await client
                .delete(dbSchema.session)
                .where(inArray(dbSchema.session.id, candidates))
                .returning({ id: dbSchema.session.id })
        } else if (recordType === 'verification') {
            const candidates = client
                .select({ id: dbSchema.verification.id })
                .from(dbSchema.verification)
                .where(lte(dbSchema.verification.expiresAt, cutoffAt))
                .orderBy(
                    asc(dbSchema.verification.expiresAt),
                    asc(dbSchema.verification.id),
                )
                .limit(batchSize)
            deleted = await client
                .delete(dbSchema.verification)
                .where(inArray(dbSchema.verification.id, candidates))
                .returning({ id: dbSchema.verification.id })
        } else {
            const orphanCutoff = new Date(cutoffAt.getTime() - 15 * 60 * 1000)
            const expired = or(
                lte(dbSchema.apikey.expiresAt, cutoffAt),
                and(
                    isNull(dbSchema.apikey.servicePrincipalId),
                    lte(dbSchema.apikey.createdAt, orphanCutoff),
                ),
            )
            const candidates = client
                .select({ id: dbSchema.apikey.id })
                .from(dbSchema.apikey)
                .where(expired)
                .orderBy(
                    sql`${dbSchema.apikey.expiresAt} IS NULL`,
                    asc(dbSchema.apikey.expiresAt),
                    asc(dbSchema.apikey.id),
                )
                .limit(batchSize)
            deleted = await client
                .delete(dbSchema.apikey)
                .where(inArray(dbSchema.apikey.id, candidates))
                .returning({ id: dbSchema.apikey.id })
        }

        deletedCount += deleted.length
        if (deleted.length < batchSize)
            return cleanupResult(recordType, cutoffAt, deletedCount, false)
    }

    const orphanCutoff = new Date(cutoffAt.getTime() - 15 * 60 * 1000)
    const [remaining] =
        recordType === 'session'
            ? await client
                  .select({ id: dbSchema.session.id })
                  .from(dbSchema.session)
                  .where(lte(dbSchema.session.expiresAt, cutoffAt))
                  .limit(1)
            : recordType === 'verification'
              ? await client
                    .select({ id: dbSchema.verification.id })
                    .from(dbSchema.verification)
                    .where(lte(dbSchema.verification.expiresAt, cutoffAt))
                    .limit(1)
              : await client
                    .select({ id: dbSchema.apikey.id })
                    .from(dbSchema.apikey)
                    .where(
                        or(
                            lte(dbSchema.apikey.expiresAt, cutoffAt),
                            and(
                                isNull(dbSchema.apikey.servicePrincipalId),
                                lte(dbSchema.apikey.createdAt, orphanCutoff),
                            ),
                        ),
                    )
                    .limit(1)
    return cleanupResult(recordType, cutoffAt, deletedCount, Boolean(remaining))
}

export const runRetentionCron = (client: TRetentionClient, cron: string) => {
    if (cron === '0 19 * * *') return purgeAuditTrail(client)
    if (cron === '5 * * * *')
        return purgeExpiredAuthenticationRecords(client, 'session')
    if (cron === '10 * * * *')
        return purgeExpiredAuthenticationRecords(client, 'verification')
    if (cron === '15 * * * *')
        return purgeExpiredAuthenticationRecords(client, 'apikey')
    return null
}
