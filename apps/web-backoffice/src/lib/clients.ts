import type { AdminRouteType } from '@hyperion/api-backoffice/api/admin'
import type { AuditTrailRouteType } from '@hyperion/api-backoffice/api/auditTrail'
import type { AuthRouteType } from '@hyperion/api-backoffice/api/auth'
import type { HeartbeatRouteType } from '@hyperion/api-backoffice/api/heartbeat'
import type { ObjectStorageRouteType } from '@hyperion/api-backoffice/api/objectStorage'
import type { UserRouteType } from '@hyperion/api-backoffice/api/user'
import { hc } from 'hono/client'
import ky from 'ky'

import { PUBLIC_API_URL } from '$env/static/public'
import { apiKeyFeatureEnabled } from '$lib/config/apiKey'
import { objectStorageFeatureEnabled } from '$lib/config/objectStorage'
import {
    ACTIVITY_LOG_INVALIDATION_EVENT,
    AUTH_UNAUTHORIZED_EVENT,
} from '$lib/states/session/constants'
import { getCookie, getCsrfCookieName } from './utilities/helpers'

type AdminClient = ReturnType<typeof hc<AdminRouteType>>
type ObjectStorageClient = ReturnType<typeof hc<ObjectStorageRouteType>>

/**
 * @description
 * Inject CSRF token to ky client
 */

const SAFE_METHODS = [
    'GET',
    'HEAD',
    'OPTIONS',
    'QUERY',
]
const AUDIT_EVENT_RECORDED_HEADER = 'Audit-Event-Recorded'

const CSRF_COOKIE_NAME = getCsrfCookieName(import.meta.env.MODE)

const kyClient = ky.extend({
    throwHttpErrors: false,
    hooks: {
        afterResponse: [
            ({ request, response }) => {
                if (
                    response.ok &&
                    response.headers.get(AUDIT_EVENT_RECORDED_HEADER) === 'true'
                ) {
                    globalThis.dispatchEvent(
                        new Event(ACTIVITY_LOG_INVALIDATION_EVENT),
                    )
                }

                if (
                    response.status === 401 &&
                    new URL(request.url).pathname !== '/api/auth/session'
                ) {
                    globalThis.dispatchEvent(new Event(AUTH_UNAUTHORIZED_EVENT))
                }
            },
        ],
        beforeRequest: [
            ({ request }) => {
                if (SAFE_METHODS.includes(request.method)) return

                const csrfToken = getCookie(CSRF_COOKIE_NAME)

                if (csrfToken) {
                    request.headers.set(
                        'x-csrf-token',
                        decodeURIComponent(csrfToken),
                    )
                }
            },
        ],
    },
})

/**
 * @description
 * Admin RPC Client
 */
export const adminClient = initAdminClient()

function initAdminClient(): AdminClient {
    const client = hc<AdminRouteType>(`${PUBLIC_API_URL}/api/admin`, {
        init: { credentials: 'include' },
        fetch: kyClient,
    })

    if (apiKeyFeatureEnabled) return client

    return new Proxy(client, {
        get(target, property, receiver) {
            if (property === 'servicePrincipal') {
                throw new Error('API-key management is disabled.')
            }

            return Reflect.get(target, property, receiver)
        },
    })
}

/**
 * @description
 * Auth RPC Client
 */
export const authClient = hc<AuthRouteType>(`${PUBLIC_API_URL}/api/auth`, {
    init: { credentials: 'include' },
    fetch: kyClient,
})

/**
 * @description
 * Audit Trail RPC Client
 */
export const auditTrailClient = hc<AuditTrailRouteType>(
    `${PUBLIC_API_URL}/api/auditTrail`,
    {
        init: { credentials: 'include' },
        fetch: kyClient,
    },
)
/**
 * @description
 * Heartbeat RPC Client
 */
export const heartbeatClient = hc<HeartbeatRouteType>(
    `${PUBLIC_API_URL}/api/heartbeat`,
    {
        init: { credentials: 'include' },
        fetch: kyClient,
    },
)

/**
 * @description
 * Object Storage RPC Client
 */
export const objectStorageClient = initObjectStorageClient()

function initObjectStorageClient(): ObjectStorageClient {
    if (!objectStorageFeatureEnabled) {
        return new Proxy({} as ObjectStorageClient, {
            get() {
                throw new Error('Object storage is disabled.')
            },
        })
    }

    return hc<ObjectStorageRouteType>(`${PUBLIC_API_URL}/api/objectStorage`, {
        init: { credentials: 'include' },
        fetch: kyClient,
    })
}

/**
 * @description
 * User RPC Client
 */
export const userClient = hc<UserRouteType>(`${PUBLIC_API_URL}/api/user`, {
    init: { credentials: 'include' },
    fetch: kyClient,
})
