/**
 * @description
 * APP realtime event names that invalidate event-driven queries. Forks list
 * events here and must also register each one in the browser registry seam
 * (`$lib/utilities/wsClientManager/registry.extension.ts`); an unregistered
 * event is dropped before it reaches the SessionProvider.
 */
export const EXTENSION_APP_REALTIME_INVALIDATION_EVENTS: readonly string[] = []
