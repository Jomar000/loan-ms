import { Hono } from 'hono'
import type { ApplyGlobalResponse } from 'hono/client'

import type { TGlobalApiResponses, THonoInstance } from '../../../types.js'
import { downloadRoute } from './download.js'
import { uploadRoute } from './upload.js'
import { uploadAttachmentRoute } from './uploadAttachment.js'

export const objectStorageRoute = new Hono<THonoInstance>()
    /**
     * @description
     * Routes
     */
    .route('/download', downloadRoute)
    .route('/upload', uploadRoute)
    .route('/upload/attachment', uploadAttachmentRoute)

export default objectStorageRoute
export type ObjectStorageRouteType = ApplyGlobalResponse<
    typeof objectStorageRoute,
    TGlobalApiResponses
>
