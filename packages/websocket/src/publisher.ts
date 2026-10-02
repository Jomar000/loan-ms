import { z } from 'zod'

import { REALTIME_STORAGE_VERSION } from './constants.js'
import {
    realtimeEventFrameSchema,
    realtimeEventNameSchema,
    realtimePublicationAudienceSchema,
    realtimePublicationDescriptorSchema,
    realtimePublicationOrganizationSchema,
    realtimePublicationStreamSchema,
    realtimePublicationTargetInputSchema,
    realtimeSurfaceSchema,
} from './schemas.js'
import { getRealtimeEventDestinations } from './topology.js'
import type {
    TBrokerRealtimePublishInput,
    TRealtimePublicationDescriptor,
    TRealtimePublicationOrigin,
    TRealtimePublicationResolution,
    TRealtimeRegistry,
    TRealtimeSurface,
    TRealtimeTopologyProfile,
} from './types.js'

const realtimePublicationObjectSchema = z.looseObject({})

export {
    realtimePublicationAudienceSchema,
    realtimePublicationDeliveryResultSchema,
    realtimePublicationDescriptorSchema,
} from './schemas.js'
export type {
    TRealtimePublicationAudience,
    TRealtimePublicationDeliveryResult,
    TRealtimePublicationDescriptor,
    TRealtimePublicationOrigin,
    TRealtimePublicationRejectionCode,
    TRealtimePublicationResolution,
    TRealtimePublisher,
} from './types.js'

export const isRealtimePublicationRouteAllowed = (input: {
    destinationSurface: TRealtimeSurface
    profile: TRealtimeTopologyProfile
    sourceSurface: TRealtimeSurface
}) => {
    if (input.sourceSurface === input.destinationSurface) {
        getRealtimeEventDestinations(input.profile, input.sourceSurface)
        return true
    }

    return getRealtimeEventDestinations(
        input.profile,
        input.sourceSurface,
    ).includes(input.destinationSurface)
}

