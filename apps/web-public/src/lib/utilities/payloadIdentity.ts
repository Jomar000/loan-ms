import canonicalize from 'canonicalize'

export function getPayloadIdentity(payload: unknown): string {
    const identity = canonicalize(payload)
    if (identity === undefined) {
        throw new TypeError('Payload must have a canonical JSON identity.')
    }
    return identity
}
