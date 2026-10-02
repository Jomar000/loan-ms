import { BaseError } from '@hyperion/errors'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
    createRealtimeBootstrapCoordinator,
    createRealtimeCommandReconciler,
    createRealtimeRefreshCoordinator,
    RealtimeCommandReconcilerDisposedError,
} from '../src/coordination.js'
import type {
    TRealtimeReadyFrame,
    TRealtimeRecoveryCallbacks,
    TRealtimeRecoveryContext,
} from '../src/types.js'

afterEach(() => {
    vi.useRealTimers()
})

describe('RealtimeCommandReconcilerDisposedError', () => {
    it('retains its contract through BaseError', () => {
        const error = new RealtimeCommandReconcilerDisposedError()

        expect(error).toBeInstanceOf(Error)
        expect(error).toBeInstanceOf(BaseError)
        expect(error).toMatchObject({
            name: 'RealtimeCommandReconcilerDisposedError',
            id: 'REALTIME_COMMAND_RECONCILER_DISPOSED',
            message: 'The realtime command reconciler was disposed.',
            category: 'lifecycle',
            retryable: false,
        })
    })
})

describe('createRealtimeBootstrapCoordinator', () => {
    it('uses the documented five-second bootstrap timeout by default.', () => {
        vi.useFakeTimers()
        const bootstrap = vi.fn()
        const subscription = createRecoverySubscription()
        const coordinator = createRealtimeBootstrapCoordinator({
            bootstrap,
            recover: vi.fn(),
            subscribeRecovery: subscription.subscribe,
        })

        vi.advanceTimersByTime(4999)
        expect(bootstrap).not.toHaveBeenCalled()

        vi.advanceTimersByTime(1)
        expect(bootstrap).toHaveBeenCalledWith({ reason: 'timeout' })

        coordinator.dispose()
    })

    it('bootstraps once on first READY and recovers on GAP and reconnect READY.', () => {
        vi.useFakeTimers()
        const bootstrap = vi.fn()
        const recover = vi.fn()
        const subscription = createRecoverySubscription()
        const coordinator = createRealtimeBootstrapCoordinator({
            bootstrap,
            recover,
            subscribeRecovery: subscription.subscribe,
            timeoutMs: 100,
        })

        subscription.callbacks?.onFirstReady?.(
            createReadyFrame('first'),
            createRecoveryContext(),
        )
        subscription.callbacks?.onFirstReady?.(
            createReadyFrame('duplicate'),
            createRecoveryContext(),
        )
        subscription.callbacks?.onGap?.(
            {
                expected: '2',
                received: '4',
                stream: 'APP',
                type: 'GAP',
            },
            createRecoveryContext(),
        )
        subscription.callbacks?.onReconnectReady?.(
            createReadyFrame('reconnect'),
            createRecoveryContext(),
        )
        vi.advanceTimersByTime(100)

        expect(bootstrap).toHaveBeenCalledOnce()
        expect(bootstrap).toHaveBeenCalledWith(
            expect.objectContaining({ reason: 'first-ready' }),
        )
        expect(recover).toHaveBeenCalledTimes(2)
        expect(recover.mock.calls.map(([trigger]) => trigger.reason)).toEqual([
            'gap',
            'reconnect-ready',
        ])

        coordinator.dispose()
    })

    it('bootstraps on timeout and treats the later first READY as recovery.', () => {
        vi.useFakeTimers()
        const bootstrap = vi.fn()
        const recover = vi.fn()
        const subscription = createRecoverySubscription()
        const coordinator = createRealtimeBootstrapCoordinator({
            bootstrap,
            recover,
            subscribeRecovery: subscription.subscribe,
            timeoutMs: 100,
        })

        vi.advanceTimersByTime(100)
        subscription.callbacks?.onFirstReady?.(
            createReadyFrame('late'),
            createRecoveryContext(),
        )

        expect(bootstrap).toHaveBeenCalledWith({ reason: 'timeout' })
        expect(recover).toHaveBeenCalledWith(
            expect.objectContaining({ reason: 'ready-after-timeout' }),
        )

        coordinator.dispose()
    })

    it('disposes the timeout and recovery subscription idempotently.', () => {
        vi.useFakeTimers()
        const bootstrap = vi.fn()
        const recover = vi.fn()
        const subscription = createRecoverySubscription()
        const coordinator = createRealtimeBootstrapCoordinator({
            bootstrap,
            recover,
            subscribeRecovery: subscription.subscribe,
            timeoutMs: 100,
        })

        coordinator.dispose()
        coordinator.dispose()
        vi.advanceTimersByTime(100)
        subscription.callbacks?.onFirstReady?.(
            createReadyFrame('disposed'),
            createRecoveryContext(),
        )

        expect(subscription.unsubscribe).toHaveBeenCalledOnce()
        expect(bootstrap).not.toHaveBeenCalled()
        expect(recover).not.toHaveBeenCalled()
    })
})

