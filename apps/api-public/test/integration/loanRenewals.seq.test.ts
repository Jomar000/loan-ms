import { env } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'

describe('loan renewals migration', () => {
    it('installs tenant-scoped renewal evidence and renewal cash-out safeguards', async () => {
        const renewalSchema = await env.LOANMSPUB_D1.prepare(
            "SELECT sql FROM sqlite_schema WHERE type = 'table' AND name = 'loan_renewal'",
        ).first<{ sql: string }>()
        const cashSchema = await env.LOANMSPUB_D1.prepare(
            "SELECT sql FROM sqlite_schema WHERE type = 'table' AND name = 'cash_transaction'",
        ).first<{ sql: string }>()
        const indexes = await env.LOANMSPUB_D1.prepare(
            "SELECT name FROM sqlite_schema WHERE type = 'index' AND name IN (?, ?, ?)",
        )
            .bind(
                'loan_renewal_organization_id_old_loan_id_unique',
                'cash_transaction_unique_renewal_release',
                'cash_transaction_unique_partial_credit_refund',
            )
            .all<{ name: string }>()

        expect(renewalSchema?.sql).toContain('loan_renewal_fk_old_loan')
        expect(renewalSchema?.sql).toContain('loan_renewal_fk_new_loan')
        expect(renewalSchema?.sql).toContain(
            'loan_renewal_check_credit_handling_evidence',
        )
        expect(renewalSchema?.sql).toContain('MANUAL_REVIEW')
        expect(renewalSchema?.sql).toContain('loan_renewal_check_lifecycle')
        expect(cashSchema?.sql).toContain('loan_renewal_id')
        expect(cashSchema?.sql).toContain('RENEWAL_RELEASE')
        expect(cashSchema?.sql).toContain('PARTIAL_CREDIT_REFUND')
        expect(cashSchema?.sql).toContain('cash_transaction_fk_loan_renewal')
        expect(renewalSchema?.sql).toContain(
            'loan_renewal_organization_id_old_loan_id_unique',
        )
        expect(indexes.results.map((index) => index.name).sort()).toEqual([
            'cash_transaction_unique_partial_credit_refund',
            'cash_transaction_unique_renewal_release',
        ])
    })
})
