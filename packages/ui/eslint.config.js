import rootConfig, { createCacheableSvelteConfig } from '../../eslint.config.js'
import svelteConfig from './svelte.config.js'

const eslintSvelteConfig = createCacheableSvelteConfig(svelteConfig)

export default [
    ...rootConfig,
    {
        ignores: ['src/components/**'],
    },
    {
        files: [
            '**/*.svelte',
            '**/*.svelte.ts',
            '**/*.svelte.js',
        ],
        languageOptions: {
            parserOptions: {
                svelteConfig: eslintSvelteConfig,
            },
        },
    },
]
