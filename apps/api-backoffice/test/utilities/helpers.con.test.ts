import { AppError } from '@loanms/errors'
import type { Context } from 'hono'
import { describe, expect, it, vi } from 'vitest'

import type { THonoInstance } from '../../src/types.js'
import {
    auditTrailLogger,
    canLoginAuthRole,
    hasPrivilegedAuthRole,
    parseAuthRoles,
} from '../../src/utilities/helpers.js'

async function expectAuditError(
    promise: Promise<void>,
    expected: {
        causeMessage?: string
        code:
            'AUDIT_TRAIL_RECORD_PREPARATION_FAILED' | 'AUDIT_TRAIL_WRITE_FAILED'
        message: string
        retryable: boolean
    },
) {
    try {
        await promise
        throw new Error('Expected audit operation to fail.')
    } catch (error) {
        expect(error).toBeInstanceOf(AppError)
        expect(error).toMatchObject({
            code: expected.code,
            message: expected.message,
            retryable: expected.retryable,
            status: 500,
        })
        if (!(error instanceof AppError) || !expected.causeMessage) return
        expect(error.cause).toBeInstanceOf(Error)
        expect((error.cause as Error).message).toBe(expected.causeMessage)
    }
}

describe('Audit helpers', () => {
    it('logs a structured error without rejecting after an audit write failure.', async () => {
        const errorSpy = vi
            .spyOn(console, 'error')
            .mockImplementation(() => undefined)
        const values: Record<string, unknown> = {
            correlationId: 'test-correlation',
            dbClient: {
                insert: () => ({
                    values: async () => {
                        throw new Error(
                            'audit unavailable postgres://user:PRIVATE_PASSWORD@db.internal/app',
                        )
                    },
                }),
            },
            dbSchema: { auditTrail: {} },
            ipAddress: '127.0.0.1',
            requestId: 'test-request',
            session: null,
            user: null,
            userAgent: 'vitest',
        }
        const ctx = {
            env: { ENVIRONMENT: 'test' },
            get: (key: string) => values[key],
            header: vi.fn(),
        } as unknown as Context<THonoInstance>

        try {
            await expect(
                auditTrailLogger(ctx, {
                    action: 'signOut',
                    attribution: {
                        actor: {
                            displayName: 'Anonymous',
                            type: 'anonymous',
                        },
                        organizationId: 'organization-id',
                    },
                    component: 'auth',
                    description: 'Completed external effect',
                }),
            ).resolves.toBeUndefined()

            expect(errorSpy).toHaveBeenCalledOnce()
            expect(JSON.parse(errorSpy.mock.calls[0][0])).toMatchObject({
                type: 'AUDIT_TRAIL_WRITE_ERROR',
                action: 'signOut',
                component: 'auth',
                correlationId: 'test-correlation',
                environment: 'test',
                name: 'AppError',
                message: 'Audit trail write failed.',
                causes: [
                    {
                        name: 'Error',
                        message:
                            'audit unavailable postgres://<redacted>@db.internal/app',
                    },
                ],
                publicCode: 'AUDIT_TRAIL_WRITE_FAILED',
                requestId: 'test-request',
                retryable: true,
                status: 500,
            })
            expect(String(errorSpy.mock.calls[0][0])).not.toContain('PRIVATE_')
            expect(ctx.header).not.toHaveBeenCalled()
        } finally {
            errorSpy.mockRestore()
        }
    })

    it('classifies a best-effort preparation failure without rejecting.', async () => {
        const errorSpy = vi
            .spyOn(console, 'error')
            .mockImplementation(() => undefined)
        const insert = vi.fn()
        const values: Record<string, unknown> = {
            apiKeyActor: null,
            correlationId: 'test-correlation',
            dbClient: { insert },
            dbSchema: { auditTrail: {} },
            requestId: 'test-request',
            session: null,
            user: null,
        }
        const ctx = {
            env: { ENVIRONMENT: 'test' },
            get: (key: string) => values[key],
            header: vi.fn(),
        } as unknown as Context<THonoInstance>

        try {
            await expect(
                auditTrailLogger(ctx, {
                    action: 'signOut',
                    component: 'auth',
                    description: 'Completed external effect',
                }),
            ).resolves.toBeUndefined()

            expect(errorSpy).toHaveBeenCalledOnce()
            expect(JSON.parse(errorSpy.mock.calls[0][0])).toMatchObject({
                type: 'AUDIT_TRAIL_RECORD_PREPARATION_ERROR',
                action: 'signOut',
                component: 'auth',
                correlationId: 'test-correlation',
                name: 'AppError',
                message: 'Audit trail record preparation failed.',
                causes: [
                    {
                        message: 'Audit trail attribution is required.',
                        name: 'Error',
                    },
                ],
                environment: 'test',
                publicCode: 'AUDIT_TRAIL_RECORD_PREPARATION_FAILED',
                requestId: 'test-request',
                retryable: false,
                status: 500,
            })
            expect(insert).not.toHaveBeenCalled()
            expect(ctx.header).not.toHaveBeenCalled()
        } finally {
            errorSpy.mockRestore()
        }
    })

    it('attributes service requests without manufacturing a user identity.', async () => {
        const inserted = vi.fn(async () => undefined)
        const values: Record<string, unknown> = {
            apiKeyActor: {
                audience: 'public-v1',
                credentialId: 'credential-id',
                name: 'Test principal',
                organizationId: 'organization-id',
                principalPublicId: '019936e2-b837-7000-8000-000000000001',
            },
            dbSchema: { auditTrail: {} },
            ipAddress: '127.0.0.1',
            session: null,
            user: null,
            userAgent: 'vitest',
        }
        const ctx = {
            get: (key: string) => values[key],
            header: vi.fn(),
        } as unknown as Context<THonoInstance>
        const transactionClient = {
            insert: () => ({ values: inserted }),
        } as unknown as NonNullable<Parameters<typeof auditTrailLogger>[2]>

        await auditTrailLogger(
            ctx,
            {
                action: 'signOut',
                component: 'auth',
                description: 'Completed service operation',
            },
            transactionClient,
        )

        expect(inserted).toHaveBeenCalledWith(
            expect.objectContaining({
                actorDisplayName: 'Test principal',
                actorIdentifier: '019936e2-b837-7000-8000-000000000001',
                actorType: 'servicePrincipal',
                credentialId: 'credential-id',
                organizationId: 'organization-id',
                servicePrincipalPublicId:
                    '019936e2-b837-7000-8000-000000000001',
                userId: null,
            }),
        )
    })

    it('snapshots the authenticated user identity from context.', async () => {
        const inserted = vi.fn(async () => undefined)
        const values: Record<string, unknown> = {
            apiKeyActor: null,
            dbSchema: { auditTrail: {} },
            ipAddress: '127.0.0.1',
            session: { activeOrganizationId: 'organization-id' },
            role: 'owner',
            user: {
                email: 'user@test.loanms.example',
                id: 'user-id',
                name: 'Test User',
                username: 'test_user',
            },
            userAgent: 'vitest',
        }
        const ctx = {
            get: (key: string) => values[key],
            header: vi.fn(),
        } as unknown as Context<THonoInstance>
        const transactionClient = {
            insert: () => ({ values: inserted }),
        } as unknown as NonNullable<Parameters<typeof auditTrailLogger>[2]>

        await auditTrailLogger(
            ctx,
            {
                action: 'update',
                component: 'user.profile',
                description: 'User profile updated',
            },
            transactionClient,
        )

        expect(inserted).toHaveBeenCalledWith(
            expect.objectContaining({
                actorDisplayName: 'Test User',
                actorIdentifier: 'test_user',
                actorRole: 'owner',
                actorType: 'user',
                organizationId: 'organization-id',
                userId: 'user-id',
            }),
        )
        expect(ctx.header).toHaveBeenCalledWith('Audit-Event-Recorded', 'true')
    })

    it.each([
        {
            actor: {
                displayName: 'Anonymous' as const,
                type: 'anonymous' as const,
            },
            expectedType: 'anonymous',
        },
        {
            actor: {
                displayName: 'LoanMS System',
                identifier: 'daily-retention',
                type: 'system' as const,
            },
            expectedType: 'system',
        },
    ])(
        'persists explicit $expectedType attribution without human IDs.',
        async ({ actor, expectedType }) => {
            const inserted = vi.fn(async () => undefined)
            const values: Record<string, unknown> = {
                dbSchema: { auditTrail: {} },
                ipAddress: null,
                session: null,
                user: null,
                userAgent: null,
            }
            const ctx = {
                get: (key: string) => values[key],
                header: vi.fn(),
            } as unknown as Context<THonoInstance>
            const transactionClient = {
                insert: () => ({ values: inserted }),
            } as unknown as NonNullable<Parameters<typeof auditTrailLogger>[2]>

            await auditTrailLogger(
                ctx,
                {
                    action: 'verifyEmail',
                    attribution: { actor, organizationId: 'organization-id' },
                    component: 'auth',
                    description: 'Email address verified',
                },
                transactionClient,
            )

            expect(inserted).toHaveBeenCalledWith(
                expect.objectContaining({
                    actorDisplayName: actor.displayName,
                    actorIdentifier:
                        'identifier' in actor ? actor.identifier : null,
                    actorType: expectedType,
                    credentialId: null,
                    servicePrincipalPublicId: null,
                    userId: null,
                }),
            )
        },
    )

    it('normalizes explicit transaction audit write failures.', async () => {
        const values: Record<string, unknown> = {
            dbSchema: { auditTrail: {} },
            ipAddress: '127.0.0.1',
            session: null,
            user: null,
            userAgent: 'vitest',
        }
        const ctx = {
            get: (key: string) => values[key],
            header: vi.fn(),
        } as unknown as Context<THonoInstance>
        const transactionClient = {
            insert: () => ({
                values: async () => {
                    throw new Error('transaction audit unavailable')
                },
            }),
        } as unknown as NonNullable<Parameters<typeof auditTrailLogger>[2]>

        await expectAuditError(
            auditTrailLogger(
                ctx,
                {
                    action: 'signOut',
                    attribution: {
                        actor: {
                            displayName: 'Anonymous',
                            type: 'anonymous',
                        },
                        organizationId: 'organization-id',
                    },
                    component: 'auth',
                    description: 'Completed business write',
                },
                transactionClient,
            ),
            {
                causeMessage: 'transaction audit unavailable',
                code: 'AUDIT_TRAIL_WRITE_FAILED',
                message: 'Audit trail write failed.',
                retryable: true,
            },
        )
        expect(ctx.header).not.toHaveBeenCalled()
    })

    it('normalizes audit writer invariant and taxonomy failures.', async () => {
        const insert = vi.fn(async () => undefined)
        const values: Record<string, unknown> = {
            apiKeyActor: null,
            dbSchema: { auditTrail: {} },
            ipAddress: '127.0.0.1',
            session: null,
            user: null,
            userAgent: 'vitest',
        }
        const ctx = {
            get: (key: string) => values[key],
            header: vi.fn(),
        } as unknown as Context<THonoInstance>
        const transactionClient = {
            insert: () => ({ values: insert }),
        } as unknown as NonNullable<Parameters<typeof auditTrailLogger>[2]>
        const attribution = {
            actor: {
                displayName: 'LoanMS System',
                type: 'system' as const,
            },
            organizationId: 'organization-id',
        }
        const baseData = {
            action: 'signOut' as const,
            attribution,
            component: 'auth' as const,
            description: 'Completed business write',
        }
        const cases = [
            {
                causeMessage: 'Audit trail attribution is required.',
                data: { ...baseData, attribution: undefined },
            },
            {
                causeMessage: 'Audit trail organization is required.',
                data: {
                    ...baseData,
                    attribution: { ...attribution, organizationId: ' ' },
                },
            },
            {
                causeMessage: 'Audit trail actor display name is required.',
                data: {
                    ...baseData,
                    attribution: {
                        ...attribution,
                        actor: { displayName: ' ', type: 'system' as const },
                    },
                },
            },
            {
                causeMessage: 'Audit trail description is required.',
                data: { ...baseData, description: ' ' },
            },
            {
                data: { ...baseData, component: 'unknown.component' },
            },
            {
                data: { ...baseData, action: 'unknown.action' },
            },
        ]

        for (const testCase of cases) {
            await expectAuditError(
                auditTrailLogger(
                    ctx,
                    testCase.data as never,
                    transactionClient,
                ),
                {
                    causeMessage: testCase.causeMessage,
                    code: 'AUDIT_TRAIL_RECORD_PREPARATION_FAILED',
                    message: 'Audit trail record preparation failed.',
                    retryable: false,
                },
            )
        }
        expect(insert).not.toHaveBeenCalled()
        expect(ctx.header).not.toHaveBeenCalled()
    })

    it('suppresses unchanged updates and empty record batches.', async () => {
        const insert = vi.fn()
        const ctx = {
            get: vi.fn(),
            header: vi.fn(),
        } as unknown as Context<THonoInstance>
        const transactionClient = {
            insert,
        } as unknown as NonNullable<Parameters<typeof auditTrailLogger>[2]>

        const unchangedUpdate = auditTrailLogger.prepare({
            action: 'update',
            component: 'user.profile',
            description: 'User profile updated',
            records: {
                entityType: 'user_profile',
                id: 'profile-id',
                newData: { firstName: 'Same' },
                oldData: { firstName: 'Same' },
                table: 'user_profile',
            },
        })
        const emptyBatch = auditTrailLogger.prepare({
            action: 'update',
            component: 'user.profile',
            description: 'User profile updated',
            records: [],
        })

        expect(unchangedUpdate).toBeNull()
        expect(emptyBatch).toBeNull()
        await auditTrailLogger(ctx, unchangedUpdate, transactionClient)
        await auditTrailLogger(ctx, emptyBatch, transactionClient)
        expect(insert).not.toHaveBeenCalled()
        expect(ctx.header).not.toHaveBeenCalled()
    })
})

