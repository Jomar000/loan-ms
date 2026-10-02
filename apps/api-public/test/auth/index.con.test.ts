import { AppError } from '@hyperion/errors'
import { sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { auth } from '../../src/auth/index.js'

const authTestControl = vi.hoisted(() => ({
    betterAuth: vi.fn((options: unknown) => options),
    deleteVerification: vi.fn(),
    emailOTP: vi.fn((options: unknown) => options),
    resendConstructor: vi.fn(),
    send: vi.fn(),
    where: vi.fn(),
}))

vi.mock('@better-auth/api-key', () => ({
    apiKey: vi.fn((options: unknown) => options),
}))

vi.mock('better-auth', () => ({
    betterAuth: authTestControl.betterAuth,
}))

vi.mock('better-auth/adapters/drizzle', () => ({
    drizzleAdapter: vi.fn(() => ({})),
}))

vi.mock('better-auth/plugins', () => ({
    emailOTP: authTestControl.emailOTP,
    organization: vi.fn((options: unknown) => options),
    username: vi.fn((options: unknown) => options),
}))

vi.mock('better-auth/plugins/access', () => ({
    createAccessControl: vi.fn(() => ({
        newRole: vi.fn(() => ({})),
    })),
}))

vi.mock('resend', () => ({
    Resend: class {
        readonly emails = { send: authTestControl.send }

        constructor(apiKey: string) {
            authTestControl.resendConstructor(apiKey)
            if (!apiKey) throw new Error('Missing Resend API key.')
        }
    },
}))

const dbSchema = {
    organization: sqliteTable('organization', { id: text('id') }),
    verification: sqliteTable('verification', {
        identifier: text('identifier'),
        value: text('value'),
    }),
}

const resendFactory = (apiKey: string) => {
    authTestControl.resendConstructor(apiKey)

    return {
        emails: {
            send: authTestControl.send,
        },
    } as never
}

describe('Auth email client initialization', () => {
    beforeEach(() => {
        authTestControl.betterAuth.mockClear()
        authTestControl.deleteVerification.mockReset()
        authTestControl.emailOTP.mockClear()
        authTestControl.resendConstructor.mockClear()
        authTestControl.send.mockReset().mockResolvedValue({ error: null })
        authTestControl.where.mockReset().mockResolvedValue(undefined)
        authTestControl.deleteVerification.mockReturnValue({
            where: authTestControl.where,
        })
    })

    it('omits mail callbacks and providers when the feature is disabled.', async () => {
        await auth({
            acl: { permissions: {}, roles: {} } as never,
            betterAuthFactory: authTestControl.betterAuth as never,
            emailOTPFactory: authTestControl.emailOTP as never,
            resendFactory,
            db: {} as never,
            dbSchema: { organization: {} } as never,
            env: {
                BETTER_AUTH_SECRET: 'test-secret',
                ENVIRONMENT: 'development',
                FEATURE_MAIL: 0,
                SESSION_EXPIRATION: '3600',
                SESSION_UPDATE_AGE: '300',
                URL_BACKEND: 'https://api.test',
                URL_FRONTEND: 'https://web.test',
            } as never,
        })

        const options = authTestControl.betterAuth.mock.calls.at(-1)?.[0] as {
            emailAndPassword: { sendResetPassword?: unknown }
            emailVerification?: unknown
        }

        expect(options.emailVerification).toBeUndefined()
        expect(options.emailAndPassword).not.toHaveProperty('sendResetPassword')
        expect(authTestControl.emailOTP).not.toHaveBeenCalled()
        expect(authTestControl.resendConstructor).not.toHaveBeenCalled()
        expect(authTestControl.send).not.toHaveBeenCalled()
    })

    it('defers Resend construction until an email delivery is attempted.', async () => {
        const cloudflareSend = vi.fn()
        await auth({
            acl: { permissions: {}, roles: {} } as never,
            betterAuthFactory: authTestControl.betterAuth as never,
            emailOTPFactory: authTestControl.emailOTP as never,
            resendFactory,
            db: {} as never,
            dbSchema: { organization: {} } as never,
            env: {
                BETTER_AUTH_SECRET: 'test-secret',
                ENVIRONMENT: 'test',
                FEATURE_MAIL: 1,
                HYPERIONPUB_EMAIL: { send: cloudflareSend },
                MAILER_ACCOUNT: 'test@example.com',
                MAILER_PROVIDER: 'resend',
                RESEND_API_KEY: 'test-key',
                SESSION_EXPIRATION: '3600',
                SESSION_UPDATE_AGE: '300',
                URL_BACKEND: 'https://api.test',
                URL_FRONTEND: 'https://web.test',
            } as never,
        })

        expect(authTestControl.resendConstructor).not.toHaveBeenCalled()
        expect(cloudflareSend).not.toHaveBeenCalled()

        const options = authTestControl.betterAuth.mock.calls[0]?.[0] as {
            emailVerification: {
                sendVerificationEmail: (input: {
                    token: string
                    user: { email: string }
                }) => Promise<void>
            }
        }

        await options.emailVerification.sendVerificationEmail({
            token: 'test-token',
            user: { email: 'member@example.com' },
        })
        expect(authTestControl.resendConstructor).toHaveBeenCalledOnce()
        expect(authTestControl.resendConstructor).toHaveBeenCalledWith(
            'test-key',
        )
        expect(cloudflareSend).not.toHaveBeenCalled()
    })

    it('sends only supported verification, OTP, and reset payloads through Cloudflare.', async () => {
        const cloudflareSend = vi.fn().mockResolvedValue({
            messageId: 'test-message',
        })
        await auth({
            acl: { permissions: {}, roles: {} } as never,
            betterAuthFactory: authTestControl.betterAuth as never,
            emailOTPFactory: authTestControl.emailOTP as never,
            resendFactory,
            db: {} as never,
            dbSchema: { organization: {} } as never,
            env: {
                BETTER_AUTH_SECRET: 'test-secret',
                ENVIRONMENT: 'development',
                FEATURE_MAIL: 1,
                HYPERIONPUB_EMAIL: { send: cloudflareSend },
                MAILER_ACCOUNT: 'test@example.com',
                MAILER_PROVIDER: 'cloudflare',
                SESSION_EXPIRATION: '3600',
                SESSION_UPDATE_AGE: '300',
                URL_BACKEND: 'https://api.test',
                URL_FRONTEND: 'https://web.test',
            } as never,
        })

        const options = authTestControl.betterAuth.mock.calls.at(-1)?.[0] as {
            emailAndPassword: {
                sendResetPassword: (input: {
                    token: string
                    url: string
                    user: { email: string; id: string }
                }) => Promise<void>
            }
            emailVerification: {
                sendVerificationEmail: (input: {
                    token: string
                    user: { email: string }
                }) => Promise<void>
            }
            plugins: {
                sendVerificationOTP: (input: {
                    email: string
                    otp: string
                    type:
                        | 'sign-in'
                        | 'email-verification'
                        | 'forget-password'
                        | 'change-email'
                }) => Promise<void>
            }[]
        }

        await options.emailVerification.sendVerificationEmail({
            token: 'verification-token',
            user: { email: 'member@example.com' },
        })
        await options.plugins.at(-1)!.sendVerificationOTP({
            email: 'member@example.com',
            otp: 'VERIFY01',
            type: 'email-verification',
        })
        await options.plugins.at(-1)!.sendVerificationOTP({
            email: 'member@example.com',
            otp: 'RESET001',
            type: 'forget-password',
        })
        await options.emailAndPassword.sendResetPassword({
            token: 'reset-token',
            url: 'https://web.test/reset-password?token=reset-token',
            user: { email: 'member@example.com', id: 'test-user' },
        })
        await expect(
            options.plugins.at(-1)!.sendVerificationOTP({
                email: 'member@example.com',
                otp: 'CHANGE01',
                type: 'change-email',
            }),
        ).rejects.toMatchObject({
            code: 'AUTHENTICATION_UNAVAILABLE',
            message: 'Authentication is temporarily unavailable.',
            status: 503,
        })

        expect(cloudflareSend.mock.calls).toEqual([
            [
                {
                    from: 'test@example.com',
                    subject: 'E-mail Verification',
                    text: 'https://web.test/verify-email?token=verification-token',
                    to: 'member@example.com',
                },
            ],
            [
                {
                    from: 'test@example.com',
                    subject: 'E-mail Verification',
                    text: 'VERIFY01',
                    to: 'member@example.com',
                },
            ],
            [
                {
                    from: 'test@example.com',
                    subject: 'Password Reset',
                    text: 'RESET001',
                    to: 'member@example.com',
                },
            ],
            [
                {
                    from: 'test@example.com',
                    subject: 'Password Reset',
                    text: 'https://web.test/reset-password?token=reset-token',
                    to: 'member@example.com',
                },
            ],
        ])
        expect(authTestControl.resendConstructor).not.toHaveBeenCalled()
    })

    it('maps provider failures to auth errors across verification and reset callbacks.', async () => {
        const providerError = new Error('Selected provider unavailable.')
        const cloudflareSend = vi.fn().mockRejectedValue(providerError)
        const onPasswordResetEmailSent = vi.fn()
        const onPasswordResetEmailFailed = vi.fn()
        await auth({
            acl: { permissions: {}, roles: {} } as never,
            betterAuthFactory: authTestControl.betterAuth as never,
            emailOTPFactory: authTestControl.emailOTP as never,
            resendFactory,
            db: { delete: authTestControl.deleteVerification } as never,
            dbSchema: dbSchema as never,
            env: {
                BETTER_AUTH_SECRET: 'test-secret',
                ENVIRONMENT: 'development',
                FEATURE_MAIL: 1,
                HYPERIONPUB_EMAIL: { send: cloudflareSend },
                MAILER_ACCOUNT: 'test@example.com',
                MAILER_PROVIDER: 'cloudflare',
                SESSION_EXPIRATION: '3600',
                SESSION_UPDATE_AGE: '300',
                URL_BACKEND: 'https://api.test',
                URL_FRONTEND: 'https://web.test',
            } as never,
            onPasswordResetEmailFailed,
            onPasswordResetEmailSent,
        })

        const options = authTestControl.betterAuth.mock.calls.at(-1)?.[0] as {
            emailAndPassword: {
                sendResetPassword: (input: {
                    token: string
                    url: string
                    user: { email: string; id: string }
                }) => Promise<void>
            }
            emailVerification: {
                sendVerificationEmail: (input: {
                    token: string
                    user: { email: string }
                }) => Promise<void>
            }
            plugins: {
                sendVerificationOTP: (input: {
                    email: string
                    otp: string
                    type: 'email-verification' | 'forget-password'
                }) => Promise<void>
            }[]
        }
        const expectedFailure = {
            cause: {
                cause: providerError,
                code: 'SERVICE_UNAVAILABLE',
            },
            code: 'AUTHENTICATION_UNAVAILABLE',
            status: 503,
        }

        await expect(
            options.emailVerification.sendVerificationEmail({
                token: 'verification-token',
                user: { email: 'member@example.com' },
            }),
        ).rejects.toMatchObject(expectedFailure)
        for (const type of [
            'email-verification',
            'forget-password',
        ] as const) {
            await expect(
                options.plugins.at(-1)!.sendVerificationOTP({
                    email: 'member@example.com',
                    otp: 'VERIFY01',
                    type,
                }),
            ).rejects.toMatchObject(expectedFailure)
        }
        await expect(
            options.emailAndPassword.sendResetPassword({
                token: 'reset-token',
                url: 'https://web.test/reset-password?token=reset-token',
                user: { email: 'member@example.com', id: 'test-user' },
            }),
        ).rejects.toMatchObject(expectedFailure)

        expect(cloudflareSend).toHaveBeenCalledTimes(4)
        expect(authTestControl.resendConstructor).not.toHaveBeenCalled()
        expect(authTestControl.deleteVerification).toHaveBeenCalledWith(
            dbSchema.verification,
        )
        expect(authTestControl.where).toHaveBeenCalledOnce()
        expect(onPasswordResetEmailSent).not.toHaveBeenCalled()
        expect(onPasswordResetEmailFailed).toHaveBeenCalledOnce()
        expect(onPasswordResetEmailFailed.mock.calls[0][0]).toMatchObject(
            expectedFailure,
        )
    })

    it('deletes only the generated reset verification after delivery fails.', async () => {
        await auth({
            acl: { permissions: {}, roles: {} } as never,
            betterAuthFactory: authTestControl.betterAuth as never,
            emailOTPFactory: authTestControl.emailOTP as never,
            resendFactory,
            db: { delete: authTestControl.deleteVerification } as never,
            dbSchema: dbSchema as never,
            env: {
                BETTER_AUTH_SECRET: 'test-secret',
                ENVIRONMENT: 'test',
                FEATURE_MAIL: 1,
                MAILER_ACCOUNT: 'test@example.com',
                MAILER_PROVIDER: 'resend',
                RESEND_API_KEY: 'test-key',
                SESSION_EXPIRATION: '3600',
                SESSION_UPDATE_AGE: '300',
                URL_BACKEND: 'https://api.test',
                URL_FRONTEND: 'https://web.test',
            } as never,
            onPasswordResetEmailSent: () => {
                throw new Error('Simulated delivery failure.')
            },
        })

        const options = authTestControl.betterAuth.mock.calls.at(-1)?.[0] as {
            emailAndPassword: {
                sendResetPassword: (input: {
                    token: string
                    url: string
                    user: { email: string; id: string }
                }) => Promise<void>
            }
        }
        await expect(
            options.emailAndPassword.sendResetPassword({
                token: '__TEST_RESET_TOKEN',
                url: 'https://web.test/reset-password',
                user: { email: 'member@example.com', id: '__TEST_USER' },
            }),
        ).rejects.toMatchObject({
            code: 'AUTHENTICATION_UNAVAILABLE',
            message: 'Authentication is temporarily unavailable.',
            status: 503,
        })
        expect(authTestControl.deleteVerification).toHaveBeenCalledWith(
            dbSchema.verification,
        )
        expect(authTestControl.where).toHaveBeenCalledOnce()
    })

    it('preserves delivery and compensation failures behind the same response.', async () => {
        authTestControl.where.mockRejectedValue(
            new Error('Simulated compensation failure.'),
        )
        await auth({
            acl: { permissions: {}, roles: {} } as never,
            betterAuthFactory: authTestControl.betterAuth as never,
            emailOTPFactory: authTestControl.emailOTP as never,
            resendFactory,
            db: { delete: authTestControl.deleteVerification } as never,
            dbSchema: dbSchema as never,
            env: {
                BETTER_AUTH_SECRET: 'test-secret',
                ENVIRONMENT: 'test',
                FEATURE_MAIL: 1,
                MAILER_ACCOUNT: 'test@example.com',
                MAILER_PROVIDER: 'resend',
                RESEND_API_KEY: 'test-key',
                SESSION_EXPIRATION: '3600',
                SESSION_UPDATE_AGE: '300',
                URL_BACKEND: 'https://api.test',
                URL_FRONTEND: 'https://web.test',
            } as never,
            onPasswordResetEmailSent: () => {
                throw new Error('Simulated delivery failure.')
            },
        })

        const options = authTestControl.betterAuth.mock.calls.at(-1)?.[0] as {
            emailAndPassword: {
                sendResetPassword: (input: {
                    token: string
                    url: string
                    user: { email: string; id: string }
                }) => Promise<void>
            }
        }
        const error = await options.emailAndPassword
            .sendResetPassword({
                token: '__TEST_RESET_TOKEN',
                url: 'https://web.test/reset-password',
                user: { email: 'member@example.com', id: '__TEST_USER' },
            })
            .catch((cause: unknown) => cause)

        expect(error).toMatchObject({
            code: 'AUTHENTICATION_UNAVAILABLE',
            message: 'Authentication is temporarily unavailable.',
            status: 503,
        })
        expect(error).toBeInstanceOf(AppError)
        const aggregateError = (error as AppError).cause
        expect(aggregateError).toBeInstanceOf(AggregateError)
        expect((aggregateError as AggregateError).errors).toHaveLength(2)
    })
})

// =============================================================================
// END OF BASE TEMPLATE TESTS - FORK-SPECIFIC TESTS MUST BE ADDED BELOW
// =============================================================================
