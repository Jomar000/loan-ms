import { Hono } from 'hono'
import type { ApplyGlobalResponse } from 'hono/client'

import type { TGlobalApiResponses, THonoInstance } from '../../../types.js'
import { servicePrincipalRoute } from './servicePrincipal.js'
import { userRoute } from './user/index.js'

export const adminRoute = new Hono<THonoInstance>()
    /**
     * @description
     * Routes
     */
    .route('/servicePrincipal', servicePrincipalRoute)
    .route('/user', userRoute)

export default adminRoute
export type AdminRouteType = ApplyGlobalResponse<
    typeof adminRoute,
    TGlobalApiResponses
>
