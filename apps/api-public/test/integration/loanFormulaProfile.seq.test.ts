import { env } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'

const insertFormulaProfile = (
    publicId: string,
    name: string,
    isDefault: boolean,
) =>
    env.LOANMSPUB_D1.prepare(
        `INSERT INTO loan_formula_profile (
            public_id,
            organization_id,
            name,
            version,
            is_active,
            is_default,
            interest_method,
            interest_rate_basis_points,
            fixed_interest_amount_minor,
            term_days,
            payment_frequency,
            installment_count,
            timezone,
            rounding_mode,
            final_installment_residue_policy,
            renewal_settlement_method,
            partial_credit_policy,
            min_completed_installments,
            allow_renewal_principal_change,
            effective_at,
            retired_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
        publicId,
        '__TEST-ORG_PRIMARY',
        name,
        1,
        true,
        isDefault,
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
        null,
    )

describe('loan formula profile migration', () => {
    it('installs the organization-scoped profile contract and allows one active default.', async () => {
        const schema = await env.LOANMSPUB_D1.prepare(
            "SELECT sql FROM sqlite_schema WHERE type = 'table' AND name = 'loan_formula_profile'",
        ).first<{ sql: string }>()

        expect(schema?.sql).toContain('loan_formula_profile_check_interest')
        expect(schema?.sql).toContain('loan_formula_profile_check_timezone')

        await expect(
            insertFormulaProfile(
                '__TEST-LOAN-FORMULA-PRIMARY',
                '__TEST-DAILY DEFAULT',
                true,
            ).run(),
        ).resolves.toBeDefined()

        await expect(
            insertFormulaProfile(
                '__TEST-LOAN-FORMULA-DUPLICATE',
                '__TEST-SECOND DAILY DEFAULT',
                true,
            ).run(),
        ).rejects.toThrow('UNIQUE constraint failed')

        await expect(
            insertFormulaProfile(
                '__TEST-LOAN-FORMULA-NONDEFAULT',
                '__TEST-DAILY ALTERNATE',
                false,
            ).run(),
        ).resolves.toBeDefined()
    })
})
