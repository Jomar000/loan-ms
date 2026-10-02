import { RateLimitBase } from '@hyperion/rate-limit/server'

type TRateLimitEnvironment = {
    ENVIRONMENT: string
}

export class RateLimit extends RateLimitBase<TRateLimitEnvironment> {}
