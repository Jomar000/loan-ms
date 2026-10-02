import { dbClient, dbSchema } from '@loanms/database/d1'
import { env } from 'cloudflare:workers'
import { eq, inArray } from 'drizzle-orm'
import { validate as validateUuid, version as uuidVersion } from 'uuid'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { aclBuilder } from '../../src/auth/acl.js'
import { auth } from '../../src/auth/index.js'
import { TEST_OWNER_USER_ID, TEST_OWNER_USER_PUBLIC_ID } from '../utilities.js'

let db: ReturnType<typeof dbClient>
const createdIds: string[] = []

beforeAll(() => {
    db = dbClient(env.LOANMSBOFC_D1)
})

afterAll(async () => {
    try {
        if (createdIds.length) {
            await db
                .delete(dbSchema.account)
                .where(inArray(dbSchema.account.userId, createdIds))
            await db
                .delete(dbSchema.user)
                .where(inArray(dbSchema.user.id, createdIds))
        }
    } finally {
        // D1 clients do not require teardown.
    }
})

describe('Canonical public user identifiers', () => {
    it('preserves UUIDv7 seed identifiers and generates UUIDv7 through Drizzle and Better Auth.', async () => {
        const [owner] = await db
            .select({ publicId: dbSchema.user.publicId })
            .from(dbSchema.user)
            .where(eq(dbSchema.user.id, TEST_OWNER_USER_ID))
        expect(owner.publicId).toBe(TEST_OWNER_USER_PUBLIC_ID)
        expect(uuidVersion(owner.publicId)).toBe(7)

        const id = '__TEST-PUBLIC-ID-DRIZZLE'
        createdIds.push(id)
        const [inserted] = await db
            .insert(dbSchema.user)
            .values({
                id,
                name: 'Public ID test',
                email: 'publicid.drizzle@test.loanms.example',
                username: '__test_publicid_drizzle',
            })
            .returning({ publicId: dbSchema.user.publicId })
        expect(validateUuid(inserted.publicId)).toBe(true)
        expect(uuidVersion(inserted.publicId)).toBe(7)

        const instance = await auth({
            db,
            dbSchema,
            env,
            acl: await aclBuilder(db, dbSchema, env.LOANMSBOFC_KV),
        })
        const created = await instance.api.signUpEmail({
            body: {
                name: 'Better Auth public ID test',
                email: 'publicid.betterauth@test.loanms.example',
                username: '__test_publicid_betterauth',
                password: 'Safe-Test-Password123!',
            },
        })
        createdIds.push(created.user.id)
        const [stored] = await db
            .select({ publicId: dbSchema.user.publicId })
            .from(dbSchema.user)
            .where(eq(dbSchema.user.id, created.user.id))
        expect(validateUuid(stored.publicId)).toBe(true)
        expect(uuidVersion(stored.publicId)).toBe(7)
        expect(
            new Set([
                owner.publicId,
                inserted.publicId,
                stored.publicId,
            ]).size,
        ).toBe(3)
    })

    it('rejects writes that bypass the application-generated public UUID.', async () => {
        const id = '__TEST-PUBLIC-ID-SQL'
        await expect(
            env.LOANMSBOFC_D1.prepare(
                `INSERT INTO "user" (id, name, email, username)
                 VALUES (?, 'SQL public ID test', 'publicid.sql@test.loanms.example', '__test_publicid_sql')`,
            )
                .bind(id)
                .run(),
        ).rejects.toThrow(/public_id/i)
    })
})

// =============================================================================
// END OF BASE TEMPLATE TESTS - FORK-SPECIFIC TESTS MUST BE ADDED BELOW
// =============================================================================
