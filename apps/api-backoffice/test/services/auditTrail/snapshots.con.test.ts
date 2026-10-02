import { AppError } from '@loanms/errors'
import type { TAuditEntityType } from '@loanms/validator/backoffice/auditTrail'
import { describe, expect, it, vi } from 'vitest'

import type { TAuditSnapshotPolicy } from '../../../src/services/auditTrail/snapshotPolicy.js'
import {
    createAuditRecordProjector,
    projectAuditRecord,
} from '../../../src/services/auditTrail/snapshots.js'

const extensionPolicy = {
    contextPolicies: {
        account: {
            fieldProjectors: {
                correlationId: (value) =>
                    typeof value === 'string' ? value.toUpperCase() : undefined,
            },
            fields: [
                'correlationId',
                'metadata',
            ],
            required: true,
            validateRecord: ({ context, id }) => {
                if (context.correlationId !== id.toUpperCase()) {
                    throw new Error(
                        'Audit correlation context must identify its record.',
                    )
                }
            },
        },
        user: {
            fields: ['note'],
        },
    },
    labelFields: {
        account: ['providerId'],
    },
    snapshotFields: {
        account: [
            'metadata',
            'providerId',
        ],
    },
    snapshotValueProjectors: {
        account: {
            providerId: (value) => {
                if (typeof value !== 'string') {
                    throw new Error('Audit provider ID must be text.')
                }
                return `provider:${value}`
            },
        },
    },
} as const satisfies TAuditSnapshotPolicy

const projectExtensionAuditRecord =
    createAuditRecordProjector<Record<string, unknown>>(extensionPolicy)

function expectPreparationFailure(
    callback: () => unknown,
    causeMessage?: string,
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
        if (causeMessage) {
            expect(error.cause).toBeInstanceOf(Error)
            expect((error.cause as Error).message).toBe(causeMessage)
        }
    }
}

