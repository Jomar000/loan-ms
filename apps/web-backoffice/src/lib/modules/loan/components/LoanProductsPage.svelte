<script lang="ts">
    import * as Alert from '@loanms/ui/components/alert'
    import { Button } from '@loanms/ui/components/button'
    import * as Dialog from '@loanms/ui/components/dialog'
    import * as Empty from '@loanms/ui/components/empty'
    import * as Field from '@loanms/ui/components/field'
    import { Input } from '@loanms/ui/components/input'
    import * as NativeSelect from '@loanms/ui/components/native-select'
    import { Skeleton } from '@loanms/ui/components/skeleton'
    import { Spinner } from '@loanms/ui/components/spinner'
    import * as Table from '@loanms/ui/components/table'
    import AlertCircleIcon from '@lucide/svelte/icons/alert-circle'
    import PlusIcon from '@lucide/svelte/icons/plus'
    import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw'
    import { toast } from 'svelte-sonner'

    import { useSessionContext } from '$lib/states/session'
    import { getErrorMessage } from '$lib/utilities/helpers'
    import { createIdempotencyKeyLifecycle } from '$lib/utilities/idempotencyKey'
    import { createFormulaProfilesQuery } from '../../settings/queries'
    import {
        createLoanProductCreateMutation,
        createLoanProductsQuery,
    } from '../queries'
    import type { LoanProductCreateInput } from '../types'
    import { formatCurrency, toMinorUnits } from '../utilities/format'

    ///////////////////
    // 02. Constants //
    ///////////////////

    const session = useSessionContext()
    const SKELETON_ROWS = [
        0,
        1,
        2,
    ]
    const createIdempotencyKey = createIdempotencyKeyLifecycle()

    ///////////////
    // 03. State //
    ///////////////

    let createOpen = $state(false)
    let draft = $state(createDraft())
    let isCreating = $state(false)

    /////////////////
    // 05. Queries //
    /////////////////

    const productsQuery = createLoanProductsQuery({
        get organizationSlug() {
            return session.data.organizationSlug
        },
    })
    const formulaProfilesQuery = createFormulaProfilesQuery(
        {
            get organizationSlug() {
                return session.data.organizationSlug
            },
        },
        { isActive: true },
    )
    const formulaProfiles = $derived(formulaProfilesQuery.data ?? [])
    const products = $derived(productsQuery.data ?? [])

    ///////////////////
    // 06. Mutations //
    ///////////////////

    const createMutation = createLoanProductCreateMutation({
        get organizationSlug() {
            return session.data.organizationSlug
        },
    })

    //////////////////
    // 09. Handlers //
    //////////////////

    function handleCreateOpenChange(open: boolean) {
        if (isCreating) return
        createOpen = open
        if (!open) {
            createIdempotencyKey.abandonAttempt()
            draft = createDraft()
        }
    }

    async function handleCreate(event: SubmitEvent) {
        event.preventDefault()
        if (isCreating) return

        const input = toCreateInput(draft)
        if (!input) {
            toast.error('Enter valid whole-peso or centavo amounts.')
            return
        }

        const claim = createIdempotencyKey.claim(input)
        if (!claim.ok) {
            toast.error(
                'Retry the unresolved request without changing its details.',
            )
            return
        }

        isCreating = true
        try {
            await createMutation.mutateAsync({
                ...input,
                idempotencyKey: claim.key,
            })
            createIdempotencyKey.confirmSuccess()
            toast.success('Loan product created.')
            handleCreateOpenChange(false)
        } catch (error) {
            toast.error(
                getErrorMessage(error, 'Could not create loan product.'),
            )
        } finally {
            isCreating = false
        }
    }

    /////////////////
    // 10. Helpers //
    /////////////////

    function createDraft() {
        return {
            formulaProfilePublicId: '',
            maximumPrincipal: '',
            minimumPrincipal: '',
            name: '',
        }
    }

    function toCreateInput(
        value: ReturnType<typeof createDraft>,
    ): LoanProductCreateInput | null {
        const maximumPrincipalMinor = toMinorUnits(value.maximumPrincipal)
        const minimumPrincipalMinor = toMinorUnits(value.minimumPrincipal)

        if (
            !value.name.trim() ||
            !value.formulaProfilePublicId.trim() ||
            maximumPrincipalMinor === null ||
            minimumPrincipalMinor === null ||
            maximumPrincipalMinor <= 0 ||
            minimumPrincipalMinor <= 0 ||
            minimumPrincipalMinor > maximumPrincipalMinor
        ) {
            return null
        }

        return {
            formulaProfilePublicId: value.formulaProfilePublicId.trim(),
            idempotencyKey: '',
            maximumPrincipalMinor,
            minimumPrincipalMinor,
            name: value.name.trim(),
        }
    }
</script>

