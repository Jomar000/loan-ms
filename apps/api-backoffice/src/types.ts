import type { dbClient, dbSchema } from '@hyperion/database/d1'
import type { AppError, TErrorDefinition } from '@hyperion/errors'
import type {
    createRateLimiter,
    TRateLimitReservation,
} from '@hyperion/rate-limit/client'
import type {
    TBaseHonoBindings,
    TBaseHonoInstance,
    TBaseHonoVariables,
    TApiResponseError,
    TApiKeyAudience,
} from '@hyperion/types/shared'
import type { TRealtimePublisher } from '@hyperion/websocket/publisher'
import type { TRealtimeRevocationBroker } from '@hyperion/websocket/server'
import type { AwsClient } from 'aws4fetch'
import type {
    ClientErrorStatusCode,
    ServerErrorStatusCode,
} from 'hono/utils/http-status'

import type { aclBuilder } from './auth/acl.js'
import type { auth } from './auth/index.js'
import type { TApiKeyBindings } from './config/apiKey.js'
import type { TMailerBindings } from './config/mailer.js'
import type {
    TEnabledObjectStorageConfiguration,
    TObjectStorageBindings,
} from './config/objectStorage.js'
import type { RateLimit } from './core/durableObject/rateLimit.js'
import type {
    WebSocketBroker,
    WebSocketServer,
} from './core/durableObject/webSocket.js'

type TWorkerBindings = Omit<
    Env,
    keyof TApiKeyBindings | keyof TMailerBindings | keyof TObjectStorageBindings
> &
    TApiKeyBindings &
    TMailerBindings &
    TObjectStorageBindings

export type THonoBindings = TBaseHonoBindings<
    {
        CF_DO_RATE_LIMIT_SECRET: string
        HYPERIONBOFC_DO_RL: DurableObjectNamespace<RateLimit>
        HYPERIONBOFC_DO_WSB: DurableObjectNamespace<WebSocketBroker>
        HYPERIONBOFC_DO_WSB_REMOTE_PUB?: TRealtimeRevocationBroker
        HYPERIONBOFC_DO_WSS: DurableObjectNamespace<WebSocketServer>
        HYPERIONBOFC_D1: D1Database
        HYPERIONBOFC_KV: KVNamespace
        HYPERIONBOFC_REALTIME_PUBLISHER_PUB?: TRealtimePublisher
    } & TWorkerBindings
>

export type THonoVariables = TBaseHonoVariables<{
    acl: Awaited<ReturnType<typeof aclBuilder>>
    auth: Awaited<ReturnType<typeof auth>>
    authRateLimitDecision:
        | {
              allowed: true
              bypassed: true
              scopes: readonly string[]
          }
        | {
              allowed: true
              bypassed: false
              limiter: ReturnType<typeof createRateLimiter>
              reservations: readonly TRateLimitReservation[]
              scopes: readonly string[]
          }
        | null
    aws4FetchClient: AwsClient
    apiKeyActor: {
        audience: TApiKeyAudience
        credentialId: string
        name: string
        organizationId: string
        principalPublicId: string
    } | null
    apiKeyPermissions: Record<string, string[]> | null
    correlationId: string | null
    dbClient: ReturnType<typeof dbClient>
    dbSchema: typeof dbSchema
    doWssClient: DurableObjectNamespace<WebSocketServer>
    ipAddress: string
    isPrivilegedRole: boolean
    kvClient: KVNamespace
    objectStorageConfiguration: TEnabledObjectStorageConfiguration
    passwordResetEmailError: AppError | null
    passwordResetEmailSent: boolean
    presentedApiKey: string | null
    role: string
    responseError: TErrorDefinition | null
    responseErrorLogDetail: TErrorLogDetail | null
    sessionAccess: {
        organizationName: string | null
        organizationSlug: string | null
        role: string | null
        websocketAuthorizationVersion: string | null
    } | null
    session:
        Awaited<ReturnType<typeof auth>>['$Infer']['Session']['session'] | null
    sessionResponseHeaders: Headers | null
    user: Awaited<ReturnType<typeof auth>>['$Infer']['Session']['user'] | null
    userAgent: string
}>

export type TErrorLogDetail = {
    category: TErrorDefinition['category']
    internalErrorId: string
    publicCode: TErrorDefinition['code']
    retryable: boolean
    status: TErrorDefinition['status']
}

export type THonoInstance = TBaseHonoInstance<THonoBindings, THonoVariables>

export type TGlobalApiResponses = {
    [status in ClientErrorStatusCode | ServerErrorStatusCode]: {
        json: TApiResponseError
    }
}
