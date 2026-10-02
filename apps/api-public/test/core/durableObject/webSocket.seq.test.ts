import { v7 as uuidv7 } from 'uuid'
import { describe, expect, it, vi } from 'vitest'

import { WebSocketServer } from '../../../src/core/durableObject/webSocket.js'

describe('WebSocket close logging', () => {
    it('logs clean closes as WS_CLOSE.', () => {
        const consoleLog = vi
            .spyOn(console, 'log')
            .mockImplementation(() => undefined)
        const logAttachmentGauge = vi.fn()
        const socket = {} as WebSocket

        try {
            WebSocketServer.prototype.webSocketClose.call(
                {
                    logAttachmentGauge,
                } as unknown as WebSocketServer,
                socket,
                1000,
                'Normal closure',
                true,
            )

            expect(consoleLog).toHaveBeenCalledWith(
                JSON.stringify({
                    type: 'WS_CLOSE',
                    code: 1000,
                }),
            )
            expect(logAttachmentGauge).toHaveBeenCalledWith(socket, true)
        } finally {
            consoleLog.mockRestore()
        }
    })

    it('logs abnormal closes as WS_CLOSE_ERROR.', () => {
        const consoleError = vi
            .spyOn(console, 'error')
            .mockImplementation(() => undefined)
        const logAttachmentGauge = vi.fn()
        const socket = {} as WebSocket

        try {
            WebSocketServer.prototype.webSocketClose.call(
                {
                    logAttachmentGauge,
                } as unknown as WebSocketServer,
                socket,
                1006,
                'Abnormal closure',
                false,
            )

            expect(consoleError).toHaveBeenCalledWith(
                JSON.stringify({
                    type: 'WS_CLOSE_ERROR',
                    code: 1006,
                }),
            )
            expect(logAttachmentGauge).toHaveBeenCalledWith(socket, true)
        } finally {
            consoleError.mockRestore()
        }
    })
})

describe('WebSocket error logging', () => {
    it('logs WS_ERROR with a serialized, redacted error chain.', () => {
        const consoleError = vi
            .spyOn(console, 'error')
            .mockImplementation(() => undefined)
        const error = Object.assign(
            new Error(
                'socket failed postgres://user:PRIVATE_PASSWORD@db.internal/app',
                {
                    cause: Object.assign(
                        new Error(
                            'Failed query: select $1\nparams: PRIVATE_PARAMETER',
                        ),
                        {
                            name: 'DrizzleQueryError',
                            query: 'select $1',
                            params: ['PRIVATE_PARAMETER'],
                        },
                    ),
                },
            ),
            { type: 'PRIVATE_TYPE' },
        )

        try {
            WebSocketServer.prototype.webSocketError.call(
                {} as WebSocketServer,
                {} as WebSocket,
                error,
            )

            const entry = JSON.parse(String(consoleError.mock.calls[0]?.[0]))
            expect(entry).toMatchObject({
                type: 'WS_ERROR',
                name: 'Error',
                message: 'socket failed postgres://<redacted>@db.internal/app',
                causes: [
                    {
                        name: 'DrizzleQueryError',
                        message: 'Failed query.',
                        sql: 'select $1',
                        paramCount: 1,
                        paramTypes: ['string'],
                    },
                ],
            })
            expect(JSON.stringify(entry)).not.toContain('PRIVATE_')
        } finally {
            consoleError.mockRestore()
        }
    })

    it('logs WS_MESSAGE_SEND_ERROR without private cause or stack data and counts the failure.', async () => {
        const consoleError = vi
            .spyOn(console, 'error')
            .mockImplementation(() => undefined)
        const scope = {
            organizationId: '__TEST-ORG_WS_SEND_ERROR',
            shardIndex: 0,
            storageVersion: 1,
            stream: 'APP',
            surface: 'public',
            topology: 'leaf',
        } as const
        const sendFailure = new Error('send failed Bearer PRIVATE_TOKEN', {
            cause: new Error(
                'socket closed postgres://user:PRIVATE_PASSWORD@db.internal/app',
            ),
        })
        sendFailure.stack = `${sendFailure.name}: ${sendFailure.message}\n    at PRIVATE_FRAME`
        const socket = {
            close: vi.fn(),
            deserializeAttachment: () => ({
                ...scope,
                authorizationVersion: uuidv7(),
                connectionId: uuidv7(),
                identityId: '__TEST-USER_WS_SEND_ERROR',
                roles: ['member'],
                sessionExpiresAt: Date.now() + 60_000,
                target: null,
                wireVersion: 'realtime.events.v1',
            }),
            readyState: WebSocket.OPEN,
            send: () => {
                throw sendFailure
            },
        }
        const server = {
            ctx: {
                blockConcurrencyWhile: (callback: () => Promise<unknown>) =>
                    callback(),
                getWebSockets: () => [socket],
            },
            ensureRealtimeLeafScope: async () => true,
            getSocketBufferedAmount: () => 0,
            matchesRealtimeAudience: () => true,
            persistRealtimeLeafRevocations: async () => ({
                blockedVersionKeys: new Set<string>(),
            }),
        } as unknown as WebSocketServer

        try {
            const result =
                await WebSocketServer.prototype.deliverRealtimeFrame.call(
                    server,
                    'frame',
                    5,
                    { kind: 'organization' },
                    scope,
                    null,
                )

            expect(result).toMatchObject({
                deliveredCount: 0,
                sendFailureCount: 1,
            })
            const entry = JSON.parse(String(consoleError.mock.calls[0]?.[0]))
            expect(entry).toMatchObject({
                type: 'WS_MESSAGE_SEND_ERROR',
                name: 'Error',
                message: 'send failed Bearer <redacted>',
                causes: [
                    {
                        name: 'Error',
                        message:
                            'socket closed postgres://<redacted>@db.internal/app',
                    },
                ],
            })
            expect(entry).not.toHaveProperty('stack')
            expect(JSON.stringify(entry)).not.toContain('PRIVATE_')
        } finally {
            consoleError.mockRestore()
        }
    })
})

// =============================================================================
// END OF BASE TEMPLATE TESTS - FORK-SPECIFIC TESTS MUST BE ADDED BELOW
// =============================================================================
