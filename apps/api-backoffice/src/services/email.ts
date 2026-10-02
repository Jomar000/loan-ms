import { AppError, catalog } from '@loanms/errors'
import { Resend } from 'resend'

import type { TEnabledMailerConfiguration } from '../config/mailer.js'

export type TEmailMessage = {
    subject: string
    text: string
    to: string
}

export type TEmailSender = {
    send: (message: TEmailMessage) => Promise<void>
}

export type TResendFactory = (apiKey: string) => Resend

export const createEmailSender = (
    configuration: TEnabledMailerConfiguration,
    resendFactory?: TResendFactory,
): TEmailSender => {
    if (configuration.provider === 'cloudflare') {
        return {
            send: async (message) => {
                try {
                    await configuration.binding.send({
                        ...message,
                        from: configuration.account,
                    })
                } catch (error) {
                    throw new AppError(catalog.serviceUnavailable, {
                        cause: error,
                    })
                }
            },
        }
    }

    let resendClient: Resend | undefined
    const getResendClient = () => {
        resendClient ??= resendFactory
            ? resendFactory(configuration.apiKey)
            : new Resend(configuration.apiKey)
        return resendClient
    }

    return {
        send: async (message) => {
            try {
                const result = await getResendClient().emails.send({
                    ...message,
                    from: configuration.account,
                })

                if (result.error) throw result.error
            } catch (error) {
                throw new AppError(catalog.serviceUnavailable, {
                    cause: error,
                })
            }
        },
    }
}
