import type { AdminRouteType } from '@loanms/api-backoffice/api/admin'
import type { AuditTrailRouteType } from '@loanms/api-backoffice/api/auditTrail'
import type { AuthRouteType } from '@loanms/api-backoffice/api/auth'
import type { BorrowerRouteType } from '@loanms/api-backoffice/api/borrower'
import type { CollectionRouteType } from '@loanms/api-backoffice/api/collection'
import type { CompanyFundRouteType } from '@loanms/api-backoffice/api/companyFund'
import type { HeartbeatRouteType } from '@loanms/api-backoffice/api/heartbeat'
import type { LoanRouteType } from '@loanms/api-backoffice/api/loan'
import type { ObjectStorageRouteType } from '@loanms/api-backoffice/api/objectStorage'
import type { OverdueRouteType } from '@loanms/api-backoffice/api/overdue'
import type { PaymentRouteType } from '@loanms/api-backoffice/api/payment'
import type { RenewalsRouteType } from '@loanms/api-backoffice/api/renewal'
import type { ReportsRouteType } from '@loanms/api-backoffice/api/report'
import type { SettingsRouteType } from '@loanms/api-backoffice/api/settings'
import type { UserRouteType } from '@loanms/api-backoffice/api/user'
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
 * Borrower RPC Client
 */
export const borrowersClient = hc<BorrowerRouteType>(
    `${PUBLIC_API_URL}/api/borrowers`,
    {
        init: { credentials: 'include' },
        fetch: kyClient,
    },
)

/**
 * @description
 * Loan origination RPC Client
 */
export const loansClient = hc<LoanRouteType>(`${PUBLIC_API_URL}/api/loans`, {
    init: { credentials: 'include' },
    fetch: kyClient,
})

/**
 * @description
 * Payment collection RPC Client
 */
export const paymentsClient = hc<PaymentRouteType>(
    `${PUBLIC_API_URL}/api/payments`,
    {
        init: { credentials: 'include' },
        fetch: kyClient,
    },
)

/**
 * @description
 * Daily collection schedule RPC Client
 */
export const collectionsClient = hc<CollectionRouteType>(
    `${PUBLIC_API_URL}/api/collections`,
    {
        init: { credentials: 'include' },
        fetch: kyClient,
    },
)

/**
 * Company fund and capital ledger RPC client
 */
export const companyFundClient = hc<CompanyFundRouteType>(
    `${PUBLIC_API_URL}/api/companyFund`,
    {
        init: { credentials: 'include' },
        fetch: kyClient,
    },
)

/**
 * Overdue portfolio RPC client
 */
export const overdueClient = hc<OverdueRouteType>(
    `${PUBLIC_API_URL}/api/overdue`,
    {
        init: { credentials: 'include' },
        fetch: kyClient,
    },
)

/**
 * Reconciled reporting RPC client
 */
export const reportsClient = hc<ReportsRouteType>(
    `${PUBLIC_API_URL}/api/reports`,
    {
        init: { credentials: 'include' },
        fetch: kyClient,
    },
)

/**
 * @description
 * Loan renewal RPC Client
 */
export const renewalsClient = hc<RenewalsRouteType>(
    `${PUBLIC_API_URL}/api/renewals`,
    {
        init: { credentials: 'include' },
        fetch: kyClient,
    },
)

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

/**
 * System settings RPC client.
 */
export const settingsClient = hc<SettingsRouteType>(
    `${PUBLIC_API_URL}/api/settings`,
    {
        init: { credentials: 'include' },
        fetch: kyClient,
    },
)
