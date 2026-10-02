import { apiKey } from '@better-auth/api-key'
import { AppError, catalog } from '@hyperion/errors'
import { betterAuth } from 'better-auth'
import type { Auth, BetterAuthOptions } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import {
    emailOTP,
    organization as organizationPlugin,
    username,
} from 'better-auth/plugins'
import { createAccessControl } from 'better-auth/plugins/access'
import { and, eq, or } from 'drizzle-orm'
import { nanoid } from 'nanoid'

import { getMailerConfiguration } from '../config/mailer.js'
import {
    createEmailSender,
    type TEmailMessage,
    type TEmailSender,
    type TResendFactory,
} from '../services/email.js'
import type { THonoBindings, THonoVariables } from '../types.js'
import type { aclBuilder } from './acl.js'
import { API_KEY_CONFIGURATIONS } from './apiKey.js'
import { getSessionCookieName } from './cookies.js'
import {
    deliverPasswordResetEmail,
    hashPassword,
    verifyPassword,
} from './password.js'

type TAuthPlugins = [
    ReturnType<typeof organizationPlugin>,
    ReturnType<typeof apiKey>,
    ReturnType<typeof username>,
    ...ReturnType<typeof emailOTP>[],
]

type TAuthOptions = Omit<BetterAuthOptions, 'plugins'> & {
    plugins: TAuthPlugins
}

export type TAuth = Auth<TAuthOptions>

async function sendAuthenticationEmail(
    send: TEmailSender['send'],
    message: TEmailMessage,
) {
    try {
        await send(message)
    } catch (error) {
        throw new AppError(catalog.authenticationUnavailable, { cause: error })
    }
}

/**
 * @link
 * https://www.better-auth.com/docs/introduction
 */
