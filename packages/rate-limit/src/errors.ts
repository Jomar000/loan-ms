import { BaseError, type TErrorOptions } from '@hyperion/errors'

export class RateLimitConfigurationError extends BaseError {
    public override readonly name = 'RateLimitConfigurationError'

    constructor(message: string, options: TErrorOptions = {}) {
        super(
            {
                category: 'configuration',
                id: 'RATE_LIMIT_CONFIGURATION_ERROR',
                message,
                retryable: false,
            },
            options,
        )
    }
}

export class RateLimitUnavailableError extends BaseError {
    public override readonly name = 'RateLimitUnavailableError'

    constructor(message: string, options: TErrorOptions = {}) {
        super(
            {
                category: 'dependency',
                id: 'RATE_LIMIT_UNAVAILABLE',
                message,
                retryable: true,
            },
            options,
        )
    }
}
