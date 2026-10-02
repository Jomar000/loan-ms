import type { TRealtimeRegistry } from '@hyperion/websocket/registry'

/**
 * @description
 * Fork-owned APP realtime registry for the browser manager. Leave undefined to
 * use the built-in registry, whose APP stream defines no events. A fork that
 * publishes custom APP events must inject the same registry its API uses,
 * otherwise the browser drops those events as `UNKNOWN_EVENT`.
 */
export const EXTENSION_APP_REALTIME_REGISTRY: TRealtimeRegistry | undefined =
    undefined
