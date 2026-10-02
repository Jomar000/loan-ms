import { Hono } from 'hono'
import type { ApplyGlobalResponse } from 'hono/client'

import type { TGlobalApiResponses, THonoInstance } from '../../../types.js'
import { userRoute } from './user/index.js'

export const adminRoute = new Hono<THonoInstance>()
    /**
     * @description
     * Routes
     */
    .route('/user', userRoute)

export default adminRoute
export type AdminRouteType = ApplyGlobalResponse<
    typeof adminRoute,
    TGlobalApiResponses
>
