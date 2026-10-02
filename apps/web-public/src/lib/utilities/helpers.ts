import { customAlphabet } from 'nanoid'
import { debounce as createDebounce } from 'perfect-debounce'

/**
 * Creates a trailing-edge debounced callback.
 *
 * @param callback - Callback to debounce.
 * @param interval - Delay in milliseconds after the latest call.
 * @returns A debounced callback with the same parameters and return type.
 */
export function debounce<T extends (...args: Parameters<T>) => ReturnType<T>>(
    callback: T,
    interval = 1000,
) {
    type Result = Awaited<ReturnType<T>>
    type PendingBatch = {
        args: Parameters<T>
        thisArg: ThisParameterType<T>
        quiet: boolean
        promise: Promise<Result>
        resolve: (value: Result | PromiseLike<Result>) => void
        reject: (reason?: unknown) => void
    }

    let pending: PendingBatch | undefined
    let invocation: Promise<void> | undefined

    function runWhenReady() {
        if (invocation || !pending?.quiet) return

        const batch = pending
        pending = undefined
        invocation = (async () => {
            try {
                batch.resolve(
                    (await callback.apply(batch.thisArg, batch.args)) as Result,
                )
            } catch (error) {
                batch.reject(error)
            }
        })().finally(() => {
            invocation = undefined
            runWhenReady()
        })
    }

    const quietTimer = createDebounce(() => {
        if (!pending) return
        pending.quiet = true
    }, interval)

    const debounced = function (
        this: ThisParameterType<T>,
        ...args: Parameters<T>
    ) {
        if (!pending) {
            let resolve!: (value: Result | PromiseLike<Result>) => void
            let reject!: (reason?: unknown) => void
            const promise = new Promise<Result>(
                (resolvePromise, rejectPromise) => {
                    resolve = resolvePromise
                    reject = rejectPromise
                },
            )
            pending = {
                args,
                thisArg: this,
                quiet: false,
                promise,
                resolve,
                reject,
            }
        } else {
            pending.args = args
            pending.thisArg = this
            pending.quiet = false
        }

        void quietTimer().then(runWhenReady)
        return pending.promise
    } as ((
        this: ThisParameterType<T>,
        ...args: Parameters<T>
    ) => Promise<Result>) & {
        cancel: () => void
        flush: () => Promise<Result> | undefined
        isPending: () => boolean
    }

    debounced.cancel = () => {
        quietTimer.cancel()
        pending = undefined
    }
    debounced.flush = () => {
        const result = pending?.promise
        void quietTimer.flush()?.then(runWhenReady)
        return result
    }
    debounced.isPending = () => pending !== undefined

    return debounced
}

/**
 * Creates an async-safe leading-edge debounced callback without a trailing
 * invocation.
 *
 * @param callback - Callback to debounce.
 * @param interval - Lockout interval in milliseconds after the latest call.
 * @returns A debounced callback with the same parameters and return type.
 */
export function debounceLeading<
    T extends (...args: Parameters<T>) => ReturnType<T>,
>(callback: T, interval = 1000) {
    type Result = Awaited<ReturnType<T>>

    let invocation: Promise<Result> | undefined
    let leadingResult: Promise<Result> | undefined
    let locked = false

    const quietTimer = createDebounce(() => {
        locked = false
    }, interval)

    const debounced = function (
        this: ThisParameterType<T>,
        ...args: Parameters<T>
    ) {
        const shouldInvoke = !locked && !invocation
        locked = true
        void quietTimer()

        if (!shouldInvoke) return invocation ?? leadingResult!

        let result: Promise<Result>
        try {
            result = Promise.resolve(
                callback.apply(this, args),
            ) as Promise<Result>
        } catch (error) {
            result = Promise.reject(error)
        }

        invocation = result
        leadingResult = result
        void result.then(
            () => {
                if (invocation === result) invocation = undefined
            },
            () => {
                if (invocation === result) invocation = undefined
            },
        )
        return result
    } as ((
        this: ThisParameterType<T>,
        ...args: Parameters<T>
    ) => Promise<Result>) & {
        cancel: () => void
        flush: () => Promise<Result> | undefined
        isPending: () => boolean
    }

    debounced.cancel = () => {
        quietTimer.cancel()
        locked = false
    }
    debounced.flush = () => {
        quietTimer.cancel()
        locked = false
        return undefined
    }
    debounced.isPending = () => locked

    return debounced
}

