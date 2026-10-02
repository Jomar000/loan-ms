import type { ApiKeyConfigurationOptions } from '@better-auth/api-key'
import { API_KEY_AUDIENCES, type TApiKeyAudience } from '@hyperion/types/shared'
import { customAlphabet } from 'nanoid'

const generateApiKeyCharacters = customAlphabet(
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
)

const API_KEY_PREFIXES = {
    'backoffice-v1': 'bof_',
    'public-v1': 'pub_',
} as const satisfies Record<TApiKeyAudience, string>

export const API_KEY_CONFIGURATIONS = [
    {
        apiKeyHeaders: 'x-api-key',
        configId: 'public-v1',
        customKeyGenerator: ({ length, prefix }) =>
            `${prefix ?? ''}${generateApiKeyCharacters(length)}`,
        defaultKeyLength: 64,
        defaultPrefix: API_KEY_PREFIXES['public-v1'],
        deferUpdates: false,
        disableKeyHashing: false,
        enableMetadata: false,
        enableSessionForAPIKeys: false,
        fallbackToDatabase: false,
        keyExpiration: {
            defaultExpiresIn: null,
            disableCustomExpiresTime: false,
            maxExpiresIn: 365,
            minExpiresIn: 1,
        },
        maximumNameLength: 64,
        minimumNameLength: 1,
        rateLimit: { enabled: false },
        references: 'organization',
        requireName: true,
        startingCharactersConfig: {
            charactersLength: 12,
            shouldStore: true,
        },
        storage: 'database',
    },
    {
        apiKeyHeaders: 'x-api-key',
        configId: 'backoffice-v1',
        customKeyGenerator: ({ length, prefix }) =>
            `${prefix ?? ''}${generateApiKeyCharacters(length)}`,
        defaultKeyLength: 64,
        defaultPrefix: API_KEY_PREFIXES['backoffice-v1'],
        deferUpdates: false,
        disableKeyHashing: false,
        enableMetadata: false,
        enableSessionForAPIKeys: false,
        fallbackToDatabase: false,
        keyExpiration: {
            defaultExpiresIn: null,
            disableCustomExpiresTime: false,
            maxExpiresIn: 365,
            minExpiresIn: 1,
        },
        maximumNameLength: 64,
        minimumNameLength: 1,
        rateLimit: { enabled: false },
        references: 'organization',
        requireName: true,
        startingCharactersConfig: {
            charactersLength: 12,
            shouldStore: true,
        },
        storage: 'database',
    },
] satisfies ApiKeyConfigurationOptions[]

export { API_KEY_AUDIENCES }
