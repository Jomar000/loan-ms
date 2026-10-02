import { BaseError } from '@loanms/errors'

import type {
    TRealtimeGapFrame,
    TRealtimeReadyFrame,
    TRealtimeRecoveryCallbacks,
    TRealtimeRecoveryContext,
} from './types.js'

const DEFAULT_BOOTSTRAP_TIMEOUT_MS = 5000
const DEFAULT_COMMAND_TIMEOUT_MS = 5000
const DEFAULT_COMPLETION_LEDGER_LIMIT = 256

export type TRealtimeBootstrapTrigger =
    | {
          context: TRealtimeRecoveryContext
          frame: TRealtimeReadyFrame
          reason: 'first-ready'
      }
    | {
          reason: 'timeout'
      }

export type TRealtimeBootstrapRecoveryTrigger =
    | {
          context: TRealtimeRecoveryContext
          frame: TRealtimeGapFrame
          reason: 'gap'
      }
    | {
          context: TRealtimeRecoveryContext
          frame: TRealtimeReadyFrame
          reason: 'ready-after-timeout' | 'reconnect-ready'
      }

export type TRealtimeBootstrapCoordinatorOptions = {
    bootstrap: (trigger: TRealtimeBootstrapTrigger) => void
    recover: (trigger: TRealtimeBootstrapRecoveryTrigger) => void
    subscribeRecovery: (callbacks: TRealtimeRecoveryCallbacks) => () => void
    timeoutMs?: number
}

export type TRealtimeBootstrapCoordinator = {
    dispose: () => void
}

export function createRealtimeBootstrapCoordinator(
    options: TRealtimeBootstrapCoordinatorOptions,
): TRealtimeBootstrapCoordinator {
    const timeoutMs = options.timeoutMs ?? DEFAULT_BOOTSTRAP_TIMEOUT_MS
    let bootstrapped = false
    let disposed = false
    let timeoutWon = false
    let timeout: ReturnType<typeof setTimeout> | undefined

    function bootstrap(trigger: TRealtimeBootstrapTrigger) {
        if (bootstrapped || disposed) return

        bootstrapped = true
        if (timeout !== undefined) clearTimeout(timeout)
        timeout = undefined
        options.bootstrap(trigger)
    }

    const unsubscribe = options.subscribeRecovery({
        onFirstReady: (frame, context) => {
            if (disposed) return

            if (timeoutWon) {
                options.recover({
                    context,
                    frame,
                    reason: 'ready-after-timeout',
                })
                return
            }

            bootstrap({ context, frame, reason: 'first-ready' })
        },
        onGap: (frame, context) => {
            if (!bootstrapped || disposed) return

            options.recover({ context, frame, reason: 'gap' })
        },
        onReconnectReady: (frame, context) => {
            if (!bootstrapped || disposed) return

            options.recover({
                context,
                frame,
                reason: 'reconnect-ready',
            })
        },
    })

    if (!bootstrapped) {
        timeout = setTimeout(() => {
            timeout = undefined
            timeoutWon = true
            bootstrap({ reason: 'timeout' })
        }, timeoutMs)
    }

    return {
        dispose: () => {
            if (disposed) return

            disposed = true
            if (timeout !== undefined) clearTimeout(timeout)
            timeout = undefined
            unsubscribe()
        },
    }
}

export type TRealtimeCommandReconcilerOptions<TExpectation, TEvent, TVersion> =
    {
        fallback: (expectation: TExpectation) => Promise<void> | void
        getEventVersion: (event: TEvent) => TVersion
        matchesExpectation: (
            expectation: TExpectation,
            event: TEvent,
        ) => boolean
        matchesVersion: (
            expectation: TExpectation,
            version: TVersion,
        ) => boolean
        refresh: (
            event: TEvent,
            expectation: TExpectation,
        ) => Promise<void> | void
        subscribe: (listener: (event: TEvent) => void) => () => void
        timeoutMs?: number
    }

export type TRealtimeCommandReconciler<TExpectation> = {
    dispose: () => void
    execute: <TResult>(
        expectation: TExpectation,
        command: () => Promise<TResult>,
    ) => Promise<TResult>
}