<section class="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4 md:p-6">
    <header class="flex flex-wrap items-start justify-between gap-3">
        <div>
            <h2 class="text-xl font-semibold text-foreground">Loan products</h2>
            <p class="text-sm text-muted-foreground">
                Reusable terms for future loans. Changes never alter existing
                loans.
            </p>
        </div>
        <Button onclick={() => (createOpen = true)}>
            <PlusIcon data-icon="inline-start" /> Create loan product
        </Button>
    </header>

    {#if productsQuery.isPending}
        <div class="grid gap-3">
            {#each SKELETON_ROWS as row (row)}
                <Skeleton class="h-18 w-full" />
            {/each}
        </div>
    {:else if productsQuery.isError}
        <Alert.Root variant="destructive">
            <AlertCircleIcon />
            <Alert.Title>Loan products could not be loaded</Alert.Title>
            <Alert.Description
                >Try refreshing the product catalog.</Alert.Description
            >
            <Button
                onclick={() => void productsQuery.refetch()}
                size="sm"
                variant="outline"
            >
                <RefreshCwIcon data-icon="inline-start" /> Refresh
            </Button>
        </Alert.Root>
    {:else if products.length === 0}
        <Empty.Root class="border">
            <Empty.Header>
                <Empty.Media variant="icon"><PlusIcon /></Empty.Media>
                <Empty.Title>No loan products</Empty.Title>
                <Empty.Description
                    >Create a product before preparing a loan quote.</Empty.Description
                >
            </Empty.Header>
        </Empty.Root>
    {:else}
        <div class="overflow-x-auto rounded-md border">
            <Table.Root>
                <Table.Header>
                    <Table.Row>
                        <Table.Head>Product</Table.Head><Table.Head
                            >Principal range</Table.Head
                        ><Table.Head>Formula profile</Table.Head><Table.Head
                            >Status</Table.Head
                        >
                    </Table.Row>
                </Table.Header>
                <Table.Body>
                    {#each products as product (product.publicId)}
                        <Table.Row>
                            <Table.Cell class="font-medium"
                                >{product.name}</Table.Cell
                            >
                            <Table.Cell
                                >{formatCurrency(product.minimumPrincipalMinor)} –
                                {formatCurrency(
                                    product.maximumPrincipalMinor,
                                )}</Table.Cell
                            >
                            <Table.Cell
                                class="max-w-48 truncate font-mono text-xs"
                                title={product.formulaProfilePublicId}
                                >{product.formulaProfilePublicId}</Table.Cell
                            >
                            <Table.Cell
                                >{product.isActive
                                    ? 'Active'
                                    : 'Inactive'}</Table.Cell
                            >
                        </Table.Row>
                    {/each}
                </Table.Body>
            </Table.Root>
        </div>
    {/if}
</section>

<Dialog.Root bind:open={() => createOpen, handleCreateOpenChange}>
    <Dialog.Content class="max-h-[90vh] max-w-xl overflow-y-auto">
        <form
            class="grid gap-5"
            onsubmit={handleCreate}
        >
            <Dialog.Header>
                <Dialog.Title>Create loan product</Dialog.Title>
                <Dialog.Description
                    >These values are copied into each loan when it is created.</Dialog.Description
                >
            </Dialog.Header>
            <Field.Group>
                <Field.Field
                    ><Field.Label for="product-name">Name</Field.Label><Input
                        id="product-name"
                        bind:value={draft.name}
                        disabled={isCreating}
                        maxlength={120}
                        required
                    /></Field.Field
                >
                <Field.Field>
                    <Field.Label for="formula-profile-public-id"
                        >Formula profile</Field.Label
                    >
                    <NativeSelect.Root
                        id="formula-profile-public-id"
                        bind:value={draft.formulaProfilePublicId}
                        disabled={isCreating || formulaProfilesQuery.isPending}
                        required
                    >
                        <NativeSelect.Option value=""
                            >Select an active profile</NativeSelect.Option
                        >
                        {#each formulaProfiles as profile (profile.publicId)}
                            <NativeSelect.Option value={profile.publicId}
                                >{profile.name} · v{profile.version}{profile.isDefault
                                    ? ' · Default'
                                    : ''}</NativeSelect.Option
                            >
                        {/each}
                    </NativeSelect.Root>
                    <Field.Description>
                        The selected immutable version is snapshotted into this
                        product and its future loans.
                    </Field.Description>
                    {#if formulaProfilesQuery.isError}
                        <Field.Error
                            >Active formula profiles could not be loaded.</Field.Error
                        >
                    {:else if !formulaProfilesQuery.isPending && formulaProfiles.length === 0}
                        <Field.Error
                            >Create and activate a formula profile in Settings
                            first.</Field.Error
                        >
                    {/if}
                </Field.Field>
                <div class="grid gap-4 sm:grid-cols-2">
                    <Field.Field
                        ><Field.Label for="product-minimum"
                            >Minimum principal (PHP)</Field.Label
                        ><Input
                            id="product-minimum"
                            bind:value={draft.minimumPrincipal}
                            disabled={isCreating}
                            inputmode="decimal"
                            min="0.01"
                            required
                            step="0.01"
                            type="number"
                        /></Field.Field
                    >
                    <Field.Field
                        ><Field.Label for="product-maximum"
                            >Maximum principal (PHP)</Field.Label
                        ><Input
                            id="product-maximum"
                            bind:value={draft.maximumPrincipal}
                            disabled={isCreating}
                            inputmode="decimal"
                            min="0.01"
                            required
                            step="0.01"
                            type="number"
                        /></Field.Field
                    >
                </div>
            </Field.Group>
            <Dialog.Footer>
                <Button
                    type="button"
                    disabled={isCreating}
                    onclick={() => handleCreateOpenChange(false)}
                    variant="outline">Cancel</Button
                >
                <Button
                    type="submit"
                    disabled={isCreating || formulaProfiles.length === 0}
                    >{#if isCreating}<Spinner
                            data-icon="inline-start"
                        />{/if}Create product</Button
                >
            </Dialog.Footer>
        </form>
    </Dialog.Content>
</Dialog.Root>