/**
 * Generates a NanoID using an alphanumeric alphabet.
 *
 * @param size - Optional identifier length overriding the 12-character default.
 * @returns A random alphanumeric identifier.
 * @see https://zelark.github.io/nano-id-cc
 */
export const nanoidCustom = customAlphabet(
    '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
    12,
)

/**
 * Executes the configured Turnstile challenge and resolves its token.
 *
 * @param options - CAPTCHA execution options.
 * @param options.action - Server-validated Turnstile action.
 * @param options.onCaptchaResolved - Callback invoked before resolving.
 * @param options.siteKey - Public Turnstile site key.
 * @returns The Turnstile response token.
 */
export async function requestCaptchaToken(options: {
    action: string
    onCaptchaResolved: () => void
    siteKey: string
}) {
    const { action, onCaptchaResolved, siteKey } = options

    return new Promise<string>((resolve) => {
        turnstile.execute('#captchaRenderArea', {
            sitekey: siteKey,
            action,
            callback: (token: string) => {
                onCaptchaResolved()
                turnstile.remove('#captchaRenderArea')
                resolve(token)
            },
        })
    })
}

/**
 * Removes properties whose values are null, undefined, or an empty string.
 *
 * @param obj - Record to serialize without empty properties.
 * @param options - Empty-value handling options.
 * @param options.allowEmptyString - Preserve empty strings when true.
 * @returns A JSON-safe copy without the configured empty values.
 */
export const stripEmptyProps = <T = unknown>(
    obj: Record<string, unknown>,
    options: { allowEmptyString?: boolean } = {},
) => {
    return JSON.parse(
        JSON.stringify(obj, (_k, v) =>
            v !== null &&
            v !== undefined &&
            (options.allowEmptyString || v !== '')
                ? v
                : undefined,
        ),
    ) as T
}

/**
 * Reads a cookie value from document.cookie.
 *
 * @param name - Cookie name to retrieve.
 * @returns The cookie value, or null when absent or unnamed.
 */
export const getCookie = (name: string) => {
    if (!name) {
        return null
    }

    const cookies = document.cookie
        .split('; ')
        .map((cookie) => cookie.split('='))
        .reduce(
            (accumulator, [
                    name,
                    ...rest
                ]) => {
                accumulator[name] = rest.join('=')
                return accumulator
            },
            {} as Record<string, string>,
        )

    return cookies[name] ?? null
}

/**
 * Resolves the environment-specific host-only CSRF cookie name.
 *
 * @param environment - Runtime environment name.
 * @returns The production or environment-qualified CSRF cookie name.
 */
export const getCsrfCookieName = (environment: string) =>
    environment === 'production'
        ? '__Host-csrf_token'
        : `__Host-${environment}_csrf_token`

/**
 * Formats a byte count using binary units.
 *
 * @param bytes - Byte count to format.
 * @param decimals - Maximum number of fractional digits.
 * @returns A human-readable byte value.
 */
export const formatBytes = (bytes: number, decimals = 2) => {
    if (!+bytes) {
        return '0 bytes'
    }

    const b = 1024
    const dm = decimals < 0 ? 0 : decimals
    const sizes = [
        'bytes',
        'KiB',
        'MiB',
        'GiB',
        'TiB',
        'PiB',
        'EiB',
        'ZiB',
        'YiB',
    ]

    const i = Math.floor(Math.log(bytes) / Math.log(b))
    return `${parseFloat((bytes / Math.pow(b, i)).toFixed(dm))} ${sizes[i]}`
}

/**
 * Returns a safe, nonempty message for an unknown error value.
 *
 * @param error - Value caught from the failed operation.
 * @param fallback - Message returned when the value is not a useful Error.
 * @returns The original nonempty Error.message, or the fallback.
 */
export function getErrorMessage(error: unknown, fallback: string) {
    if (error instanceof Error && error.message.trim() !== '') {
        return error.message
    }

    return fallback
}
