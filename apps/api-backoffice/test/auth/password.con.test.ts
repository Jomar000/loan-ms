import { describe, expect, it, vi } from 'vitest'

import { deliverPasswordResetEmail } from '../../src/auth/password.js'
import { TEST_MEMBER_EMAIL } from '../utilities.js'

describe('Password helpers', () => {
    it('forwards a password-reset message to a provider-neutral sender.', async () => {
        const send = vi.fn().mockResolvedValue(undefined)

        await expect(
            deliverPasswordResetEmail(send, {
                to: TEST_MEMBER_EMAIL,
                subject: 'Password Reset',
                text: 'https://example.com/reset',
            }),
        ).resolves.toBeUndefined()
        expect(send).toHaveBeenCalledWith({
            to: TEST_MEMBER_EMAIL,
            subject: 'Password Reset',
            text: 'https://example.com/reset',
        })
    })

    it('rejects a rejected password-reset provider call.', async () => {
        const providerError = 'Simulated provider failure.'
        const send = vi.fn().mockRejectedValue(providerError)

        await expect(
            deliverPasswordResetEmail(send, {
                to: TEST_MEMBER_EMAIL,
                subject: 'Password Reset',
                text: 'https://example.com/reset',
            }),
        ).rejects.toMatchObject({
            code: 'AUTHENTICATION_UNAVAILABLE',
            cause: expect.objectContaining({ cause: providerError }),
            message: 'Authentication is temporarily unavailable.',
            status: 503,
        })
        expect(send).toHaveBeenCalledOnce()
    })
})

// =============================================================================
// END OF BASE TEMPLATE TESTS - FORK-SPECIFIC TESTS MUST BE ADDED BELOW
// =============================================================================
