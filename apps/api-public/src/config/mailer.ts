import { parseFeatureFlag } from './featureFlag.js'

const MAIL_FEATURE_FLAG = 'FEATURE_MAIL'

export const MAILER_PROVIDERS = [
    'resend',
    'cloudflare',
] as const

export type TMailerProvider = (typeof MAILER_PROVIDERS)[number]

export type TMailerBindings = {
    FEATURE_MAIL?: 0 | 1 | '0' | '1'
    HYPERIONPUB_EMAIL?: SendEmail
    MAILER_ACCOUNT?: string
    MAILER_PROVIDER?: string
    RESEND_API_KEY?: string
}

export type TCloudflareMailerConfiguration = {
    account: string
    binding: SendEmail
    enabled: true
    provider: 'cloudflare'
}

export type TResendMailerConfiguration = {
    account: string
    apiKey: string
    enabled: true
    provider: 'resend'
}

export type TMailerConfiguration =
    | { enabled: false }
    | TCloudflareMailerConfiguration
    | TResendMailerConfiguration

export type TEnabledMailerConfiguration = Extract<
    TMailerConfiguration,
    { enabled: true }
>

type TMailerEnvironment = TMailerBindings & {
    FEATURE_MAIL?: unknown
    STATUS?: unknown
}

const readRequiredString = (value: unknown, name: string) => {
    if (typeof value !== 'string' || value.trim().length === 0)
        throw new Error(`${name} must be a non-empty string.`)

    return value
}

export const getMailerConfiguration = (
    environment: object,
): TMailerConfiguration => {
    if (!isMailerFeatureEnabled(environment)) return { enabled: false }

    const bindings = environment as TMailerEnvironment
    const provider = readRequiredString(
        bindings.MAILER_PROVIDER,
        'MAILER_PROVIDER',
    )
    const account = readRequiredString(
        bindings.MAILER_ACCOUNT,
        'MAILER_ACCOUNT',
    )

    if (provider === 'resend') {
        return {
            account,
            apiKey: readRequiredString(
                bindings.RESEND_API_KEY,
                'RESEND_API_KEY',
            ),
            enabled: true,
            provider,
        }
    }

    if (provider === 'cloudflare') {
        if (!bindings.HYPERIONPUB_EMAIL)
            throw new Error(
                'HYPERIONPUB_EMAIL is required when MAILER_PROVIDER is cloudflare.',
            )

        return {
            account,
            binding: bindings.HYPERIONPUB_EMAIL,
            enabled: true,
            provider,
        }
    }

    throw new Error('MAILER_PROVIDER must be resend or cloudflare.')
}

export const isMailerFeatureEnabled = (environment: object) =>
    parseFeatureFlag(
        (environment as TMailerEnvironment).FEATURE_MAIL,
        MAIL_FEATURE_FLAG,
    )

export const validateMailerStartupConfiguration = (environment: object) => {
    const bindings = environment as TMailerEnvironment

    if (!isMailerFeatureEnabled(environment) || bindings.STATUS === 'down') {
        return
    }

    getMailerConfiguration(environment)
}
