import { describe, expect, it, vi } from 'vitest'

import {
    getMailerConfiguration,
    isMailerFeatureEnabled,
    validateMailerStartupConfiguration,
} from '../../src/config/mailer.js'

describe('Mailer configuration', () => {
    it.each([
        undefined,
        0,
        '0',
    ])(
        'requires no mail configuration when disabled with %s',
        (featureFlag) => {
            const environment = { FEATURE_MAIL: featureFlag }

            expect(isMailerFeatureEnabled(environment)).toBe(false)
            expect(getMailerConfiguration(environment)).toEqual({
                enabled: false,
            })
            expect(() =>
                validateMailerStartupConfiguration(environment),
            ).not.toThrow()
        },
    )

    it.each([
        1,
        '1',
    ])('resolves a feature flag of %s as enabled', (featureFlag) => {
        expect(isMailerFeatureEnabled({ FEATURE_MAIL: featureFlag })).toBe(true)
    })

    it('rejects an invalid feature flag', () => {
        expect(() =>
            validateMailerStartupConfiguration({
                FEATURE_MAIL: 'yes',
                STATUS: 'down',
            }),
        ).toThrow('FEATURE_MAIL must be 0 or 1.')
    })

    it('skips enabled-provider validation while the Worker is down', () => {
        expect(() =>
            validateMailerStartupConfiguration({
                FEATURE_MAIL: 1,
                STATUS: 'down',
            }),
        ).not.toThrow()
    })

    it('validates enabled provider configuration while the Worker is up', () => {
        expect(() =>
            validateMailerStartupConfiguration({
                FEATURE_MAIL: 1,
                STATUS: 'up',
            }),
        ).toThrow('MAILER_PROVIDER must be a non-empty string.')
    })

    it.each([
        undefined,
        '',
        'smtp',
    ])('rejects an unsupported provider of %s', (provider) => {
        expect(() =>
            getMailerConfiguration({
                FEATURE_MAIL: 1,
                MAILER_ACCOUNT: 'test@example.com',
                MAILER_PROVIDER: provider,
            }),
        ).toThrow(
            provider === undefined || provider === ''
                ? 'MAILER_PROVIDER must be a non-empty string.'
                : 'MAILER_PROVIDER must be resend or cloudflare.',
        )
    })

    it('requires a sender account for every provider', () => {
        expect(() =>
            getMailerConfiguration({
                FEATURE_MAIL: 1,
                MAILER_PROVIDER: 'resend',
                RESEND_API_KEY: 'test-key',
            }),
        ).toThrow('MAILER_ACCOUNT must be a non-empty string.')
    })

    it('requires a Resend secret only when Resend is selected', () => {
        expect(() =>
            getMailerConfiguration({
                FEATURE_MAIL: 1,
                MAILER_ACCOUNT: 'test@example.com',
                MAILER_PROVIDER: 'resend',
            }),
        ).toThrow('RESEND_API_KEY must be a non-empty string.')

        expect(
            getMailerConfiguration({
                FEATURE_MAIL: 1,
                HYPERIONPUB_EMAIL: { send: vi.fn() },
                MAILER_ACCOUNT: 'test@example.com',
                MAILER_PROVIDER: 'cloudflare',
            }),
        ).toMatchObject({ provider: 'cloudflare' })
    })

    it('requires the public Cloudflare binding only when Cloudflare is selected', () => {
        expect(() =>
            getMailerConfiguration({
                FEATURE_MAIL: 1,
                MAILER_ACCOUNT: 'test@example.com',
                MAILER_PROVIDER: 'cloudflare',
            }),
        ).toThrow(
            'HYPERIONPUB_EMAIL is required when MAILER_PROVIDER is cloudflare.',
        )

        expect(
            getMailerConfiguration({
                FEATURE_MAIL: 1,
                MAILER_ACCOUNT: 'test@example.com',
                MAILER_PROVIDER: 'resend',
                RESEND_API_KEY: 'test-key',
            }),
        ).toEqual({
            account: 'test@example.com',
            apiKey: 'test-key',
            enabled: true,
            provider: 'resend',
        })
    })
})

// =============================================================================
// END OF BASE TEMPLATE TESTS - FORK-SPECIFIC TESTS MUST BE ADDED BELOW
// =============================================================================
