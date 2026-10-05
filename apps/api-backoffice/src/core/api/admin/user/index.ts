import { Hono } from 'hono'

import type { THonoInstance } from '../../../../types.js'
import { addressRoute } from './address.js'
import { passwordRoute } from './password.js'
import { profileRoute } from './profile.js'
import { staffRoute } from './staff.js'

export const userRoute = new Hono<THonoInstance>()
    /**
     * @description
     * Routes
     */
    .route('/address', addressRoute)
    .route('/password', passwordRoute)
    .route('/profile', profileRoute)
    .route('/staff', staffRoute)

export default userRoute
