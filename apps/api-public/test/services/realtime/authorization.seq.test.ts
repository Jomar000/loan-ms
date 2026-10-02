import { env } from 'cloudflare:workers'
import { v7 as uuidv7 } from 'uuid'
import { describe, expect, it, vi } from 'vitest'

import { deliverPublicRealtimeRevocationLocally } from '../../../src/services/realtime/authorization.js'

describe('Public realtime authorization', () => {
    it('rejects expired remote directives before Durable Object lookup.', async () => {
        const getByName = vi.fn()

        await expect(
            deliverPublicRealtimeRevocationLocally(
                { getByName } as unknown as typeof env.LOANMSPUB_DO_WSB,
                {
                    authorizationVersion: uuidv7(),
                    expiresAt: Date.now() - 1,
                    identityId: '__TEST-USER_WS_REVOCATION',
                    operationId: uuidv7(),
                    organizationId: '__TEST-ORG_WS_REVOCATION',
                },
            ),
        ).resolves.toEqual({
            accepted: false,
            error: 'INVALID_REVOCATION_DIRECTIVE',
        })
        expect(getByName).not.toHaveBeenCalled()
    })

    it('logs the rejected broker call once as a serialized, redacted error.', async () => {
        const consoleError = vi
            .spyOn(console, 'error')
            .mockImplementation(() => undefined)
        const operationId = uuidv7()
        const getByName = vi.fn(() => ({
            revokeRealtimeAuthorization: async () => {
                throw new Error(
                    'broker down postgres://user:PRIVATE_PASSWORD@db.internal/app',
                )
            },
        }))

        try {
            await deliverPublicRealtimeRevocationLocally(
                { getByName } as unknown as typeof env.LOANMSPUB_DO_WSB,
                {
                    authorizationVersion: uuidv7(),
                    expiresAt: Date.now() + 60_000,
                    identityId: '__TEST-USER_WS_REVOCATION',
                    operationId,
                    organizationId: '__TEST-ORG_WS_REVOCATION',
                },
            )

            const entries = consoleError.mock.calls.map(([entry]) =>
                JSON.parse(String(entry)),
            )
            expect(entries).toEqual([
                expect.objectContaining({
                    type: 'WS_REVOCATION_DELIVERY_ERROR',
                    operationId,
                    surface: 'public',
                    name: 'Error',
                    message:
                        'broker down postgres://<redacted>@db.internal/app',
                }),
            ])
            expect(JSON.stringify(entries)).not.toContain('PRIVATE_')
        } finally {
            consoleError.mockRestore()
        }
    })

    it('returns a fixed error instead of a thrown broker message.', async () => {
        const getByName = vi.fn(() => ({
            revokeRealtimeAuthorization: async () => {
                throw new Error(
                    'broker down postgres://user:PRIVATE_PASSWORD@db.internal/app',
                )
            },
        }))

        await expect(
            deliverPublicRealtimeRevocationLocally(
                { getByName } as unknown as typeof env.LOANMSPUB_DO_WSB,
                {
                    authorizationVersion: uuidv7(),
                    expiresAt: Date.now() + 60_000,
                    identityId: '__TEST-USER_WS_REVOCATION',
                    operationId: uuidv7(),
                    organizationId: '__TEST-ORG_WS_REVOCATION',
                },
            ),
        ).resolves.toEqual({
            accepted: false,
            error: 'Realtime revocation delivery failed.',
        })
        expect(getByName).toHaveBeenCalled()
    })
})

// =============================================================================
// END OF BASE TEMPLATE TESTS - FORK-SPECIFIC TESTS MUST BE ADDED BELOW
// =============================================================================
