import { Hono } from 'hono'
import type { ApplyGlobalResponse } from 'hono/client'

import type { TGlobalApiResponses, THonoInstance } from '../../../types.js'
import { addressRoute } from './address.js'
import { notificationRoute } from './notification.js'
import { profileRoute } from './profile.js'

export const userRoute = new Hono<THonoInstance>()
    /**
     * @description
     * Routes
     */
    .route('/address', addressRoute)
    .route('/notification', notificationRoute)
    .route('/profile', profileRoute)

export default userRoute
export type UserRouteType = ApplyGlobalResponse<
    typeof userRoute,
    TGlobalApiResponses
>
