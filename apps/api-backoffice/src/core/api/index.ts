import { Hono } from 'hono'

import type { THonoInstance } from '../../types.js'
import { apiKeyFeatureGuard } from '../middleware/apiKeyFeatureGuard.js'
import { corsHandler } from '../middleware/corsHandler.js'
import { csrfHandler } from '../middleware/csrfHandler.js'
import {
    initAuthContext,
    initDatabaseContext,
    initObjectStorageContext,
    initRequestContext,
} from '../middleware/initContext.js'
import { mailFeatureGuard } from '../middleware/mailFeatureGuard.js'
import { objectStorageFeatureGuard } from '../middleware/objectStorageFeatureGuard.js'
import { postRoleGuard, roleGuard } from '../middleware/roleGuard.js'
import { wsOriginGuard } from '../middleware/wsOriginGuard.js'
import { adminRoute } from './admin/index.js'
import { auditTrailRoute } from './auditTrail.js'
import { authRoute } from './auth.js'
import { borrowersRoute } from './borrowers.js'
import { collectionsRoute } from './collections.js'
import { companyFundRoute } from './companyFund.js'
import { heartbeatRoute } from './heartbeat.js'
import { loansRoute } from './loans.js'
import { objectStorageRoute } from './objectStorage/index.js'
import { overdueRoute } from './overdue.js'
import { paymentsRoute } from './payments.js'
import { renewalsRoute } from './renewals.js'
import { reportsRoute } from './reports.js'
import { settingsRoute } from './settings.js'
import { userRoute } from './user/index.js'
import { v1Route } from './v1/index.js'
import { wsRoute } from './ws.js'

/** Routes using CORS and CSRF protection. */
const securityApiRoutePatterns = [
    '/admin/*',
    '/auditTrail/*',
    '/auth/*',
    '/borrowers/*',
    '/collections/*',
    '/companyFund/*',
    '/loans/*',
    '/objectStorage/*',
    '/overdue/*',
    '/payments/*',
    '/renewals/*',
    '/reports/*',
    '/settings/*',
    '/user/*',
] as const

/** Routes receiving shared request, database, and auth context at the API root. */
const contextApiRoutePatterns = [
    '/admin/*',
    '/auditTrail/*',
    '/borrowers/*',
    '/collections/*',
    '/companyFund/*',
    '/loans/*',
    '/objectStorage/*',
    '/overdue/*',
    '/payments/*',
    '/renewals/*',
    '/reports/*',
    '/settings/*',
    '/user/*',
    '/ws/*',
] as const

/** Routes that initiate outbound mail. */
const mailApiRoutePatterns = [
    '/admin/user/password/resetRequest',
    '/auth/password/resetRequest',
] as const

export const apiRoute = new Hono<THonoInstance>().use('/ws/*', wsOriginGuard())

for (const routePattern of securityApiRoutePatterns) {
    apiRoute.use(routePattern, corsHandler('default'))
}

for (const routePattern of mailApiRoutePatterns) {
    apiRoute.use(routePattern, mailFeatureGuard())
}

apiRoute
    .use('/admin/servicePrincipal/*', apiKeyFeatureGuard())
    .use('/objectStorage/*', objectStorageFeatureGuard())

for (const routePattern of securityApiRoutePatterns) {
    apiRoute.use(routePattern, csrfHandler())
}

for (const routePattern of contextApiRoutePatterns) {
    apiRoute
        .use(routePattern, initRequestContext())
        .use(routePattern, initDatabaseContext())
        .use(routePattern, initAuthContext())
}

// Viewer/Auditor roles are read-only; Cashier and Collector may not mutate
// operational records outside the dedicated payment and collection routes.
for (const routePattern of [
    '/admin/*',
    '/borrowers/*',
    '/companyFund/*',
    '/loans/*',
    '/renewals/*',
    '/settings/*',
] as const) {
    apiRoute.use(
        routePattern,
        postRoleGuard([
            'owner',
            'admin',
        ]),
    )
}

for (const routePattern of [
    '/overdue/*',
    '/reports/*',
] as const) {
    apiRoute.use(
        routePattern,
        roleGuard([
            'owner',
            'admin',
            'viewer',
            'auditor',
        ]),
    )
}

apiRoute
    .use('/objectStorage/*', initObjectStorageContext())
    /**
     * @description
     * Routes
     */
    .route('/admin', adminRoute)
    .route('/auditTrail', auditTrailRoute)
    .route('/auth', authRoute)
    .route('/borrowers', borrowersRoute)
    .route('/collections', collectionsRoute)
    .route('/companyFund', companyFundRoute)
    .route('/loans', loansRoute)
    .route('/heartbeat', heartbeatRoute)
    .route('/objectStorage', objectStorageRoute)
    .route('/overdue', overdueRoute)
    .route('/payments', paymentsRoute)
    .route('/renewals', renewalsRoute)
    .route('/reports', reportsRoute)
    .route('/settings', settingsRoute)
    .route('/user', userRoute)
    .route('/v1', v1Route)
    .route('/ws', wsRoute)

export default apiRoute