describe('createRealtimeCommandReconciler', () => {
    it('reconciles an event that refreshes before the HTTP response.', async () => {
        const command = createDeferred<string>()
        const harness = createCommandHarness()
        const result = harness.reconciler.execute(
            { id: 'command', version: 2 },
            () => command.promise,
        )
        await Promise.resolve()

        harness.emit({ id: 'command', version: 2 })
        await Promise.resolve()
        command.resolve('saved')

        await expect(result).resolves.toBe('saved')
        expect(harness.refresh).toHaveBeenCalledOnce()
        expect(harness.fallback).not.toHaveBeenCalled()
    })

    it('waits for a matching event after the HTTP response.', async () => {
        vi.useFakeTimers()
        const harness = createCommandHarness()
        const result = harness.reconciler.execute(
            { id: 'command', version: 2 },
            async () => 'saved',
        )
        await vi.advanceTimersByTimeAsync(50)

        harness.emit({ id: 'command', version: 2 })

        await expect(result).resolves.toBe('saved')
        expect(harness.refresh).toHaveBeenCalledOnce()
        expect(harness.fallback).not.toHaveBeenCalled()
    })

    it('ignores expectation and version mismatches before using fallback.', async () => {
        vi.useFakeTimers()
        const harness = createCommandHarness()
        const result = harness.reconciler.execute(
            { id: 'command', version: 2 },
            async () => 'saved',
        )
        await vi.advanceTimersByTimeAsync(0)

        harness.emit({ id: 'other', version: 2 })
        harness.emit({ id: 'command', version: 1 })
        await vi.advanceTimersByTimeAsync(100)

        await expect(result).resolves.toBe('saved')
        expect(harness.refresh).not.toHaveBeenCalled()
        expect(harness.fallback).toHaveBeenCalledOnce()
    })

    it('propagates command, refresh, and fallback failures.', async () => {
        vi.useFakeTimers()
        const commandError = new Error('command failed')
        const refreshError = new Error('refresh failed')
        const fallbackError = new Error('fallback failed')
        const commandHarness = createCommandHarness()
        const refreshHarness = createCommandHarness({
            refresh: vi.fn().mockRejectedValue(refreshError),
        })
        const fallbackHarness = createCommandHarness({
            fallback: vi.fn().mockRejectedValue(fallbackError),
        })

        await expect(
            commandHarness.reconciler.execute(
                { id: 'command', version: 1 },
                async () => {
                    throw commandError
                },
            ),
        ).rejects.toBe(commandError)

        const refreshResult = refreshHarness.reconciler.execute(
            { id: 'command', version: 1 },
            async () => 'saved',
        )
        await vi.advanceTimersByTimeAsync(0)
        refreshHarness.emit({ id: 'command', version: 1 })
        await expect(refreshResult).rejects.toBe(refreshError)

        const fallbackResult = fallbackHarness.reconciler.execute(
            { id: 'command', version: 1 },
            async () => 'saved',
        )
        const fallbackExpectation =
            expect(fallbackResult).rejects.toBe(fallbackError)
        await vi.advanceTimersByTimeAsync(100)
        await fallbackExpectation
    })

    it('propagates synchronous refresh and fallback failures.', async () => {
        vi.useFakeTimers()
        const refreshError = new Error('synchronous refresh failed')
        const fallbackError = new Error('synchronous fallback failed')
        const refreshHarness = createCommandHarness({
            refresh: () => {
                throw refreshError
            },
        })
        const fallbackHarness = createCommandHarness({
            fallback: () => {
                throw fallbackError
            },
        })

        const refreshResult = refreshHarness.reconciler.execute(
            { id: 'command', version: 1 },
            async () => 'saved',
        )
        await vi.advanceTimersByTimeAsync(0)
        refreshHarness.emit({ id: 'command', version: 1 })

        await expect(refreshResult).rejects.toBe(refreshError)

        const fallbackResult = fallbackHarness.reconciler.execute(
            { id: 'command', version: 1 },
            async () => 'saved',
        )
        const fallbackExpectation =
            expect(fallbackResult).rejects.toBe(fallbackError)
        await vi.advanceTimersByTimeAsync(100)

        await fallbackExpectation
    })

    it('ignores matching events after the fallback has started.', async () => {
        vi.useFakeTimers()
        const fallback = createDeferred<void>()
        const harness = createCommandHarness({
            fallback: vi.fn(() => fallback.promise),
        })
        const result = harness.reconciler.execute(
            { id: 'command', version: 1 },
            async () => 'saved',
        )

        await vi.advanceTimersByTimeAsync(100)
        harness.emit({ id: 'command', version: 1 })
        await Promise.resolve()

        expect(harness.fallback).toHaveBeenCalledOnce()
        expect(harness.refresh).not.toHaveBeenCalled()

        fallback.resolve()

        await expect(result).resolves.toBe('saved')
    })

    it('unsubscribes and cancels all pending commands on disposal.', async () => {
        const command = createDeferred<string>()
        const harness = createCommandHarness()
        const result = harness.reconciler.execute(
            { id: 'command', version: 1 },
            () => command.promise,
        )

        harness.reconciler.dispose()
        harness.reconciler.dispose()

        await expect(result).rejects.toBeInstanceOf(
            RealtimeCommandReconcilerDisposedError,
        )
        await expect(
            harness.reconciler.execute(
                { id: 'next', version: 1 },
                async () => 'ignored',
            ),
        ).rejects.toBeInstanceOf(RealtimeCommandReconcilerDisposedError)
        expect(harness.unsubscribe).toHaveBeenCalledOnce()
    })
})

