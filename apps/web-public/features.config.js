const buildFeatureFlags = {
    __FEATURE_IN_APP_BROWSER_DETECTION__: 'FEATURE_IN_APP_BROWSER_DETECTION',
    __FEATURE_OBJECT_STORAGE__: 'FEATURE_OBJECT_STORAGE',
}

/**
 * @param {Record<string, string | undefined>} environment
 * @returns {Record<string, string>}
 */
export function defineBuildFeatureFlags(environment) {
    return Object.fromEntries(
        Object.entries(buildFeatureFlags).map(
            ([
                constant,
                name,
            ]) => [
                constant,
                JSON.stringify(parseBuildFeatureFlag(environment[name], name)),
            ],
        ),
    )
}

/**
 * @param {string | undefined} value
 * @param {string} name
 * @returns {boolean}
 */
function parseBuildFeatureFlag(value, name) {
    if (value === undefined || value === '0') return false
    if (value === '1') return true

    throw new Error(`${name} must be 0 or 1.`)
}
