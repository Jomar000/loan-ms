import { describe, expect, it } from 'vitest'

import {
    getObjectStorageConfiguration,
    isObjectStorageFeatureEnabled,
    validateObjectStorageStartupConfiguration,
} from '../../src/config/objectStorage.js'

const enabledEnvironment = {
    CF_ACCOUNT_ID: 'account-id',
    CF_R2_ACCESS_KEY_ID: 'access-key-id',
    CF_R2_BUCKET_PRIVATE: 'private-bucket',
    CF_R2_BUCKET_PUBLIC: 'public-bucket',
    CF_R2_BUCKET_PUBLIC_URL: 'https://storage.example.com',
    CF_R2_PRESIGN_EXPIRY: '900',
    CF_R2_SECRET_ACCESS_KEY: 'secret-access-key',
    FEATURE_OBJECT_STORAGE: '1',
}

const enabledConfiguration = {
    accessKeyId: 'access-key-id',
    accountId: 'account-id',
    bucketPrivate: 'private-bucket',
    bucketPublic: 'public-bucket',
    bucketPublicUrl: 'https://storage.example.com',
    enabled: true,
    presignExpiry: 900,
    secretAccessKey: 'secret-access-key',
}

const requiredBindings = [
    [
        'CF_ACCOUNT_ID',
        'CF_ACCOUNT_ID must be configured.',
    ],
    [
        'CF_R2_ACCESS_KEY_ID',
        'CF_R2_ACCESS_KEY_ID must be configured.',
    ],
    [
        'CF_R2_BUCKET_PRIVATE',
        'CF_R2_BUCKET_PRIVATE must be configured.',
    ],
    [
        'CF_R2_BUCKET_PUBLIC',
        'CF_R2_BUCKET_PUBLIC must be configured.',
    ],
    [
        'CF_R2_BUCKET_PUBLIC_URL',
        'CF_R2_BUCKET_PUBLIC_URL must be configured.',
    ],
    [
        'CF_R2_PRESIGN_EXPIRY',
        'CF_R2_PRESIGN_EXPIRY must be an integer from 1 to 604800 seconds.',
    ],
    [
        'CF_R2_SECRET_ACCESS_KEY',
        'CF_R2_SECRET_ACCESS_KEY must be configured.',
    ],
] as const

describe('Object-storage configuration', () => {
    it.each([
        undefined,
        0,
        '0',
    ])(
        'resolves a feature flag of %s as disabled without R2 bindings',
        (featureFlag) => {
            expect(
                getObjectStorageConfiguration({
                    FEATURE_OBJECT_STORAGE: featureFlag,
                }),
            ).toEqual({ enabled: false })
        },
    )

    it.each([
        1,
        '1',
    ])('resolves a feature flag of %s as enabled', (featureFlag) => {
        expect(
            getObjectStorageConfiguration({
                ...enabledEnvironment,
                FEATURE_OBJECT_STORAGE: featureFlag,
            }),
        ).toEqual(enabledConfiguration)
    })

    it('rejects unsupported feature-flag values', () => {
        expect(() =>
            isObjectStorageFeatureEnabled({ FEATURE_OBJECT_STORAGE: 'yes' }),
        ).toThrow('FEATURE_OBJECT_STORAGE must be 0 or 1.')
    })

    it.each(requiredBindings)(
        'rejects a missing %s binding when enabled',
        (binding, message) => {
            const environment: Record<string, unknown> = {
                ...enabledEnvironment,
            }
            delete environment[binding]

            expect(() => getObjectStorageConfiguration(environment)).toThrow(
                message,
            )
        },
    )

    it.each([
        'CF_ACCOUNT_ID',
        'CF_R2_ACCESS_KEY_ID',
        'CF_R2_BUCKET_PRIVATE',
        'CF_R2_BUCKET_PUBLIC',
        'CF_R2_BUCKET_PUBLIC_URL',
        'CF_R2_SECRET_ACCESS_KEY',
    ])('rejects a blank %s binding when enabled', (binding) => {
        expect(() =>
            getObjectStorageConfiguration({
                ...enabledEnvironment,
                [binding]: '   ',
            }),
        ).toThrow(`${binding} must not be empty.`)
    })

    it.each([
        'storage.example.com',
        'ftp://storage.example.com',
    ])('rejects an invalid public R2 URL of %s', (bucketPublicUrl) => {
        expect(() =>
            getObjectStorageConfiguration({
                ...enabledEnvironment,
                CF_R2_BUCKET_PUBLIC_URL: bucketPublicUrl,
            }),
        ).toThrow('CF_R2_BUCKET_PUBLIC_URL must be a valid HTTP(S) URL.')
    })

    it('normalizes trailing slashes from the public R2 URL', () => {
        expect(
            getObjectStorageConfiguration({
                ...enabledEnvironment,
                CF_R2_BUCKET_PUBLIC_URL: 'https://storage.example.com///',
            }),
        ).toEqual(enabledConfiguration)
    })

    it.each([
        1,
        '1',
        604_800,
        '604800',
    ])('accepts a presign expiry boundary value of %s', (presignExpiry) => {
        expect(
            getObjectStorageConfiguration({
                ...enabledEnvironment,
                CF_R2_PRESIGN_EXPIRY: presignExpiry,
            }),
        ).toMatchObject({
            enabled: true,
            presignExpiry: Number(presignExpiry),
        })
    })

    it.each([
        0,
        -1,
        0.5,
        604_801,
        '',
        '   ',
        'invalid',
        Number.POSITIVE_INFINITY,
    ])('rejects an invalid presign expiry of %s', (presignExpiry) => {
        expect(() =>
            getObjectStorageConfiguration({
                ...enabledEnvironment,
                CF_R2_PRESIGN_EXPIRY: presignExpiry,
            }),
        ).toThrow(
            'CF_R2_PRESIGN_EXPIRY must be an integer from 1 to 604800 seconds.',
        )
    })

    it('skips startup R2 validation while disabled or explicitly down', () => {
        expect(() =>
            validateObjectStorageStartupConfiguration({
                FEATURE_OBJECT_STORAGE: 0,
            }),
        ).not.toThrow()
        expect(() =>
            validateObjectStorageStartupConfiguration({
                FEATURE_OBJECT_STORAGE: 1,
                STATUS: 'down',
            }),
        ).not.toThrow()
        expect(() =>
            validateObjectStorageStartupConfiguration({
                FEATURE_OBJECT_STORAGE: 1,
                STATUS: 'up',
            }),
        ).toThrow('CF_R2_ACCESS_KEY_ID must be configured.')
    })

    it('rejects an invalid feature flag while explicitly down', () => {
        expect(() =>
            validateObjectStorageStartupConfiguration({
                FEATURE_OBJECT_STORAGE: 'yes',
                STATUS: 'down',
            }),
        ).toThrow('FEATURE_OBJECT_STORAGE must be 0 or 1.')
    })
})

// =============================================================================
// END OF BASE TEMPLATE TESTS - FORK-SPECIFIC TESTS MUST BE ADDED BELOW
// =============================================================================
