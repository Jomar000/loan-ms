import { defineRateLimitPolicy } from '@hyperion/rate-limit/policy'
import { env } from 'cloudflare:workers'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

const policy = defineRateLimitPolicy({
    algorithm: 'sliding-window',
    limit: 10,
    version: 1,
    windowMs: 60_000,
})

const createStub = () => env.HYPERIONBOFC_DO_RL.getByName(crypto.randomUUID())

const consumeConcurrently = (
    stub: ReturnType<typeof createStub>,
    count: number,
    scope: string,
) =>
    Promise.all(
        Array.from({ length: count }, () =>
            stub.consume({
                keyPrefix: '0123456789ab',
                policy,
                scope,
            }),
        ),
    )

const expectExactMaximum = (
    outcomes: readonly { allowed: boolean }[],
    total: number,
) => {
    expect(outcomes.filter(({ allowed }) => allowed)).toHaveLength(policy.limit)
    expect(outcomes.filter(({ allowed }) => !allowed)).toHaveLength(
        total - policy.limit,
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

beforeAll(
    async () => {
        await createStub().setTestNowForTesting(Date.now())
    },
    // Full concurrent runs can spend longer than the global hook timeout
    // initializing the Worker while peer files start their own runtimes.
    30_000,
)

afterAll(() => restoreConsoleLog?.())

describe('Rate-limit Durable Object concurrency', () => {
    it('accepts exactly ten of one hundred concurrent requests.', async () => {
        const stub = createStub()
        await stub.setTestNowForTesting(Date.now())

        expectExactMaximum(
            await consumeConcurrently(stub, 100, 'test.concurrent'),
            100,
        )
    })

    it('keeps independent keys isolated under concurrent load.', async () => {
        const first = createStub()
        const second = createStub()
        const nowMs = Date.now()
        await Promise.all([
            first.setTestNowForTesting(nowMs),
            second.setTestNowForTesting(nowMs),
        ])

        const [
            firstOutcomes,
            secondOutcomes,
        ] = await Promise.all([
            consumeConcurrently(first, 100, 'test.concurrent-first'),
            consumeConcurrently(second, 100, 'test.concurrent-second'),
        ])

        expectExactMaximum(firstOutcomes, 100)
        expectExactMaximum(secondOutcomes, 100)
    })
})

// =============================================================================
// END OF BASE TEMPLATE TESTS - FORK-SPECIFIC TESTS MUST BE ADDED BELOW
// =============================================================================
