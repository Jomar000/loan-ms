import { dbClient, dbSchema } from '@hyperion/database/d1'
import { env } from 'cloudflare:workers'
import { and, eq } from 'drizzle-orm'
import { v7 as uuidv7 } from 'uuid'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { TEST_PRIMARY_ORGANIZATION_ID } from '../utilities.js'

let db: ReturnType<typeof dbClient>

async function expectD1Failure(
    operation: PromiseLike<unknown>,
    pattern: RegExp,
) {
    try {
        await operation
    } catch (error) {
        const d1Error =
            typeof error === 'object' && error !== null && 'cause' in error
                ? error.cause
                : error
        expect(d1Error).toBeInstanceOf(Error)
        expect((d1Error as Error).message).toMatch(pattern)
        return
    }

    throw new Error(`Expected D1 failure matching ${String(pattern)}.`)
}

beforeAll(() => {
    db = dbClient(env.HYPERIONBOFC_D1)
})

afterAll(async () => {
    await db
        .delete(dbSchema.keyCounter)
        .where(
            and(
                eq(
                    dbSchema.keyCounter.organizationId,
                    TEST_PRIMARY_ORGANIZATION_ID,
                ),
                eq(dbSchema.keyCounter.key, '__TEST-AUDIT-ROLLBACK'),
            ),
        )
})

describe('Audit Trail persistence contract', () => {
    it('installs the implemented tenant, filter, actor, and record indexes', async () => {
        const { results } = await env.HYPERIONBOFC_D1.prepare(
            `SELECT name
             FROM sqlite_schema
             WHERE type = 'index' AND tbl_name = 'audit_trail'
             ORDER BY name`,
        ).all<{ name: string }>()
        const names = results.map(({ name }) => name)

        expect(names).toEqual(
            expect.arrayContaining([
                'audit_trail_unique_1',
                'audit_trail_idx_1',
                'audit_trail_idx_2',
                'audit_trail_idx_3',
                'audit_trail_idx_4',
                'audit_trail_idx_5',
                'audit_trail_idx_6',
                'audit_trail_idx_7',
            ]),
        )
        expect(names).not.toContain('audit_trail_unique_2')
        expect(names).not.toContain('audit_trail_records_gin_index')
    })

    it('rejects actor IDs that do not match the declared actor type', async () => {
        const base = {
            action: 'verifyEmail',
            actorDisplayName: '__TEST-Audit actor',
            component: 'auth',
            description: '__TEST-Audit actor constraint checked',
            organizationId: TEST_PRIMARY_ORGANIZATION_ID,
        }

        await expectD1Failure(
            db.insert(dbSchema.auditTrail).values({
                ...base,
                actorType: 'user',
            }),
            /CHECK constraint failed/i,
        )
        await expectD1Failure(
            db.insert(dbSchema.auditTrail).values({
                ...base,
                actorType: 'servicePrincipal',
                servicePrincipalPublicId:
                    '019fc1a5-caf8-76f1-8f19-e873e77f86ec',
            }),
            /CHECK constraint failed/i,
        )
        await expectD1Failure(
            db.insert(dbSchema.auditTrail).values({
                ...base,
                actorType: 'anonymous',
                userId: '__TEST-invalid-audit-user',
            }),
            /CHECK constraint failed/i,
        )
        await expectD1Failure(
            db.insert(dbSchema.auditTrail).values({
                ...base,
                actorType: 'robot',
            }),
            /CHECK constraint failed/i,
        )
    })

    it('requires immutable organization, actor, and display attribution', async () => {
        await expectD1Failure(
            env.HYPERIONBOFC_D1.prepare(
                `INSERT INTO audit_trail (
                     public_id, component, action, description, actor_type
                 ) VALUES (?, 'auth', 'verifyEmail', ?, 'anonymous')`,
            )
                .bind(uuidv7(), '__TEST-Audit required attribution checked')
                .run(),
            /NOT NULL constraint failed: audit_trail\.organization_id/i,
        )
    })

    it('rolls back a business mutation when its D1 batch audit fails', async () => {
        const counterKey = '__TEST-AUDIT-ROLLBACK'
        const database = env.HYPERIONBOFC_D1

        await expectD1Failure(
            database.batch([
                database
                    .prepare(
                        `INSERT INTO key_counter (
                             public_id, organization_id, key, counter
                         ) VALUES (?, ?, ?, 1)`,
                    )
                    .bind(uuidv7(), TEST_PRIMARY_ORGANIZATION_ID, counterKey),
                database
                    .prepare(
                        `INSERT INTO audit_trail (
                             public_id, organization_id, actor_type,
                             actor_display_name, component, action, description
                         ) VALUES (?, ?, 'user', ?, 'auth', 'verifyEmail', ?)`,
                    )
                    .bind(
                        uuidv7(),
                        TEST_PRIMARY_ORGANIZATION_ID,
                        'Invalid user actor',
                        'Email address verified',
                    ),
            ]),
            /CHECK constraint failed/i,
        )

        const rows = await db
            .select({ key: dbSchema.keyCounter.key })
            .from(dbSchema.keyCounter)
            .where(
                and(
                    eq(
                        dbSchema.keyCounter.organizationId,
                        TEST_PRIMARY_ORGANIZATION_ID,
                    ),
                    eq(dbSchema.keyCounter.key, counterKey),
                ),
            )
        expect(rows).toEqual([])
    })
})

// =============================================================================
// END OF BASE TEMPLATE TESTS - FORK-SPECIFIC TESTS MUST BE ADDED BELOW
// =============================================================================
