import { parseFeatureFlag } from './featureFlag.js'

const API_KEY_FEATURE_FLAG = 'FEATURE_API_KEY'

export type TApiKeyBindings = {
    FEATURE_API_KEY?: 0 | 1 | '0' | '1'
}

type TApiKeyEnvironment = {
    FEATURE_API_KEY?: unknown
}

export function isApiKeyFeatureEnabled(environment: object) {
    return parseFeatureFlag(
        (environment as TApiKeyEnvironment).FEATURE_API_KEY,
        API_KEY_FEATURE_FLAG,
    )
}

export function validateApiKeyStartupConfiguration(environment: object) {
    isApiKeyFeatureEnabled(environment)
}