export const auth = async (opts: {
    db: THonoVariables['dbClient']
    dbSchema: THonoVariables['dbSchema']
    env: THonoBindings
    acl: Awaited<ReturnType<typeof aclBuilder>>
    betterAuthFactory?: typeof betterAuth
    emailOTPFactory?: typeof emailOTP
    onPasswordResetEmailFailed?: (error: AppError) => void
    onPasswordResetEmailSent?: () => void | Promise<void>
    resendFactory?: TResendFactory
}): Promise<TAuth> => {
    const { db, dbSchema, env, acl } = opts

    const { organization: organizationTable } = dbSchema

    const cookieAttrs = {
        httpOnly: true,
        partitioned: true,
        path: '/',
        sameSite: 'strict' as const,
        secure: true,
    }

    const mailerConfiguration = getMailerConfiguration(env)
    const mailer = mailerConfiguration.enabled
        ? createEmailSender(mailerConfiguration, opts.resendFactory)
        : null

    /**
     * @description
     * Provides the ACL to the Organization plugin
     */
    const aclInstance = createAccessControl(acl.permissions)

    const authOptions: TAuthOptions = {
        secret: env.BETTER_AUTH_SECRET,
        onAPIError: {
            throw: true,
        },
        advanced: {
            cookies: {
                session_token: {
                    name: getSessionCookieName(env.ENVIRONMENT),
                },
            },
            defaultCookieAttributes: cookieAttrs,
            ipAddress: {
                ipAddressHeaders: [
                    'cf-connecting-ip',
                ],
                disableIpTracking: false,
            },
            // The complete cookie name already uses the browser-enforced
            // `__Host-` prefix. Prevent Better Auth from prepending `__Secure-`.
            useSecureCookies: false,
        },
        baseURL: env.URL_BACKEND,
        database: drizzleAdapter(db, {
            provider: 'sqlite',
            schema: dbSchema,
            transaction: false,
        }),
        databaseHooks: {
            session: {
                create: {
                    before: async (session, ctx) => {
                        const organizationId = ctx?.query?.organizationId
                        let activeOrganizationId =
                            ctx?.context.session?.session
                                .activeOrganizationId ?? null

                        // Check if the provided organizationId is valid.
                        // If yes, set it as the activeOrganizationId for this session.
                        if (organizationId)
                            activeOrganizationId =
                                (
                                    await db
                                        .select({ id: organizationTable.id })
                                        .from(organizationTable)
                                        .where(
                                            or(
                                                eq(
                                                    organizationTable.id,
                                                    organizationId,
                                                ),
                                                eq(
                                                    organizationTable.slug,
                                                    organizationId,
                                                ),
                                            ),
                                        )
                                )[0]?.id ?? null

                        return {
                            data: {
                                ...session,
                                activeOrganizationId,
                            },
                        }
                    },
                },
            },
        },
        emailVerification: mailer
            ? {
                  sendOnSignUp: false,
                  sendVerificationEmail: async ({ user, token }) => {
                      const verificationUrl = new URL(
                          '/verify-email',
                          env.URL_FRONTEND,
                      )
                      verificationUrl.searchParams.set('token', token)

                      await sendAuthenticationEmail(mailer.send, {
                          to: user.email,
                          subject: 'E-mail Verification',
                          text: verificationUrl.toString(),
                      })
                  },
              }
            : undefined,
        emailAndPassword: {
            enabled: true,
            autoSignIn: false,
            password: {
                hash: hashPassword,
                verify: verifyPassword,
            },
            ...(mailer
                ? {
                      sendResetPassword: async ({ user, url, token }) => {
                          try {
                              if (env.ENVIRONMENT === 'test') {
                                  await opts.onPasswordResetEmailSent?.()
                              } else {
                                  await deliverPasswordResetEmail(
                                      (message) =>
                                          sendAuthenticationEmail(
                                              mailer.send,
                                              message,
                                          ),
                                      {
                                          to: user.email,
                                          subject: 'Password Reset',
                                          text: url,
                                      },
                                  )
                                  await opts.onPasswordResetEmailSent?.()
                              }
                          } catch (deliveryError) {
                              let unavailableError: AppError

                              try {
                                  const { verification } = dbSchema
                                  await db
                                      .delete(verification)
                                      .where(
                                          and(
                                              eq(
                                                  verification.identifier,
                                                  `reset-password:${token}`,
                                              ),
                                              eq(verification.value, user.id),
                                          ),
                                      )
                              } catch (compensationError) {
                                  unavailableError = new AppError(
                                      catalog.authenticationUnavailable,
                                      {
                                          cause: new AggregateError(
                                              [
                                                  deliveryError,
                                                  compensationError,
                                              ],
                                              'Password reset delivery and compensation failed.',
                                          ),
                                      },
                                  )
                                  opts.onPasswordResetEmailFailed?.(
                                      unavailableError,
                                  )
                                  throw unavailableError
                              }

                              unavailableError =
                                  deliveryError instanceof AppError
                                      ? deliveryError
                                      : new AppError(
                                            catalog.authenticationUnavailable,
                                            { cause: deliveryError },
                                        )
                              opts.onPasswordResetEmailFailed?.(
                                  unavailableError,
                              )
                              throw unavailableError
                          }
                      },
                  }
                : {}),
        },
        plugins: [
            organizationPlugin({
                ac: aclInstance,
                roles: Object.fromEntries(
                    Object.entries(acl.roles).map(
                        ([
                            role,
                            perms,
                        ]) => [
                            role,
                            aclInstance.newRole(perms),
                        ],
                    ),
                ),
            }),
            apiKey(API_KEY_CONFIGURATIONS),
            username({
                usernameValidator: (value) => /^[\w-.]+$/.test(value),
                minUsernameLength: 6,
                maxUsernameLength: 36,
            }),
            ...(mailer
                ? [
                      (opts.emailOTPFactory ?? emailOTP)({
                          generateOTP: () => nanoid(8).toUpperCase(),
                          overrideDefaultEmailVerification: false,
                          sendVerificationOTP: async ({ email, otp, type }) => {
                              if (env.ENVIRONMENT === 'test') return

                              switch (type) {
                                  case 'sign-in':
                                      return
                                  case 'email-verification':
                                      await sendAuthenticationEmail(
                                          mailer.send,
                                          {
                                              to: email,
                                              subject: 'E-mail Verification',
                                              text: otp,
                                          },
                                      )
                                      return
                                  case 'forget-password':
                                      await sendAuthenticationEmail(
                                          mailer.send,
                                          {
                                              to: email,
                                              subject: 'Password Reset',
                                              text: otp,
                                          },
                                      )
                                      return
                                  default:
                                      throw new AppError(
                                          catalog.authenticationUnavailable,
                                      )
                              }
                          },
                      }),
                  ]
                : []),
        ] as TAuthPlugins,
        rateLimit: { enabled: false },
        session: {
            expiresIn: Number(env.SESSION_EXPIRATION),
            updateAge: Number(env.SESSION_UPDATE_AGE),
        },
        trustedOrigins: [env.URL_FRONTEND],
    }

    return (opts.betterAuthFactory ?? betterAuth)(authOptions)
}

export default auth
