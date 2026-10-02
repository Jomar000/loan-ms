import { Hono } from 'hono'
import type { ApplyGlobalResponse } from 'hono/client'

import type { TGlobalApiResponses, THonoInstance } from '../../types.js'
import { corsHandler } from '../middleware/corsHandler.js'
import { csrfHandler } from '../middleware/csrfHandler.js'

export const heartbeatRoute = new Hono<THonoInstance>()
    /**
     * @description
     * Middleware
     */
    .use(corsHandler('default'))
    .use(csrfHandler())
    /**
     * @description
     * Routes
     */
    .get('/', (ctx) => ctx.body(null, 204))

export default heartbeatRoute
export type HeartbeatRouteType = ApplyGlobalResponse<
    typeof heartbeatRoute,
    TGlobalApiResponses
>
