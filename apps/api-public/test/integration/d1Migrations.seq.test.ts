import { env } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'

import {
    expectedIndexes,
    expectedNamedConstraints,
    expectedTables,
    expectedTriggers,
} from '../fixtures/d1CompatibilityManifest.js'

const expectedLoanManagementTables = [
    'borrower',
    'borrower_document',
    'borrower_payment_tag_history',
    'capital_transaction',
    'cash_transaction',
    'company_fund',
    'loan',
    'loan_collection_assignment',
    'loan_formula_profile',
    'loan_installment',
    'loan_product',
    'loan_renewal',
    'payment',
    'payment_allocation',
    'system_settings',
] as const

const expectedLoanManagementIndexes = [
    'borrower_document_idx_borrower',
    'borrower_document_idx_duplicate_number',
    'borrower_document_organization_id_idempotency_key_unique',
    'borrower_idx_duplicate_contact',
    'borrower_idx_duplicate_email',
    'borrower_idx_duplicate_name_birth_date',
    'borrower_idx_duplicate_secondary_contact',
    'borrower_idx_list',
    'borrower_idx_payment_tag',
    'borrower_payment_tag_history_idx_borrower',
    'capital_transaction_idx_fund',
    'capital_transaction_idx_list',
    'cash_transaction_idx_loan',
    'cash_transaction_idx_renewal',
    'cash_transaction_organization_id_id_unique',
    'cash_transaction_unique_loan_release',
    'cash_transaction_unique_partial_credit_refund',
    'cash_transaction_unique_renewal_release',
    'company_fund_unique_primary',
    'loan_formula_profile_unique_active_default',
    'loan_formula_profile_organization_id_idempotency_key_unique',
    'loan_formula_profile_organization_id_id_unique',
    'loan_idx_borrower_history',
    'loan_idx_list',
    'loan_collection_assignment_idx_collector_active',
    'loan_installment_idx_collections',
    'loan_installment_idx_schedule',
    'loan_installment_organization_id_id_unique',
    'loan_product_idx_list',
    'loan_renewal_idx_borrower',
    'loan_renewal_idx_list',
    'payment_idx_borrower_history',
    'payment_idx_collections',
    'system_settings_unique_current',
] as const

const expectedSystemSettingsConstraints = [
    'system_settings_check_borrower_tag_policy',
    'system_settings_check_default_frequency',
    'system_settings_check_enabled_payment_frequencies',
    'system_settings_check_idempotency_fingerprint',
    'system_settings_check_version',
    'system_settings_fk_created_by_member',
    'system_settings_fk_default_loan_product',
    'system_settings_fk_organization',
    'system_settings_organization_id_id_unique',
    'system_settings_organization_id_idempotency_key_unique',
    'system_settings_organization_id_public_id_unique',
    'system_settings_organization_id_version_unique',
    'loan_collection_assignment_check_dates',
    'loan_collection_assignment_fk_assigner',
    'loan_collection_assignment_fk_collector',
    'loan_collection_assignment_fk_loan',
    'loan_collection_assignment_organization_id_id_unique',
    'loan_collection_assignment_organization_id_public_id_unique',
    'loan_collection_assignment_organization_loan_collector_unique',
] as const

const forkSchemaObjectsByType = {
    index: new Set<string>(),
    table: new Set<string>(),
    trigger: new Set<string>(),
} as const

const listSchemaObjects = async (type: 'index' | 'table' | 'trigger') => {
    const result = await env.LOANMSPUB_D1.prepare(
        `SELECT name FROM sqlite_schema WHERE type = ? AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'd1_%' AND substr(name, 1, 4) <> '_cf_' ORDER BY name`,
    )
        .bind(type)
        .all<{ name: string }>()
    return result.results
        .map(({ name }) => name)
        .filter((name) => !forkSchemaObjectsByType[type].has(name))
}

describe('D1 baseline migration compatibility', () => {
    it('installs the exact source-derived table, explicit index, and runtime trigger inventories.', async () => {
        await expect(listSchemaObjects('table')).resolves.toEqual(
            [
                ...expectedTables,
                ...expectedLoanManagementTables,
            ].sort(),
        )
        await expect(listSchemaObjects('index')).resolves.toEqual(
            [
                ...expectedIndexes,
                ...expectedLoanManagementIndexes,
            ].sort(),
        )
        await expect(listSchemaObjects('trigger')).resolves.toEqual(
            expectedTriggers,
        )
    })

    it('retains every named business constraint recorded by the compatibility ledger.', async () => {
        const schema = await env.LOANMSPUB_D1.prepare(
            "SELECT sql FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
        ).all<{ sql: string }>()
        const sql = schema.results.map(({ sql: value }) => value).join('\n')

        for (const constraint of [
            ...expectedNamedConstraints,
            ...expectedSystemSettingsConstraints,
        ]) {
            expect(sql, `missing constraint ${constraint}`).toContain(
                constraint,
            )
        }
    })

    it('has no foreign-key violations and stores timestamp defaults as integer milliseconds.', async () => {
        const foreignKeyViolations = await env.LOANMSPUB_D1.prepare(
            'PRAGMA foreign_key_check',
        ).all()
        expect(foreignKeyViolations.results).toEqual([])

        const timestampStorage = await env.LOANMSPUB_D1.prepare(
            'SELECT DISTINCT typeof(created_at) AS storage_type FROM user',
        ).all<{ storage_type: string }>()
        expect(timestampStorage.results).toEqual([{ storage_type: 'integer' }])
    })
})
