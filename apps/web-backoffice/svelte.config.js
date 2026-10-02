import adapter from '@sveltejs/adapter-static'
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte'
import { loadEnv } from 'vite'

const mode =
    process.argv.find((arg) => arg.startsWith('--mode='))?.split('=')[1] || ''

const env = {
    PUBLIC_API_URL: '',
    PUBLIC_CF_ACCOUNT_ID: '',
    ...loadEnv(mode, import.meta.dirname, 'PUBLIC_'),
}

const getHttpOrigin = (value, variableName) => {
    const configuredValue = value.trim()
    if (!configuredValue) return undefined

    let url
    try {
        url = new URL(configuredValue)
    } catch {
        throw new Error(`${variableName} must be an absolute HTTP(S) URL.`)
    }

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw new Error(
            `${variableName} must use the http: or https: protocol.`,
        )
    }

    return url.origin
}

const getWebSocketOrigin = (httpOrigin) => {
    const url = new URL(httpOrigin)
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
    return url.origin
}

const connectSources = [
    'self',
    'https://cloudflareinsights.com',
]

const cloudflareAccountId = env.PUBLIC_CF_ACCOUNT_ID.trim()
if (cloudflareAccountId) {
    if (!/^[a-f0-9]{32}$/iu.test(cloudflareAccountId)) {
        throw new Error(
            'PUBLIC_CF_ACCOUNT_ID must be a 32-character hexadecimal ID.',
        )
    }

    connectSources.push(
        `https://${cloudflareAccountId}.r2.cloudflarestorage.com`,
    )
}

const apiOrigin = getHttpOrigin(env.PUBLIC_API_URL, 'PUBLIC_API_URL')
if (apiOrigin) {
    connectSources.push(apiOrigin, getWebSocketOrigin(apiOrigin))
}

/**
 * @type {import('@sveltejs/kit').Config}
 */
const config = {
    // Consult https://kit.svelte.dev/docs/integrations#preprocessors
    // for more information about preprocessors
    preprocess: vitePreprocess(),

    kit: {
        // adapter-auto only supports some environments, see https://kit.svelte.dev/docs/adapter-auto for a list.
        // If your environment is not supported or you settled on a specific environment, switch out the adapter.
        // See https://kit.svelte.dev/docs/adapters for more information about adapters.
        adapter: adapter({
            fallback: '404.html',
            pages: 'dist',
        }),
        prerender: {
            handleHttpError: 'warn',
        },
        csp: {
            mode: 'hash',
            directives: {
                'base-uri': ['none'],
                'connect-src': connectSources,
                'default-src': ['none'],
                'font-src': ['self'],
                'form-action': ['self'],
                'frame-src': [
                    'self',
                    'https://challenges.cloudflare.com/',
                    'https://www.youtube.com/',
                ],
                'img-src': [
                    'self',
                    'blob:',
                    'data:',
                    'https://img.youtube.com/',
                ],
                'manifest-src': ['self'],
                'media-src': [
                    'self',
                    'blob:',
                    'data:',
                    'mediastream:',
                ],
                'object-src': ['none'],
                'script-src': [
                    'self',
                    'https://challenges.cloudflare.com/',
                    'https://static.cloudflareinsights.com/',
                ],
                'script-src-attr': ['none'],
                'style-src': ['self'],
                'style-src-attr': ['unsafe-inline'],
                'style-src-elem': ['self'],
                'worker-src': [
                    'self',
                    'blob:',
                ],
            },
        },
    },
    compilerOptions: {
        modernAst: true,
        warningFilter: (warning) => {
            /**
             * Ignored Warnings
             * https://github.com/sveltejs/language-tools/issues/650#issuecomment-2260462839
             */

            const ignoredWarningCodes = [
                'a11y_invalid_attribute',
            ]

            return !(
                ignoredWarningCodes.includes(warning.code) ||
                warning.filename?.includes('node_modules')
            )
        },
    },
}

export default config
