import { env } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'

import {
    expectedIndexes,
    expectedNamedConstraints,
    expectedTables,
    expectedTriggers,
} from '../fixtures/d1CompatibilityManifest.js'

const listSchemaObjects = async (type: 'index' | 'table' | 'trigger') => {
    const result = await env.HYPERIONPUB_D1.prepare(
        `SELECT name FROM sqlite_schema WHERE type = ? AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'd1_%' AND substr(name, 1, 4) <> '_cf_' ORDER BY name`,
    )
        .bind(type)
        .all<{ name: string }>()
    return result.results.map(({ name }) => name)
}

describe('D1 baseline migration compatibility', () => {
    it('installs the exact table, explicit index, and runtime trigger inventories.', async () => {
        await expect(listSchemaObjects('table')).resolves.toEqual(
            expectedTables,
        )
        await expect(listSchemaObjects('index')).resolves.toEqual(
            expectedIndexes,
        )
        await expect(listSchemaObjects('trigger')).resolves.toEqual(
            expectedTriggers,
        )
    })

    it('retains every named business constraint recorded by the compatibility ledger.', async () => {
        const schema = await env.HYPERIONPUB_D1.prepare(
            "SELECT sql FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
        ).all<{ sql: string }>()
        const sql = schema.results.map(({ sql: value }) => value).join('\n')

        for (const constraint of expectedNamedConstraints) {
            expect(sql, `missing constraint ${constraint}`).toContain(
                constraint,
            )
        }
    })

    it('has no foreign-key violations and stores timestamp defaults as integer milliseconds.', async () => {
        const foreignKeyViolations = await env.HYPERIONPUB_D1.prepare(
            'PRAGMA foreign_key_check',
        ).all()
        expect(foreignKeyViolations.results).toEqual([])

        const timestampStorage = await env.HYPERIONPUB_D1.prepare(
            'SELECT DISTINCT typeof(created_at) AS storage_type FROM user',
        ).all<{ storage_type: string }>()
        expect(timestampStorage.results).toEqual([{ storage_type: 'integer' }])
    })
})
