import { serializeError } from '@hyperion/errors'
import {
    realtimePublicationDeliveryResultSchema,
    resolveRealtimePublication,
    type TRealtimePublicationAudience,
    type TRealtimePublicationDeliveryResult,
    type TRealtimePublicationDescriptor,
    type TRealtimePublicationOrigin,
    type TRealtimePublisher,
} from '@hyperion/websocket/publisher'
import type { TRealtimeRegistry } from '@hyperion/websocket/registry'
import {
    getRealtimeEventDestinations,
    type TRealtimeSurface,
    type TRealtimeTopologyProfile,
} from '@hyperion/websocket/topology'
import { createRealtimeBrokerObjectName } from '@hyperion/websocket/transport'

import type { WebSocketBroker } from '../../core/durableObject/webSocket.js'
import {
    BACKOFFICE_REALTIME_SURFACE,
    BACKOFFICE_REALTIME_TOPOLOGY,
    backofficeRealtimeRegistry,
} from './configuration.js'

export type TBackofficeRealtimePublicationMetadata = {
    audience: TRealtimePublicationAudience
    event: string
    eventId: string
    occurredAt: string
    organizationId: string
    stream: string
    target: string | null
}

export type TBackofficeRealtimePublicationOutcome =
    | {
          accepted: true
          delivery: 'local' | 'remote'
          result: Extract<
              TRealtimePublicationDeliveryResult,
              { accepted: true }
          >
          surface: TRealtimeSurface
      }
    | {
          accepted: false
          code: string
          delivery: 'local' | 'remote'
          error?: string
          surface: TRealtimeSurface
      }

export type TBackofficeRealtimePublicationResult = {
    complete: boolean
    deliveries: readonly TBackofficeRealtimePublicationOutcome[]
    eventId: string
}

const PROJECTION_FAILED_MESSAGE = 'Realtime payload projection failed.'
const PUBLICATION_FAILED_MESSAGE = 'Realtime publication failed.'

const logRealtimePublicationFailure = (entry: Record<string, unknown>) => {
    try {
        console.error(JSON.stringify(entry))
    } catch {
        // Observability must never affect the completed business operation.
    }
}

export const scheduleBackofficeRealtimePublications = (input: {
    operation: string
    publications: readonly Promise<TBackofficeRealtimePublicationResult>[]
    waitUntil: (promise: Promise<unknown>) => void
}) => {
    const observed = Promise.allSettled(input.publications).then((outcomes) => {
        for (const outcome of outcomes) {
            if (outcome.status === 'rejected') {
                // Serialized first: a database `code` must not replace the event code.
                logRealtimePublicationFailure({
                    ...serializeError(outcome.reason),
                    type: 'REALTIME_PUBLISH_ERROR',
                    metric: 'realtime.publish.failure',
                    operation: input.operation,
                    destination: 'unknown',
                    code: 'PROMISE_REJECTED',
                    delivery: 'unknown',
                })
                continue
            }

            for (const delivery of outcome.value.deliveries) {
                if (delivery.accepted) continue
                logRealtimePublicationFailure({
                    type: 'REALTIME_PUBLISH_ERROR',
                    metric: 'realtime.publish.failure',
                    operation: input.operation,
                    destination: delivery.surface,
                    code: delivery.code,
                    delivery: delivery.delivery,
                    message: delivery.error,
                })
            }
        }
    })

    try {
        input.waitUntil(observed)
    } catch {
        void observed
    }
}

export const publishBackofficeRealtimeLocally = async (input: {
    descriptor: TRealtimePublicationDescriptor
    namespace: DurableObjectNamespace<WebSocketBroker>
    origin: TRealtimePublicationOrigin
    profile?: TRealtimeTopologyProfile
    registry?: TRealtimeRegistry
}): Promise<TRealtimePublicationDeliveryResult> => {
    const resolution = resolveRealtimePublication({
        descriptor: input.descriptor,
        localSurface: BACKOFFICE_REALTIME_SURFACE,
        origin: input.origin,
        profile: input.profile ?? BACKOFFICE_REALTIME_TOPOLOGY,
        registry: input.registry ?? backofficeRealtimeRegistry,
    })

    if (!resolution.accepted) return resolution

    return input.namespace
        .getByName(createRealtimeBrokerObjectName(resolution.brokerInput.scope))
        .publishRealtime(resolution.brokerInput)
}

export const publishBackofficeRealtimeAfterCommit = async (input: {
    metadata: TBackofficeRealtimePublicationMetadata
    namespace: DurableObjectNamespace<WebSocketBroker>
    profile?: TRealtimeTopologyProfile
    projectPayload: (destinationSurface: TRealtimeSurface) => unknown
    realtimePublisher?: TRealtimePublisher
    registry?: TRealtimeRegistry
}): Promise<TBackofficeRealtimePublicationResult> => {
    const profile = input.profile ?? BACKOFFICE_REALTIME_TOPOLOGY
    const destinations: TRealtimeSurface[] = [
        BACKOFFICE_REALTIME_SURFACE,
        ...getRealtimeEventDestinations(profile, BACKOFFICE_REALTIME_SURFACE),
    ]
    const deliveries = await Promise.all(
        destinations.map(
            async (
                destinationSurface,
            ): Promise<TBackofficeRealtimePublicationOutcome> => {
                const delivery =
                    destinationSurface === BACKOFFICE_REALTIME_SURFACE
                        ? 'local'
                        : 'remote'
                let payload: unknown

                try {
                    payload = input.projectPayload(destinationSurface)
                } catch {
                    return {
                        accepted: false,
                        code: 'PROJECTION_FAILED',
                        delivery,
                        error: PROJECTION_FAILED_MESSAGE,
                        surface: destinationSurface,
                    }
                }

                const descriptor: TRealtimePublicationDescriptor = {
                    ...input.metadata,
                    destinationSurface,
                    payload,
                    sourceSurface: BACKOFFICE_REALTIME_SURFACE,
                }

                if (delivery === 'remote' && !input.realtimePublisher) {
                    return {
                        accepted: false,
                        code: 'CAPABILITY_UNAVAILABLE',
                        delivery,
                        surface: destinationSurface,
                    }
                }

                try {
                    const rawResult =
                        delivery === 'local'
                            ? await publishBackofficeRealtimeLocally({
                                  descriptor,
                                  namespace: input.namespace,
                                  origin: 'local',
                                  profile,
                                  registry: input.registry,
                              })
                            : await input.realtimePublisher!.publishRealtimePublication(
                                  descriptor,
                              )
                    const result =
                        realtimePublicationDeliveryResultSchema.safeParse(
                            rawResult,
                        )

                    if (!result.success) {
                        return {
                            accepted: false,
                            code: 'RPC_RESULT_INVALID',
                            delivery,
                            surface: destinationSurface,
                        }
                    }

                    return result.data.accepted
                        ? {
                              accepted: true,
                              delivery,
                              result: result.data,
                              surface: destinationSurface,
                          }
                        : {
                              accepted: false,
                              code: result.data.code,
                              delivery,
                              surface: destinationSurface,
                          }
                } catch {
                    return {
                        accepted: false,
                        code:
                            delivery === 'local'
                                ? 'LOCAL_BROKER_UNAVAILABLE'
                                : 'RPC_UNAVAILABLE',
                        delivery,
                        error: PUBLICATION_FAILED_MESSAGE,
                        surface: destinationSurface,
                    }
                }
            },
        ),
    )

    return {
        complete: deliveries.every((delivery) => delivery.accepted),
        deliveries,
        eventId: input.metadata.eventId,
    }
}