describe('createRealtimeRefreshCoordinator', () => {
    it('unions groups requested in the same turn.', async () => {
        const execute = vi.fn().mockResolvedValue(undefined)
        const coordinator = createRealtimeRefreshCoordinator<string, number>({
            execute,
            isVersionCovered: (completed, requested) => completed >= requested,
        })

        const first = coordinator.request('summary', 1)
        const second = coordinator.request('details', 1)
        const duplicate = coordinator.request('summary', 1)

        await Promise.all([
            first,
            second,
            duplicate,
        ])
        expect(execute).toHaveBeenCalledOnce()
        expect(execute).toHaveBeenCalledWith([
            'summary',
            'details',
        ])
    })

    it('queues one trailing union while a refresh is active.', async () => {
        const firstPass = createDeferred<void>()
        const execute = vi
            .fn()
            .mockImplementationOnce(() => firstPass.promise)
            .mockResolvedValue(undefined)
        const coordinator = createRealtimeRefreshCoordinator<string, number>({
            execute,
            isVersionCovered: (completed, requested) => completed >= requested,
        })

        const first = coordinator.request('summary')
        await Promise.resolve()
        const second = coordinator.request('details')
        const third = coordinator.request('history')
        firstPass.resolve()

        await Promise.all([
            first,
            second,
            third,
        ])
        expect(execute).toHaveBeenCalledTimes(2)
        expect(execute.mock.calls[1]?.[0]).toEqual([
            'details',
            'history',
        ])
    })

    it('suppresses covered versions but always executes unversioned requests.', async () => {
        const execute = vi.fn().mockResolvedValue(undefined)
        const coordinator = createRealtimeRefreshCoordinator<string, number>({
            execute,
            isVersionCovered: (completed, requested) => completed >= requested,
        })

        await coordinator.request('summary', 2)
        await coordinator.request('summary', 1)
        await coordinator.request('summary')

        expect(execute).toHaveBeenCalledTimes(2)
    })

    it('evicts old completion entries at the configured ledger bound.', async () => {
        const execute = vi.fn().mockResolvedValue(undefined)
        const coordinator = createRealtimeRefreshCoordinator<string, number>({
            completionLedgerLimit: 1,
            execute,
            isVersionCovered: (completed, requested) => completed >= requested,
        })

        await coordinator.request('summary', 1)
        await coordinator.request('details', 1)
        await coordinator.request('summary', 1)

        expect(execute).toHaveBeenCalledTimes(3)
    })

    it('keeps 256 completion entries by default.', async () => {
        const execute = vi.fn().mockResolvedValue(undefined)
        const coordinator = createRealtimeRefreshCoordinator<string, number>({
            execute,
            isVersionCovered: (completed, requested) => completed >= requested,
        })

        await Promise.all(
            Array.from({ length: 257 }, (_, index) =>
                coordinator.request(`group-${index}`, 1),
            ),
        )
        await coordinator.request('group-1', 1)
        await coordinator.request('group-0', 1)

        expect(execute).toHaveBeenCalledTimes(2)
        expect(execute.mock.calls[1]?.[0]).toEqual(['group-0'])
    })

    it('rejects a failed pass and continues with queued work.', async () => {
        const refreshError = new Error('refresh failed')
        const execute = vi
            .fn()
            .mockRejectedValueOnce(refreshError)
            .mockResolvedValue(undefined)
        const coordinator = createRealtimeRefreshCoordinator<string, number>({
            execute,
            isVersionCovered: (completed, requested) => completed >= requested,
        })

        await expect(coordinator.request('summary', 1)).rejects.toBe(
            refreshError,
        )
        await expect(coordinator.request('details', 1)).resolves.toBeUndefined()
        expect(execute).toHaveBeenCalledTimes(2)
    })
})

