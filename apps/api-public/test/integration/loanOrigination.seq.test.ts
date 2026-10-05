import { env } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'

const organizationId = '__TEST-ORG_PRIMARY'
const ownerUserId = '__TEST-USER_OWNER'

const insertFormulaProfile = () =>
    env.LOANMSPUB_D1.prepare(
        `INSERT INTO loan_formula_profile (
            public_id, organization_id, name, version, is_active, is_default,
            interest_method, interest_rate_basis_points,
            fixed_interest_amount_minor, term_days, payment_frequency,
            installment_count, timezone, rounding_mode,
            final_installment_residue_policy, renewal_settlement_method,
            partial_credit_policy, min_completed_installments,
            allow_renewal_principal_change, effective_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
        '__TEST-ORIGINATION-FORMULA',
        organizationId,
        '__TEST-ORIGINATION FORMULA',
        1,
        true,
        false,
        'FLAT_PERCENTAGE',
        2_000,
        null,
        60,
        'DAILY',
        60,
        'Asia/Manila',
        'HALF_UP',
        'LAST_INSTALLMENT_ABSORBS_RESIDUE',
        'COMPLETED_INSTALLMENT_BALANCE',
        'CARRY_FORWARD',
        0,
        false,
        0,
    )

const insertBorrower = () =>
    env.LOANMSPUB_D1.prepare(
        `INSERT INTO borrower (
            public_id, organization_id, borrower_number, first_name, last_name,
            birth_date, gender, contact_number, normalized_contact_number,
            normalized_full_name, address_line, barangay, city_municipality,
            province, created_by_user_id, updated_by_user_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
        '__TEST-ORIGINATION-BORROWER',
        organizationId,
        '__TEST-ORIGINATION-000001',
        '__TEST-LOAN',
        '__TEST-BORROWER',
        '1990-01-01',
        'PREFER_NOT_TO_SAY',
        '639171000009',
        '639171000009',
        '__test loan borrower',
        '__TEST-LOAN STREET',
        '__TEST-BARANGAY',
        '__TEST-CITY',
        '__TEST-PROVINCE',
        ownerUserId,
        ownerUserId,
    )

const insertLoan = (
    publicId: string,
    loanNumber: string,
    status: 'DRAFT' | 'ACTIVE',
    borrowerId: number,
    productId: number,
    formulaProfileId: number,
) =>
    env.LOANMSPUB_D1.prepare(
        `INSERT INTO loan (
            public_id, organization_id, loan_number, borrower_id, loan_product_id,
            formula_profile_id, loan_product_name_snapshot,
            formula_profile_name_snapshot, formula_profile_version_snapshot,
            interest_method, interest_rate_basis_points,
            fixed_interest_amount_minor, principal_amount_minor,
            minimum_principal_amount_minor_snapshot,
            maximum_principal_amount_minor_snapshot, interest_amount_minor,
            total_payable_amount_minor, term_days, payment_frequency,
            installment_count, installment_amount_minor, daily_payment_amount_minor,
            timezone, rounding_mode, final_installment_residue_policy,
            renewal_settlement_method, partial_credit_policy,
            min_completed_installments, allow_renewal_principal_change,
            release_date, first_payment_date, expected_completion_date,
            total_amount_paid_minor, completed_installment_count,
            partial_payment_credit_minor, actual_outstanding_balance_minor, status,
            create_idempotency_key, release_idempotency_key, created_by_user_id,
            updated_by_user_id, approved_by_user_id, approved_at,
            released_by_user_id, released_at
        ) VALUES (
            ?, ?, ?, ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?, ?, ?, ?, ?
        )`,
    ).bind(
        publicId,
        organizationId,
        loanNumber,
        borrowerId,
        productId,
        formulaProfileId,
        '__TEST-ORIGINATION PRODUCT',
        '__TEST-ORIGINATION FORMULA',
        1,
        'FLAT_PERCENTAGE',
        2_000,
        null,
        700_000,
        100_000,
        1_000_000,
        140_000,
        840_000,
        60,
        'DAILY',
        60,
        14_000,
        14_000,
        'Asia/Manila',
        'HALF_UP',
        'LAST_INSTALLMENT_ABSORBS_RESIDUE',
        'COMPLETED_INSTALLMENT_BALANCE',
        'CARRY_FORWARD',
        0,
        false,
        status === 'ACTIVE' ? '2026-10-03' : null,
        '2026-10-04',
        '2026-12-02',
        0,
        0,
        0,
        840_000,
        status,
        `019936e2-b837-7000-8000-0000000003${status === 'ACTIVE' ? '02' : '01'}`,
        status === 'ACTIVE' ? '019936e2-b837-7000-8000-000000000303' : null,
        ownerUserId,
        ownerUserId,
        status === 'ACTIVE' ? ownerUserId : null,
        status === 'ACTIVE' ? 1 : null,
        status === 'ACTIVE' ? ownerUserId : null,
        status === 'ACTIVE' ? 2 : null,
    )

describe('loan origination migration', () => {
    it('installs tenant-scoped product, loan, schedule, and one-time loan-release cash-out constraints.', async () => {
        const loanSchema = await env.LOANMSPUB_D1.prepare(
            "SELECT sql FROM sqlite_schema WHERE type = 'table' AND name = 'loan'",
        ).first<{ sql: string }>()
        const cashSchema = await env.LOANMSPUB_D1.prepare(
            "SELECT sql FROM sqlite_schema WHERE type = 'table' AND name = 'cash_transaction'",
        ).first<{ sql: string }>()

        expect(loanSchema?.sql).toContain('loan_check_lifecycle')
        expect(loanSchema?.sql).toContain('loan_fk_formula_profile')
        expect(cashSchema?.sql).toContain(
            'cash_transaction_check_type_direction',
        )

        await insertFormulaProfile().run()
        await insertBorrower().run()

        const formulaProfile = await env.LOANMSPUB_D1.prepare(
            'SELECT id FROM loan_formula_profile WHERE organization_id = ? AND public_id = ?',
        )
            .bind(organizationId, '__TEST-ORIGINATION-FORMULA')
            .first<{ id: number }>()
        const borrower = await env.LOANMSPUB_D1.prepare(
            'SELECT id FROM borrower WHERE organization_id = ? AND public_id = ?',
        )
            .bind(organizationId, '__TEST-ORIGINATION-BORROWER')
            .first<{ id: number }>()

        expect(formulaProfile).toBeDefined()
        expect(borrower).toBeDefined()

        await expect(
            env.LOANMSPUB_D1.prepare(
                `INSERT INTO loan_product (
                    public_id, organization_id, formula_profile_id, name,
                    interest_method, interest_rate_basis_points,
                    fixed_interest_amount_minor, term_days, payment_frequency,
                    installment_count, timezone, rounding_mode,
                    final_installment_residue_policy, renewal_settlement_method,
                    partial_credit_policy, min_completed_installments,
                    allow_renewal_principal_change, minimum_principal_amount_minor,
                    maximum_principal_amount_minor, created_by_user_id,
                    updated_by_user_id
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            )
                .bind(
                    '__TEST-ORIGINATION-CROSS-TENANT-PRODUCT',
                    '__TEST-ORG_ISOLATED',
                    formulaProfile?.id,
                    '__TEST-CROSS TENANT PRODUCT',
                    'FLAT_PERCENTAGE',
                    2_000,
                    null,
                    60,
                    'DAILY',
                    60,
                    'Asia/Manila',
                    'HALF_UP',
                    'LAST_INSTALLMENT_ABSORBS_RESIDUE',
                    'COMPLETED_INSTALLMENT_BALANCE',
                    'CARRY_FORWARD',
                    0,
                    false,
                    100_000,
                    1_000_000,
                    ownerUserId,
                    ownerUserId,
                )
                .run(),
        ).rejects.toThrow('FOREIGN KEY constraint failed')

        await env.LOANMSPUB_D1.prepare(
            `INSERT INTO loan_product (
                public_id, organization_id, formula_profile_id, name,
                interest_method, interest_rate_basis_points,
                fixed_interest_amount_minor, term_days, payment_frequency,
                installment_count, timezone, rounding_mode,
                final_installment_residue_policy, renewal_settlement_method,
                partial_credit_policy, min_completed_installments,
                allow_renewal_principal_change, minimum_principal_amount_minor,
                maximum_principal_amount_minor, idempotency_key,
                created_by_user_id, updated_by_user_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
            .bind(
                '__TEST-ORIGINATION-PRODUCT',
                organizationId,
                formulaProfile?.id,
                '__TEST-ORIGINATION PRODUCT',
                'FLAT_PERCENTAGE',
                2_000,
                null,
                60,
                'DAILY',
                60,
                'Asia/Manila',
                'HALF_UP',
                'LAST_INSTALLMENT_ABSORBS_RESIDUE',
                'COMPLETED_INSTALLMENT_BALANCE',
                'CARRY_FORWARD',
                0,
                false,
                100_000,
                1_000_000,
                '019936e2-b837-7000-8000-000000000300',
                ownerUserId,
                ownerUserId,
            )
            .run()

        const product = await env.LOANMSPUB_D1.prepare(
            'SELECT id FROM loan_product WHERE organization_id = ? AND public_id = ?',
        )
            .bind(organizationId, '__TEST-ORIGINATION-PRODUCT')
            .first<{ id: number }>()

        expect(product).toBeDefined()

        await expect(
            insertLoan(
                '__TEST-ORIGINATION-DRAFT-LOAN',
                '__TEST-LOAN-000001',
                'DRAFT',
                borrower?.id ?? 0,
                product?.id ?? 0,
                formulaProfile?.id ?? 0,
            ).run(),
        ).resolves.toBeDefined()

        const draftLoan = await env.LOANMSPUB_D1.prepare(
            'SELECT id FROM loan WHERE organization_id = ? AND public_id = ?',
        )
            .bind(organizationId, '__TEST-ORIGINATION-DRAFT-LOAN')
            .first<{ id: number }>()

        await expect(
            env.LOANMSPUB_D1.prepare(
                `INSERT INTO loan_installment (
                    public_id, organization_id, loan_id, installment_number,
                    payment_frequency, period_start, period_end, due_date,
                    amount_due_minor
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            )
                .bind(
                    '__TEST-ORIGINATION-INSTALLMENT-1',
                    organizationId,
                    draftLoan?.id,
                    1,
                    'DAILY',
                    '2026-10-04',
                    '2026-10-04',
                    '2026-10-04',
                    14_000,
                )
                .run(),
        ).resolves.toBeDefined()

        await expect(
            env.LOANMSPUB_D1.prepare(
                `INSERT INTO loan_installment (
                    public_id, organization_id, loan_id, installment_number,
                    payment_frequency, period_start, period_end, due_date,
                    amount_due_minor
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            )
                .bind(
                    '__TEST-ORIGINATION-INSTALLMENT-DUPLICATE',
                    organizationId,
                    draftLoan?.id,
                    1,
                    'DAILY',
                    '2026-10-04',
                    '2026-10-04',
                    '2026-10-04',
                    14_000,
                )
                .run(),
        ).rejects.toThrow('UNIQUE constraint failed')

        await insertLoan(
            '__TEST-ORIGINATION-ACTIVE-LOAN',
            '__TEST-LOAN-000002',
            'ACTIVE',
            borrower?.id ?? 0,
            product?.id ?? 0,
            formulaProfile?.id ?? 0,
        ).run()

        const activeLoan = await env.LOANMSPUB_D1.prepare(
            'SELECT id FROM loan WHERE organization_id = ? AND public_id = ?',
        )
            .bind(organizationId, '__TEST-ORIGINATION-ACTIVE-LOAN')
            .first<{ id: number }>()

        await expect(
            env.LOANMSPUB_D1.prepare(
                `INSERT INTO cash_transaction (
                    public_id, organization_id, transaction_number,
                    transaction_type, direction, borrower_id, loan_id,
                    amount_minor, idempotency_key, created_by_user_id
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            )
                .bind(
                    '__TEST-ORIGINATION-CASH-OUT',
                    organizationId,
                    '__TEST-CASH-OUT-000001',
                    'LOAN_RELEASE',
                    'CASH_OUT',
                    borrower?.id,
                    activeLoan?.id,
                    700_000,
                    '019936e2-b837-7000-8000-000000000304',
                    ownerUserId,
                )
                .run(),
        ).resolves.toBeDefined()

        await expect(
            env.LOANMSPUB_D1.prepare(
                `INSERT INTO cash_transaction (
                    public_id, organization_id, transaction_number,
                    transaction_type, direction, borrower_id, loan_id,
                    amount_minor, idempotency_key, created_by_user_id
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            )
                .bind(
                    '__TEST-ORIGINATION-CASH-OUT-DUPLICATE',
                    organizationId,
                    '__TEST-CASH-OUT-000002',
                    'LOAN_RELEASE',
                    'CASH_OUT',
                    borrower?.id,
                    activeLoan?.id,
                    700_000,
                    '019936e2-b837-7000-8000-000000000305',
                    ownerUserId,
                )
                .run(),
        ).rejects.toThrow('UNIQUE constraint failed')
    })
})