type TPendingCommand<TExpectation> = {
    commandCompleted: boolean
    eventMatched: boolean
    expectation: TExpectation
    fallbackStarted: boolean
    refreshFailed: boolean
    refreshCompleted: boolean
    refreshError: unknown
    reject: (reason: unknown) => void
    resolve: () => void
    settled: boolean
    timeout: ReturnType<typeof setTimeout> | undefined
}

export class RealtimeCommandReconcilerDisposedError extends BaseError {
    constructor() {
        super({
            category: 'lifecycle',
            id: 'REALTIME_COMMAND_RECONCILER_DISPOSED',
            message: 'The realtime command reconciler was disposed.',
            retryable: false,
        })
    }

    public override readonly name = 'RealtimeCommandReconcilerDisposedError'
}

export function createRealtimeCommandReconciler<TExpectation, TEvent, TVersion>(
    options: TRealtimeCommandReconcilerOptions<TExpectation, TEvent, TVersion>,
): TRealtimeCommandReconciler<TExpectation> {
    const timeoutMs = options.timeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS
    const pendingCommands = new Set<TPendingCommand<TExpectation>>()
    let disposed = false

    function settle(
        pending: TPendingCommand<TExpectation>,
        result:
            { status: 'fulfilled' } | { reason: unknown; status: 'rejected' },
    ) {
        if (pending.settled) return

        pending.settled = true
        if (pending.timeout !== undefined) clearTimeout(pending.timeout)
        pending.timeout = undefined
        pendingCommands.delete(pending)

        if (result.status === 'fulfilled') {
            pending.resolve()
        } else {
            pending.reject(result.reason)
        }
    }

    function settleAfterRefresh(pending: TPendingCommand<TExpectation>) {
        if (
            pending.settled ||
            !pending.commandCompleted ||
            !pending.refreshCompleted
        ) {
            return
        }

        if (pending.refreshFailed) {
            settle(pending, {
                reason: pending.refreshError,
                status: 'rejected',
            })
        } else {
            settle(pending, { status: 'fulfilled' })
        }
    }

    function startFallback(pending: TPendingCommand<TExpectation>) {
        if (
            pending.settled ||
            pending.eventMatched ||
            pending.fallbackStarted
        ) {
            return
        }

        pending.timeout = undefined
        pending.fallbackStarted = true

        Promise.resolve()
            .then(() => options.fallback(pending.expectation))
            .then(
                () => {
                    settle(pending, {
                        status: 'fulfilled',
                    })
                },
                (reason: unknown) => {
                    settle(pending, { reason, status: 'rejected' })
                },
            )
    }

    function handleEvent(event: TEvent) {
        if (disposed) return

        const version = options.getEventVersion(event)

        for (const pending of [...pendingCommands]) {
            if (
                pending.settled ||
                pending.eventMatched ||
                pending.fallbackStarted ||
                !options.matchesExpectation(pending.expectation, event) ||
                !options.matchesVersion(pending.expectation, version)
            ) {
                continue
            }

            pending.eventMatched = true
            if (pending.timeout !== undefined) clearTimeout(pending.timeout)
            pending.timeout = undefined

            Promise.resolve()
                .then(() => options.refresh(event, pending.expectation))
                .then(
                    () => {
                        pending.refreshCompleted = true
                        settleAfterRefresh(pending)
                    },
                    (reason: unknown) => {
                        pending.refreshCompleted = true
                        pending.refreshFailed = true
                        pending.refreshError = reason
                        settleAfterRefresh(pending)
                    },
                )
        }
    }

    const unsubscribe = options.subscribe(handleEvent)

    function dispose() {
        if (disposed) return

        disposed = true
        unsubscribe()

        for (const pending of [...pendingCommands]) {
            settle(pending, {
                reason: new RealtimeCommandReconcilerDisposedError(),
                status: 'rejected',
            })
        }
    }

    function execute<TResult>(
        expectation: TExpectation,
        command: () => Promise<TResult>,
    ): Promise<TResult> {
        if (disposed) {
            return Promise.reject(new RealtimeCommandReconcilerDisposedError())
        }

        return new Promise<TResult>((resolve, reject) => {
            let commandResult!: TResult
            const pending: TPendingCommand<TExpectation> = {
                commandCompleted: false,
                eventMatched: false,
                expectation,
                fallbackStarted: false,
                refreshCompleted: false,
                refreshError: undefined,
                refreshFailed: false,
                reject,
                resolve: () => resolve(commandResult),
                settled: false,
                timeout: undefined,
            }

            pendingCommands.add(pending)

            Promise.resolve()
                .then(command)
                .then(
                    (result) => {
                        if (pending.settled) return

                        pending.commandCompleted = true
                        commandResult = result

                        if (pending.eventMatched) {
                            settleAfterRefresh(pending)
                            return
                        }

                        pending.timeout = setTimeout(
                            () => startFallback(pending),
                            timeoutMs,
                        )
                    },
                    (reason: unknown) => {
                        settle(pending, { reason, status: 'rejected' })
                    },
                )
        })
    }

    return {
        dispose,
        execute,
    }
}

