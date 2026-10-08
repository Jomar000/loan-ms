<script lang="ts">
    import type { TApiKeyAudience } from '@loanms/types/shared'
    import * as Alert from '@loanms/ui/components/alert'
    import * as AlertDialog from '@loanms/ui/components/alert-dialog'
    import { Badge } from '@loanms/ui/components/badge'
    import { Button } from '@loanms/ui/components/button'
    import * as Card from '@loanms/ui/components/card'
    import * as Dialog from '@loanms/ui/components/dialog'
    import * as Empty from '@loanms/ui/components/empty'
    import * as Field from '@loanms/ui/components/field'
    import { Input } from '@loanms/ui/components/input'
    import * as NativeSelect from '@loanms/ui/components/native-select'
    import * as Pagination from '@loanms/ui/components/pagination'
    import { Spinner } from '@loanms/ui/components/spinner'
    import * as Table from '@loanms/ui/components/table'
    import { Textarea } from '@loanms/ui/components/textarea'
    import AlertCircleIcon from '@lucide/svelte/icons/alert-circle'
    import CopyIcon from '@lucide/svelte/icons/copy'
    import KeyRoundIcon from '@lucide/svelte/icons/key-round'
    import PlusIcon from '@lucide/svelte/icons/plus'
    import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw'
    import { useQueryClient } from '@tanstack/svelte-query'
    import { tick } from 'svelte'
    import { toast } from 'svelte-sonner'

    import { useSessionContext } from '$lib/states/session'
    import { createTenantKey } from '$lib/states/session/tenant'
    import { getErrorMessage } from '$lib/utilities/helpers'
    import { createIdempotencyKeyLifecycle } from '$lib/utilities/idempotencyKey'
    import {
        createServiceCredentialCreateMutation,
        createServiceCredentialListQuery,
        createServiceCredentialRevokeMutation,
        createServicePrincipalCreateMutation,
        createServicePrincipalDeleteMutation,
        createServicePrincipalDisableMutation,
        createServicePrincipalEnableMutation,
        createServicePrincipalListQuery,
        createServicePrincipalPermissions,
        createServicePrincipalUpdateMutation,
        type TServiceCredential,
        type TServicePrincipal,
    } from '../utilities/servicePrincipals'

    ///////////////////
    // 02. Constants //
    ///////////////////

    type TPrincipalCreateAttempt = {
        audience: TApiKeyAudience
        description: string | null
        idempotencyKey: string
        name: string
    }

    type TCredentialCreateAttempt = {
        expiryDays: number | null
        idempotencyKey: string
        name: string
        principalPublicId: string
    }

    const PAGE_SIZE = 10
    const CREDENTIAL_PAGE_SIZE = 10
    const dateFormatter = new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
    })
    const credentialIdempotencyKey = createIdempotencyKeyLifecycle()
    const principalIdempotencyKey = createIdempotencyKeyLifecycle()
    const queryClient = useQueryClient()
    const session = useSessionContext()

    ///////////////
    // 03. State //
    ///////////////

    let audience = $state<TApiKeyAudience>('public-v1')
    let principalPage = $state(1)
    let credentialPage = $state(1)
    let createPrincipalOpen = $state(false)
    let editPrincipalOpen = $state(false)
    let principalActionOpen = $state(false)
    let credentialManagerOpen = $state(false)
    let createCredentialOpen = $state(false)
    let credentialRecoveryOpen = $state(false)
    let revokeCredentialOpen = $state(false)
    let secretOpen = $state(false)
    let selectedPrincipal = $state<TServicePrincipal | null>(null)
    let selectedCredential = $state<TServiceCredential | null>(null)
    let principalAction = $state<'delete' | 'disable' | 'enable'>('disable')
    let principalName = $state('')
    let principalDescription = $state('')
    let credentialName = $state('')
    let credentialExpiryDays = $state('90')
    let credentialExpiryMode = $state<'expires' | 'never'>('expires')
    let rawCredential = $state('')
    let isActionLocked = $state(false)
    let principalCreateAttempt = $state.raw<TPrincipalCreateAttempt | null>(
        null,
    )
    let credentialCreateAttempt = $state.raw<TCredentialCreateAttempt | null>(
        null,
    )
    let credentialCreatePrincipal = $state.raw<TServicePrincipal | null>(null)

    /////////////////
    // 05. Queries //
    /////////////////

    const principalListQuery = createServicePrincipalListQuery({
        get audience() {
            return audience
        },
        get enabled() {
            return Boolean(session.data.organizationSlug)
        },
        limit: PAGE_SIZE,
        get offset() {
            return (principalPage - 1) * PAGE_SIZE
        },
        get organizationSlug() {
            return session.data.organizationSlug
        },
    })

    const credentialListQuery = createServiceCredentialListQuery({
        get enabled() {
            return (
                Boolean(session.data.organizationSlug) &&
                credentialManagerOpen &&
                Boolean(selectedPrincipal)
            )
        },
        limit: CREDENTIAL_PAGE_SIZE,
        get offset() {
            return (credentialPage - 1) * CREDENTIAL_PAGE_SIZE
        },
        get organizationSlug() {
            return session.data.organizationSlug
        },
        get principalPublicId() {
            return selectedPrincipal?.publicId ?? ''
        },
    })

    ///////////////////
    // 06. Mutations //
    ///////////////////

    const createPrincipalMutation = createServicePrincipalCreateMutation({
        get organizationSlug() {
            return session.data.organizationSlug
        },
    })
    const updatePrincipalMutation = createServicePrincipalUpdateMutation({
        get organizationSlug() {
            return session.data.organizationSlug
        },
    })
    const disablePrincipalMutation = createServicePrincipalDisableMutation({
        get organizationSlug() {
            return session.data.organizationSlug
        },
    })
    const enablePrincipalMutation = createServicePrincipalEnableMutation({
        get organizationSlug() {
            return session.data.organizationSlug
        },
    })
    const deletePrincipalMutation = createServicePrincipalDeleteMutation({
        get organizationSlug() {
            return session.data.organizationSlug
        },
    })
    const createCredentialMutation = createServiceCredentialCreateMutation({
        get organizationSlug() {
            return session.data.organizationSlug
        },
        onSecret: ({ key }) => {
            rawCredential = key
            secretOpen = true
        },
    })
    const revokeCredentialMutation = createServiceCredentialRevokeMutation({
        get organizationSlug() {
            return session.data.organizationSlug
        },
    })

    /////////////////
    // 09. Handlers //
    /////////////////

    function handleAudienceChange(event: Event) {
        audience = (event.currentTarget as HTMLSelectElement)
            .value as TApiKeyAudience
        principalPage = 1
    }

    function openCreatePrincipalDialog() {
        if (principalCreateAttempt) {
            restorePrincipalCreateAttempt(principalCreateAttempt)
        } else {
            principalName = ''
            principalDescription = ''
        }
        createPrincipalOpen = true
    }

    function openEditPrincipalDialog(principal: TServicePrincipal) {
        selectedPrincipal = principal
        principalName = principal.name
        principalDescription = principal.description ?? ''
        editPrincipalOpen = true
    }

    function openPrincipalActionDialog(
        principal: TServicePrincipal,
        action: 'delete' | 'disable' | 'enable',
    ) {
        selectedPrincipal = principal
        principalAction = action
        principalActionOpen = true
    }

    function openCredentialManager(principal: TServicePrincipal) {
        selectedPrincipal = principal
        credentialPage = 1
        credentialManagerOpen = true
    }

    function openCreateCredentialDialog() {
        if (credentialCreateAttempt) {
            if (credentialCreatePrincipal) {
                selectedPrincipal = credentialCreatePrincipal
            }
            restoreCredentialCreateAttempt(credentialCreateAttempt)
        } else {
            resetCredentialCreateDraft()
        }
        createCredentialOpen = true
    }

    function openRevokeCredentialDialog(credential: TServiceCredential) {
        selectedCredential = credential
        revokeCredentialOpen = true
    }

    function handleCredentialExpiryMode(event: Event) {
        credentialExpiryMode = (event.currentTarget as HTMLSelectElement)
            .value as 'expires' | 'never'
    }

    async function handleCreatePrincipal(event: SubmitEvent) {
        event.preventDefault()
        if (isInteractionLocked() || !principalName.trim()) return

        const payload = {
            audience,
            description: principalDescription.trim() || null,
            name: principalName.trim(),
        }
        const claim = principalIdempotencyKey.claim(payload)
        if (!claim.ok) {
            if (principalCreateAttempt) {
                restorePrincipalCreateAttempt(principalCreateAttempt)
            }
            toast.error(
                'Retry the unresolved service principal without changing its details.',
            )
            return
        }

        const attempt =
            principalCreateAttempt ??
            ({
                ...payload,
                idempotencyKey: claim.key,
            } satisfies TPrincipalCreateAttempt)
        principalCreateAttempt = attempt
        isActionLocked = true
        try {
            await createPrincipalMutation.mutateAsync(attempt)
            principalName = ''
            principalDescription = ''
            principalCreateAttempt = null
            principalIdempotencyKey.confirmSuccess()
            createPrincipalOpen = false
            toast.success('Service principal created.')
            await invalidateServicePrincipals()
        } catch (error) {
            restorePrincipalCreateAttempt(attempt)
            toast.error(
                getErrorMessage(error, 'Service principal creation failed.'),
            )
        } finally {
            isActionLocked = false
        }
    }

    async function handleUpdatePrincipal(event: SubmitEvent) {
        event.preventDefault()
        if (
            isInteractionLocked() ||
            !selectedPrincipal ||
            !principalName.trim()
        ) {
            return
        }

        isActionLocked = true
        try {
            await updatePrincipalMutation.mutateAsync({
                description: principalDescription.trim() || null,
                name: principalName.trim(),
                permissions: selectedPrincipal.permissions,
                publicId: selectedPrincipal.publicId,
            })
            editPrincipalOpen = false
            toast.success('Service principal updated.')
            await invalidateServicePrincipals()
        } catch (error) {
            toast.error(
                getErrorMessage(error, 'Service principal update failed.'),
            )
        } finally {
            isActionLocked = false
        }
    }

    async function handlePrincipalAction() {
        if (isInteractionLocked() || !selectedPrincipal) return

        isActionLocked = true
        try {
            if (principalAction === 'disable') {
                await disablePrincipalMutation.mutateAsync(
                    selectedPrincipal.publicId,
                )
            } else if (principalAction === 'enable') {
                await enablePrincipalMutation.mutateAsync(
                    selectedPrincipal.publicId,
                )
            } else {
                await deletePrincipalMutation.mutateAsync(
                    selectedPrincipal.publicId,
                )
            }

            principalActionOpen = false
            toast.success(
                principalAction === 'delete'
                    ? 'Service principal deleted.'
                    : `Service principal ${principalAction}d.`,
            )
            await invalidateServicePrincipals()
        } catch (error) {
            toast.error(
                getErrorMessage(error, 'Service principal action failed.'),
            )
        } finally {
            isActionLocked = false
        }
    }

    async function handleCreateCredential(event: SubmitEvent) {
        event.preventDefault()
        if (
            isInteractionLocked() ||
            !selectedPrincipal ||
            !credentialName.trim()
        ) {
            return
        }

        const expiryDays = parseCredentialExpiryDays()
        if (expiryDays === undefined) {
            toast.error('Expiry must be a whole number from 1 to 365.')
            return
        }

        const payload = {
            expiryDays,
            name: credentialName.trim(),
            principalPublicId: selectedPrincipal.publicId,
        }
        const claim = credentialIdempotencyKey.claim(payload)
        if (!claim.ok) {
            if (credentialCreateAttempt) {
                restoreCredentialCreateAttempt(credentialCreateAttempt)
            }
            toast.error(
                'Retry the unresolved credential request without changing its details.',
            )
            return
        }

        const attempt =
            credentialCreateAttempt ??
            ({
                ...payload,
                idempotencyKey: claim.key,
            } satisfies TCredentialCreateAttempt)
        if (!credentialCreateAttempt) {
            credentialCreatePrincipal = selectedPrincipal
        }
        credentialCreateAttempt = attempt
        isActionLocked = true
        try {
            const result = await createCredentialMutation.mutateAsync(attempt)
            createCredentialOpen = false
            credentialName = ''
            credentialCreateAttempt = null
            credentialCreatePrincipal = null
            credentialIdempotencyKey.confirmSuccess()
            if (result.outcome === 'alreadyIssued') {
                toast.error('Credential was already issued.', {
                    description:
                        'The secret cannot be shown again. Inspect credential metadata and revoke the uncertain credential before issuing a replacement.',
                })
            } else {
                toast.success('Credential created.')
            }
            await invalidateServicePrincipals()
        } catch (error) {
            restoreCredentialCreateAttempt(attempt)
            await invalidateServicePrincipals()
            toast.error('Credential creation could not be confirmed.', {
                description: `${getErrorMessage(
                    error,
                    'Retry this unchanged request to inspect its outcome.',
                )} Inspect credential metadata and revoke any uncertain credential before issuing a replacement.`,
            })
        } finally {
            isActionLocked = false
        }
    }

    async function handleInspectCredentialAttempt() {
        if (
            isInteractionLocked() ||
            !credentialCreateAttempt ||
            !credentialCreatePrincipal
        ) {
            return
        }

        selectedPrincipal = credentialCreatePrincipal
        credentialPage = 1
        createCredentialOpen = false
        credentialManagerOpen = true
        await tick()
        await credentialListQuery.refetch()
    }

    function openCredentialRecoveryDialog() {
        if (isInteractionLocked() || !credentialCreateAttempt) return
        credentialRecoveryOpen = true
    }

    function handleAbandonCredentialAttempt() {
        if (isInteractionLocked() || !credentialCreateAttempt) return

        credentialCreateAttempt = null
        credentialCreatePrincipal = null
        createCredentialMutation.reset()
        credentialIdempotencyKey.abandonAttempt()
        resetCredentialCreateDraft()
        credentialRecoveryOpen = false
    }

    async function handleRevokeCredential() {
        if (
            isInteractionLocked() ||
            !selectedPrincipal ||
            !selectedCredential
        ) {
            return
        }

        isActionLocked = true
        try {
            await revokeCredentialMutation.mutateAsync({
                credentialId: selectedCredential.id,
                principalPublicId: selectedPrincipal.publicId,
            })
            revokeCredentialOpen = false
            selectedCredential = null
            toast.success('Credential revoked.')
            await invalidateServicePrincipals()
        } catch (error) {
            toast.error(getErrorMessage(error, 'Credential revocation failed.'))
        } finally {
            isActionLocked = false
        }
    }

    async function handleCopySecret() {
        if (!rawCredential) return
        await navigator.clipboard.writeText(rawCredential)
        toast.success('Credential copied.')
    }

    function handleSecretOpenChange(open: boolean) {
        secretOpen = open
        if (!open) rawCredential = ''
    }

    function handleCreatePrincipalOpenChange(open: boolean) {
        if (!open && isInteractionLocked()) return
        createPrincipalOpen = open
        if (open && principalCreateAttempt) {
            restorePrincipalCreateAttempt(principalCreateAttempt)
        }
    }

    function handleEditPrincipalOpenChange(open: boolean) {
        if (!open && isInteractionLocked()) return
        editPrincipalOpen = open
    }

    function handlePrincipalActionOpenChange(open: boolean) {
        if (!open && isInteractionLocked()) return
        principalActionOpen = open
    }

    function handleCredentialManagerOpenChange(open: boolean) {
        if (!open && isInteractionLocked()) return
        credentialManagerOpen = open
    }

    function handleCreateCredentialOpenChange(open: boolean) {
        if (!open && isInteractionLocked()) return
        createCredentialOpen = open
        if (open && credentialCreateAttempt) {
            if (credentialCreatePrincipal) {
                selectedPrincipal = credentialCreatePrincipal
            }
            restoreCredentialCreateAttempt(credentialCreateAttempt)
        }
    }

    function handleCredentialRecoveryOpenChange(open: boolean) {
        if (!open && isInteractionLocked()) return
        credentialRecoveryOpen = open
    }

    function handleRevokeCredentialOpenChange(open: boolean) {
        if (!open && isInteractionLocked()) return
        revokeCredentialOpen = open
    }

    /////////////////
    // 10. Helpers //
    /////////////////

    async function invalidateServicePrincipals() {
        const tenantKey = createTenantKey(
            session.data.organizationSlug,
            'servicePrincipal',
        )
        try {
            await queryClient.invalidateQueries({ queryKey: tenantKey })
        } catch (error) {
            toast.error('The change was saved, but metadata refresh failed.', {
                description: getErrorMessage(
                    error,
                    'Refresh this page before taking another action.',
                ),
            })
        }
    }

    function restoreCredentialCreateAttempt(attempt: TCredentialCreateAttempt) {
        credentialExpiryDays = attempt.expiryDays?.toString() ?? '90'
        credentialExpiryMode = attempt.expiryDays === null ? 'never' : 'expires'
        credentialName = attempt.name
    }

    function resetCredentialCreateDraft() {
        credentialExpiryDays = '90'
        credentialExpiryMode = 'expires'
        credentialName = ''
    }

    function restorePrincipalCreateAttempt(attempt: TPrincipalCreateAttempt) {
        audience = attempt.audience
        principalDescription = attempt.description ?? ''
        principalName = attempt.name
    }

    function parseCredentialExpiryDays(): number | null | undefined {
        if (credentialExpiryMode === 'never') return null

        const parsed = Number(credentialExpiryDays)
        return Number.isInteger(parsed) && parsed >= 1 && parsed <= 365
            ? parsed
            : undefined
    }

    function isInteractionLocked() {
        return (
            isActionLocked ||
            createPrincipalMutation.isPending ||
            updatePrincipalMutation.isPending ||
            disablePrincipalMutation.isPending ||
            enablePrincipalMutation.isPending ||
            deletePrincipalMutation.isPending ||
            createCredentialMutation.isPending ||
            revokeCredentialMutation.isPending
        )
    }

    function formatDate(value: string | null, fallback: string) {
        return value ? dateFormatter.format(new Date(value)) : fallback
    }

    function permissionLabel(principal: TServicePrincipal) {
        return Object.entries(principal.permissions)
            .flatMap(
                ([
                    component,
                    actions,
                ]) => actions.map((action) => `${component}.${action}`),
            )
            .join(', ')
    }

    function principalActionTitle() {
        if (principalAction === 'delete') return 'Delete service principal?'
        if (principalAction === 'enable') return 'Re-enable service principal?'
        return 'Disable service principal?'
    }

    function principalActionDescription() {
        if (principalAction === 'delete') {
            return 'This permanently deletes the disabled principal and every linked credential.'
        }
        if (principalAction === 'enable') {
            return 'Existing unexpired credentials will become usable again. Confirm that the principal is safe to restore.'
        }
        return 'Access stops immediately, but linked credentials are preserved. Revoke credentials separately if compromise is suspected.'
    }
