import { dbClient, dbSchema } from '@hyperion/database/d1'
import { env } from 'cloudflare:workers'
import { and, eq, inArray } from 'drizzle-orm'
import { v7 as uuidv7 } from 'uuid'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { incrementKeyCounter } from '../../src/utilities/helpers.js'
import {
    generateUniqueName,
    TEST_ISOLATED_ORGANIZATION_ID,
    TEST_MEMBER_USER_ID,
    TEST_PRIMARY_ORGANIZATION_ID,
} from '../utilities.js'

const counterKey = generateUniqueName('__TEST-tenant_counter')
const keyValueKey = generateUniqueName('__TEST-tenant_key_value')

let db: ReturnType<typeof dbClient>

const expectD1UniqueViolation = async (
    operation: () => PromiseLike<unknown>,
) => {
    try {
        await operation()
    } catch (error) {
        const d1Error =
            typeof error === 'object' && error !== null && 'cause' in error
                ? error.cause
                : error

        expect(d1Error).toBeInstanceOf(Error)
        expect((d1Error as Error).message).toMatch(/UNIQUE constraint failed/i)
        return
    }

    throw new Error('Expected D1 unique violation.')
}

beforeAll(() => {
    db = dbClient(env.HYPERIONBOFC_D1)
})

afterAll(async () => {
    const { keyCounter, keyValue } = dbSchema

    await db.delete(keyCounter).where(
        and(
            eq(keyCounter.key, counterKey),
            inArray(keyCounter.organizationId, [
                TEST_PRIMARY_ORGANIZATION_ID,
                TEST_ISOLATED_ORGANIZATION_ID,
            ]),
        ),
    )
    await db.delete(keyValue).where(
        and(
            eq(keyValue.key, keyValueKey),
            inArray(keyValue.organizationId, [
                TEST_PRIMARY_ORGANIZATION_ID,
                TEST_ISOLATED_ORGANIZATION_ID,
            ]),
        ),
    )
})

