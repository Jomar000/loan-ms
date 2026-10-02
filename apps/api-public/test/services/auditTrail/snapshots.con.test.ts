import { AppError } from '@loanms/errors'
import { describe, expect, it, vi } from 'vitest'

import { projectAuditRecord } from '../../../src/services/auditTrail/snapshots.js'

function expectPreparationFailure(
    callback: () => unknown,
    causeMessage: string,
) {
    try {
        callback()
        throw new Error('Expected audit record preparation to fail.')
    } catch (error) {
        expect(error).toBeInstanceOf(AppError)
        expect(error).toMatchObject({
            code: 'AUDIT_TRAIL_RECORD_PREPARATION_FAILED',
            message: 'Audit trail record preparation failed.',
            retryable: false,
            status: 500,
        })
        if (!(error instanceof AppError)) return
        expect(error.cause).toBeInstanceOf(Error)
        expect((error.cause as Error).message).toBe(causeMessage)
    }
}

describe.concurrent('Public audit snapshot projector', () => {
    it('keeps current address fields and excludes unreviewed values.', () => {
        expect(
            projectAuditRecord({
                table: 'user_address',
                id: 'address-id',
                newData: {
                    administrativeArea: 'Metro Manila',
                    dependentLocality: 'Barangay 1',
                    locality: 'Manila',
                    secret: 'must-not-persist',
                },
            }).newData,
        ).toEqual({
            administrativeArea: 'Metro Manila',
            dependentLocality: 'Barangay 1',
            locality: 'Manila',
        })
    })

    it('rejects top-level accessors without invoking them.', () => {
        const getter = vi.fn(() => 'must-not-read')
        const newData: Record<string, unknown> = {}
        Object.defineProperty(newData, 'addressLine1', {
            enumerable: true,
            get: getter,
        })

        expectPreparationFailure(
            () =>
                projectAuditRecord({
                    table: 'user_address',
                    id: 'address-id',
                    newData,
                }),
            'Audit snapshot inputs must not contain accessor properties.',
        )
        expect(getter).not.toHaveBeenCalled()
    })

    it('rejects non-plain and circular allowlisted values.', () => {
        expectPreparationFailure(
            () =>
                projectAuditRecord({
                    table: 'user_address',
                    id: 'address-id',
                    newData: new (class AddressSnapshot {
                        addressLine1 = 'must-not-read'
                    })() as unknown as Record<string, unknown>,
                }),
            'Audit values must contain only plain objects and arrays.',
        )

        const circular: Record<string, unknown> = {}
        circular.self = circular
        expectPreparationFailure(
            () =>
                projectAuditRecord({
                    table: 'user_address',
                    id: 'address-id',
                    newData: { addressLine1: circular },
                }),
            'Audit values must not contain circular references.',
        )
    })
})

// =============================================================================
// END OF BASE TEMPLATE TESTS - FORK-SPECIFIC TESTS MUST BE ADDED BELOW
// =============================================================================