</script>

<div
    class="grid min-h-0 page-scroll flex-1 content-start gap-3 bg-zinc-50/80 p-3 md:p-4 dark:bg-[#171717]"
>
    <div
        class="flex flex-col gap-2 rounded-xl border border-zinc-200 bg-white p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between dark:border-zinc-800 dark:bg-[#202020]"
    >
        <div>
            <h2 class="text-lg font-semibold tracking-tight md:text-xl">
                Service principals
            </h2>
            <p class="text-xs text-zinc-500 dark:text-zinc-400">
                Manage non-human organization identities and their API
                credentials.
            </p>
        </div>
        <Button
            onclick={openCreatePrincipalDialog}
            disabled={isInteractionLocked()}
        >
            <PlusIcon data-icon="inline-start" />
            Create principal
        </Button>
    </div>

    <Card.Root
        class="min-h-0 border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-[#202020]"
    >
        <Card.Header class="gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
                <Card.Title>Organization service principals</Card.Title>
                <Card.Description>
                    Principals own permissions; credentials are immutable
                    secrets used only to authenticate them.
                </Card.Description>
            </div>
            <Field.Field class="w-full sm:w-64">
                <Field.Label for="service-principal-audience">
                    Audience
                </Field.Label>
                <NativeSelect.Root
                    id="service-principal-audience"
                    value={audience}
                    onchange={handleAudienceChange}
                    disabled={isInteractionLocked()}
                >
                    <NativeSelect.Option value="public-v1">
                        Public API v1
                    </NativeSelect.Option>
                    <NativeSelect.Option value="backoffice-v1">
                        Backoffice API v1
                    </NativeSelect.Option>
                </NativeSelect.Root>
            </Field.Field>
        </Card.Header>
        <Card.Content class="min-w-0">
            {#if principalListQuery.isPending}
                <div
                    class="flex min-h-48 items-center justify-center gap-2 text-sm"
                >
                    <Spinner /> Loading service principals…
                </div>
            {:else if principalListQuery.isError}
                <Alert.Root variant="destructive">
                    <AlertCircleIcon />
                    <Alert.Title>Could not load service principals</Alert.Title>
                    <Alert.Description>
                        {getErrorMessage(
                            principalListQuery.error,
                            'Try again.',
                        )}
                    </Alert.Description>
                    <Button
                        class="mt-3"
                        size="sm"
                        variant="outline"
                        onclick={() => principalListQuery.refetch()}
                    >
                        <RefreshCwIcon data-icon="inline-start" /> Retry
                    </Button>
                </Alert.Root>
            {:else if (principalListQuery.data?.data.length ?? 0) === 0}
                <Empty.Root class="min-h-48 border">
                    <Empty.Header>
                        <Empty.Media variant="icon">
                            <KeyRoundIcon />
                        </Empty.Media>
                        <Empty.Title>No service principals</Empty.Title>
                        <Empty.Description>
                            Create the first non-human identity for this
                            audience.
                        </Empty.Description>
                    </Empty.Header>
                </Empty.Root>
            {:else}
                <div class="max-h-[min(60dvh,40rem)] table-scroll">
                    <Table.Root>
                        <Table.Header
                            class="sticky top-0 z-10 bg-zinc-50/95 backdrop-blur-sm dark:bg-[#1b1b1b]/95 [&_th]:h-9 [&_th]:px-3 [&_th]:text-[10px] [&_th]:font-semibold [&_th]:tracking-wider [&_th]:text-zinc-500 [&_th]:uppercase dark:[&_th]:text-zinc-400"
                        >
                            <Table.Row>
                                <Table.Head>Principal</Table.Head>
                                <Table.Head>Status</Table.Head>
                                <Table.Head>Permission</Table.Head>
                                <Table.Head>Credentials</Table.Head>
                                <Table.Head>Last verified</Table.Head>
                                <Table.Head class="text-right"
                                    >Actions</Table.Head
                                >
                            </Table.Row>
                        </Table.Header>
                        <Table.Body
                            class="[&_td]:h-10 [&_td]:px-3 [&_td]:py-1.5 [&_tr]:hover:bg-amber-50/60 dark:[&_tr]:hover:bg-amber-500/5"
                        >
                            {#each principalListQuery.data?.data ?? [] as principal (principal.publicId)}
                                <Table.Row>
                                    <Table.Cell>
                                        <div class="flex flex-col gap-1">
                                            <span class="font-medium">
                                                {principal.name}
                                            </span>
                                            <span
                                                class="max-w-48 truncate font-mono text-xs text-muted-foreground"
                                            >
                                                {principal.publicId}
                                            </span>
                                        </div>
                                    </Table.Cell>
                                    <Table.Cell>
                                        <Badge
                                            variant={principal.enabled
                                                ? 'secondary'
                                                : 'outline'}
                                        >
                                            {principal.enabled
                                                ? 'Enabled'
                                                : 'Disabled'}
                                        </Badge>
                                    </Table.Cell>
                                    <Table.Cell>
                                        <Badge variant="outline">
                                            {permissionLabel(principal)}
                                        </Badge>
                                    </Table.Cell>
                                    <Table.Cell>
                                        {principal.activeCredentialCount} / 2 active
                                    </Table.Cell>
                                    <Table.Cell>
                                        {formatDate(
                                            principal.lastVerifiedAt,
                                            'Never verified',
                                        )}
                                    </Table.Cell>
                                    <Table.Cell>
                                        <div
                                            class="flex flex-wrap justify-end gap-2"
                                        >
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onclick={() =>
                                                    openCredentialManager(
                                                        principal,
                                                    )}
                                                disabled={isInteractionLocked()}
                                            >
                                                Credentials
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                onclick={() =>
                                                    openEditPrincipalDialog(
                                                        principal,
                                                    )}
                                                disabled={isInteractionLocked()}
                                            >
                                                Edit
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                onclick={() =>
                                                    openPrincipalActionDialog(
                                                        principal,
                                                        principal.enabled
                                                            ? 'disable'
                                                            : 'enable',
                                                    )}
                                                disabled={isInteractionLocked()}
                                            >
                                                {principal.enabled
                                                    ? 'Disable'
                                                    : 'Enable'}
                                            </Button>
                                            {#if !principal.enabled}
                                                <Button
                                                    size="sm"
                                                    variant="destructive"
                                                    onclick={() =>
                                                        openPrincipalActionDialog(
                                                            principal,
                                                            'delete',
                                                        )}
                                                    disabled={isInteractionLocked()}
                                                >
                                                    Delete
                                                </Button>
                                            {/if}
                                        </div>
                                    </Table.Cell>
                                </Table.Row>
                            {/each}
                        </Table.Body>
                    </Table.Root>
                </div>
            {/if}
        </Card.Content>
        {#if (principalListQuery.data?.count ?? 0) > PAGE_SIZE}
            <Card.Footer
                class="shrink-0 border-t border-zinc-100 bg-zinc-50/70 px-2 py-1.5 dark:border-zinc-800 dark:bg-zinc-900/35"
            >
                <Pagination.Root
                    count={principalListQuery.data?.count ?? 0}
                    perPage={PAGE_SIZE}
                    bind:page={principalPage}
                >
                    {#snippet children({ pages, currentPage })}
                        <Pagination.Content>
                            <Pagination.Item>
                                <Pagination.Previous
                                    disabled={isInteractionLocked()}
                                />
                            </Pagination.Item>
                            {#each pages as page (page.key)}
                                {#if page.type === 'ellipsis'}
                                    <Pagination.Item>
                                        <Pagination.Ellipsis />
                                    </Pagination.Item>
                                {:else}
                                    <Pagination.Item>
                                        <Pagination.Link
                                            disabled={isInteractionLocked()}
                                            isActive={currentPage ===
                                                page.value}
                                            {page}
                                        />
                                    </Pagination.Item>
                                {/if}
                            {/each}
                            <Pagination.Item>
                                <Pagination.Next
                                    disabled={isInteractionLocked()}
                                />
                            </Pagination.Item>
                        </Pagination.Content>
                    {/snippet}
                </Pagination.Root>
            </Card.Footer>
        {/if}
    </Card.Root>
</div>

<Dialog.Root
    bind:open={() => createPrincipalOpen, handleCreatePrincipalOpenChange}
>
    <Dialog.Content
        class="max-h-[calc(100svh-2rem)] overflow-y-auto overscroll-contain"
    >
        <form
            class="grid gap-4"
            onsubmit={handleCreatePrincipal}
        >
            <Dialog.Header>
                <Dialog.Title>Create service principal</Dialog.Title>
                <Dialog.Description>
                    Creates a non-human identity for {audience}. It is not
                    connected to a user account or login session.
                </Dialog.Description>
            </Dialog.Header>
            <Field.Group>
                <Field.Field>
                    <Field.Label for="create-principal-name">Name</Field.Label>
                    <Input
                        id="create-principal-name"
                        bind:value={principalName}
                        disabled={isInteractionLocked() ||
                            Boolean(principalCreateAttempt)}
                        maxlength={64}
                        required
                    />
                </Field.Field>
                <Field.Field>
                    <Field.Label for="create-principal-description">
                        Description
                    </Field.Label>
                    <Textarea
                        id="create-principal-description"
                        bind:value={principalDescription}
                        disabled={isInteractionLocked() ||
                            Boolean(principalCreateAttempt)}
                        maxlength={512}
                    />
                </Field.Field>
                <Field.Field>
                    <Field.Label>Required permission</Field.Label>
                    <Badge variant="outline">
                        {Object.keys(
                            createServicePrincipalPermissions(audience),
                        )[0]}.access
                    </Badge>
                </Field.Field>
            </Field.Group>
            <Dialog.Footer>
                <Button
                    type="button"
                    variant="outline"
                    onclick={() => handleCreatePrincipalOpenChange(false)}
                    disabled={isInteractionLocked()}
                >
                    Cancel
                </Button>
                <Button
                    type="submit"
                    disabled={isInteractionLocked() || !principalName.trim()}
                >
                    {#if createPrincipalMutation.isPending}<Spinner
                            data-icon="inline-start"
                        />{/if}
                    Create
                </Button>
            </Dialog.Footer>
        </form>
    </Dialog.Content>
</Dialog.Root>

<Dialog.Root bind:open={() => editPrincipalOpen, handleEditPrincipalOpenChange}>
    <Dialog.Content
        class="max-h-[calc(100svh-2rem)] overflow-y-auto overscroll-contain"
    >
        <form
            class="grid gap-4"
            onsubmit={handleUpdatePrincipal}
        >
            <Dialog.Header>
                <Dialog.Title>Edit service principal</Dialog.Title>
                <Dialog.Description>
                    Update the stable identity. Its audience cannot be changed.
                </Dialog.Description>
            </Dialog.Header>
            <Field.Group>
                <Field.Field>
                    <Field.Label for="edit-principal-name">Name</Field.Label>
                    <Input
                        id="edit-principal-name"
                        bind:value={principalName}
                        disabled={isInteractionLocked()}
                        maxlength={64}
                        required
                    />
                </Field.Field>
                <Field.Field>
                    <Field.Label for="edit-principal-description">
                        Description
                    </Field.Label>
                    <Textarea
                        id="edit-principal-description"
                        bind:value={principalDescription}
                        disabled={isInteractionLocked()}
                        maxlength={512}
                    />
                </Field.Field>
                <Field.Field>
                    <Field.Label>Required permission</Field.Label>
                    {#if selectedPrincipal}
                        <Badge variant="outline">
                            {Object.keys(
                                createServicePrincipalPermissions(
                                    selectedPrincipal.audience,
                                ),
                            )[0]}.access
                        </Badge>
                    {/if}
                </Field.Field>
            </Field.Group>
            <Dialog.Footer>
                <Button
                    type="button"
                    variant="outline"
                    onclick={() => handleEditPrincipalOpenChange(false)}
                    disabled={isInteractionLocked()}
                >
                    Cancel
                </Button>
                <Button
                    type="submit"
                    disabled={isInteractionLocked() || !principalName.trim()}
                >
                    {#if updatePrincipalMutation.isPending}<Spinner
                            data-icon="inline-start"
                        />{/if}
                    Save
                </Button>
            </Dialog.Footer>
        </form>
    </Dialog.Content>
</Dialog.Root>

<AlertDialog.Root
    bind:open={() => principalActionOpen, handlePrincipalActionOpenChange}
>
    <AlertDialog.Content
        class="max-h-[calc(100svh-2rem)] max-w-[calc(100vw-2rem)] overflow-y-auto overscroll-contain"
    >
        <AlertDialog.Header>
            <AlertDialog.Title>{principalActionTitle()}</AlertDialog.Title>
            <AlertDialog.Description>
                {principalActionDescription()}
            </AlertDialog.Description>
        </AlertDialog.Header>
        <AlertDialog.Footer>
            <AlertDialog.Cancel disabled={isInteractionLocked()}>
                Cancel
            </AlertDialog.Cancel>
            <AlertDialog.Action
                variant={principalAction === 'delete'
                    ? 'destructive'
                    : 'default'}
                onclick={handlePrincipalAction}
                disabled={isInteractionLocked()}
            >
                {#if isActionLocked}<Spinner data-icon="inline-start" />{/if}
                Confirm
            </AlertDialog.Action>
        </AlertDialog.Footer>
    </AlertDialog.Content>
</AlertDialog.Root>

<Dialog.Root
    bind:open={() => credentialManagerOpen, handleCredentialManagerOpenChange}
>
    <Dialog.Content
        class="max-h-[calc(100svh-2rem)] overflow-y-auto overscroll-contain sm:max-w-3xl"
    >
        <Dialog.Header>
            <Dialog.Title>
                Credentials for {selectedPrincipal?.name ?? 'service principal'}
            </Dialog.Title>
            <Dialog.Description>
                Credentials authenticate this principal and cannot be edited
                after issuance.
            </Dialog.Description>
        </Dialog.Header>

        <div class="flex justify-end">
            <Button
                onclick={openCreateCredentialDialog}
                disabled={isInteractionLocked() ||
                    !selectedPrincipal?.enabled ||
                    (selectedPrincipal?.activeCredentialCount ?? 0) >= 2}
            >
                <PlusIcon data-icon="inline-start" />
                Issue credential
            </Button>
        </div>

        {#if !selectedPrincipal?.enabled}
            <Alert.Root>
                <AlertCircleIcon />
                <Alert.Title>Principal disabled</Alert.Title>
                <Alert.Description>
                    Re-enable the principal before issuing another credential.
                </Alert.Description>
            </Alert.Root>
        {:else if (selectedPrincipal?.activeCredentialCount ?? 0) >= 2}
            <Alert.Root>
                <AlertCircleIcon />
                <Alert.Title>Credential limit reached</Alert.Title>
                <Alert.Description>
                    Revoke or allow a credential to expire before issuing
                    another.
                </Alert.Description>
            </Alert.Root>
        {/if}

        {#if credentialListQuery.isPending}
            <div
                class="flex min-h-32 items-center justify-center gap-2 text-sm"
            >
                <Spinner /> Loading credentials…
            </div>
        {:else if credentialListQuery.isError}
            <Alert.Root variant="destructive">
                <AlertCircleIcon />
                <Alert.Title>Could not load credentials</Alert.Title>
                <Alert.Description>
                    {getErrorMessage(credentialListQuery.error, 'Try again.')}
                </Alert.Description>
            </Alert.Root>
        {:else if (credentialListQuery.data?.data.length ?? 0) === 0}
            <Empty.Root class="min-h-32 border">
                <Empty.Header>
                    <Empty.Media variant="icon">
                        <KeyRoundIcon />
                    </Empty.Media>
                    <Empty.Title>No credentials</Empty.Title>
                    <Empty.Description>
                        Issue a credential to authenticate this principal.
                    </Empty.Description>
                </Empty.Header>
            </Empty.Root>
        {:else}
            <div class="max-h-[min(60dvh,40rem)] table-scroll">
                <Table.Root>
                    <Table.Header
                        class="sticky top-0 z-10 bg-zinc-50/95 backdrop-blur-sm dark:bg-[#1b1b1b]/95 [&_th]:h-9 [&_th]:px-3 [&_th]:text-[10px] [&_th]:font-semibold [&_th]:tracking-wider [&_th]:text-zinc-500 [&_th]:uppercase dark:[&_th]:text-zinc-400"
                    >
                        <Table.Row>
                            <Table.Head>Name</Table.Head>
                            <Table.Head>Key start</Table.Head>
                            <Table.Head>Expires</Table.Head>
                            <Table.Head>Last verified</Table.Head>
                            <Table.Head class="text-right">Action</Table.Head>
                        </Table.Row>
                    </Table.Header>
                    <Table.Body
                        class="[&_td]:h-10 [&_td]:px-3 [&_td]:py-1.5 [&_tr]:hover:bg-amber-50/60 dark:[&_tr]:hover:bg-amber-500/5"
                    >
                        {#each credentialListQuery.data?.data ?? [] as credential (credential.id)}
                            <Table.Row>
                                <Table.Cell class="font-medium">
                                    {credential.name}
                                </Table.Cell>
                                <Table.Cell class="font-mono text-xs">
                                    {credential.start ?? 'Unavailable'}…
                                </Table.Cell>
                                <Table.Cell>
                                    {formatDate(credential.expiresAt, 'Never')}
                                </Table.Cell>
                                <Table.Cell>
                                    {formatDate(
                                        credential.lastVerifiedAt,
                                        'Never verified',
                                    )}
                                </Table.Cell>
                                <Table.Cell class="text-right">
                                    <Button
                                        size="sm"
                                        variant="destructive"
                                        onclick={() =>
                                            openRevokeCredentialDialog(
                                                credential,
                                            )}
                                        disabled={isInteractionLocked()}
                                    >
                                        Revoke
                                    </Button>
                                </Table.Cell>
                            </Table.Row>
                        {/each}
                    </Table.Body>
                </Table.Root>
            </div>
        {/if}
    </Dialog.Content>
</Dialog.Root>

<Dialog.Root
    bind:open={() => createCredentialOpen, handleCreateCredentialOpenChange}
>
    <Dialog.Content
        class="max-h-[calc(100svh-2rem)] overflow-y-auto overscroll-contain"
    >
        <form
            class="grid gap-4"
            onsubmit={handleCreateCredential}
        >
            <Dialog.Header>
                <Dialog.Title>Issue credential</Dialog.Title>
                <Dialog.Description>
                    The raw key is shown once. Credential properties are
                    immutable; revoke and replace to change them.
                </Dialog.Description>
            </Dialog.Header>
            <Field.Group>
                <Field.Field>
                    <Field.Label for="credential-name">Name</Field.Label>
                    <Input
                        id="credential-name"
                        bind:value={credentialName}
                        disabled={isInteractionLocked() ||
                            Boolean(credentialCreateAttempt)}
                        maxlength={64}
                        required
                    />
                </Field.Field>
                <Field.Field>
                    <Field.Label for="credential-expiry-mode">
                        Expiration
                    </Field.Label>
                    <NativeSelect.Root
                        id="credential-expiry-mode"
                        value={credentialExpiryMode}
                        onchange={handleCredentialExpiryMode}
                        disabled={isInteractionLocked() ||
                            Boolean(credentialCreateAttempt)}
                    >
                        <NativeSelect.Option value="expires">
                            Expires after a set number of days
                        </NativeSelect.Option>
                        <NativeSelect.Option value="never">
                            Never expires
                        </NativeSelect.Option>
                    </NativeSelect.Root>
                </Field.Field>
                {#if credentialExpiryMode === 'expires'}
                    <Field.Field>
                        <Field.Label for="credential-expiry-days">
                            Expiry days
                        </Field.Label>
                        <Input
                            id="credential-expiry-days"
                            bind:value={credentialExpiryDays}
                            disabled={isInteractionLocked() ||
                                Boolean(credentialCreateAttempt)}
                            type="number"
                            min={1}
                            max={365}
                            required
                        />
                        <Field.Description>
                            Defaults to 90 days; allowed range is 1–365.
                        </Field.Description>
                    </Field.Field>
                {:else}
                    <Alert.Root variant="destructive">
                        <AlertCircleIcon />
                        <Alert.Title>Permanent credential</Alert.Title>
                        <Alert.Description>
                            A never-expiring secret increases long-term
                            exposure. Prefer rotation with a finite expiration.
                        </Alert.Description>
                    </Alert.Root>
                {/if}
            </Field.Group>
            {#if credentialCreateAttempt}
                <Alert.Root variant="destructive">
                    <AlertCircleIcon />
                    <Alert.Title>Credential outcome unresolved</Alert.Title>
                    <Alert.Description>
                        Retry the unchanged request, or inspect this principal's
                        credentials and revoke any uncertain credential. Start a
                        new attempt only after acknowledging that the previous
                        request is not canceled and its secret cannot be
                        recovered.
                    </Alert.Description>
                    <div class="flex flex-wrap gap-2 pt-2">
                        <Button
                            type="submit"
                            size="sm"
                            disabled={isInteractionLocked()}
                        >
                            {#if createCredentialMutation.isPending}<Spinner
                                    data-icon="inline-start"
                                />{/if}
                            Retry unchanged request
                        </Button>
                        <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onclick={handleInspectCredentialAttempt}
                            disabled={isInteractionLocked()}
                        >
                            Inspect credentials
                        </Button>
                        <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onclick={openCredentialRecoveryDialog}
                            disabled={isInteractionLocked()}
                        >
                            Start a new attempt
                        </Button>
                    </div>
                </Alert.Root>
            {/if}
            <Dialog.Footer>
                <Button
                    type="button"
                    variant="outline"
                    onclick={() => handleCreateCredentialOpenChange(false)}
                    disabled={isInteractionLocked()}
                >
                    Cancel
                </Button>
                {#if !credentialCreateAttempt}
                    <Button
                        type="submit"
                        disabled={isInteractionLocked() ||
                            !credentialName.trim()}
                    >
                        {#if createCredentialMutation.isPending}<Spinner
                                data-icon="inline-start"
                            />{/if}
                        Issue
                    </Button>
                {/if}
            </Dialog.Footer>
        </form>
    </Dialog.Content>
</Dialog.Root>

<AlertDialog.Root
    bind:open={() => credentialRecoveryOpen, handleCredentialRecoveryOpenChange}
>
    <AlertDialog.Content
        class="max-h-[calc(100svh-2rem)] max-w-[calc(100vw-2rem)] overflow-y-auto overscroll-contain"
    >
        <AlertDialog.Header>
            <AlertDialog.Title>
                Start a new credential attempt?
            </AlertDialog.Title>
            <AlertDialog.Description>
                The previous request is not canceled, and its secret cannot be
                recovered. Inspect and revoke any uncertain credential before
                continuing. This only clears the saved attempt and prepares a
                blank form; it does not issue or revoke a credential.
            </AlertDialog.Description>
        </AlertDialog.Header>
        <AlertDialog.Footer>
            <AlertDialog.Cancel disabled={isInteractionLocked()}>
                Keep previous attempt
            </AlertDialog.Cancel>
            <AlertDialog.Action
                onclick={handleAbandonCredentialAttempt}
                disabled={isInteractionLocked()}
            >
                Start new attempt
            </AlertDialog.Action>
        </AlertDialog.Footer>
    </AlertDialog.Content>
</AlertDialog.Root>

<AlertDialog.Root
    bind:open={() => revokeCredentialOpen, handleRevokeCredentialOpenChange}
>
    <AlertDialog.Content
        class="max-h-[calc(100svh-2rem)] max-w-[calc(100vw-2rem)] overflow-y-auto overscroll-contain"
    >
        <AlertDialog.Header>
            <AlertDialog.Title>Revoke credential?</AlertDialog.Title>
            <AlertDialog.Description>
                {selectedCredential?.name ?? 'This credential'} will stop authenticating
                immediately. This cannot be undone.
            </AlertDialog.Description>
        </AlertDialog.Header>
        <AlertDialog.Footer>
            <AlertDialog.Cancel disabled={isInteractionLocked()}>
                Cancel
            </AlertDialog.Cancel>
            <AlertDialog.Action
                variant="destructive"
                onclick={handleRevokeCredential}
                disabled={isInteractionLocked()}
            >
                {#if revokeCredentialMutation.isPending}<Spinner
                        data-icon="inline-start"
                    />{/if}
                Revoke
            </AlertDialog.Action>
        </AlertDialog.Footer>
    </AlertDialog.Content>
</AlertDialog.Root>

<Dialog.Root
    open={secretOpen}
    onOpenChange={handleSecretOpenChange}
>
    <Dialog.Content
        class="max-h-[calc(100svh-2rem)] overflow-y-auto overscroll-contain"
    >
        <Dialog.Header>
            <Dialog.Title>Copy this credential now</Dialog.Title>
            <Dialog.Description>
                This secret cannot be recovered or displayed again. Store it in
                a secret manager.
            </Dialog.Description>
        </Dialog.Header>
        <div class="rounded-md border bg-muted p-3 font-mono text-sm break-all">
            {rawCredential}
        </div>
        <Dialog.Footer>
            <Button
                type="button"
                variant="outline"
                onclick={handleCopySecret}
            >
                <CopyIcon data-icon="inline-start" /> Copy
            </Button>
            <Button
                type="button"
                onclick={() => handleSecretOpenChange(false)}
            >
                Done
            </Button>
        </Dialog.Footer>
    </Dialog.Content>
</Dialog.Root>
