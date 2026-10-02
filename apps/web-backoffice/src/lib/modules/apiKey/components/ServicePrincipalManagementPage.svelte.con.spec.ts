import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-svelte'
import { page, userEvent } from 'vitest/browser'

import ServicePrincipalManagementPage from './ServicePrincipalManagementPage.svelte'

const mocks = vi.hoisted(() => {
    const credential = {
        createdAt: '2026-08-25T00:00:00.000Z',
        expiresAt: '2026-11-23T00:00:00.000Z',
        id: 'credential-id',
        lastVerifiedAt: null,
        name: 'rotation-a',
        start: 'pub_AAAAAAAA',
    }
    const principal = {
        activeCredentialCount: 1,
        audience: 'public-v1' as const,
        description: 'CI automation',
        enabled: true,
        lastVerifiedAt: null,
        name: 'automation',
        permissions: { 'api.public': ['access'] },
        publicId: '019936e2-b837-7000-8000-000000000001',
    }
    const otherPrincipal = {
        ...principal,
        name: 'reporting',
        publicId: '019936e2-b837-7000-8000-000000000004',
    }
    const rawKey = `pub_${'A'.repeat(64)}`
    const createPrincipalInput = vi.fn()
    const createPrincipal = vi.fn(async (input: unknown) => {
        createPrincipalInput(input)
        return principal
    })
    let idempotencyKeySequence = 2

    return {
        abandonIdempotencyAttempt: vi.fn(),
        confirmIdempotencySuccess: vi.fn(),
        idempotencyClaimInput: vi.fn(),
        rejectIdempotencyClaim: false,
        createCredentialInput: vi.fn(),
        credentialCreatePromise: null as Promise<{
            credential: typeof credential
            outcome: 'alreadyIssued' | 'issued'
        }> | null,
        credentialCreateReset: vi.fn(),
        credentialCreateOutcome: 'issued' as 'alreadyIssued' | 'issued',
        credentialCreateShouldFail: false,
        createPrincipal,
        createPrincipalInput,
        credentialListState: {
            data: {
                count: 1,
                data: [credential],
                limit: 10,
                offset: 0,
            },
            error: null as Error | null,
            isError: false,
            isPending: false,
            refetch: vi.fn(async () => undefined),
        },
        disableInput: vi.fn(),
        invalidateQueries: vi.fn(async () => undefined),
        nextIdempotencyKey: vi.fn(() => {
            const suffix = idempotencyKeySequence.toString().padStart(12, '0')
            idempotencyKeySequence += 1
            return `019936e2-b837-7000-8000-${suffix}`
        }),
        onSecret: null as null | ((secret: { key: string }) => void),
        principalListState: {
            data: {
                count: 1,
                data: [principal],
                limit: 10,
                offset: 0,
            },
            error: null as Error | null,
            isError: false,
            isPending: false,
            refetch: vi.fn(async () => undefined),
        },
        toastError: vi.fn(),
        toastSuccess: vi.fn(),
        resetIdempotencyKeys: () => {
            idempotencyKeySequence = 2
        },
        revokeCredentialInput: vi.fn(),
        writeText: vi.fn(async () => undefined),
        credential,
        otherPrincipal,
        principal,
        rawKey,
    }
})

