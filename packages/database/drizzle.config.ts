// Drizzle Configuration
// https://orm.drizzle.team/kit-docs/config-reference

import { defineConfig } from 'drizzle-kit'

export default defineConfig({
    dialect: 'sqlite',
    out: './src/d1/migrations/default',
    schema: './src/d1/schema.ts',
})
