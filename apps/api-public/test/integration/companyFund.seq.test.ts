import { env } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'

const primaryOrganizationId = '__TEST-ORG_PRIMARY'
const isolatedOrganizationId = '__TEST-ORG_ISOLATED'
const ownerUserId = '__TEST-USER_OWNER'

describe('company fund migration', () => {
    it('installs tenant-scoped funds and an immutable, reconcilable capital ledger', async () => {
        const fundSchema = await env.LOANMSPUB_D1.prepare(
            "SELECT sql FROM sqlite_schema WHERE type = 'table' AND name = 'company_fund'",
        ).first<{ sql: string }>()
        const ledgerSchema = await env.LOANMSPUB_D1.prepare(
            "SELECT sql FROM sqlite_schema WHERE type = 'table' AND name = 'capital_transaction'",
        ).first<{ sql: string }>()
        const indexes = await env.LOANMSPUB_D1.prepare(
            "SELECT name FROM sqlite_schema WHERE type = 'index' AND name IN (?, ?, ?)",
        )
            .bind(
                'company_fund_unique_primary',
                'cash_transaction_organization_id_id_unique',
                'capital_transaction_idx_list',
            )
            .all<{ name: string }>()

        expect(fundSchema?.sql).toContain('company_fund_check_opening_capital')
        expect(ledgerSchema?.sql).toContain(
            'capital_transaction_fk_company_fund',
        )
        expect(ledgerSchema?.sql).toContain(
            'capital_transaction_fk_cash_transaction',
        )
        expect(ledgerSchema?.sql).toContain(
            'capital_transaction_check_type_direction_links',
        )
        expect(ledgerSchema?.sql).toContain(
            'capital_transaction_organization_id_cash_transaction_id_type_unique',
        )
        expect(ledgerSchema?.sql).toContain('PRINCIPAL_COLLECTION')
        expect(ledgerSchema?.sql).toContain('INTEREST_COLLECTION')
        expect(indexes.results.map((index) => index.name).sort()).toEqual([
            'capital_transaction_idx_list',
            'cash_transaction_organization_id_id_unique',
            'company_fund_unique_primary',
        ])

        await env.LOANMSPUB_D1.prepare(
            `INSERT INTO company_fund (
                public_id, organization_id, fund_name, opening_capital_minor,
                current_capital_minor, currency, is_primary
            ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
            .bind(
                '019c9b48-1000-7000-8000-000000000901',
                primaryOrganizationId,
                '__TEST-PRIMARY FUND',
                500_000,
                500_000,
                'PHP',
                true,
            )
            .run()

        const primaryFund = await env.LOANMSPUB_D1.prepare(
            'SELECT id, opening_capital_minor, current_capital_minor FROM company_fund WHERE organization_id = ? AND is_primary = TRUE',
        )
            .bind(primaryOrganizationId)
            .first<{
                id: number
                opening_capital_minor: number
                current_capital_minor: number
            }>()

        expect(primaryFund).toMatchObject({
            opening_capital_minor: 500_000,
            current_capital_minor: 500_000,
        })

        await expect(
            env.LOANMSPUB_D1.prepare(
                `INSERT INTO company_fund (
                    public_id, organization_id, fund_name, opening_capital_minor,
                    currency, is_primary
                ) VALUES (?, ?, ?, ?, ?, ?)`,
            )
                .bind(
                    '019c9b48-1000-7000-8000-000000000902',
                    primaryOrganizationId,
                    '__TEST-DUPLICATE PRIMARY FUND',
                    1,
                    'PHP',
                    true,
                )
                .run(),
        ).rejects.toThrow()

        await env.LOANMSPUB_D1.prepare(
            `INSERT INTO capital_transaction (
                public_id, organization_id, company_fund_id, transaction_number,
                transaction_type, direction, amount_minor, idempotency_key,
                created_by_user_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
            .bind(
                '019c9b48-1000-7000-8000-000000000903',
                primaryOrganizationId,
                primaryFund?.id,
                '__TEST-CT-OPENING-001',
                'OPENING_CAPITAL',
                'IN',
                500_000,
                '00000000-0000-7000-8000-000000000901',
                ownerUserId,
            )
            .run()

        const openingEntry = await env.LOANMSPUB_D1.prepare(
            `SELECT transaction_type, direction, amount_minor, loan_id, payment_id,
                loan_renewal_id, cash_transaction_id
             FROM capital_transaction WHERE transaction_number = ?`,
        )
            .bind('__TEST-CT-OPENING-001')
            .first<{
                transaction_type: string
                direction: string
                amount_minor: number
                loan_id: number | null
                payment_id: number | null
                loan_renewal_id: number | null
                cash_transaction_id: number | null
            }>()

        expect(openingEntry).toEqual({
            transaction_type: 'OPENING_CAPITAL',
            direction: 'IN',
            amount_minor: 500_000,
            loan_id: null,
            payment_id: null,
            loan_renewal_id: null,
            cash_transaction_id: null,
        })

        await expect(
            env.LOANMSPUB_D1.prepare(
                `INSERT INTO capital_transaction (
                    public_id, organization_id, company_fund_id, transaction_number,
                    transaction_type, direction, amount_minor, idempotency_key,
                    created_by_user_id
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            )
                .bind(
                    '019c9b48-1000-7000-8000-000000000904',
                    primaryOrganizationId,
                    primaryFund?.id,
                    '__TEST-CT-OPENING-REPLAY',
                    'OPENING_CAPITAL',
                    'IN',
                    500_000,
                    '00000000-0000-7000-8000-000000000901',
                    ownerUserId,
                )
                .run(),
        ).rejects.toThrow()

        await expect(
            env.LOANMSPUB_D1.prepare(
                `INSERT INTO capital_transaction (
                    public_id, organization_id, company_fund_id, transaction_number,
                    transaction_type, direction, amount_minor, created_by_user_id
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            )
                .bind(
                    '019c9b48-1000-7000-8000-000000000905',
                    isolatedOrganizationId,
                    primaryFund?.id,
                    '__TEST-CT-CROSS-TENANT',
                    'OPENING_CAPITAL',
                    'IN',
                    1,
                    ownerUserId,
                )
                .run(),
        ).rejects.toThrow()
    })
})
