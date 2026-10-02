import { describe, expect, it } from 'vitest'

import {
    getCsrfCookieName,
    getSessionCookieName,
} from '../../src/auth/cookies.js'

describe('Cookie hardening', () => {
    it.each([
        [
            'production',
            '__Host-session_token',
            '__Host-csrf_token',
        ],
        [
            'staging',
            '__Host-staging_session_token',
            '__Host-staging_csrf_token',
        ],
        [
            'test',
            '__Host-test_session_token',
            '__Host-test_csrf_token',
        ],
        [
            'development',
            '__Host-development_session_token',
            '__Host-development_csrf_token',
        ],
    ] as const)(
        'maps %s cookie names',
        (environment, sessionCookieName, csrfCookieName) => {
            expect(getSessionCookieName(environment)).toBe(sessionCookieName)
            expect(getCsrfCookieName(environment)).toBe(csrfCookieName)
        },
    )
})

// =============================================================================
// END OF BASE TEMPLATE TESTS - FORK-SPECIFIC TESTS MUST BE ADDED BELOW
// =============================================================================