export const resolveRealtimePublication = (input: {
    descriptor: unknown
    localSurface: TRealtimeSurface
    origin: TRealtimePublicationOrigin
    profile: TRealtimeTopologyProfile
    registry: TRealtimeRegistry
}): TRealtimePublicationResolution => {
    const rawInput = input.descriptor
    const parsedInput = realtimePublicationObjectSchema.safeParse(rawInput)

    if (!parsedInput.success) {
        return { accepted: false, code: 'FRAME_INVALID' }
    }

    const candidate =
        parsedInput.data as Partial<TRealtimePublicationDescriptor>

    const sourceSurface = realtimeSurfaceSchema.safeParse(
        candidate.sourceSurface,
    )

    if (!sourceSurface.success) {
        return { accepted: false, code: 'INVALID_SOURCE' }
    }

    const destinationSurface = realtimeSurfaceSchema.safeParse(
        candidate.destinationSurface,
    )

    if (!destinationSurface.success) {
        return { accepted: false, code: 'INVALID_DESTINATION' }
    }

    if (destinationSurface.data !== input.localSurface) {
        return { accepted: false, code: 'DESTINATION_MISMATCH' }
    }

    if (
        (input.origin === 'local' &&
            sourceSurface.data !== input.localSurface) ||
        (input.origin === 'peer' && sourceSurface.data === input.localSurface)
    ) {
        return { accepted: false, code: 'SOURCE_MISMATCH' }
    }

    try {
        if (
            !isRealtimePublicationRouteAllowed({
                destinationSurface: destinationSurface.data,
                profile: input.profile,
                sourceSurface: sourceSurface.data,
            })
        ) {
            return { accepted: false, code: 'ROUTE_NOT_ALLOWED' }
        }
    } catch {
        return { accepted: false, code: 'ROUTE_NOT_ALLOWED' }
    }

    const parsedDescriptor =
        realtimePublicationDescriptorSchema.safeParse(candidate)

    if (!parsedDescriptor.success) {
        if (
            !realtimePublicationOrganizationSchema.safeParse(
                candidate.organizationId,
            ).success
        ) {
            return { accepted: false, code: 'INVALID_ORGANIZATION' }
        }

        const streamName = realtimePublicationStreamSchema.safeParse(
            candidate.stream,
        )

        if (!streamName.success || !input.registry.getStream(streamName.data)) {
            return { accepted: false, code: 'INVALID_STREAM' }
        }

        const stream = input.registry.getStream(streamName.data)!
        const eventName = realtimeEventNameSchema.safeParse(candidate.event)

        if (
            !eventName.success ||
            !input.registry.getEvent(stream.wireName, eventName.data)
        ) {
            return { accepted: false, code: 'INVALID_EVENT' }
        }

        const event = input.registry.getEvent(stream.wireName, eventName.data)!

        if (
            !realtimeEventFrameSchema.shape.eventId.safeParse(candidate.eventId)
                .success
        ) {
            return { accepted: false, code: 'INVALID_EVENT_ID' }
        }

        if (
            !realtimeEventFrameSchema.shape.occurredAt.safeParse(
                candidate.occurredAt,
            ).success
        ) {
            return { accepted: false, code: 'INVALID_TIMESTAMP' }
        }

        const audience = realtimePublicationAudienceSchema.safeParse(
            candidate.audience,
        )

        if (
            !audience.success ||
            !event.audiences.includes(audience.data.kind)
        ) {
            return { accepted: false, code: 'INVALID_AUDIENCE' }
        }

        if (
            !realtimePublicationTargetInputSchema.safeParse(candidate.target)
                .success
        ) {
            return { accepted: false, code: 'INVALID_TARGET' }
        }

        return { accepted: false, code: 'FRAME_INVALID' }
    }

    const descriptor = parsedDescriptor.data
    const stream = input.registry.getStream(descriptor.stream)

    if (!stream) {
        return { accepted: false, code: 'INVALID_STREAM' }
    }

    const event = input.registry.getEvent(stream.wireName, descriptor.event)

    if (!event) {
        return { accepted: false, code: 'INVALID_EVENT' }
    }

    if (!event.audiences.includes(descriptor.audience.kind)) {
        return { accepted: false, code: 'INVALID_AUDIENCE' }
    }

    if (
        (event.delivery === 'organization' && descriptor.target !== null) ||
        (event.delivery === 'target' && descriptor.target === null)
    ) {
        return { accepted: false, code: 'INVALID_TARGET' }
    }

    let target = descriptor.target

    if (target !== null) {
        const normalizedTarget = input.registry.normalizeTarget(
            stream.wireName,
            target,
        )

        if (!normalizedTarget.success) {
            return { accepted: false, code: 'INVALID_TARGET' }
        }

        target = normalizedTarget.target
    }

    const audience =
        descriptor.audience.kind === 'identity'
            ? {
                  identityIds: [...descriptor.audience.identityIds],
                  kind: 'identity' as const,
              }
            : descriptor.audience.kind === 'role'
              ? {
                    kind: 'role' as const,
                    roles: [...descriptor.audience.roles],
                }
              : { kind: 'organization' as const }

    const brokerInput: TBrokerRealtimePublishInput = {
        audience,
        event: descriptor.event,
        eventId: descriptor.eventId,
        occurredAt: descriptor.occurredAt,
        payload: descriptor.payload,
        scope: {
            organizationId: descriptor.organizationId,
            storageVersion: REALTIME_STORAGE_VERSION,
            stream: stream.wireName,
            surface: descriptor.destinationSurface,
        },
        target,
    }

    return {
        accepted: true,
        brokerInput,
        descriptor: {
            audience: descriptor.audience,
            destinationSurface: descriptor.destinationSurface,
            event: descriptor.event,
            eventId: descriptor.eventId,
            occurredAt: descriptor.occurredAt,
            organizationId: descriptor.organizationId,
            payload: descriptor.payload,
            sourceSurface: descriptor.sourceSurface,
            stream: stream.wireName,
            target,
        },
    }
}
