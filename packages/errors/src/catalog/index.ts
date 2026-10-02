import { apiKeyErrors } from './apiKey.js'
import { auditTrailErrors } from './auditTrail.js'
import { authErrors } from './auth.js'
import { commonErrors } from './common.js'
import { notificationErrors } from './notification.js'
import { objectStorageErrors } from './objectStorage.js'
import { realtimeErrors } from './realtime.js'
import { userErrors } from './user.js'

export const catalog = {
    ...apiKeyErrors,
    ...auditTrailErrors,
    ...authErrors,
    ...commonErrors,
    ...notificationErrors,
    ...objectStorageErrors,
    ...realtimeErrors,
    ...userErrors,
} as const

export {
    apiKeyErrors,
    auditTrailErrors,
    authErrors,
    commonErrors,
    notificationErrors,
    objectStorageErrors,
    realtimeErrors,
    userErrors,
}
