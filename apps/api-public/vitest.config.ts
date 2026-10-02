// Vitest Configuration
// https://vitest.dev/guide/#configuring-vitest

// CloudFlare Workers Vitest Integration
// https://developers.cloudflare.com/workers/testing/vitest-integration

import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const workerDependencyOptimization = () => ({
    // Workerd only runs ESM — CJS dependencies must be pre-bundled via Vite's
    // SSR optimizer so they are converted to ESM before workerd loads them.
    // resend → svix (pure CJS) → uuid
    // https://developers.cloudflare.com/workers/testing/vitest-integration/known-issues/#module-resolution
    optimizer: {
        ssr: {
            enabled: true,
            include: [
                'resend',
            ],
        },
    },
})

const defaultMigrations = await readD1Migrations(
    fileURLToPath(
        new URL(
            '../../packages/database/src/d1/migrations/default',
            import.meta.url,
        ),
    ),
)
const testMigrations = await readD1Migrations(
    fileURLToPath(
        new URL(
            '../../packages/database/src/d1/migrations/test',
            import.meta.url,
        ),
    ),
)

export default defineConfig({
    plugins: [
        cloudflareTest({
            miniflare: {
                bindings: {
                    BETTER_AUTH_SECRET:
                        'test-better-auth-secret-12345678901234567890',
                    CF_ACCOUNT_ID: 'test-cloudflare-account-id',
                    CF_DO_RATE_LIMIT_SECRET:
                        'test-cf-do-rate-limit-secret-123456789012345678901234',
                    CF_R2_ACCESS_KEY_ID: 'test-r2-access-key-id',
                    CF_R2_SECRET_ACCESS_KEY: 'test-r2-secret-access-key',
                    HYPERION_DEFAULT_MIGRATIONS: defaultMigrations,
                    HYPERION_TEST_MIGRATIONS: testMigrations,
                },
            },
            wrangler: {
                configPath: './wrangler.toml',
                environment: 'test',
            },
        }),
    ],
    test: {
        coverage: {
            provider: 'istanbul',
        },
        expect: { requireAssertions: true },
        projects: [
            {
                cacheDir: './node_modules/.vite/vitest-concurrent-test-files',
                extends: true,
                test: {
                    deps: workerDependencyOptimization(),
                    name: 'concurrent-test-files',
                    include: [
                        '**/*.con.test.ts',
                    ],
                },
            },
            {
                cacheDir: './node_modules/.vite/vitest-sequential-test-files',
                extends: true,
                test: {
                    deps: workerDependencyOptimization(),
                    name: 'sequential-test-files',
                    include: [
                        '**/*.seq.test.ts',
                    ],
                    fileParallelism: false,
                },
            },
            {
                cacheDir:
                    './node_modules/.vite/vitest-single-runtime-test-files',
                extends: true,
                test: {
                    deps: workerDependencyOptimization(),
                    name: 'single-runtime-test-files',
                    // Avoid the Workers Vitest console RPC teardown deadlock:
                    // https://github.com/cloudflare/workers-sdk/issues/15719
                    disableConsoleIntercept: true,
                    include: [
                        '**/*.srt.test.ts',
                    ],
                    fileParallelism: false,
                    isolate: false,
                    maxWorkers: 1,
                },
            },
        ],
        hookTimeout: 15000,
        setupFiles: ['./test/setup.ts'],
        testTimeout: 15000,
    },
})
