export function parseFeatureFlag(value: unknown, name: string) {
    if (value === undefined || value === 0 || value === '0') return false
    if (value === 1 || value === '1') return true

    throw new Error(`${name} must be 0 or 1.`)
}