export type TRealtimeRefreshCoordinatorOptions<TGroup, TVersion> = {
    completionLedgerLimit?: number
    execute: (groups: readonly TGroup[]) => Promise<void> | void
    isVersionCovered: (
        completedVersion: TVersion,
        requestedVersion: TVersion,
    ) => boolean
}

export type TRealtimeRefreshCoordinator<TGroup, TVersion> = {
    request: (group: TGroup, version?: TVersion) => Promise<void>
}

type TRefreshRequest<TGroup, TVersion> = {
    group: TGroup
    reject: (reason: unknown) => void
    resolve: () => void
    version:
        | {
              present: true
              value: TVersion
          }
        | {
              present: false
          }
}

type TCompletion<TGroup, TVersion> = {
    group: TGroup
    version: TVersion
}

export function createRealtimeRefreshCoordinator<TGroup, TVersion>(
    options: TRealtimeRefreshCoordinatorOptions<TGroup, TVersion>,
): TRealtimeRefreshCoordinator<TGroup, TVersion> {
    const completionLedgerLimit =
        options.completionLedgerLimit ?? DEFAULT_COMPLETION_LEDGER_LIMIT
    const completionLedger: TCompletion<TGroup, TVersion>[] = []
    let active = false
    let scheduled = false
    let queuedRequests: TRefreshRequest<TGroup, TVersion>[] = []

    function isCovered(request: TRefreshRequest<TGroup, TVersion>) {
        const requestedVersion = request.version
        if (!requestedVersion.present) return false

        return completionLedger.some(
            (completion) =>
                Object.is(completion.group, request.group) &&
                options.isVersionCovered(
                    completion.version,
                    requestedVersion.value,
                ),
        )
    }

    function recordCompletion(request: TRefreshRequest<TGroup, TVersion>) {
        const requestedVersion = request.version
        if (!requestedVersion.present || completionLedgerLimit <= 0) return

        for (let index = completionLedger.length - 1; index >= 0; index -= 1) {
            const completion = completionLedger[index]

            if (
                completion !== undefined &&
                Object.is(completion.group, request.group) &&
                options.isVersionCovered(
                    requestedVersion.value,
                    completion.version,
                )
            ) {
                completionLedger.splice(index, 1)
            }
        }

        completionLedger.push({
            group: request.group,
            version: requestedVersion.value,
        })

        while (completionLedger.length > completionLedgerLimit) {
            completionLedger.shift()
        }
    }

    function schedulePass() {
        if (active || scheduled || queuedRequests.length === 0) return

        scheduled = true
        queueMicrotask(() => {
            scheduled = false
            void executePass()
        })
    }

    async function executePass() {
        if (active) return

        const requests = queuedRequests
        queuedRequests = []
        const uncoveredRequests = requests.filter((request) => {
            if (!isCovered(request)) return true

            request.resolve()
            return false
        })

        if (uncoveredRequests.length === 0) {
            schedulePass()
            return
        }

        active = true
        const groups = [
            ...new Set(uncoveredRequests.map((request) => request.group)),
        ]

        try {
            await options.execute(groups)

            for (const request of uncoveredRequests) {
                recordCompletion(request)
                request.resolve()
            }
        } catch (reason) {
            for (const request of uncoveredRequests) request.reject(reason)
        } finally {
            active = false
            schedulePass()
        }
    }

    return {
        request: (group, ...versionArgument) =>
            new Promise<void>((resolve, reject) => {
                queuedRequests.push({
                    group,
                    reject,
                    resolve,
                    version:
                        versionArgument.length === 0
                            ? { present: false }
                            : {
                                  present: true,
                                  value: versionArgument[0] as TVersion,
                              },
                })
                schedulePass()
            }),
    }
}