vi.mock('@tanstack/svelte-query', () => ({
    useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }),
}))
vi.mock('svelte-sonner', () => ({
    toast: { error: mocks.toastError, success: mocks.toastSuccess },
}))
vi.mock('$lib/states/session', () => ({
    useSessionContext: () => ({
        data: { organizationSlug: 'current-organization' },
    }),
}))
vi.mock('$lib/states/session/tenant', () => ({
    createTenantKey: (organizationSlug: string, ...segments: unknown[]) => [
        organizationSlug,
        ...segments,
    ],
}))
vi.mock('$lib/utilities/helpers', () => ({
    getErrorMessage: (_error: unknown, fallback: string) => fallback,
}))
vi.mock('$lib/utilities/idempotencyKey', () => ({
    createIdempotencyKeyLifecycle: () => {
        let current = mocks.nextIdempotencyKey()
        let claimedPayload: string | undefined

        function reset() {
            current = mocks.nextIdempotencyKey()
            claimedPayload = undefined
        }

        return {
            abandonAttempt: () => {
                mocks.abandonIdempotencyAttempt(current)
                reset()
            },
            claim: (payload: unknown) => {
                mocks.idempotencyClaimInput(payload)
                if (mocks.rejectIdempotencyClaim) {
                    return { ok: false, reason: 'payload-mismatch' as const }
                }
                const payloadIdentity = JSON.stringify(payload)
                if (
                    claimedPayload !== undefined &&
                    claimedPayload !== payloadIdentity
                ) {
                    return { ok: false, reason: 'payload-mismatch' as const }
                }
                claimedPayload = payloadIdentity
                return { key: current, ok: true as const }
            },
            confirmSuccess: () => {
                mocks.confirmIdempotencySuccess(current)
                reset()
            },
            get current() {
                return current
            },
        }
    },
}))
vi.mock('../utilities/servicePrincipals', () => ({
    createServicePrincipalListQuery: () => mocks.principalListState,
    createServiceCredentialListQuery: () => mocks.credentialListState,
    createServicePrincipalCreateMutation: () => ({
        isPending: false,
        mutateAsync: mocks.createPrincipal,
    }),
    createServicePrincipalUpdateMutation: () => ({
        isPending: false,
        mutateAsync: vi.fn(async () => mocks.principal),
    }),
    createServicePrincipalDisableMutation: () => ({
        isPending: false,
        mutateAsync: vi.fn(async (input: unknown) => {
            mocks.disableInput(input)
            return { ...mocks.principal, enabled: false }
        }),
    }),
    createServicePrincipalEnableMutation: () => ({
        isPending: false,
        mutateAsync: vi.fn(async () => mocks.principal),
    }),
    createServicePrincipalDeleteMutation: () => ({
        isPending: false,
        mutateAsync: vi.fn(async () => undefined),
    }),
    createServiceCredentialCreateMutation: (options: {
        onSecret: (secret: { key: string }) => void
    }) => {
        mocks.onSecret = options.onSecret
        return {
            isPending: false,
            mutateAsync: vi.fn(async (input: unknown) => {
                mocks.createCredentialInput(input)
                if (mocks.credentialCreateShouldFail) {
                    throw new Error('network unavailable')
                }
                if (mocks.credentialCreatePromise) {
                    return mocks.credentialCreatePromise
                }
                if (mocks.credentialCreateOutcome === 'issued') {
                    options.onSecret({ key: mocks.rawKey })
                }
                return {
                    credential: mocks.credential,
                    outcome: mocks.credentialCreateOutcome,
                }
            }),
            reset: mocks.credentialCreateReset,
        }
    },
    createServiceCredentialRevokeMutation: () => ({
        isPending: false,
        mutateAsync: vi.fn(async (input: unknown) => {
            mocks.revokeCredentialInput(input)
        }),
    }),
    createServicePrincipalPermissions: (audience: string) =>
        audience === 'public-v1'
            ? { 'api.public': ['access'] }
            : { 'api.backoffice': ['access'] },
}))

