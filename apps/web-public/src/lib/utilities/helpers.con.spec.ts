import { afterEach, describe, expect, it, vi } from 'vitest'

import {
    debounce,
    debounceLeading,
    getErrorMessage,
} from '$lib/utilities/helpers.js'

describe('getErrorMessage', () => {
    it('returns a nonempty Error message', () => {
        expect(getErrorMessage(new Error('Request failed.'), 'Fallback.')).toBe(
            'Request failed.',
        )
    })

    it.each([
        [
            'empty Error message',
            new Error(''),
        ],
        [
            'whitespace Error message',
            new Error('   '),
        ],
        [
            'string',
            'Request failed.',
        ],
        [
            'null',
            null,
        ],
        [
            'unknown object',
            { message: 'Request failed.' },
        ],
    ])('returns the fallback for %s', (_label, error) => {
        expect(getErrorMessage(error, 'Fallback.')).toBe('Fallback.')
    })
})

describe('debounce', () => {
    afterEach(() => {
        vi.useRealTimers()
    })

    it('rearms the full trailing delay for initial and later bursts', async () => {
        vi.useFakeTimers()
        const callback = vi.fn((value: string) => value)
        const debounced = debounce(callback, 100)

        const first = debounced('first')
        await vi.advanceTimersByTimeAsync(60)
        const latest = debounced('latest')
        await vi.advanceTimersByTimeAsync(99)
        expect(callback).not.toHaveBeenCalled()

        await vi.advanceTimersByTimeAsync(1)
        expect(callback).toHaveBeenLastCalledWith('latest')
        await expect(first).resolves.toBe('latest')
        await expect(latest).resolves.toBe('latest')

        void debounced('later')
        await vi.advanceTimersByTimeAsync(60)
        void debounced('later-latest')
        await vi.advanceTimersByTimeAsync(99)
        expect(callback).toHaveBeenCalledTimes(1)

        await vi.advanceTimersByTimeAsync(1)
        expect(callback).toHaveBeenLastCalledWith('later-latest')
    })

    it('serializes async work and retains the latest pending arguments', async () => {
        vi.useFakeTimers()
        let completeFirst!: () => void
        const firstGate = new Promise<void>((resolve) => {
            completeFirst = resolve
        })
        const callback = vi.fn(async (value: string) => {
            if (value === 'first') await firstGate
            return value
        })
        const debounced = debounce(callback, 100)

        void debounced('first')
        await vi.advanceTimersByTimeAsync(100)
        expect(callback).toHaveBeenCalledWith('first')

        const pending = debounced('second')
        await vi.advanceTimersByTimeAsync(50)
        const latest = debounced('latest')
        await vi.advanceTimersByTimeAsync(100)
        expect(callback).toHaveBeenCalledTimes(1)
        expect(debounced.isPending()).toBe(true)

        completeFirst()
        await vi.advanceTimersByTimeAsync(0)
        expect(callback).toHaveBeenLastCalledWith('latest')
        await expect(pending).resolves.toBe('latest')
        await expect(latest).resolves.toBe('latest')
    })

    it('supports cancellation, flushing, and pending-state inspection', async () => {
        vi.useFakeTimers()
        const callback = vi.fn((value: string) => value)
        const debounced = debounce(callback, 100)

        void debounced('cancelled')
        expect(debounced.isPending()).toBe(true)
        debounced.cancel()
        expect(debounced.isPending()).toBe(false)
        await vi.advanceTimersByTimeAsync(100)
        expect(callback).not.toHaveBeenCalled()

        const pending = debounced('flushed')
        const flushed = debounced.flush()
        await vi.advanceTimersByTimeAsync(0)
        expect(callback).toHaveBeenCalledWith('flushed')
        expect(debounced.isPending()).toBe(false)
        await expect(flushed).resolves.toBe('flushed')
        await expect(pending).resolves.toBe('flushed')
    })
})

describe('debounceLeading', () => {
    afterEach(() => {
        vi.useRealTimers()
    })

    it('rearms the lockout during async work without queuing a trailing call', async () => {
        vi.useFakeTimers()
        let completeFirst!: () => void
        const firstGate = new Promise<void>((resolve) => {
            completeFirst = resolve
        })
        const callback = vi.fn(async (value: string) => {
            if (value === 'first') await firstGate
            return value
        })
        const debounced = debounceLeading(callback, 100)

        const first = debounced('first')
        expect(callback).toHaveBeenCalledTimes(1)
        expect(callback).toHaveBeenLastCalledWith('first')

        await vi.advanceTimersByTimeAsync(100)
        const duringInvocation = debounced('ignored-during-invocation')
        completeFirst()
        await vi.advanceTimersByTimeAsync(0)
        await expect(first).resolves.toBe('first')
        await expect(duringInvocation).resolves.toBe('first')

        await vi.advanceTimersByTimeAsync(99)
        const duringLockout = debounced('ignored-during-lockout')
        await expect(duringLockout).resolves.toBe('first')
        await vi.advanceTimersByTimeAsync(99)
        expect(callback).toHaveBeenCalledTimes(1)
        expect(debounced.isPending()).toBe(true)

        await vi.advanceTimersByTimeAsync(1)
        expect(callback).toHaveBeenCalledTimes(1)
        expect(debounced.isPending()).toBe(false)

        await expect(debounced('second')).resolves.toBe('second')
        expect(callback).toHaveBeenLastCalledWith('second')
    })

    it('preserves receiver context and releases the lockout through controls', async () => {
        vi.useFakeTimers()
        const receiver = {
            prefix: 'value',
            callback(this: { prefix: string }, suffix: string) {
                return `${this.prefix}-${suffix}`
            },
        }
        const callback = vi.fn(receiver.callback)
        const debounced = debounceLeading(callback, 100)

        await expect(debounced.call(receiver, 'first')).resolves.toBe(
            'value-first',
        )
        expect(debounced.isPending()).toBe(true)
        expect(debounced.flush()).toBeUndefined()
        expect(debounced.isPending()).toBe(false)

        await expect(debounced.call(receiver, 'flushed')).resolves.toBe(
            'value-flushed',
        )
        debounced.cancel()
        expect(debounced.isPending()).toBe(false)
        await expect(debounced.call(receiver, 'cancelled')).resolves.toBe(
            'value-cancelled',
        )
        expect(callback).toHaveBeenCalledTimes(3)
    })
})

// =============================================================================
// END OF BASE TEMPLATE TESTS - FORK-SPECIFIC TESTS MUST BE ADDED BELOW
// =============================================================================