describe.concurrent('Audit Trail snapshot projectors', () => {
    it('serializes JSON-safe values and rejects unregistered entities', () => {
        const projected = projectAuditRecord({
            table: 'apikey',
            id: 'credential-id',
            newData: {
                expiresAt: new Date('2026-09-03T00:00:00.000Z'),
                key: 'must-not-persist',
                name: 'Automation',
            },
        })

        expect(projected.newData).toEqual({
            expiresAt: '2026-09-03T00:00:00.000Z',
            name: 'Automation',
        })
        expectPreparationFailure(() =>
            projectAuditRecord({ table: 'unknown_entity', id: 'id' }),
        )
    })

    it('omits redacted-only and unchanged snapshots', () => {
        expect(
            projectAuditRecord({
                table: 'user',
                id: 'user-id',
                oldData: { password: '[REDACTED]' },
            }),
        ).not.toHaveProperty('oldData')

        expect(
            projectAuditRecord({
                table: 'user_profile',
                id: 'user-id',
                oldData: { firstName: 'Pat' },
                newData: { firstName: 'Pat' },
            }),
        ).toEqual({
            entityType: 'user_profile',
            table: 'user_profile',
            id: 'user-id',
        })
    })

    it('retains allowlisted fields added and removed by an update', () => {
        expect(
            projectAuditRecord({
                table: 'user_profile',
                id: 'user-id',
                oldData: {
                    firstName: 'Pat',
                    middleName: 'Unchanged',
                },
                newData: {
                    lastName: 'Lee',
                    middleName: 'Unchanged',
                },
            }),
        ).toEqual({
            entityType: 'user_profile',
            table: 'user_profile',
            id: 'user-id',
            oldData: { firstName: 'Pat' },
            newData: { lastName: 'Lee' },
        })
    })

    it('applies extension projectors, labels, and allowlisted context', () => {
        expect(
            projectExtensionAuditRecord({
                table: 'account',
                id: 'account-id',
                context: {
                    correlationId: 'account-id',
                    ignored: 'must-not-persist',
                    metadata: {
                        enabled: true,
                        ignoredBigInt: 1n,
                        ignoredFunction: () => undefined,
                        unsafe: Symbol('must-not-persist'),
                    },
                },
                newData: {
                    metadata: {
                        enabled: true,
                        ignored: undefined,
                    },
                    providerId: 'oauth',
                    secret: 'must-not-persist',
                },
            }),
        ).toEqual({
            entityType: 'account',
            table: 'account',
            id: 'account-id',
            context: {
                correlationId: 'ACCOUNT-ID',
                metadata: { enabled: true },
            },
            label: 'provider:oauth',
            newData: {
                metadata: { enabled: true },
                providerId: 'provider:oauth',
            },
        })
    })

    it('omits optional extension context when absent', () => {
        expect(
            projectExtensionAuditRecord({
                table: 'user',
                id: 'user-id',
                newData: { email: 'user@example.com' },
            }),
        ).not.toHaveProperty('context')
    })

    it('normalizes required, missing, and unsafe context failures', () => {
        expectPreparationFailure(
            () =>
                projectExtensionAuditRecord({
                    table: 'account',
                    id: 'account-id',
                }),
            'Audit account context is required.',
        )
        expectPreparationFailure(
            () =>
                projectExtensionAuditRecord({
                    table: 'account',
                    id: 'account-id',
                    context: { correlationId: 'account-id' },
                }),
            'Audit context metadata is required.',
        )
        expectPreparationFailure(
            () =>
                projectExtensionAuditRecord({
                    table: 'user',
                    id: 'user-id',
                    context: { note: Symbol('unsafe') },
                }),
            'Audit context note must be JSON-safe.',
        )
    })

    it('normalizes extension projector and record validation failures', () => {
        expectPreparationFailure(
            () =>
                projectExtensionAuditRecord({
                    table: 'account',
                    id: 'account-id',
                    context: {
                        correlationId: 'another-id',
                        metadata: {},
                    },
                }),
            'Audit correlation context must identify its record.',
        )
        expectPreparationFailure(
            () =>
                projectExtensionAuditRecord({
                    table: 'account',
                    id: 'account-id',
                    context: {
                        correlationId: 'account-id',
                        metadata: {},
                    },
                    newData: { providerId: 42 },
                }),
            'Audit provider ID must be text.',
        )
    })

    it('rejects non-finite and circular generic snapshot values', () => {
        const context = {
            correlationId: 'account-id',
            metadata: {},
        }
        for (const metadata of [
            Number.NaN,
            { score: Number.POSITIVE_INFINITY },
        ]) {
            expectPreparationFailure(
                () =>
                    projectExtensionAuditRecord({
                        table: 'account',
                        id: 'account-id',
                        context,
                        newData: { metadata },
                    }),
                'Audit values must contain only finite numbers.',
            )
        }

        const circular: Record<string, unknown> = {}
        circular.self = circular
        expectPreparationFailure(
            () =>
                projectExtensionAuditRecord({
                    table: 'account',
                    id: 'account-id',
                    context,
                    newData: { metadata: circular },
                }),
            'Audit values must not contain circular references.',
        )
    })

    it('rejects accessors without invoking them', () => {
        const nestedGetter = vi.fn(() => 'must-not-read')
        const nestedValue: Record<string, unknown> = {}
        Object.defineProperty(nestedValue, 'secret', {
            enumerable: true,
            get: nestedGetter,
        })

        expectPreparationFailure(
            () =>
                projectExtensionAuditRecord({
                    table: 'account',
                    id: 'account-id',
                    context: {
                        correlationId: 'account-id',
                        metadata: {},
                    },
                    newData: { metadata: nestedValue },
                }),
            'Audit values must not contain accessor properties.',
        )
        expect(nestedGetter).not.toHaveBeenCalled()

        const inputGetter = vi.fn(() => nestedValue)
        const newData: Record<string, unknown> = {}
        Object.defineProperty(newData, 'metadata', {
            enumerable: true,
            get: inputGetter,
        })
        expectPreparationFailure(
            () =>
                projectExtensionAuditRecord({
                    table: 'account',
                    id: 'account-id',
                    context: {
                        correlationId: 'account-id',
                        metadata: {},
                    },
                    newData,
                }),
            'Audit snapshot inputs must not contain accessor properties.',
        )
        expect(inputGetter).not.toHaveBeenCalled()

        const contextGetter = vi.fn(() => nestedValue)
        const context: Record<string, unknown> = {
            correlationId: 'account-id',
        }
        Object.defineProperty(context, 'metadata', {
            enumerable: true,
            get: contextGetter,
        })
        expectPreparationFailure(
            () =>
                projectExtensionAuditRecord({
                    table: 'account',
                    id: 'account-id',
                    context,
                }),
            'Audit context inputs must not contain accessor properties.',
        )
        expect(contextGetter).not.toHaveBeenCalled()
    })

    it('rejects custom prototypes and excessive traversal', () => {
        const customPrototypeValue = Object.assign(
            Object.create({ inherited: true }) as Record<string, unknown>,
            { safe: true },
        )
        const context = {
            correlationId: 'account-id',
            metadata: {},
        }

        expectPreparationFailure(
            () =>
                projectExtensionAuditRecord({
                    table: 'account',
                    id: 'account-id',
                    context,
                    newData: { metadata: customPrototypeValue },
                }),
            'Audit values must contain only plain objects and arrays.',
        )

        const deeplyNested: Record<string, unknown> = {}
        let cursor = deeplyNested
        for (let depth = 0; depth <= 32; depth += 1) {
            const next: Record<string, unknown> = {}
            cursor.next = next
            cursor = next
        }
        expectPreparationFailure(
            () =>
                projectExtensionAuditRecord({
                    table: 'account',
                    id: 'account-id',
                    context,
                    newData: { metadata: deeplyNested },
                }),
            'Audit values exceed the supported size or nesting depth.',
        )
        expectPreparationFailure(
            () =>
                projectExtensionAuditRecord({
                    table: 'account',
                    id: 'account-id',
                    context,
                    newData: {
                        metadata: Array.from({ length: 10_000 }, () => null),
                    },
                }),
            'Audit values exceed the supported size or nesting depth.',
        )
    })

    it('accepts repeated references that are not circular', () => {
        const shared = { enabled: true }

        expect(
            projectExtensionAuditRecord({
                table: 'account',
                id: 'account-id',
                context: {
                    correlationId: 'account-id',
                    metadata: {
                        first: shared,
                        second: shared,
                    },
                },
            }).context,
        ).toEqual({
            correlationId: 'ACCOUNT-ID',
            metadata: {
                first: { enabled: true },
                second: { enabled: true },
            },
        })
    })

    it('recursively validates custom projector output', () => {
        const unsafeProjector = createAuditRecordProjector<
            Record<string, unknown>
        >({
            ...extensionPolicy,
            snapshotValueProjectors: {
                account: {
                    providerId: () => ({ nested: Number.NaN }) as never,
                },
            },
        })

        expectPreparationFailure(
            () =>
                unsafeProjector({
                    table: 'account',
                    id: 'account-id',
                    context: {
                        correlationId: 'account-id',
                        metadata: {},
                    },
                    newData: { providerId: 'oauth' },
                }),
            'Audit snapshot projector account.providerId must return a JSON-safe value.',
        )
    })

    it('rejects accessor-bearing custom projector output without invoking it', () => {
        const getter = vi.fn(() => 'must-not-read')
        const projectedValue: Record<string, unknown> = {}
        Object.defineProperty(projectedValue, 'secret', {
            enumerable: true,
            get: getter,
        })
        const unsafeProjector = createAuditRecordProjector<
            Record<string, unknown>
        >({
            ...extensionPolicy,
            snapshotValueProjectors: {
                account: {
                    providerId: () => projectedValue as never,
                },
            },
        })

        expectPreparationFailure(
            () =>
                unsafeProjector({
                    table: 'account',
                    id: 'account-id',
                    context: {
                        correlationId: 'account-id',
                        metadata: {},
                    },
                    newData: { providerId: 'oauth' },
                }),
            'Audit snapshot projector account.providerId must return a JSON-safe value.',
        )
        expect(getter).not.toHaveBeenCalled()
    })

    it('rejects invalid extension policy configuration at construction', () => {
        expect(() =>
            createAuditRecordProjector({
                ...extensionPolicy,
                snapshotFields: { typo_entity: ['name'] },
            } as unknown as TAuditSnapshotPolicy<TAuditEntityType>),
        ).toThrow(
            'Audit snapshot policy snapshotFields contains unknown entity typo_entity.',
        )
        expect(() =>
            createAuditRecordProjector({
                ...extensionPolicy,
                snapshotFields: {
                    account: [
                        'providerId',
                        'providerId',
                    ],
                },
            }),
        ).toThrow(
            'Audit snapshot policy snapshotFields for account contains duplicate field providerId.',
        )
        expect(() =>
            createAuditRecordProjector({
                ...extensionPolicy,
                labelFields: { account: ['notAllowed'] },
            }),
        ).toThrow(
            'Audit label field account.notAllowed is not snapshot-allowlisted.',
        )
        expect(() =>
            createAuditRecordProjector({
                ...extensionPolicy,
                snapshotValueProjectors: {
                    account: { notAllowed: () => 'value' },
                },
            }),
        ).toThrow(
            'Audit snapshot projector account.notAllowed is not snapshot-allowlisted.',
        )
        expect(() =>
            createAuditRecordProjector({
                ...extensionPolicy,
                contextPolicies: {
                    ...extensionPolicy.contextPolicies,
                    account: {
                        ...extensionPolicy.contextPolicies.account,
                        fieldProjectors: {
                            notAllowed: () => 'value',
                        },
                    },
                },
            }),
        ).toThrow(
            'Audit context projector account.notAllowed is not context-allowlisted.',
        )
    })
})

// =============================================================================
// END OF BASE TEMPLATE TESTS - FORK-SPECIFIC TESTS MUST BE ADDED BELOW
// =============================================================================
