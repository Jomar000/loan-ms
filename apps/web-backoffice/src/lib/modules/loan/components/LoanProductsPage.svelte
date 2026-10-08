<script lang="ts">
    import * as Alert from '@loanms/ui/components/alert'
    import { Badge } from '@loanms/ui/components/badge'
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

<section
    class="flex min-h-0 page-scroll flex-1 flex-col bg-zinc-50/80 p-3 md:p-4 dark:bg-[#171717]"
>
    <div
        class="mb-3 overflow-hidden rounded-xl border border-amber-200/70 bg-white shadow-sm dark:border-amber-500/15 dark:bg-[#202020]"
    >
        <div
            class="h-1 bg-linear-to-r from-amber-500 via-yellow-400 to-amber-600"
        ></div>
        <header
            class="flex flex-col gap-3 p-3 lg:flex-row lg:items-center lg:justify-between"
        >
            <div class="flex min-w-0 items-center gap-2.5">
                <div
                    class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300"
                >
                    <PlusIcon class="size-4" />
                </div>
                <div class="min-w-0">
                    <h1
                        class="truncate text-lg font-semibold tracking-tight text-zinc-950 md:text-xl dark:text-zinc-50"
                    >
                        Loan products
                    </h1>
                    <p class="text-xs/5 text-zinc-500 dark:text-zinc-400">
                        Reusable terms for future loans. Changes never alter
                        existing loans.
                    </p>
                </div>
            </div>
            <Button
                class="h-8 bg-amber-500 px-3 text-xs font-semibold text-zinc-950 shadow-sm hover:bg-amber-400 dark:bg-amber-400 dark:hover:bg-amber-300"
                onclick={() => (createOpen = true)}
                size="sm"
            >
                <PlusIcon
                    class="size-3.5"
                    data-icon="inline-start"
                />
                Create loan product
            </Button>
        </header>
    </div>
    <div
        class="flex min-h-80 flex-1 flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-[#202020]"
    >
        {#if productsQuery.isPending}
            <div
                role="status"
                class="flex min-h-0 flex-1 flex-col gap-2 p-3"
            >
                <span class="sr-only">Loading loan products</span>
                <div
                    class="grid shrink-0 grid-cols-4 gap-3 border-b border-zinc-100 px-3 pb-2 dark:border-zinc-800"
                >
                    {#each [0, 1, 2, 3] as column (column)}
                        <Skeleton class="h-4 w-full rounded-sm" />
                    {/each}
                </div>
                {#each SKELETON_ROWS as row (row)}
                    <Skeleton class="h-10 w-full rounded-lg" />
                {/each}
            </div>
        {:else if productsQuery.isError}
            <div class="flex min-h-0 flex-1 items-start p-3">
                <Alert.Root
                    class="w-full rounded-xl border-red-200 bg-red-50/70 shadow-none dark:border-red-500/20 dark:bg-red-500/5"
                    variant="destructive"
                >
                    <AlertCircleIcon />
                    <Alert.Title>Loan products could not be loaded</Alert.Title>
                    <Alert.Description
                        >Try refreshing the product catalog.</Alert.Description
                    >
                    <Button
                        class="mt-2 h-8 border-red-200 bg-white px-2.5 text-xs hover:bg-red-50 dark:border-red-500/20 dark:bg-zinc-900 dark:hover:bg-red-500/10"
                        onclick={() => void productsQuery.refetch()}
                        size="sm"
                        variant="outline"
                    >
                        <RefreshCwIcon
                            class="size-3.5"
                            data-icon="inline-start"
                        />
                        Refresh
                    </Button>
                </Alert.Root>
            </div>
        {:else if products.length === 0}
            <div class="flex min-h-0 flex-1 p-3">
                <Empty.Root
                    class="min-h-full w-full rounded-xl border border-dashed border-amber-200 bg-amber-50/30 py-8 dark:border-amber-500/20 dark:bg-amber-500/5"
                >
                    <Empty.Header>
                        <Empty.Media
                            class="bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300"
                            variant="icon"
                        >
                            <PlusIcon />
                        </Empty.Media>
                        <Empty.Title>No loan products</Empty.Title>
                        <Empty.Description>
                            Create a product before preparing a loan quote.
                        </Empty.Description>
                    </Empty.Header>
                    <Empty.Content>
                        <Button
                            class="h-8 border-amber-300 bg-white px-3 text-xs font-semibold text-amber-800 hover:bg-amber-50 dark:border-amber-500/30 dark:bg-zinc-900 dark:text-amber-300 dark:hover:bg-amber-500/10"
                            onclick={() => (createOpen = true)}
                            size="sm"
                            variant="outline"
                        >
                            <PlusIcon
                                class="size-3.5"
                                data-icon="inline-start"
                            />
                            Create loan product
                        </Button>
                    </Empty.Content>
                </Empty.Root>
            </div>
        {:else}
            <div class="min-h-0 table-scroll flex-1">
                <Table.Root class="min-w-[760px] text-xs">
                    <Table.Caption class="sr-only"
                        >Loan product catalog</Table.Caption
                    >
                    <Table.Header
                        class="sticky top-0 z-10 bg-zinc-50/95 backdrop-blur-sm dark:bg-[#1b1b1b]/95"
                    >
                        <Table.Row
                            class="border-b border-zinc-200 hover:bg-transparent dark:border-zinc-800"
                        >
                            <Table.Head
                                class="h-9 px-3 text-[10px] font-semibold tracking-wider text-zinc-500 uppercase dark:text-zinc-400"
                            >
                                Product
                            </Table.Head>
                            <Table.Head
                                class="h-9 px-3 text-right text-[10px] font-semibold tracking-wider text-zinc-500 uppercase dark:text-zinc-400"
                            >
                                Principal range
                            </Table.Head>
                            <Table.Head
                                class="h-9 px-3 text-[10px] font-semibold tracking-wider text-zinc-500 uppercase dark:text-zinc-400"
                            >
                                Formula profile
                            </Table.Head>
                            <Table.Head
                                class="h-9 px-3 text-[10px] font-semibold tracking-wider text-zinc-500 uppercase dark:text-zinc-400"
                            >
                                Status
                            </Table.Head>
                        </Table.Row>
                    </Table.Header>
                    <Table.Body>
                        {#each products as product (product.publicId)}
                            <Table.Row
                                class="border-b border-zinc-100 transition-colors hover:bg-amber-50/60 dark:border-zinc-800/80 dark:hover:bg-amber-500/5"
                            >
                                <Table.Cell
                                    class="h-11 px-3 py-1.5 font-semibold text-zinc-950 dark:text-zinc-100"
                                >
                                    {product.name}
                                </Table.Cell>
                                <Table.Cell
                                    class="h-11 px-3 py-1.5 text-right font-mono text-xs font-semibold text-zinc-900 tabular-nums dark:text-zinc-100"
                                >
                                    {formatCurrency(
                                        product.minimumPrincipalMinor,
                                    )} – {formatCurrency(
                                        product.maximumPrincipalMinor,
                                    )}
                                </Table.Cell>
                                <Table.Cell
                                    class="h-11 max-w-56 truncate px-3 py-1.5 font-mono text-[11px] text-zinc-600 dark:text-zinc-400"
                                    title={product.formulaProfilePublicId}
                                >
                                    {product.formulaProfilePublicId}
                                </Table.Cell>
                                <Table.Cell class="h-11 px-3 py-1.5">
                                    <Badge
                                        variant="outline"
                                        class="h-6 rounded-full border-zinc-200 bg-zinc-50 px-2 text-[10px] font-semibold tracking-wide text-zinc-600 uppercase dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
                                    >
                                        {product.isActive
                                            ? 'Active'
                                            : 'Inactive'}
                                    </Badge>
                                </Table.Cell>
                            </Table.Row>
                        {/each}
                    </Table.Body>
                </Table.Root>
            </div>
        {/if}
    </div>
</section>
<Dialog.Root bind:open={() => createOpen, handleCreateOpenChange}>
    <Dialog.Content
        class="max-h-[calc(100svh-2rem)] overflow-y-auto overscroll-contain border-amber-200/70 bg-white shadow-2xl sm:max-w-xl dark:border-amber-500/20 dark:bg-[#202020]"
    >
        <form
            class="grid gap-4"
            onsubmit={handleCreate}
        >
            <Dialog.Header
                class="border-b border-zinc-100 pb-3 dark:border-zinc-800"
            >
                <Dialog.Title>Create loan product</Dialog.Title>
                <Dialog.Description>
                    These values are copied into each loan when it is created.
                </Dialog.Description>
            </Dialog.Header>
            <Field.Group class="gap-4">
                <Field.Field>
                    <Field.Label for="product-name">Name</Field.Label>
                    <Input
                        class="h-9"
                        id="product-name"
                        bind:value={draft.name}
                        disabled={isCreating}
                        maxlength={120}
                        required
                    />
                </Field.Field>
                <Field.Field>
                    <Field.Label for="formula-profile-public-id"
                        >Formula profile</Field.Label
                    >
                    <NativeSelect.Root
                        class="h-9 text-sm"
                        id="formula-profile-public-id"
                        bind:value={draft.formulaProfilePublicId}
                        disabled={isCreating || formulaProfilesQuery.isPending}
                        required
                    >
                        <NativeSelect.Option value=""
                            >Select an active profile</NativeSelect.Option
                        >
                        {#each formulaProfiles as profile (profile.publicId)}
                            <NativeSelect.Option value={profile.publicId}>
                                {profile.name} · v{profile.version}{profile.isDefault
                                    ? ' · Default'
                                    : ''}
                            </NativeSelect.Option>
                        {/each}
                    </NativeSelect.Root>
                    <Field.Description class="text-xs">
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
                <div class="grid gap-3 sm:grid-cols-2">
                    <Field.Field>
                        <Field.Label for="product-minimum"
                            >Minimum principal (PHP)</Field.Label
                        >
                        <Input
                            class="h-9 font-mono tabular-nums"
                            id="product-minimum"
                            bind:value={draft.minimumPrincipal}
                            disabled={isCreating}
                            inputmode="decimal"
                            min="0.01"
                            required
                            step="0.01"
                            type="number"
                        />
                    </Field.Field>
                    <Field.Field>
                        <Field.Label for="product-maximum"
                            >Maximum principal (PHP)</Field.Label
                        >
                        <Input
                            class="h-9 font-mono tabular-nums"
                            id="product-maximum"
                            bind:value={draft.maximumPrincipal}
                            disabled={isCreating}
                            inputmode="decimal"
                            min="0.01"
                            required
                            step="0.01"
                            type="number"
                        />
                    </Field.Field>
                </div>
            </Field.Group>
            <Dialog.Footer
                class="border-t border-zinc-100 pt-3 dark:border-zinc-800"
            >
                <Button
                    class="h-8"
                    type="button"
                    disabled={isCreating}
                    onclick={() => handleCreateOpenChange(false)}
                    variant="outline"
                >
                    Cancel
                </Button>
                <Button
                    class="h-8 bg-amber-500 px-3 text-xs font-semibold text-zinc-950 hover:bg-amber-400 dark:bg-amber-400 dark:hover:bg-amber-300"
                    type="submit"
                    disabled={isCreating || formulaProfiles.length === 0}
                >
                    {#if isCreating}
                        <Spinner data-icon="inline-start" />
                    {/if}
                    Create product
                </Button>
            </Dialog.Footer>
        </form>
    </Dialog.Content>
</Dialog.Root>
