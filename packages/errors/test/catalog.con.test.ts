import { describe, expect, it } from 'vitest'

import { catalog, errorCategories, publicCodeRegistry } from '../src/index.js'

describe.concurrent('error catalog', () => {
    it('contains unique internal IDs and registered public codes', () => {
        const definitions = Object.values(catalog)
        const ids = definitions.map(({ id }) => id)

        expect(new Set(ids).size).toBe(ids.length)
        expect(new Set(definitions.map(({ code }) => code))).toEqual(
            new Set(Object.keys(publicCodeRegistry)),
        )
        for (const definition of definitions) {
            expect(publicCodeRegistry).toHaveProperty(definition.code)
            expect(errorCategories).toContain(definition.category)
            expect(definition).toMatchObject(
                publicCodeRegistry[definition.code],
            )
        }
    })

    it('keeps classification consistent for shared public codes', () => {
        const definitionsByCode = Object.groupBy(
            Object.values(catalog),
            ({ code }) => code,
        )

        for (const [
            code,
            definitions,
        ] of Object.entries(definitionsByCode)) {
            for (const definition of definitions ?? []) {
                expect(definition).toMatchObject(
                    publicCodeRegistry[code as keyof typeof publicCodeRegistry],
                )
            }
        }
    })
})

// =============================================================================
// END OF BASE TEMPLATE TESTS - FORK-SPECIFIC TESTS MUST BE ADDED BELOW
// =============================================================================
