import { auth as authValidator } from '@loanms/validator/public'
import { toast } from 'svelte-sonner'
import type { z } from 'zod'

import { authClient } from '$lib/clients'
import { getErrorMessage, requestCaptchaToken } from '$lib/utilities/helpers'

export type SignInPayload = z.input<typeof authValidator.signInInputSchema>

const SIGN_IN_COPY_TOAST_ID = 'sign-in-copy'
const SIGN_IN_ERROR_TOAST_ID = 'sign-in-error'
const TOAST_FEEDBACK_DURATION = 8000

export async function signInWithCaptcha({
    onCaptchaResolved,
    onSuccess,
    payload,
    siteKey,
}: {
    onCaptchaResolved: () => void
    onSuccess: () => Promise<void> | void
    payload: SignInPayload
    siteKey: string
}) {
    toast.dismiss(SIGN_IN_ERROR_TOAST_ID)

    const action = getSignInAction(payload.accountId)
    const captchaToken = await requestCaptchaToken({
        action,
        onCaptchaResolved,
        siteKey,
    })

    try {
        const endpoint =
            action === 'sign-in-email'
                ? authClient.signIn.email
                : authClient.signIn.username

        const response = await endpoint.$post(
            {
                json: {
                    organizationId: payload.organizationId,
                    accountId: payload.accountId,
                    password: payload.password,
                },
            },
            {
                headers: {
                    'x-captcha-response': captchaToken,
                },
            },
        )

        const responseJson = await response.json()
        if (!responseJson.success) {
            throw new Error(responseJson.error.message)
        }
    } catch (error) {
        showSignInErrorToast(getErrorMessage(error, 'Sign-in failed.'))
        throw error
    }

    await onSuccess()
}

function getSignInAction(accountId: string) {
    return accountId.includes('@') ? 'sign-in-email' : 'sign-in-username'
}

function showSignInErrorToast(message: string) {
    toast.error('Sign-in failed', {
        id: SIGN_IN_ERROR_TOAST_ID,
        duration: 15000,
        description: message,
        action: {
            label: 'COPY',
            onClick: async (event) => {
                event.preventDefault()

                try {
                    await navigator.clipboard.writeText(message)
                    toast.success('Error copied', {
                        id: SIGN_IN_ERROR_TOAST_ID,
                        duration: 3000,
                    })
                } catch {
                    toast.warning('Copy unavailable', {
                        id: SIGN_IN_COPY_TOAST_ID,
                        duration: TOAST_FEEDBACK_DURATION,
                        description: 'Copy the error message manually.',
                    })
                }
            },
        },
    })
}
