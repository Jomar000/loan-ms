import type { AdminRouteType } from '@hyperion/api-public/api/admin'
import type { AuthRouteType } from '@hyperion/api-public/api/auth'
import type { HeartbeatRouteType } from '@hyperion/api-public/api/heartbeat'
import type { ObjectStorageRouteType } from '@hyperion/api-public/api/objectStorage'
import type { UserRouteType } from '@hyperion/api-public/api/user'
import { hc } from 'hono/client'
import ky from 'ky'

import { PUBLIC_API_URL } from '$env/static/public'
import { objectStorageFeatureEnabled } from '$lib/config/objectStorage'
import { AUTH_UNAUTHORIZED_EVENT } from '$lib/states/session/constants'
import { getCookie, getCsrfCookieName } from './utilities/helpers'

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

const CSRF_COOKIE_NAME = getCsrfCookieName(import.meta.env.MODE)

const kyClient = ky.extend({
    throwHttpErrors: false,
    hooks: {
        afterResponse: [
            ({ request, response }) => {
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
export const adminClient = hc<AdminRouteType>(`${PUBLIC_API_URL}/api/admin`, {
    init: { credentials: 'include' },
    fetch: kyClient,
})

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
