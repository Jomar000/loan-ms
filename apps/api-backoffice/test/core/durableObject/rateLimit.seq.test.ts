import { defineRateLimitPolicy } from '@hyperion/rate-limit/policy'
import {
    evictDurableObject,
    runDurableObjectAlarm,
    runInDurableObject,
} from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { RateLimit } from '../../../src/core/durableObject/rateLimit.js'

const policy = defineRateLimitPolicy({
    algorithm: 'sliding-window',
    limit: 2,
    version: 1,
    windowMs: 60_000,
})
const request = {
    keyPrefix: 'abcdef012345',
    policy,
    scope: 'test.sequential',
}
const createStub = () => env.HYPERIONBOFC_DO_RL.getByName(crypto.randomUUID())

const expectExactMaximum = (
    outcomes: readonly { allowed: boolean }[],
    limit: number,
    total: number,
) => {
    expect(outcomes.filter(({ allowed }) => allowed)).toHaveLength(limit)
    expect(outcomes.filter(({ allowed }) => !allowed)).toHaveLength(
        total - limit,
    )
}

let restoreConsoleLog: (() => void) | undefined

beforeAll(() => {
    const originalConsoleLog = console.log.bind(console)
    const consoleLog = vi
        .spyOn(console, 'log')
        .mockImplementation((...args) => {
            if (
                typeof args[0] === 'string' &&
                args[0].startsWith('{"type":"RATE_LIMIT_DECISION",')
            )
                return

            originalConsoleLog(...args)
        })
    restoreConsoleLog = () => consoleLog.mockRestore()
})

afterAll(() => restoreConsoleLog?.())