describe.concurrent('Auth role helpers', () => {
    it('parses, trims, and deduplicates well-formed role strings.', () => {
        expect(parseAuthRoles(' owner, admin,member,owner ')).toEqual([
            'owner',
            'admin',
            'member',
        ])
    })

    it('rejects malformed role strings with empty segments.', () => {
        expect(parseAuthRoles('owner,,member')).toEqual([])
        expect(parseAuthRoles('')).toEqual([])
    })

    it.each([
        'owner,member',
        'admin,member',
    ])('recognizes privileged multi-role value %s.', (role) => {
        expect(hasPrivilegedAuthRole(role)).toBe(true)
    })

    it('does not treat non-privileged multi-role values as privileged.', () => {
        expect(hasPrivilegedAuthRole('member')).toBe(false)
    })

    it('allows nonempty parsed roles when no login role allow-list is provided.', () => {
        expect(canLoginAuthRole('owner,member')).toBe(true)
        expect(canLoginAuthRole('')).toBe(false)
    })

    it('allows login when any parsed role exists in the allow-list.', () => {
        expect(canLoginAuthRole('owner,member', ['member'])).toBe(true)
        expect(canLoginAuthRole('admin,member', ['admin'])).toBe(true)
    })

    it('rejects login when no parsed role exists in the allow-list.', () => {
        expect(
            canLoginAuthRole('member', [
                'admin',
                'owner',
            ]),
        ).toBe(false)
    })
})

// =============================================================================
// END OF BASE TEMPLATE TESTS - FORK-SPECIFIC TESTS MUST BE ADDED BELOW
// =============================================================================
