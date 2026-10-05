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
        '__TEST-PAYMENT-FORMULA',
        organizationId,
        '__TEST-PAYMENT FORMULA',
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
        '__TEST-PAYMENT-BORROWER',
        organizationId,
        '__TEST-PAYMENT-000001',
        '__TEST-PAYMENT',
        '__TEST-BORROWER',
        '1990-01-01',
        'PREFER_NOT_TO_SAY',
        '639171000010',
        '639171000010',
        '__test payment borrower',
        '__TEST-PAYMENT STREET',
        '__TEST-BARANGAY',
        '__TEST-CITY',
        '__TEST-PROVINCE',
        ownerUserId,
        ownerUserId,
    )

describe('payment collections migration', () => {
    it('retains allocatable receipts and reversible, same-tenant cash evidence.', async () => {
        const paymentSchema = await env.LOANMSPUB_D1.prepare(
            "SELECT sql FROM sqlite_schema WHERE type = 'table' AND name = 'payment'",
        ).first<{ sql: string }>()
        const allocationSchema = await env.LOANMSPUB_D1.prepare(
            "SELECT sql FROM sqlite_schema WHERE type = 'table' AND name = 'payment_allocation'",
        ).first<{ sql: string }>()
        const cashSchema = await env.LOANMSPUB_D1.prepare(
            "SELECT sql FROM sqlite_schema WHERE type = 'table' AND name = 'cash_transaction'",
        ).first<{ sql: string }>()

        expect(paymentSchema?.sql).toContain('payment_check_reversal')
        expect(allocationSchema?.sql).toContain('amount_paid_before_minor')
        expect(allocationSchema?.sql).toContain(
            'payment_allocation_check_before_payment_state',
        )
        expect(cashSchema?.sql).toContain('PAYMENT_RECEIVED')
        expect(cashSchema?.sql).toContain('cash_transaction_fk_payment')

        await insertFormulaProfile().run()
        await insertBorrower().run()

        const formulaProfile = await env.LOANMSPUB_D1.prepare(
            'SELECT id FROM loan_formula_profile WHERE organization_id = ? AND public_id = ?',
        )
            .bind(organizationId, '__TEST-PAYMENT-FORMULA')
            .first<{ id: number }>()
        const borrower = await env.LOANMSPUB_D1.prepare(
            'SELECT id FROM borrower WHERE organization_id = ? AND public_id = ?',
        )
            .bind(organizationId, '__TEST-PAYMENT-BORROWER')
            .first<{ id: number }>()

        await env.LOANMSPUB_D1.prepare(
            `INSERT INTO loan_product (
                public_id, organization_id, formula_profile_id, name,
                interest_method, interest_rate_basis_points,
                term_days, payment_frequency, installment_count, timezone,
                rounding_mode, final_installment_residue_policy,
                renewal_settlement_method, partial_credit_policy,
                min_completed_installments, allow_renewal_principal_change,
                minimum_principal_amount_minor, maximum_principal_amount_minor,
                created_by_user_id, updated_by_user_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
            .bind(
                '__TEST-PAYMENT-PRODUCT',
                organizationId,
                formulaProfile?.id,
                '__TEST-PAYMENT PRODUCT',
                'FLAT_PERCENTAGE',
                2_000,
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
            .run()

        const product = await env.LOANMSPUB_D1.prepare(
            'SELECT id FROM loan_product WHERE organization_id = ? AND public_id = ?',
        )
            .bind(organizationId, '__TEST-PAYMENT-PRODUCT')
            .first<{ id: number }>()

        await env.LOANMSPUB_D1.prepare(
            `INSERT INTO loan (
                public_id, organization_id, loan_number, borrower_id, loan_product_id,
                formula_profile_id, loan_product_name_snapshot,
                formula_profile_name_snapshot, formula_profile_version_snapshot,
                interest_method, interest_rate_basis_points,
                principal_amount_minor, minimum_principal_amount_minor_snapshot,
                maximum_principal_amount_minor_snapshot, interest_amount_minor,
                total_payable_amount_minor, term_days, payment_frequency,
                installment_count, installment_amount_minor, daily_payment_amount_minor,
                timezone, rounding_mode, final_installment_residue_policy,
                renewal_settlement_method, partial_credit_policy,
                min_completed_installments, allow_renewal_principal_change,
                release_date, first_payment_date, expected_completion_date,
                actual_outstanding_balance_minor, status, created_by_user_id,
                updated_by_user_id, approved_by_user_id, approved_at,
                released_by_user_id, released_at
            ) VALUES (
                ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
            )`,
        )
            .bind(
                '__TEST-PAYMENT-LOAN',
                organizationId,
                '__TEST-PAYMENT-LOAN-000001',
                borrower?.id,
                product?.id,
                formulaProfile?.id,
                '__TEST-PAYMENT PRODUCT',
                '__TEST-PAYMENT FORMULA',
                1,
                'FLAT_PERCENTAGE',
                2_000,
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
                '2026-10-03',
                '2026-10-04',
                '2026-12-02',
                840_000,
                'ACTIVE',
                ownerUserId,
                ownerUserId,
                ownerUserId,
                1,
                ownerUserId,
                2,
            )
            .run()

        const loan = await env.LOANMSPUB_D1.prepare(
            'SELECT id FROM loan WHERE organization_id = ? AND public_id = ?',
        )
            .bind(organizationId, '__TEST-PAYMENT-LOAN')
            .first<{ id: number }>()

        await env.LOANMSPUB_D1.prepare(
            `INSERT INTO loan_installment (
                public_id, organization_id, loan_id, installment_number,
                payment_frequency, period_start, period_end, due_date,
                amount_due_minor
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
            .bind(
                '__TEST-PAYMENT-INSTALLMENT',
                organizationId,
                loan?.id,
                1,
                'DAILY',
                '2026-10-04',
                '2026-10-04',
                '2026-10-04',
                14_000,
            )
            .run()

        const installment = await env.LOANMSPUB_D1.prepare(
            'SELECT id FROM loan_installment WHERE organization_id = ? AND public_id = ?',
        )
            .bind(organizationId, '__TEST-PAYMENT-INSTALLMENT')
            .first<{ id: number }>()

        await env.LOANMSPUB_D1.prepare(
            `INSERT INTO payment (
                public_id, organization_id, payment_number, borrower_id, loan_id,
                amount_received_minor, amount_allocated_minor, unallocated_minor,
                payment_type_snapshot, payment_date, payment_method,
                partial_payment_credit_after_payment_minor,
                completed_installments_after_payment,
                remaining_installments_after_payment,
                actual_outstanding_balance_after_payment_minor, idempotency_key,
                created_by_user_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
            .bind(
                '__TEST-PAYMENT-RECEIPT',
                organizationId,
                '__TEST-PAYMENT-000001',
                borrower?.id,
                loan?.id,
                400_000,
                392_000,
                8_000,
                'DAILY',
                '2026-10-10',
                'CASH',
                8_000,
                28,
                32,
                440_000,
                '019936e2-b837-7000-8000-000000000401',
                ownerUserId,
            )
            .run()

        const payment = await env.LOANMSPUB_D1.prepare(
            'SELECT id FROM payment WHERE organization_id = ? AND public_id = ?',
        )
            .bind(organizationId, '__TEST-PAYMENT-RECEIPT')
            .first<{ id: number }>()

        await env.LOANMSPUB_D1.prepare(
            `INSERT INTO payment_allocation (
                organization_id, payment_id, loan_installment_id,
                allocated_amount_minor, amount_paid_before_minor, status_before,
                paid_at_before
            ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
            .bind(
                organizationId,
                payment?.id,
                installment?.id,
                14_000,
                0,
                'UPCOMING',
                null,
            )
            .run()

        await env.LOANMSPUB_D1.prepare(
            `INSERT INTO cash_transaction (
                public_id, organization_id, transaction_number, transaction_type,
                direction, borrower_id, loan_id, payment_id, amount_minor,
                idempotency_key, created_by_user_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
            .bind(
                '__TEST-PAYMENT-CASH-IN',
                organizationId,
                '__TEST-CASH-IN-000001',
                'PAYMENT_RECEIVED',
                'CASH_IN',
                borrower?.id,
                loan?.id,
                payment?.id,
                400_000,
                '019936e2-b837-7000-8000-000000000402',
                ownerUserId,
            )
            .run()

        await expect(
            env.LOANMSPUB_D1.prepare(
                `INSERT INTO cash_transaction (
                    public_id, organization_id, transaction_number, transaction_type,
                    direction, borrower_id, loan_id, payment_id, amount_minor,
                    idempotency_key, created_by_user_id
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            )
                .bind(
                    '__TEST-PAYMENT-CASH-IN-DUPLICATE',
                    organizationId,
                    '__TEST-CASH-IN-000002',
                    'PAYMENT_RECEIVED',
                    'CASH_IN',
                    borrower?.id,
                    loan?.id,
                    payment?.id,
                    400_000,
                    '019936e2-b837-7000-8000-000000000403',
                    ownerUserId,
                )
                .run(),
        ).rejects.toThrow('UNIQUE constraint failed')

        await env.LOANMSPUB_D1.prepare(
            `INSERT INTO cash_transaction (
                public_id, organization_id, transaction_number, transaction_type,
                direction, borrower_id, loan_id, payment_id, amount_minor,
                idempotency_key, created_by_user_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
            .bind(
                '__TEST-PAYMENT-CASH-OUT',
                organizationId,
                '__TEST-CASH-OUT-000001',
                'PAYMENT_REVERSAL',
                'CASH_OUT',
                borrower?.id,
                loan?.id,
                payment?.id,
                400_000,
                '019936e2-b837-7000-8000-000000000404',
                ownerUserId,
            )
            .run()

        await env.LOANMSPUB_D1.prepare(
            `UPDATE payment_allocation
             SET reversed_by_user_id = ?, reversed_at = ?
             WHERE organization_id = ? AND payment_id = ?`,
        )
            .bind(ownerUserId, 3, organizationId, payment?.id)
            .run()
        await env.LOANMSPUB_D1.prepare(
            `UPDATE payment
             SET status = 'REVERSED', reversed_by_user_id = ?, reversed_at = ?,
                 reversal_reason = ?
             WHERE organization_id = ? AND id = ?`,
        )
            .bind(
                ownerUserId,
                3,
                '__TEST-INCORRECT RECEIPT',
                organizationId,
                payment?.id,
            )
            .run()

        const reversal = await env.LOANMSPUB_D1.prepare(
            `SELECT p.status, a.amount_paid_before_minor, a.status_before,
                a.paid_at_before, a.reversed_at
             FROM payment p
             INNER JOIN payment_allocation a ON a.payment_id = p.id
             WHERE p.organization_id = ? AND p.id = ?`,
        )
            .bind(organizationId, payment?.id)
            .first<{
                amount_paid_before_minor: number
                paid_at_before: number | null
                reversed_at: number | null
                status: string
                status_before: string
            }>()

        expect(reversal).toEqual({
            amount_paid_before_minor: 0,
            paid_at_before: null,
            reversed_at: 3,
            status: 'REVERSED',
            status_before: 'UPCOMING',
        })
    })
})