describe('Rate-limit Durable Object storage', () => {
    it('uses an exact sliding window with deterministic retry timing.', async () => {
        const stub = createStub()
        const nowMs = Date.now()
        await stub.setTestNowForTesting(nowMs)

        expect(await stub.consume(request)).toMatchObject({ allowed: true })
        expect(await stub.consume(request)).toMatchObject({ allowed: true })
        expect(await stub.consume(request)).toMatchObject({
            allowed: false,
            retryAfterMs: 60_000,
        })

        await stub.setTestNowForTesting(nowMs + 1_000)
        expect(await stub.consume(request)).toMatchObject({
            allowed: false,
            retryAfterMs: 59_000,
        })

        await stub.setTestNowForTesting(nowMs + 60_000)
        expect(await stub.consume(request)).toMatchObject({ allowed: true })
    })

    it('honors just-before, exact, and just-after boundaries for short and long windows.', async () => {
        const nowMs = Date.now()

        for (const [
            version,
            windowMs,
        ] of [
            [
                1,
                1_000,
            ],
            [
                2,
                24 * 60 * 60 * 1_000,
            ],
        ] as const) {
            const boundaryPolicy = defineRateLimitPolicy({
                algorithm: 'sliding-window',
                limit: 1,
                version,
                windowMs,
            })
            const boundaryRequest = {
                keyPrefix: '123456789abc',
                policy: boundaryPolicy,
                scope: 'test.boundary',
            }
            const exactStub = createStub()
            await exactStub.setTestNowForTesting(nowMs)
            expect(await exactStub.consume(boundaryRequest)).toMatchObject({
                allowed: true,
            })
            await exactStub.setTestNowForTesting(nowMs + windowMs - 1)
            expect(await exactStub.consume(boundaryRequest)).toMatchObject({
                allowed: false,
                retryAfterMs: 1,
            })
            await exactStub.setTestNowForTesting(nowMs + windowMs)
            expect(await exactStub.consume(boundaryRequest)).toMatchObject({
                allowed: true,
            })

            const afterStub = createStub()
            await afterStub.setTestNowForTesting(nowMs)
            expect(await afterStub.consume(boundaryRequest)).toMatchObject({
                allowed: true,
            })
            await afterStub.setTestNowForTesting(nowMs + windowMs + 1)
            expect(await afterStub.consume(boundaryRequest)).toMatchObject({
                allowed: true,
            })
        }
    })

    it('admits exactly a fresh concurrent maximum at the expiry boundary.', async () => {
        const expiryPolicy = defineRateLimitPolicy({
            algorithm: 'sliding-window',
            limit: 10,
            version: 1,
            windowMs: 60_000,
        })
        const expiryRequest = {
            keyPrefix: '456789abcdef',
            policy: expiryPolicy,
            scope: 'test.concurrent-expiry',
        }
        const stub = createStub()
        const nowMs = Date.now()
        const consumeConcurrently = () =>
            Promise.all(
                Array.from({ length: 100 }, () => stub.consume(expiryRequest)),
            )
        await stub.setTestNowForTesting(nowMs)

        const initialOutcomes = await consumeConcurrently()
        expectExactMaximum(initialOutcomes, expiryPolicy.limit, 100)

        await stub.setTestNowForTesting(nowMs + expiryPolicy.windowMs)
        const renewedOutcomes = await consumeConcurrently()
        expectExactMaximum(renewedOutcomes, expiryPolicy.limit, 100)
    })

    it('preserves active reservations across Durable Object eviction.', async () => {
        const evictionPolicy = defineRateLimitPolicy({
            algorithm: 'sliding-window',
            limit: 3,
            version: 1,
            windowMs: 60_000,
        })
        const evictionRequest = {
            keyPrefix: '23456789abcd',
            policy: evictionPolicy,
            scope: 'test.eviction',
        }
        const stub = createStub()
        await stub.setTestNowForTesting(Date.now())

        expect(await stub.consume(evictionRequest)).toMatchObject({
            allowed: true,
            remaining: 2,
        })
        expect(await stub.consume(evictionRequest)).toMatchObject({
            allowed: true,
            remaining: 1,
        })

        await evictDurableObject(stub)

        expect(await stub.consume(evictionRequest)).toMatchObject({
            allowed: true,
            remaining: 0,
        })
        expect(await stub.consume(evictionRequest)).toMatchObject({
            allowed: false,
            remaining: 0,
        })
    })

    it('releases only the named reservation and resets the key.', async () => {
        const stub = createStub()
        await stub.setTestNowForTesting(Date.now())
        const first = await stub.consume(request)
        expect(first.allowed).toBe(true)
        if (!first.allowed) throw new Error('Expected an accepted reservation.')

        await stub.release({ ...request, reservationId: first.reservationId })
        expect(await stub.consume(request)).toMatchObject({ allowed: true })
        await stub.reset(request)
        expect(await stub.consume(request)).toMatchObject({ allowed: true })
    })

    it('deletes object state after the final expiry alarm.', async () => {
        const stub = createStub()
        const nowMs = Date.now()
        await stub.setTestNowForTesting(nowMs)
        await stub.consume(request)
        await stub.setTestNowForTesting(nowMs + 60_000)

        expect(await runDurableObjectAlarm(stub)).toBe(true)
        const state = await runInDurableObject(
            stub,
            async (_instance, durableObjectState) => ({
                alarm: await durableObjectState.storage.getAlarm(),
                tables: durableObjectState.storage.sql
                    .exec<{ count: number }>(
                        `
                        SELECT COUNT(*) AS count
                        FROM sqlite_master
                        WHERE type = 'table'
                          AND name = 'rate_limit_reservation'
                    `,
                    )
                    .one().count,
            }),
        )

        expect(state).toEqual({ alarm: null, tables: 0 })
        expect(await runDurableObjectAlarm(stub)).toBe(false)

        const repeatedState = await runInDurableObject(
            stub,
            async (instance: RateLimit, durableObjectState) => {
                const alarm = instance.alarm?.bind(instance)
                if (!alarm) throw new Error('Expected a rate-limit alarm.')

                await alarm()
                await alarm()

                return {
                    alarm: await durableObjectState.storage.getAlarm(),
                    tables: durableObjectState.storage.sql
                        .exec<{ count: number }>(
                            `
                            SELECT COUNT(*) AS count
                            FROM sqlite_master
                            WHERE type = 'table'
                              AND name = 'rate_limit_reservation'
                        `,
                        )
                        .one().count,
                }
            },
        )

        expect(repeatedState).toEqual({ alarm: null, tables: 0 })
    })

    it('preserves a new window when an earlier alarm arrives late.', async () => {
        const lateAlarmPolicy = defineRateLimitPolicy({
            algorithm: 'sliding-window',
            limit: 1,
            version: 1,
            windowMs: 1_000,
        })
        const lateAlarmRequest = {
            keyPrefix: '3456789abcde',
            policy: lateAlarmPolicy,
            scope: 'test.late-alarm',
        }
        const stub = createStub()
        const nowMs = Date.now()
        await stub.setTestNowForTesting(nowMs)
        await stub.consume(lateAlarmRequest)
        await stub.setTestNowForTesting(nowMs + lateAlarmPolicy.windowMs)
        await stub.consume(lateAlarmRequest)

        const state = await runInDurableObject(
            stub,
            async (instance: RateLimit, durableObjectState) => {
                const alarm = instance.alarm?.bind(instance)
                if (!alarm) throw new Error('Expected a rate-limit alarm.')

                await alarm()

                return {
                    alarm: await durableObjectState.storage.getAlarm(),
                    reservations: durableObjectState.storage.sql
                        .exec<{ count: number }>(
                            'SELECT COUNT(*) AS count FROM rate_limit_reservation',
                        )
                        .one().count,
                }
            },
        )

        expect(state).toEqual({
            alarm: nowMs + 2 * lateAlarmPolicy.windowMs,
            reservations: 1,
        })
    })

    it('fails closed and logs privacy-safe context for malformed stored state.', async () => {
        const stub = createStub()
        await stub.setTestNowForTesting(Date.now())
        await stub.consume(request)
        await runInDurableObject(stub, (_instance, durableObjectState) => {
            durableObjectState.storage.sql.exec(
                "UPDATE rate_limit_reservation SET expires_at = 'malformed'",
            )
        })
        const consoleError = vi
            .spyOn(console, 'error')
            .mockImplementation(() => undefined)

        try {
            const failure = await runInDurableObject(stub, async (instance) => {
                try {
                    await (instance as RateLimit).consume(request)
                } catch (error) {
                    return error instanceof Error ? error.message : null
                }

                return null
            })
            expect(failure).toBe('Invalid persisted rate-limit state.')
            expect(consoleError).toHaveBeenCalledWith(
                JSON.stringify({
                    type: 'RATE_LIMIT_STORAGE_VALIDATION_FAILED',
                    operation: 'consume',
                    keyPrefix: request.keyPrefix,
                    scope: request.scope,
                }),
            )

            const reservations = await runInDurableObject(
                stub,
                (_instance, durableObjectState) =>
                    durableObjectState.storage.sql
                        .exec<{ count: number }>(
                            'SELECT COUNT(*) AS count FROM rate_limit_reservation',
                        )
                        .one().count,
            )
            expect(reservations).toBe(1)

            await expect(stub.reset(request)).resolves.toEqual({ ok: true })
            await expect(stub.consume(request)).resolves.toMatchObject({
                allowed: true,
            })
        } finally {
            consoleError.mockRestore()
        }
    })
})

// =============================================================================
// END OF BASE TEMPLATE TESTS - FORK-SPECIFIC TESTS MUST BE ADDED BELOW
// =============================================================================
