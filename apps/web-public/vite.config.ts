// Vite Configuration
// https://vitejs.dev/config/#configuring-vite

import { sveltekit } from '@sveltejs/kit/vite'
import tailwindcss from '@tailwindcss/vite'
import { playwright } from '@vitest/browser-playwright'
import { loadEnv } from 'vite'
import { imagetools } from 'vite-imagetools'
import { defineConfig } from 'vitest/config'

import { defineBuildFeatureFlags } from './features.config.js'

export default defineConfig(({ mode }) => {
    const environment = loadEnv(mode, import.meta.dirname, '')

    return {
        build: {
            target: 'esnext',
        },
        define: defineBuildFeatureFlags(environment),
        server: {
            port: 5174,
        },
        plugins: [
            tailwindcss(),
            sveltekit(),
            imagetools({
                defaultDirectives: () => {
                    return new URLSearchParams({
                        format: 'avif',
                    })
                },
            }),
        ],
        test: {
            expect: { requireAssertions: true },
            hookTimeout: 15000,
            projects: [
                {
                    cacheDir:
                        './node_modules/.vite/vitest-client-concurrent-test-files',
                    extends: './vite.config.ts',
                    test: {
                        name: 'client-concurrent-test-files',
                        browser: {
                            enabled: true,
                            headless: true,
                            provider: playwright(),
                            instances: [{ browser: 'chromium' }],
                        },
                        include: ['src/**/*.svelte.con.spec.{js,ts}'],
                        setupFiles: ['./vitest-setup-client.ts'],
                    },
                },
                {
                    cacheDir:
                        './node_modules/.vite/vitest-client-sequential-test-files',
                    extends: './vite.config.ts',
                    test: {
                        name: 'client-sequential-test-files',
                        browser: {
                            enabled: true,
                            headless: true,
                            provider: playwright(),
                            instances: [{ browser: 'chromium' }],
                        },
                        include: ['src/**/*.svelte.seq.spec.{js,ts}'],
                        setupFiles: ['./vitest-setup-client.ts'],
                        fileParallelism: false,
                    },
                },
                {
                    cacheDir:
                        './node_modules/.vite/vitest-server-concurrent-test-files',
                    extends: './vite.config.ts',
                    test: {
                        name: 'server-concurrent-test-files',
                        environment: 'node',
                        include: ['src/**/*.con.spec.{js,ts}'],
                        exclude: ['src/**/*.svelte.con.spec.{js,ts}'],
                    },
                },
                {
                    cacheDir:
                        './node_modules/.vite/vitest-server-sequential-test-files',
                    extends: './vite.config.ts',
                    test: {
                        name: 'server-sequential-test-files',
                        environment: 'node',
                        include: ['src/**/*.seq.spec.{js,ts}'],
                        exclude: ['src/**/*.svelte.seq.spec.{js,ts}'],
                        fileParallelism: false,
                    },
                },
            ],
            testTimeout: 15000,
        },
    }
})
