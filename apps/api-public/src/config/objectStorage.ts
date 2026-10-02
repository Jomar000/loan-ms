import { parseFeatureFlag } from './featureFlag.js'

const OBJECT_STORAGE_FEATURE_FLAG = 'FEATURE_OBJECT_STORAGE'
const R2_PRESIGN_EXPIRY_MAX_SECONDS = 604_800

export type TObjectStorageBindings = {
    CF_ACCOUNT_ID?: string
    CF_R2_ACCESS_KEY_ID?: string
    CF_R2_BUCKET_PRIVATE?: string
    CF_R2_BUCKET_PUBLIC?: string
    CF_R2_BUCKET_PUBLIC_URL?: string
    CF_R2_PRESIGN_EXPIRY?: number | string
    CF_R2_SECRET_ACCESS_KEY?: string
    FEATURE_OBJECT_STORAGE?: 0 | 1 | '0' | '1'
}

type TObjectStorageEnvironment = {
    CF_ACCOUNT_ID?: unknown
    CF_R2_ACCESS_KEY_ID?: unknown
    CF_R2_BUCKET_PRIVATE?: unknown
    CF_R2_BUCKET_PUBLIC?: unknown
    CF_R2_BUCKET_PUBLIC_URL?: unknown
    CF_R2_PRESIGN_EXPIRY?: unknown
    CF_R2_SECRET_ACCESS_KEY?: unknown
    FEATURE_OBJECT_STORAGE?: unknown
    STATUS?: unknown
}

export type TObjectStorageConfiguration =
    | { enabled: false }
    | {
          accessKeyId: string
          accountId: string
          bucketPrivate: string
          bucketPublic: string
          bucketPublicUrl: string
          enabled: true
          presignExpiry: number
          secretAccessKey: string
      }

export type TEnabledObjectStorageConfiguration = Extract<
    TObjectStorageConfiguration,
    { enabled: true }
>

export function isObjectStorageFeatureEnabled(environment: object) {
    return parseFeatureFlag(
        (environment as TObjectStorageEnvironment).FEATURE_OBJECT_STORAGE,
        OBJECT_STORAGE_FEATURE_FLAG,
    )
}

export function getObjectStorageConfiguration(
    environment: object,
): TObjectStorageConfiguration {
    if (!isObjectStorageFeatureEnabled(environment)) return { enabled: false }

    const bindings = environment as TObjectStorageEnvironment

    return {
        accessKeyId: readRequiredString(
            bindings.CF_R2_ACCESS_KEY_ID,
            'CF_R2_ACCESS_KEY_ID',
        ),
        accountId: readRequiredString(bindings.CF_ACCOUNT_ID, 'CF_ACCOUNT_ID'),
        bucketPrivate: readRequiredString(
            bindings.CF_R2_BUCKET_PRIVATE,
            'CF_R2_BUCKET_PRIVATE',
        ),
        bucketPublic: readRequiredString(
            bindings.CF_R2_BUCKET_PUBLIC,
            'CF_R2_BUCKET_PUBLIC',
        ),
        bucketPublicUrl: readRequiredHttpUrl(
            bindings.CF_R2_BUCKET_PUBLIC_URL,
            'CF_R2_BUCKET_PUBLIC_URL',
        ),
        enabled: true,
        presignExpiry: readPresignExpiry(
            bindings.CF_R2_PRESIGN_EXPIRY,
            'CF_R2_PRESIGN_EXPIRY',
        ),
        secretAccessKey: readRequiredString(
            bindings.CF_R2_SECRET_ACCESS_KEY,
            'CF_R2_SECRET_ACCESS_KEY',
        ),
    }
}

export function validateObjectStorageStartupConfiguration(environment: object) {
    const bindings = environment as TObjectStorageEnvironment
    const enabled = isObjectStorageFeatureEnabled(environment)

    if (!enabled || bindings.STATUS === 'down') return

    getObjectStorageConfiguration(environment)
}

function readPresignExpiry(value: unknown, binding: string) {
    const number =
        typeof value === 'number'
            ? value
            : typeof value === 'string' && value.trim() !== ''
              ? Number(value)
              : Number.NaN

    if (
        !Number.isInteger(number) ||
        number < 1 ||
        number > R2_PRESIGN_EXPIRY_MAX_SECONDS
    ) {
        throw new Error(
            `${binding} must be an integer from 1 to ${R2_PRESIGN_EXPIRY_MAX_SECONDS} seconds.`,
        )
    }

    return number
}

function readRequiredHttpUrl(value: unknown, binding: string) {
    const string = readRequiredString(value, binding).trim()

    try {
        const url = new URL(string)

        if (url.protocol !== 'http:' && url.protocol !== 'https:') {
            throw new Error('Unsupported URL protocol.')
        }
    } catch {
        throw new Error(`${binding} must be a valid HTTP(S) URL.`)
    }

    return string.replace(/\/+$/, '')
}

function readRequiredString(value: unknown, binding: string) {
    const string = readString(value, binding)

    if (string.trim() === '') throw new Error(`${binding} must not be empty.`)

    return string
}

function readString(value: unknown, binding: string) {
    if (typeof value !== 'string') {
        throw new Error(`${binding} must be configured.`)
    }

    return value
}
