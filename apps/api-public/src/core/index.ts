import { dbClient } from '@loanms/database/d1'
import { catalog } from '@loanms/errors'
import { env } from 'cloudflare:workers'
import { Hono } from 'hono'
import { requestId } from 'hono/request-id'
import { v7 as uuidv7 } from 'uuid'

import { validateApiKeyStartupConfiguration } from '../config/apiKey.js'
import { validateMailerStartupConfiguration } from '../config/mailer.js'
import { validateObjectStorageStartupConfiguration } from '../config/objectStorage.js'
import { recoverPublicRealtimeRevocations } from '../services/realtime/authorization.js'
import { validatePublicRealtimeStartupConfiguration } from '../services/realtime/configuration.js'
import type { THonoInstance } from '../types.js'
import { apiResponseErrorWrapper } from '../utilities/helpers.js'
import { apiRoute } from './api/index.js'
import { RateLimit } from './durableObject/rateLimit.js'
import { WebSocketBroker, WebSocketServer } from './durableObject/webSocket.js'
import { errorHandler } from './errorHandler.js'
import { requestTimer } from './middleware/requestTimer.js'
import { RealtimePublisher } from './workerEntrypoint/realtimePublisher.js'
import { RealtimeRevocationBroker } from './workerEntrypoint/realtimeRevocationBroker.js'

validatePublicRealtimeStartupConfiguration(env)
validateApiKeyStartupConfiguration(env)
validateMailerStartupConfiguration(env)
validateObjectStorageStartupConfiguration(env)

export const app = new Hono<THonoInstance>()
    /**
     * @description
     * Error Handler
     */
    .onError(errorHandler)
    /**
     * @description
     * Middleware
     */
    .use(
        requestId({
            headerName: '',
            generator: () => uuidv7(),
        }),
    )
    .use(requestTimer)
    .use(async (ctx, next) => {
        if (ctx.env.STATUS !== 'up') {
            return apiResponseErrorWrapper(ctx, catalog.serviceUnavailable)
        }

        await next()
    })
    /**
     * @description
     * Routes
     */
    .route('/api', apiRoute)

const worker = Object.assign(app, {
    scheduled: (
        _controller: ScheduledController,
        env: THonoInstance['Bindings'],
        executionContext: ExecutionContext,
    ) => {
        const client = dbClient(env.LOANMSPUB_D1)

        executionContext.waitUntil(
            recoverPublicRealtimeRevocations({
                client,
                namespace: env.LOANMSPUB_DO_WSB,
            }),
        )
    },
})

export default worker
export {
    RateLimit,
    RealtimePublisher,
    RealtimeRevocationBroker,
    WebSocketBroker,
    WebSocketServer,
}