describe('ServicePrincipalManagementPage', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mocks.resetIdempotencyKeys()
        mocks.createPrincipal.mockImplementation(async (input: unknown) => {
            mocks.createPrincipalInput(input)
            return mocks.principal
        })
        mocks.principalListState.data = {
            count: 1,
            data: [mocks.principal],
            limit: 10,
            offset: 0,
        }
        mocks.principalListState.error = null
        mocks.principalListState.isError = false
        mocks.principalListState.isPending = false
        mocks.credentialListState.data = {
            count: 1,
            data: [mocks.credential],
            limit: 10,
            offset: 0,
        }
        mocks.credentialCreateOutcome = 'issued'
        mocks.credentialCreatePromise = null
        mocks.credentialCreateShouldFail = false
        mocks.rejectIdempotencyClaim = false
        mocks.onSecret = null
        Object.defineProperty(navigator, 'clipboard', {
            configurable: true,
            value: { writeText: mocks.writeText },
        })
    })

    it('renders the service identity separately from credential metadata.', async () => {
        const screen = await render(ServicePrincipalManagementPage)

        await expect.element(screen.getByText('automation')).toBeVisible()
        await expect
            .element(screen.getByText('api.public.access'))
            .toBeVisible()
        await expect.element(screen.getByText('1 / 2 active')).toBeVisible()
        await expect
            .element(screen.getByText(mocks.rawKey))
            .not.toBeInTheDocument()

        await screen.getByRole('button', { name: 'Credentials' }).click()
        await expect.element(screen.getByText('rotation-a')).toBeVisible()
        await expect.element(screen.getByText('pub_AAAAAAAA…')).toBeVisible()
        await expect
            .element(
                screen
                    .getByRole('dialog', {
                        name: 'Credentials for automation',
                    })
                    .getByText('Never verified'),
            )
            .toBeVisible()
    })

    it('submits an idempotent principal create with normalized access scope.', async () => {
        const screen = await render(ServicePrincipalManagementPage)

        await screen.getByRole('button', { name: 'Create principal' }).click()
        await screen.getByLabelText('Name').fill('deployment automation')
        await screen
            .getByLabelText('Description')
            .fill('Runs controlled deployments')
        await screen
            .getByRole('button', { name: 'Create', exact: true })
            .click()

        await expect
            .poll(() => mocks.createPrincipalInput)
            .toHaveBeenCalledWith({
                audience: 'public-v1',
                description: 'Runs controlled deployments',
                idempotencyKey: '019936e2-b837-7000-8000-000000000003',
                name: 'deployment automation',
            })
        expect(mocks.idempotencyClaimInput).toHaveBeenCalledWith({
            audience: 'public-v1',
            description: 'Runs controlled deployments',
            name: 'deployment automation',
        })
        expect(mocks.confirmIdempotencySuccess).toHaveBeenCalledOnce()
        expect(mocks.invalidateQueries).toHaveBeenCalledWith({
            queryKey: [
                'current-organization',
                'servicePrincipal',
            ],
        })
    })

    it('rejects a changed principal claim without sending a request.', async () => {
        mocks.rejectIdempotencyClaim = true
        const screen = await render(ServicePrincipalManagementPage)

        await screen.getByRole('button', { name: 'Create principal' }).click()
        await screen.getByLabelText('Name').fill('changed automation')
        await screen
            .getByRole('button', { name: 'Create', exact: true })
            .click()

        expect(mocks.createPrincipal).not.toHaveBeenCalled()
        expect(mocks.toastError).toHaveBeenCalledWith(
            'Retry the unresolved service principal without changing its details.',
        )
    })

    it('restores and exactly replays an unresolved principal-create attempt.', async () => {
        mocks.createPrincipal.mockImplementationOnce(async (input: unknown) => {
            mocks.createPrincipalInput(input)
            throw new Error('ambiguous network failure')
        })
        const screen = await render(ServicePrincipalManagementPage)

        await screen.getByRole('button', { name: 'Create principal' }).click()
        await screen.getByLabelText('Name').fill('retry automation')
        await screen
            .getByLabelText('Description')
            .fill('Must replay the captured request')
        await screen
            .getByRole('button', { name: 'Create', exact: true })
            .click()

        await expect.poll(() => mocks.createPrincipal).toHaveBeenCalledTimes(1)
        expect(mocks.confirmIdempotencySuccess).not.toHaveBeenCalled()
        await expect.element(screen.getByLabelText('Name')).toBeDisabled()
        await screen.getByRole('button', { name: 'Cancel' }).click()
        await screen.getByRole('button', { name: 'Create principal' }).click()
        await expect
            .element(screen.getByLabelText('Name'))
            .toHaveValue('retry automation')
        await expect
            .element(screen.getByLabelText('Description'))
            .toHaveValue('Must replay the captured request')

        await screen
            .getByRole('button', { name: 'Create', exact: true })
            .click()

        await expect.poll(() => mocks.createPrincipal).toHaveBeenCalledTimes(2)
        expect(mocks.createPrincipal.mock.calls[1][0]).toEqual(
            mocks.createPrincipal.mock.calls[0][0],
        )
        expect(mocks.confirmIdempotencySuccess).toHaveBeenCalledOnce()
    })

    it('locks dialog cancellation while principal creation is pending.', async () => {
        let resolveCreate: ((value: typeof mocks.principal) => void) | undefined
        mocks.createPrincipal.mockImplementationOnce(
            (input: unknown) =>
                new Promise((resolve) => {
                    mocks.createPrincipalInput(input)
                    resolveCreate = resolve
                }),
        )
        const screen = await render(ServicePrincipalManagementPage)

        await screen.getByRole('button', { name: 'Create principal' }).click()
        await screen.getByLabelText('Name').fill('pending automation')
        await screen
            .getByRole('button', { name: 'Create', exact: true })
            .click()

        await expect.poll(() => mocks.createPrincipal).toHaveBeenCalledOnce()
        await expect
            .element(screen.getByRole('button', { name: 'Cancel' }))
            .toBeDisabled()
        resolveCreate?.(mocks.principal)
        await expect
            .poll(() => mocks.confirmIdempotencySuccess)
            .toHaveBeenCalledOnce()
    })

    it('keeps the create dialog open on Escape and outside click while creation is pending.', async () => {
        let resolveCreate: ((value: typeof mocks.principal) => void) | undefined
        mocks.createPrincipal.mockImplementationOnce(
            (input: unknown) =>
                new Promise((resolve) => {
                    mocks.createPrincipalInput(input)
                    resolveCreate = resolve
                }),
        )
        const screen = await render(ServicePrincipalManagementPage)

        await screen.getByRole('button', { name: 'Create principal' }).click()
        await screen.getByLabelText('Name').fill('pending automation')
        await screen
            .getByRole('button', { name: 'Create', exact: true })
            .click()
        await expect.poll(() => mocks.createPrincipal).toHaveBeenCalledOnce()

        await expect
            .element(
                screen.getByRole('dialog', {
                    name: 'Create service principal',
                }),
            )
            .toBeVisible()
        await userEvent.keyboard('{Escape}')
        await expect
            .element(
                screen.getByRole('dialog', {
                    name: 'Create service principal',
                }),
            )
            .toBeVisible()
        await page
            .elementLocator(
                document.querySelector<HTMLElement>(
                    '[data-slot="dialog-overlay"]',
                )!,
            )
            .click({ force: true, position: { x: 2, y: 2 } })

        await expect
            .element(
                screen.getByRole('dialog', {
                    name: 'Create service principal',
                }),
            )
            .toBeVisible()
        await expect
            .element(screen.getByRole('button', { name: 'Cancel' }))
            .toBeDisabled()

        resolveCreate?.(mocks.principal)
        await expect
            .poll(() => mocks.confirmIdempotencySuccess)
            .toHaveBeenCalledOnce()
    })

    it('defaults credential expiry to 90 days and shows permanent-risk guidance.', async () => {
        const screen = await render(ServicePrincipalManagementPage)

        await screen.getByRole('button', { name: 'Credentials' }).click()
        await screen.getByRole('button', { name: 'Issue credential' }).click()
        await screen.getByLabelText('Name').fill('rotation-b')
        await screen.getByRole('button', { name: 'Issue', exact: true }).click()

        await expect
            .poll(() => mocks.createCredentialInput)
            .toHaveBeenCalledWith({
                expiryDays: 90,
                idempotencyKey: '019936e2-b837-7000-8000-000000000002',
                name: 'rotation-b',
                principalPublicId: mocks.principal.publicId,
            })
        expect(mocks.idempotencyClaimInput).toHaveBeenCalledWith({
            expiryDays: 90,
            name: 'rotation-b',
            principalPublicId: mocks.principal.publicId,
        })
        await expect.element(screen.getByText(mocks.rawKey)).toBeVisible()
        await screen.getByRole('button', { name: 'Copy' }).click()
        expect(mocks.writeText).toHaveBeenCalledWith(mocks.rawKey)
        await screen.getByRole('button', { name: 'Done' }).click()
        await expect
            .element(screen.getByText(mocks.rawKey))
            .not.toBeInTheDocument()

        await screen.getByRole('button', { name: 'Issue credential' }).click()
        await screen.getByLabelText('Expiration').selectOptions('never')
        await expect
            .element(screen.getByText('Permanent credential'))
            .toBeVisible()
    })

    it('retries the exact unresolved credential attempt and blocks changed input.', async () => {
        mocks.credentialCreateShouldFail = true
        const screen = await render(ServicePrincipalManagementPage)

        await screen.getByRole('button', { name: 'Credentials' }).click()
        await screen.getByRole('button', { name: 'Issue credential' }).click()
        await screen.getByLabelText('Name').fill('stable-rotation')
        await screen.getByRole('button', { name: 'Issue', exact: true }).click()
        await expect
            .poll(() => mocks.createCredentialInput)
            .toHaveBeenCalledOnce()
        await expect
            .element(screen.getByText('Credential outcome unresolved'))
            .toBeVisible()
        await expect.element(screen.getByLabelText('Name')).toBeDisabled()
        await expect
            .element(screen.getByLabelText('Name'))
            .toHaveValue('stable-rotation')

        await screen
            .getByRole('button', { name: 'Retry unchanged request' })
            .click()
        await expect
            .poll(() => mocks.createCredentialInput)
            .toHaveBeenCalledTimes(2)
        expect(mocks.createCredentialInput.mock.calls[1][0]).toEqual(
            mocks.createCredentialInput.mock.calls[0][0],
        )
        expect(mocks.toastError).toHaveBeenCalledTimes(2)
    })

    it('abandons only after confirmation and permits another principal and key.', async () => {
        mocks.credentialCreateShouldFail = true
        mocks.principalListState.data = {
            count: 2,
            data: [
                mocks.principal,
                mocks.otherPrincipal,
            ],
            limit: 10,
            offset: 0,
        }
        const screen = await render(ServicePrincipalManagementPage)

        await screen
            .getByRole('button', { name: 'Credentials' })
            .first()
            .click()
        await screen.getByRole('button', { name: 'Issue credential' }).click()
        await screen.getByLabelText('Name').fill('terminal-claim')
        await screen.getByRole('button', { name: 'Issue', exact: true }).click()
        await screen
            .getByRole('button', { name: 'Retry unchanged request' })
            .click()
        await expect
            .poll(() => mocks.createCredentialInput)
            .toHaveBeenCalledTimes(2)
        expect(mocks.createCredentialInput.mock.calls[1][0]).toEqual(
            mocks.createCredentialInput.mock.calls[0][0],
        )

        await screen
            .getByRole('button', { name: 'Start a new attempt' })
            .click()
        await expect
            .element(screen.getByText('Start a new credential attempt?'))
            .toBeVisible()
        mocks.credentialCreateShouldFail = false
        await screen.getByRole('button', { name: 'Start new attempt' }).click()

        expect(mocks.createCredentialInput).toHaveBeenCalledTimes(2)
        expect(mocks.revokeCredentialInput).not.toHaveBeenCalled()
        expect(mocks.abandonIdempotencyAttempt).toHaveBeenCalledOnce()
        expect(mocks.credentialCreateReset).toHaveBeenCalledOnce()
        await expect.element(screen.getByLabelText('Name')).toHaveValue('')
        await expect
            .element(screen.getByLabelText('Expiry days'))
            .toHaveValue(90)

        await screen.getByRole('button', { name: 'Cancel' }).click()
        await screen.getByRole('button', { name: 'Close' }).click()
        await screen.getByRole('button', { name: 'Credentials' }).nth(1).click()
        await screen.getByRole('button', { name: 'Issue credential' }).click()
        await screen.getByLabelText('Name').fill('reporting-rotation')
        await screen.getByRole('button', { name: 'Issue', exact: true }).click()

        await expect
            .poll(() => mocks.createCredentialInput)
            .toHaveBeenCalledTimes(3)
        expect(mocks.createCredentialInput.mock.calls[2][0]).toMatchObject({
            name: 'reporting-rotation',
            principalPublicId: mocks.otherPrincipal.publicId,
        })
        expect(mocks.createCredentialInput.mock.calls[2][0]).not.toMatchObject({
            idempotencyKey: (
                mocks.createCredentialInput.mock.calls[0][0] as {
                    idempotencyKey: string
                }
            ).idempotencyKey,
        })
    })

    it('keeps the original attempt when recovery is canceled or reopened.', async () => {
        mocks.credentialCreateShouldFail = true
        const screen = await render(ServicePrincipalManagementPage)

        await screen.getByRole('button', { name: 'Credentials' }).click()
        await screen.getByRole('button', { name: 'Issue credential' }).click()
        await screen.getByLabelText('Name').fill('preserved-attempt')
        await screen.getByLabelText('Expiry days').fill('30')
        await screen.getByRole('button', { name: 'Issue', exact: true }).click()
        await screen
            .getByRole('button', { name: 'Start a new attempt' })
            .click()
        await screen
            .getByRole('button', { name: 'Keep previous attempt' })
            .click()

        expect(mocks.abandonIdempotencyAttempt).not.toHaveBeenCalled()
        expect(mocks.credentialCreateReset).not.toHaveBeenCalled()
        await screen.getByRole('button', { name: 'Cancel' }).click()
        await screen.getByRole('button', { name: 'Issue credential' }).click()
        await expect
            .element(screen.getByLabelText('Name'))
            .toHaveValue('preserved-attempt')
        await expect
            .element(screen.getByLabelText('Expiry days'))
            .toHaveValue(30)

        await screen
            .getByRole('button', { name: 'Retry unchanged request' })
            .click()
        await expect
            .poll(() => mocks.createCredentialInput)
            .toHaveBeenCalledTimes(2)
        expect(mocks.createCredentialInput.mock.calls[1][0]).toEqual(
            mocks.createCredentialInput.mock.calls[0][0],
        )
    })

    it('inspects credential metadata without issuing or revoking.', async () => {
        mocks.credentialCreateShouldFail = true
        const screen = await render(ServicePrincipalManagementPage)

        await screen.getByRole('button', { name: 'Credentials' }).click()
        await screen.getByRole('button', { name: 'Issue credential' }).click()
        await screen.getByLabelText('Name').fill('inspect-attempt')
        await screen.getByRole('button', { name: 'Issue', exact: true }).click()
        await screen
            .getByRole('button', { name: 'Inspect credentials' })
            .click()

        await expect
            .poll(() => mocks.credentialListState.refetch)
            .toHaveBeenCalledOnce()
        expect(mocks.createCredentialInput).toHaveBeenCalledOnce()
        expect(mocks.revokeCredentialInput).not.toHaveBeenCalled()
        await expect
            .element(
                screen.getByRole('dialog', {
                    name: 'Credentials for automation',
                }),
            )
            .toBeVisible()
        await expect
            .element(
                screen
                    .getByRole('dialog', {
                        name: 'Credentials for automation',
                    })
                    .getByRole('button', { name: 'Revoke' }),
            )
            .toBeVisible()
    })

    it('disables every recovery action while issuance is pending.', async () => {
        let resolveCredential:
            | ((value: {
                  credential: typeof mocks.credential
                  outcome: 'issued'
              }) => void)
            | undefined
        mocks.credentialCreatePromise = new Promise((resolve) => {
            resolveCredential = resolve
        })
        const screen = await render(ServicePrincipalManagementPage)

        await screen.getByRole('button', { name: 'Credentials' }).click()
        await screen.getByRole('button', { name: 'Issue credential' }).click()
        await screen.getByLabelText('Name').fill('pending-attempt')
        await screen.getByRole('button', { name: 'Issue', exact: true }).click()

        await expect
            .element(
                screen.getByRole('button', { name: 'Retry unchanged request' }),
            )
            .toBeDisabled()
        await expect
            .element(
                screen.getByRole('button', { name: 'Inspect credentials' }),
            )
            .toBeDisabled()
        await expect
            .element(
                screen.getByRole('button', { name: 'Start a new attempt' }),
            )
            .toBeDisabled()
        expect(mocks.abandonIdempotencyAttempt).not.toHaveBeenCalled()
        expect(mocks.revokeCredentialInput).not.toHaveBeenCalled()

        resolveCredential?.({
            credential: mocks.credential,
            outcome: 'issued',
        })
        await expect
            .poll(() => mocks.confirmIdempotencySuccess)
            .toHaveBeenCalledOnce()
    })

    it('shows recovery guidance without redisclosing a duplicate secret.', async () => {
        mocks.credentialCreateOutcome = 'alreadyIssued'
        const screen = await render(ServicePrincipalManagementPage)

        await screen.getByRole('button', { name: 'Credentials' }).click()
        await screen.getByRole('button', { name: 'Issue credential' }).click()
        await screen.getByLabelText('Name').fill('lost-response')
        await screen.getByRole('button', { name: 'Issue', exact: true }).click()

        await expect
            .poll(() => mocks.toastError)
            .toHaveBeenCalledWith(
                'Credential was already issued.',
                expect.objectContaining({
                    description: expect.stringContaining(
                        'The secret cannot be shown again.',
                    ),
                }),
            )
        expect(mocks.onSecret).toBeTypeOf('function')
        expect(mocks.confirmIdempotencySuccess).toHaveBeenCalledOnce()
        expect(mocks.abandonIdempotencyAttempt).not.toHaveBeenCalled()
        await expect
            .element(screen.getByText(mocks.rawKey))
            .not.toBeInTheDocument()
    })

    it('requires confirmation before disabling a principal.', async () => {
        const screen = await render(ServicePrincipalManagementPage)

        await screen.getByRole('button', { name: 'Disable' }).click()
        await expect
            .element(screen.getByText('Disable service principal?'))
            .toBeVisible()
        await screen.getByRole('button', { name: 'Confirm' }).click()

        await expect
            .poll(() => mocks.disableInput)
            .toHaveBeenCalledWith(mocks.principal.publicId)
    })

    it('renders loading, error, and empty states without exposing secrets.', async () => {
        mocks.principalListState.isPending = true
        const loading = await render(ServicePrincipalManagementPage)
        await expect
            .element(loading.getByText('Loading service principals…'))
            .toBeVisible()
        loading.unmount()

        mocks.principalListState.isPending = false
        mocks.principalListState.isError = true
        mocks.principalListState.error = new Error('network unavailable')
        const error = await render(ServicePrincipalManagementPage)
        await expect
            .element(error.getByText('Could not load service principals'))
            .toBeVisible()
        error.unmount()

        mocks.principalListState.isError = false
        mocks.principalListState.data = {
            count: 0,
            data: [],
            limit: 10,
            offset: 0,
        }
        const empty = await render(ServicePrincipalManagementPage)
        await expect
            .element(empty.getByText('No service principals'))
            .toBeVisible()
    })
})

// =============================================================================
// END OF BASE TEMPLATE TESTS - FORK-SPECIFIC TESTS MUST BE ADDED BELOW
// =============================================================================