type TCommandExpectation = { id: string; version: number }
type TCommandEvent = { id: string; version: number }

function createCommandHarness(
    overrides: {
        fallback?: (expectation: TCommandExpectation) => Promise<void> | void
        refresh?: (
            event: TCommandEvent,
            expectation: TCommandExpectation,
        ) => Promise<void> | void
    } = {},
) {
    let listener: ((event: TCommandEvent) => void) | undefined
    const fallback = overrides.fallback ?? vi.fn().mockResolvedValue(undefined)
    const refresh = overrides.refresh ?? vi.fn().mockResolvedValue(undefined)
    const unsubscribe = vi.fn()
    const reconciler = createRealtimeCommandReconciler<
        TCommandExpectation,
        TCommandEvent,
        number
    >({
        fallback,
        getEventVersion: (event) => event.version,
        matchesExpectation: (expectation, event) => expectation.id === event.id,
        matchesVersion: (expectation, version) =>
            version >= expectation.version,
        refresh,
        subscribe: (nextListener) => {
            listener = nextListener
            return unsubscribe
        },
        timeoutMs: 100,
    })

    return {
        emit: (event: TCommandEvent) => listener?.(event),
        fallback,
        reconciler,
        refresh,
        unsubscribe,
    }
}

function createDeferred<T>() {
    let reject!: (reason?: unknown) => void
    let resolve!: (value: T | PromiseLike<T>) => void
    const promise = new Promise<T>((resolvePromise, rejectPromise) => {
        reject = rejectPromise
        resolve = resolvePromise
    })

    return { promise, reject, resolve }
}

function createReadyFrame(connectionId: string): TRealtimeReadyFrame {
    return {
        authorizationVersion: 'authorization-version',
        connectionId,
        stream: 'APP',
        type: 'READY',
        wireVersion: 'realtime.events.v1',
    }
}

function createRecoveryContext(): TRealtimeRecoveryContext {
    return {
        recoveryPolicy: 'active_tenant',
        stream: 'APP',
        target: null,
    }
}

function createRecoverySubscription() {
    let callbacks: TRealtimeRecoveryCallbacks | undefined
    const unsubscribe = vi.fn()

    return {
        get callbacks() {
            return callbacks
        },
        subscribe: (nextCallbacks: TRealtimeRecoveryCallbacks) => {
            callbacks = nextCallbacks
            return unsubscribe
        },
        unsubscribe,
    }
}

// =============================================================================
// END OF BASE TEMPLATE TESTS - FORK-SPECIFIC TESTS MUST BE ADDED BELOW
// =============================================================================
