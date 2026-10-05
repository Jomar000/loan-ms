import { env } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'

const insertBorrower = (
    publicId: string,
    borrowerNumber: string,
    normalizedContactNumber: string,
    gender = 'PREFER_NOT_TO_SAY',
    birthDate: null | string = '1990-01-01',
) =>
    env.LOANMSPUB_D1.prepare(
        `INSERT INTO borrower (
            public_id,
            organization_id,
            borrower_number,
            first_name,
            last_name,
            birth_date,
            gender,
            contact_number,
            normalized_contact_number,
            normalized_full_name,
            address_line,
            barangay,
            city_municipality,
            province,
            created_by_user_id,
            updated_by_user_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
        publicId,
        '__TEST-ORG_PRIMARY',
        borrowerNumber,
        '__TEST-BORROWER',
        '__TEST-PRIMARY',
        birthDate,
        gender,
        normalizedContactNumber,
        normalizedContactNumber,
        '__test borrower primary',
        '__TEST-1 BORROWER STREET',
        '__TEST-BARANGAY',
        '__TEST-CITY',
        '__TEST-PROVINCE',
        '__TEST-USER_OWNER',
        '__TEST-USER_OWNER',
    )

describe('borrower management migration', () => {
    it('installs organization-scoped borrowers, non-blocking duplicate keys, and same-tenant document storage.', async () => {
        const schema = await env.LOANMSPUB_D1.prepare(
            "SELECT sql FROM sqlite_schema WHERE type = 'table' AND name = 'borrower'",
        ).first<{ sql: string }>()

        expect(schema?.sql).toContain('borrower_check_payment_tag_source')
        expect(schema?.sql).toContain('borrower_check_archived')
        expect(schema?.sql).toContain('borrower_fk_organization')
        expect(schema?.sql).toContain('borrower_check_gender')

        const indexes = await env.LOANMSPUB_D1.prepare(
            "SELECT name FROM sqlite_schema WHERE type = 'index' AND tbl_name = 'borrower'",
        ).all<{ name: string }>()

        expect(indexes.results.map((index) => index.name)).toEqual(
            expect.arrayContaining([
                'borrower_idx_list',
                'borrower_idx_payment_tag',
                'borrower_idx_duplicate_contact',
                'borrower_idx_duplicate_secondary_contact',
                'borrower_idx_duplicate_email',
                'borrower_idx_duplicate_name_birth_date',
            ]),
        )

        await expect(
            insertBorrower(
                '__TEST-BORROWER-PRIMARY',
                '__TEST-BORROWER-000001',
                '639171000001',
            ).run(),
        ).resolves.toBeDefined()

        await expect(
            insertBorrower(
                '__TEST-BORROWER-DUPLICATE-CONTACT',
                '__TEST-BORROWER-000002',
                '639171000001',
            ).run(),
        ).resolves.toBeDefined()

        await expect(
            insertBorrower(
                '__TEST-BORROWER-WITHOUT-BIRTH-DATE',
                '__TEST-BORROWER-000004',
                '639171000005',
                'PREFER_NOT_TO_SAY',
                null,
            ).run(),
        ).resolves.toBeDefined()

        await expect(
            insertBorrower(
                '__TEST-BORROWER-INVALID-BIRTH-DATE',
                '__TEST-BORROWER-000005',
                '639171000006',
                'PREFER_NOT_TO_SAY',
                '1990/01/01',
            ).run(),
        ).rejects.toThrow('CHECK constraint failed')

        await expect(
            insertBorrower(
                '__TEST-BORROWER-DUPLICATE-NUMBER',
                '__TEST-BORROWER-000001',
                '639171000003',
            ).run(),
        ).rejects.toThrow('UNIQUE constraint failed')

        await expect(
            insertBorrower(
                '__TEST-BORROWER-INVALID-GENDER',
                '__TEST-BORROWER-000003',
                '639171000004',
                'INVALID',
            ).run(),
        ).rejects.toThrow('CHECK constraint failed')

        await env.LOANMSPUB_D1.prepare(
            `INSERT INTO object_storage (
                id,
                organization_id,
                size,
                hash_sha256,
                is_uploaded
            ) VALUES (?, ?, ?, ?, ?)`,
        )
            .bind(
                '__TEST-BORROWER-DOCUMENT-OBJECT',
                '__TEST-ORG_PRIMARY',
                64,
                'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
                true,
            )
            .run()

        const borrowerRecord = await env.LOANMSPUB_D1.prepare(
            'SELECT id FROM borrower WHERE organization_id = ? AND public_id = ?',
        )
            .bind('__TEST-ORG_PRIMARY', '__TEST-BORROWER-PRIMARY')
            .first<{ id: number }>()

        expect(borrowerRecord).toBeDefined()

        await expect(
            env.LOANMSPUB_D1.prepare(
                `INSERT INTO borrower_document (
                    public_id,
                    organization_id,
                    borrower_id,
                    document_type,
                    document_number,
                    normalized_document_number,
                    object_storage_id,
                    idempotency_key,
                    created_by_user_id
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            )
                .bind(
                    '__TEST-BORROWER-DOCUMENT',
                    '__TEST-ORG_PRIMARY',
                    borrowerRecord?.id,
                    'VALID_ID',
                    '__TEST-ID-1',
                    '__testid1',
                    '__TEST-BORROWER-DOCUMENT-OBJECT',
                    '019936e2-b837-7000-8000-000000000201',
                    '__TEST-USER_OWNER',
                )
                .run(),
        ).resolves.toBeDefined()

        await expect(
            env.LOANMSPUB_D1.prepare(
                `INSERT INTO borrower_document (
                    public_id,
                    organization_id,
                    borrower_id,
                    document_type,
                    object_storage_id,
                    idempotency_key,
                    created_by_user_id
                ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            )
                .bind(
                    '__TEST-BORROWER-DOCUMENT-DUPLICATE-REQUEST',
                    '__TEST-ORG_PRIMARY',
                    borrowerRecord?.id,
                    'BORROWER_PHOTO',
                    '__TEST-BORROWER-DOCUMENT-OBJECT',
                    '019936e2-b837-7000-8000-000000000201',
                    '__TEST-USER_OWNER',
                )
                .run(),
        ).rejects.toThrow('UNIQUE constraint failed')

        await expect(
            env.LOANMSPUB_D1.prepare(
                `INSERT INTO borrower_document (
                    public_id,
                    organization_id,
                    borrower_id,
                    document_type,
                    object_storage_id,
                    created_by_user_id
                ) VALUES (?, ?, ?, ?, ?, ?)`,
            )
                .bind(
                    '__TEST-BORROWER-CROSS-TENANT-DOCUMENT',
                    '__TEST-ORG_PRIMARY',
                    borrowerRecord?.id,
                    'BORROWER_PHOTO',
                    'TESTTenantObjectIsolated000000001',
                    '__TEST-USER_OWNER',
                )
                .run(),
        ).rejects.toThrow('FOREIGN KEY constraint failed')
    })
})
