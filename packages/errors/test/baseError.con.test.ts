import { describe, expect, it } from 'vitest'

import { AppError, BaseError, catalog } from '../src/index.js'

describe.concurrent('error classes', () => {
    it('preserves BaseError metadata, prototype, and unknown causes', () => {
        const cause = { detail: 'unknown cause' }
        const error = new BaseError(
            {
                category: 'lifecycle',
                id: 'TEST_BASE_ERROR',
                message: 'Base failure.',
                retryable: false,
            },
            { cause },
        )

        expect(error).toBeInstanceOf(Error)
        expect(error).toBeInstanceOf(BaseError)
        expect(error).toMatchObject({
            name: 'BaseError',
            id: 'TEST_BASE_ERROR',
            message: 'Base failure.',
            category: 'lifecycle',
            retryable: false,
            cause,
        })
    })

    it('derives AppError public metadata from its catalog definition', () => {
        const cause = 'arbitrary thrown value'
        const error = new AppError(catalog.authenticationUnavailable, {
            cause,
        })

        expect(error).toBeInstanceOf(Error)
        expect(error).toBeInstanceOf(BaseError)
        expect(error).toBeInstanceOf(AppError)
        expect(error).toMatchObject({
            name: 'AppError',
            ...catalog.authenticationUnavailable,
            cause,
        })
    })
})

// =============================================================================
// END OF BASE TEMPLATE TESTS - FORK-SPECIFIC TESTS MUST BE ADDED BELOW
// =============================================================================
