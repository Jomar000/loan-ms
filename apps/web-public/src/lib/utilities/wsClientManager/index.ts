import { createWsClientManager } from '@loanms/websocket/client'

import { PUBLIC_API_URL } from '$env/static/public'
import { EXTENSION_APP_REALTIME_REGISTRY } from './registry.extension'

/**
 * Shared realtime manager for the public API.
 *
 * The authenticated SessionProvider owns the APP subscription; features
 * acquire registered dedicated streams with `connect(stream, target)`.
 * Equivalent normalized stream/target calls share one socket and reconnect
 * loop.
 *
 * Socket-owning effects must depend on stable organization, stream, and target
 * scalars. Do not reacquire a lease for an unchanged scope after session data
 * refreshes.
 *
 * The manager uses the built-in registry, whose APP stream defines no events,
 * unless `EXTENSION_APP_REALTIME_REGISTRY` provides the registry shared with
 * the API. Frames for events missing from the browser registry are dropped.
 *
 * Always call `release()` when the consumer no longer needs the subscription.
 *
 * @example
 * ```ts
 * import { wsClientManager } from '$lib/utilities/wsClientManager'
 *
 * const subscription = wsClientManager.connect('RESOURCE', resourceId)
 *
 * const unsubscribe = subscription.subscribe((frame) => {
 *     // Handle a validated realtime frame.
 * })
 *
 * onDestroy(() => {
 *     unsubscribe()
 *     subscription.release()
 * })
 * ```
 */
export const wsClientManager = createWsClientManager({
    registry: EXTENSION_APP_REALTIME_REGISTRY,
    getUrl: (stream, target) => {
        const wsBase = PUBLIC_API_URL.replace(/^http/, 'ws')
        const route =
            stream === 'APP'
                ? 'app'
                : target === undefined
                  ? stream
                  : `${stream}/${encodeURIComponent(target)}`

        return `${wsBase}/api/ws/${route}`
    },
})
