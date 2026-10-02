import { v7 as uuidv7 } from 'uuid'

import { getPayloadIdentity } from './payloadIdentity.js'

export const createIdempotencyKeyLifecycle = (
    createKey: () => string = uuidv7,
) => {
    let current = createKey()
    let claimedPayloadIdentity: string | undefined

    function reset() {
        current = createKey()
        claimedPayloadIdentity = undefined
    }

    return {
        get current() {
            return current
        },
        abandonAttempt: reset,
        confirmSuccess: reset,
        claim(payload: unknown) {
            const nextIdentity = getPayloadIdentity(payload)
            if (
                claimedPayloadIdentity !== undefined &&
                claimedPayloadIdentity !== nextIdentity
            ) {
                return {
                    ok: false as const,
                    reason: 'payload-mismatch' as const,
                }
            }
            claimedPayloadIdentity = nextIdentity
            return { key: current, ok: true as const }
        },
    }
}