describe('Organization Tenant Isolation', () => {
    describe('Tenant-scoped key tables', () => {
        it('increments identical counter keys independently by organization.', async () => {
            const orgAFirst = await incrementKeyCounter(
                db,
                TEST_PRIMARY_ORGANIZATION_ID,
                counterKey,
            )
            const orgASecond = await incrementKeyCounter(
                db,
                TEST_PRIMARY_ORGANIZATION_ID,
                counterKey,
            )
            const orgBFirst = await incrementKeyCounter(
                db,
                TEST_ISOLATED_ORGANIZATION_ID,
                counterKey,
            )

            expect(orgAFirst).toBe(1)
            expect(orgASecond).toBe(2)
            expect(orgBFirst).toBe(1)
        })

        it('stores identical key_value keys independently by organization.', async () => {
            const { keyValue } = dbSchema

            await db.insert(keyValue).values([
                {
                    organizationId: TEST_PRIMARY_ORGANIZATION_ID,
                    key: keyValueKey,
                    value: 'org-a',
                },
                {
                    organizationId: TEST_ISOLATED_ORGANIZATION_ID,
                    key: keyValueKey,
                    value: 'org-b',
                },
            ])

            const rows = await db
                .select({
                    organizationId: keyValue.organizationId,
                    value: keyValue.value,
                })
                .from(keyValue)
                .where(eq(keyValue.key, keyValueKey))

            expect(rows).toEqual(
                expect.arrayContaining([
                    {
                        organizationId: TEST_PRIMARY_ORGANIZATION_ID,
                        value: 'org-a',
                    },
                    {
                        organizationId: TEST_ISOLATED_ORGANIZATION_ID,
                        value: 'org-b',
                    },
                ]),
            )
        })

        it('scopes key_counter public IDs by organization.', async () => {
            const { keyCounter } = dbSchema
            const publicId = uuidv7()

            try {
                await db.insert(keyCounter).values([
                    {
                        publicId,
                        organizationId: TEST_PRIMARY_ORGANIZATION_ID,
                        key: generateUniqueName(
                            '__TEST-counter_public_id_org_a',
                        ),
                    },
                    {
                        publicId,
                        organizationId: TEST_ISOLATED_ORGANIZATION_ID,
                        key: generateUniqueName(
                            '__TEST-counter_public_id_org_b',
                        ),
                    },
                ])

                await expectD1UniqueViolation(() =>
                    db.insert(keyCounter).values({
                        publicId,
                        organizationId: TEST_PRIMARY_ORGANIZATION_ID,
                        key: generateUniqueName(
                            '__TEST-counter_public_id_duplicate',
                        ),
                    }),
                )
            } finally {
                await db
                    .delete(keyCounter)
                    .where(eq(keyCounter.publicId, publicId))
            }
        })

        it('scopes key_value public IDs by organization.', async () => {
            const { keyValue } = dbSchema
            const publicId = uuidv7()

            try {
                await db.insert(keyValue).values([
                    {
                        publicId,
                        organizationId: TEST_PRIMARY_ORGANIZATION_ID,
                        key: generateUniqueName(
                            '__TEST-key_value_public_id_org_a',
                        ),
                    },
                    {
                        publicId,
                        organizationId: TEST_ISOLATED_ORGANIZATION_ID,
                        key: generateUniqueName(
                            '__TEST-key_value_public_id_org_b',
                        ),
                    },
                ])

                await expectD1UniqueViolation(() =>
                    db.insert(keyValue).values({
                        publicId,
                        organizationId: TEST_PRIMARY_ORGANIZATION_ID,
                        key: generateUniqueName(
                            '__TEST-key_value_public_id_duplicate',
                        ),
                    }),
                )
            } finally {
                await db.delete(keyValue).where(eq(keyValue.publicId, publicId))
            }
        })
    })

    describe('Active membership access relationships', () => {
        it('cascades object-storage ACLs when their object is removed.', async () => {
            const { objectStorage, objectStorageAcl } = dbSchema
            const objectStorageId = generateUniqueName('__TEST-acl_cascade')

            await db.insert(objectStorage).values({
                id: objectStorageId,
                organizationId: TEST_PRIMARY_ORGANIZATION_ID,
                size: 1,
                hashSha256: uuidv7(),
            })
            await db.insert(objectStorageAcl).values({
                organizationId: TEST_PRIMARY_ORGANIZATION_ID,
                objectStorageId,
                userId: TEST_MEMBER_USER_ID,
            })
            await db
                .delete(objectStorage)
                .where(eq(objectStorage.id, objectStorageId))

            const aclRows = await db
                .select({ userId: objectStorageAcl.userId })
                .from(objectStorageAcl)
                .where(eq(objectStorageAcl.objectStorageId, objectStorageId))

            expect(aclRows).toEqual([])
        })
    })

    describe('Tenant-scoped audit trail', () => {
        it('scopes public ID uniqueness by organization.', async () => {
            const { auditTrail } = dbSchema
            const publicId = uuidv7()
            const auditEntry = {
                publicId,
                actorDisplayName: '__TEST-System',
                actorType: 'system',
                component: generateUniqueName('__TEST-audit_public_id'),
                action: 'publicId.tenantIsolation',
                description: '__TEST-audit public ID tenancy regression',
            }

            try {
                await db.insert(auditTrail).values([
                    {
                        ...auditEntry,
                        organizationId: TEST_PRIMARY_ORGANIZATION_ID,
                    },
                    {
                        ...auditEntry,
                        organizationId: TEST_ISOLATED_ORGANIZATION_ID,
                    },
                ])

                const rows = await db
                    .select({ organizationId: auditTrail.organizationId })
                    .from(auditTrail)
                    .where(eq(auditTrail.publicId, publicId))

                expect(rows).toEqual(
                    expect.arrayContaining([
                        { organizationId: TEST_PRIMARY_ORGANIZATION_ID },
                        { organizationId: TEST_ISOLATED_ORGANIZATION_ID },
                    ]),
                )
                expect(rows).toHaveLength(2)

                await expectD1UniqueViolation(() =>
                    db.insert(auditTrail).values({
                        ...auditEntry,
                        organizationId: TEST_PRIMARY_ORGANIZATION_ID,
                    }),
                )
            } finally {
                await db
                    .delete(auditTrail)
                    .where(eq(auditTrail.publicId, publicId))
            }
        })
    })
})

// =============================================================================
// END OF BASE TEMPLATE TESTS - FORK-SPECIFIC TESTS MUST BE ADDED BELOW
// =============================================================================
