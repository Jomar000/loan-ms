import { auditTrailGroups } from '@loanms/validator/backoffice/auditTrail'
import { describe, expect, it } from 'vitest'

import { ACTIVITY_LOG_STAT_CARDS } from './config'

describe.concurrent('Activity Log configuration', () => {
    it('defines one ordered quick card for every audit group', () => {
        expect(ACTIVITY_LOG_STAT_CARDS.map(({ key }) => key)).toEqual(
            auditTrailGroups,
        )
    })
})

// =============================================================================
// END OF BASE TEMPLATE TESTS - FORK-SPECIFIC TESTS MUST BE ADDED BELOW
// =============================================================================
