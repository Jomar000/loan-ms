<script lang="ts">
    import * as Alert from '@loanms/ui/components/alert'
    import { Button } from '@loanms/ui/components/button'
    import * as Dialog from '@loanms/ui/components/dialog'
    import * as Empty from '@loanms/ui/components/empty'
    import { Input } from '@loanms/ui/components/input'
    import * as NativeSelect from '@loanms/ui/components/native-select'
    import { Skeleton } from '@loanms/ui/components/skeleton'
    import { Spinner } from '@loanms/ui/components/spinner'
    import * as Table from '@loanms/ui/components/table'
    import AlertCircleIcon from '@lucide/svelte/icons/alert-circle'
    import PlusIcon from '@lucide/svelte/icons/plus'
    import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw'
    import SearchIcon from '@lucide/svelte/icons/search'
    import { onDestroy } from 'svelte'
    import { toast } from 'svelte-sonner'
    import { goto } from '$app/navigation'
    import PaginationFooter from '$lib/components/dataWorkspace/PaginationFooter.svelte'
    import { useSessionContext } from '$lib/states/session'
    import { debounce, getErrorMessage } from '$lib/utilities/helpers'
    import { createIdempotencyKeyLifecycle } from '$lib/utilities/idempotencyKey'
    import {
        createBorrowerCreateMutation,
        createBorrowerListQuery,
    } from '../queries'
    import type { BorrowerCreateInput, BorrowerStatus } from '../types'
    import BorrowerFormFields from './BorrowerFormFields.svelte'
    import PaymentTagBadge from './PaymentTagBadge.svelte'
    ////////////////////
    // 01. Properties //
    ////////////////////
    let { role }: { role: 'admin' | 'owner' } = $props()
    ///////////////////
    // 02. Constants //
    ///////////////////
    const PAGE_SIZE = 25
    const SKELETON_ROWS = [
        0,
        1,
        2,
        3,
        4,
        5,
    ]
    const createIdempotencyKey = createIdempotencyKeyLifecycle()
    const session = useSessionContext()
    ///////////////
    // 03. State //
    ///////////////
    let createOpen = $state(false)
    let createdBorrowerPublicId = $state<string | null>(null)
    let duplicateCandidates = $state<
        {
            borrowerNumber: string
            contactNumber: string
            fullName: string
            publicId: string
        }[]
    >([])
    let draft = $state<BorrowerCreateInput>(createBorrowerDraft())
    let inputSearch = $state('')
    let isCreating = $state(false)
    let pageNumber = $state(1)
    let pageSize = $state(PAGE_SIZE)
    let paymentTag = $state<'ALL' | 'BAD_PAYER' | 'GOOD_PAYER' | 'SCAMMER'>(
        'ALL',
    )
    let search = $state('')
    let status = $state<'ALL' | BorrowerStatus>('ALL')
    /////////////////
    // 04. Derived //
    /////////////////
    const request = $derived({
        filters: {
            ...(paymentTag === 'ALL' ? {} : { paymentTag }),
            ...(search ? { search } : {}),
            ...(status === 'ALL' ? {} : { status }),
        },
        limit: pageSize,
        offset: (pageNumber - 1) * pageSize,
        sortOrder: 'asc' as const,
    })
    /////////////////
    // 05. Queries //
    /////////////////
    const listQuery = createBorrowerListQuery(
        {
            get organizationSlug() {
                return session.data.organizationSlug
            },
        },
        {
            get request() {
                return request
            },
        },
    )
    const rows = $derived(listQuery.data?.data ?? [])
    const isCreateWorkflowLocked = $derived(
        isCreating || Boolean(createdBorrowerPublicId),
    )
    ///////////////////
    // 06. Mutations //
    ///////////////////
    const createMutation = createBorrowerCreateMutation({
        get organizationSlug() {
            return session.data.organizationSlug
        },
    })
    /////////////////
    // 08. Effects //
    /////////////////
    onDestroy(() => applySearch.cancel())
    //////////////////
    // 09. Handlers //
    //////////////////
    const applySearch = debounce((value: string) => {
        search = value.trim()
        pageNumber = 1
    }, 300)
    function handleCreateOpenChange(open: boolean) {
        if (isCreating) return
        createOpen = open
        if (!open) {
            createdBorrowerPublicId = null
            duplicateCandidates = []
            createIdempotencyKey.abandonAttempt()
            draft = createBorrowerDraft()
        }
    }
    async function handleCreate(event: SubmitEvent) {
        event.preventDefault()
        if (isCreateWorkflowLocked) return
        const payload = normalizeBorrowerDraft(draft)
        const claim = createIdempotencyKey.claim(payload)
        if (!claim.ok) {
            toast.error(
                'Retry the unresolved request without changing its details.',
            )
            return
        }
        isCreating = true
        try {
            const result = await createMutation.mutateAsync({
                ...payload,
                idempotencyKey: claim.key,
            })
            duplicateCandidates = result.duplicateCandidates
            createdBorrowerPublicId = result.borrower.publicId
            createIdempotencyKey.confirmSuccess()
            draft = createBorrowerDraft()
            toast.success('Borrower created successfully.')
        } catch (error) {
            toast.error(getErrorMessage(error, 'Could not create borrower.'))
        } finally {
            isCreating = false
        }
    }
    function handlePaymentTagChange(event: Event) {
        paymentTag = (event.currentTarget as HTMLSelectElement)
            .value as typeof paymentTag
        pageNumber = 1
    }
    function handleStatusChange(event: Event) {
        status = (event.currentTarget as HTMLSelectElement)
            .value as typeof status
        pageNumber = 1
    }
    async function handleViewBorrower(publicId: string) {
        await goto(`/app/${role}/borrowers/${publicId}`)
    }
    /////////////////
    // 10. Helpers //
    /////////////////
    function createBorrowerDraft(): BorrowerCreateInput {
        return {
            addressLine: '',
            barangay: '',
            cityMunicipality: '',
            contactNumber: '',
            email: '',
            fullName: '',
            gender: 'PREFER_NOT_TO_SAY',
            idempotencyKey: createIdempotencyKey.current,
            notes: '',
            postalCode: '',
            province: '',
            secondaryContactNumber: '',
        }
    }
    function normalizeBorrowerDraft(
        value: BorrowerCreateInput,
    ): Omit<BorrowerCreateInput, 'idempotencyKey'> {
        return {
            addressLine: value.addressLine.trim(),
            barangay: value.barangay.trim(),
            cityMunicipality: value.cityMunicipality.trim(),
            contactNumber: value.contactNumber.trim(),
            ...(value.email?.trim() ? { email: value.email.trim() } : {}),
            fullName: value.fullName.trim(),
            gender: value.gender,
            ...(value.notes?.trim() ? { notes: value.notes.trim() } : {}),
            ...(value.postalCode?.trim()
                ? { postalCode: value.postalCode.trim() }
                : {}),
            province: value.province.trim(),
            ...(value.secondaryContactNumber?.trim()
                ? {
                      secondaryContactNumber:
                          value.secondaryContactNumber.trim(),
                  }
                : {}),
        }
    }
</script>

<section
    class="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-zinc-50/70 p-3 text-zinc-950 md:p-4 dark:bg-[#121212] dark:text-zinc-100"
>
    <div class="flex min-h-0 flex-1 flex-col gap-3">
        <header
            class="relative shrink-0 overflow-hidden rounded-xl border border-zinc-200/80 bg-white shadow-sm dark:border-zinc-800 dark:bg-[#1a1a1a]"
        >
            <div
                class="absolute inset-x-0 top-0 h-0.5 bg-linear-to-r from-amber-300 via-amber-500 to-amber-600"
            ></div>
            <div
                class="grid gap-3 p-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:p-4"
            >
                <div class="min-w-0">
                    <div class="mb-1.5 flex flex-wrap items-center gap-2">
                        <span
                            class="inline-flex items-center rounded-md border border-amber-300/70 bg-amber-50 px-2 py-0.5 text-[10px] font-bold tracking-[0.14em] text-amber-800 uppercase dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300"
                            >Borrower Registry</span
                        >
                        <span
                            class="text-[11px] font-medium text-zinc-400 dark:text-zinc-500"
                            >Master records</span
                        >
                    </div>
                    <h2
                        class="text-lg font-bold tracking-tight text-zinc-950 md:text-xl dark:text-white"
                    >
                        Borrowers
                    </h2>
                    <p
                        class="mt-0.5 max-w-2xl text-xs/5 text-zinc-500 dark:text-zinc-400"
                    >
                        Register and maintain borrower records independently of
                        loans.
                    </p>
                </div>
                <Button
                    class="h-9 bg-amber-500 px-3 font-semibold text-zinc-950 shadow-sm hover:bg-amber-400 dark:bg-amber-400 dark:hover:bg-amber-300"
                    onclick={() => (createOpen = true)}
                >
                    <PlusIcon data-icon="inline-start" /> Create New Borrower
                </Button>
            </div>
            <div
                class="grid border-t border-zinc-200/80 bg-zinc-50/80 sm:grid-cols-3 dark:border-zinc-800 dark:bg-[#171717]"
            >
                <div
                    class="border-b border-zinc-200/80 px-3 py-2 sm:border-r sm:border-b-0 dark:border-zinc-800"
                >
                    <p
                        class="text-[10px] font-semibold tracking-[0.12em] text-zinc-400 uppercase"
                    >
                        Total records
                    </p>
                    <p
                        class="mt-0.5 text-base font-bold text-zinc-900 tabular-nums dark:text-zinc-100"
                    >
                        {listQuery.data?.count ?? 0}
                    </p>
                </div>
                <div
                    class="border-b border-zinc-200/80 px-3 py-2 sm:border-r sm:border-b-0 dark:border-zinc-800"
                >
                    <p
                        class="text-[10px] font-semibold tracking-[0.12em] text-zinc-400 uppercase"
                    >
                        Visible rows
                    </p>
                    <p
                        class="mt-0.5 text-base font-bold text-zinc-900 tabular-nums dark:text-zinc-100"
                    >
                        {rows.length}
                    </p>
                </div>
                <div class="px-3 py-2">
                    <p
                        class="text-[10px] font-semibold tracking-[0.12em] text-zinc-400 uppercase"
                    >
                        Current page
                    </p>
                    <p
                        class="mt-0.5 text-base font-bold text-amber-700 tabular-nums dark:text-amber-300"
                    >
                        {pageNumber}
                    </p>
                </div>
            </div>
        </header>
        <div
            class="grid shrink-0 gap-2 rounded-xl border border-zinc-200/80 bg-white p-2.5 shadow-sm md:grid-cols-12 dark:border-zinc-800 dark:bg-[#1a1a1a]"
        >
            <label class="relative block md:col-span-6">
                <span
                    class="mb-1 block text-[10px] font-semibold tracking-widest text-zinc-500 uppercase dark:text-zinc-400"
                    >Search borrower</span
                >
                <div class="relative">
                    <SearchIcon
                        class="pointer-events-none absolute top-1/2 left-3 z-10 size-4 -translate-y-1/2 text-zinc-400"
                        aria-hidden="true"
                    />
                    <Input
                        class="h-9 border-zinc-200 bg-zinc-50/70 pl-9 text-sm shadow-none focus-visible:ring-amber-500/30 dark:border-zinc-700 dark:bg-[#151515]"
                        bind:value={inputSearch}
                        oninput={() => applySearch(inputSearch)}
                        placeholder="Name, borrower number, or contact number"
                    />
                </div>
            </label>
            <div class="md:col-span-3">
                <span
                    class="mb-1 block text-[10px] font-semibold tracking-widest text-zinc-500 uppercase dark:text-zinc-400"
                    >Account status</span
                >
                <NativeSelect.Root
                    aria-label="Borrower status"
                    onchange={handleStatusChange}
                    value={status}
                >
                    <NativeSelect.Option value="ALL"
                        >All statuses</NativeSelect.Option
                    >
                    <NativeSelect.Option value="ACTIVE"
                        >Active</NativeSelect.Option
                    >
                    <NativeSelect.Option value="INACTIVE"
                        >Inactive</NativeSelect.Option
                    >
                    <NativeSelect.Option value="BLOCKED"
                        >Blocked</NativeSelect.Option
                    >
                    <NativeSelect.Option value="ARCHIVED"
                        >Archived</NativeSelect.Option
                    >
                </NativeSelect.Root>
            </div>
            <div class="md:col-span-3">
                <span
                    class="mb-1 block text-[10px] font-semibold tracking-widest text-zinc-500 uppercase dark:text-zinc-400"
                    >Payment tag</span
                >
                <NativeSelect.Root
                    aria-label="Payment tag"
                    onchange={handlePaymentTagChange}
                    value={paymentTag}
                >
                    <NativeSelect.Option value="ALL"
                        >All payment tags</NativeSelect.Option
                    >
                    <NativeSelect.Option value="GOOD_PAYER"
                        >Good Payer</NativeSelect.Option
                    >
                    <NativeSelect.Option value="BAD_PAYER"
                        >Bad Payer</NativeSelect.Option
                    >
                    <NativeSelect.Option value="SCAMMER"
                        >Scammer</NativeSelect.Option
                    >
                </NativeSelect.Root>
            </div>
        </div>
        {#if listQuery.isError}
            <Alert.Root
                class="shrink-0 border-red-200 bg-red-50/80 dark:border-red-900/60 dark:bg-red-950/20"
                variant="destructive"
            >
                <AlertCircleIcon />
                <Alert.Title>Borrowers could not be loaded</Alert.Title>
                <Alert.Description
                    >Refresh the list to try again. Existing results remain
                    visible when available.</Alert.Description
                >
                <Button
                    onclick={() => void listQuery.refetch()}
                    size="sm"
                    variant="outline"
                >
                    <RefreshCwIcon data-icon="inline-start" /> Refresh
                </Button>
            </Alert.Root>
        {/if}
        <div
            class="flex min-h-80 flex-1 flex-col overflow-hidden rounded-xl border border-zinc-200/80 bg-white shadow-sm dark:border-zinc-800 dark:bg-[#1a1a1a]"
        >
            <div
                class="flex shrink-0 items-center justify-between gap-3 border-b border-zinc-200/80 bg-zinc-50/80 px-3 py-2 dark:border-zinc-800 dark:bg-[#171717]"
            >
                <div class="min-w-0">
                    <p
                        class="text-xs font-bold text-zinc-900 dark:text-zinc-100"
                    >
                        Borrower Directory
                    </p>
                    <p class="text-[10px] text-zinc-500 dark:text-zinc-400">
                        Corporate registry view · {listQuery.data?.count ?? 0} total
                        records
                    </p>
                </div>
                {#if listQuery.isFetching && !listQuery.isPending}
                    <div
                        class="inline-flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.08em] text-amber-700 uppercase dark:text-amber-300"
                    >
                        <Spinner /> Updating
                    </div>
                {/if}
            </div>
            <div
                class="min-h-0 flex-1 overflow-auto [&_table]:min-w-[760px] [&_tbody_tr]:border-zinc-200/70 [&_tbody_tr]:transition-colors hover:[&_tbody_tr]:bg-amber-50/40 dark:[&_tbody_tr]:border-zinc-800 dark:hover:[&_tbody_tr]:bg-amber-500/4 [&_td]:px-3 [&_td]:py-2 [&_th]:h-9 [&_th]:border-b [&_th]:border-zinc-200 [&_th]:px-3 [&_th]:text-[10px] [&_th]:font-bold [&_th]:tracking-widest [&_th]:text-zinc-500 [&_th]:uppercase dark:[&_th]:border-zinc-800 dark:[&_th]:text-zinc-400 [&_thead]:sticky [&_thead]:top-0 [&_thead]:z-20 [&_thead]:bg-zinc-100/95 [&_thead]:backdrop-blur-sm dark:[&_thead]:bg-[#202020]/95"
            >
                <Table.Root>
                    <Table.Header>
                        <Table.Row>
                            <Table.Head>Borrower</Table.Head>
                            <Table.Head>Tag</Table.Head>
                            <Table.Head>Contact</Table.Head>
                            <Table.Head>Status</Table.Head>
                            <Table.Head class="text-right"
                                ><span class="sr-only">Actions</span
                                ></Table.Head
                            >
                        </Table.Row>
                    </Table.Header>
                    <Table.Body>
                        {#if listQuery.isPending}
                            {#each SKELETON_ROWS as row (row)}
                                <Table.Row>
                                    <Table.Cell colspan={5}
                                        ><Skeleton
                                            class="h-6 w-full"
                                        /></Table.Cell
                                    >
                                </Table.Row>
                            {/each}
                        {:else if rows.length}
                            {#each rows as borrower (borrower.publicId)}
                                <Table.Row>
                                    <Table.Cell>
                                        <button
                                            class="group text-left"
                                            onclick={() =>
                                                void handleViewBorrower(
                                                    borrower.publicId,
                                                )}
                                        >
                                            <span
                                                class="block text-sm font-semibold text-zinc-900 transition-colors group-hover:text-amber-700 dark:text-zinc-100 dark:group-hover:text-amber-300"
                                                >{borrower.fullName}</span
                                            >
                                            <span
                                                class="mt-0.5 block font-mono text-[10px] font-medium tracking-wide text-zinc-400 dark:text-zinc-500"
                                                >{borrower.borrowerNumber}</span
                                            >
                                        </button>
                                    </Table.Cell>
                                    <Table.Cell
                                        ><PaymentTagBadge
                                            source={borrower.paymentTagSource}
                                            tag={borrower.paymentTag}
                                        /></Table.Cell
                                    >
                                    <Table.Cell
                                        ><span
                                            class="text-xs font-medium text-zinc-700 tabular-nums dark:text-zinc-300"
                                            >{borrower.contactNumber}</span
                                        ></Table.Cell
                                    >
                                    <Table.Cell>
                                        {#if borrower.status === 'ACTIVE'}
                                            <span
                                                class="inline-flex rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold tracking-wide text-emerald-700 uppercase dark:border-emerald-800/60 dark:bg-emerald-950/30 dark:text-emerald-300"
                                                >Active</span
                                            >
                                        {:else if borrower.status === 'INACTIVE'}
                                            <span
                                                class="inline-flex rounded-md border border-zinc-200 bg-zinc-100 px-2 py-0.5 text-[10px] font-bold tracking-wide text-zinc-600 uppercase dark:border-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-300"
                                                >Inactive</span
                                            >
                                        {:else if borrower.status === 'BLOCKED'}
                                            <span
                                                class="inline-flex rounded-md border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-bold tracking-wide text-red-700 uppercase dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300"
                                                >Blocked</span
                                            >
                                        {:else}
                                            <span
                                                class="inline-flex rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-bold tracking-wide text-amber-700 uppercase dark:border-amber-800/60 dark:bg-amber-950/20 dark:text-amber-300"
                                                >Archived</span
                                            >
                                        {/if}
                                    </Table.Cell>
                                    <Table.Cell class="text-right">
                                        <Button
                                            class="h-7 border-zinc-200 px-2.5 text-[11px] font-semibold hover:border-amber-300 hover:bg-amber-50 hover:text-amber-800 dark:border-zinc-700 dark:hover:border-amber-500/40 dark:hover:bg-amber-500/10 dark:hover:text-amber-300"
                                            onclick={() =>
                                                void handleViewBorrower(
                                                    borrower.publicId,
                                                )}
                                            size="sm"
                                            variant="outline">View</Button
                                        >
                                    </Table.Cell>
                                </Table.Row>
                            {/each}
                        {:else}
                            <Table.Row>
                                <Table.Cell colspan={5}>
                                    <Empty.Root class="border-0 py-12">
                                        <Empty.Header>
                                            <Empty.Media
                                                class="border border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300"
                                                variant="icon"
                                                ><SearchIcon /></Empty.Media
                                            >
                                            <Empty.Title
                                                >No borrowers found</Empty.Title
                                            >
                                            <Empty.Description
                                                >Adjust the filters or create a
                                                borrower record.</Empty.Description
                                            >
                                        </Empty.Header>
                                    </Empty.Root>
                                </Table.Cell>
                            </Table.Row>
                        {/if}
                    </Table.Body>
                </Table.Root>
            </div>
        </div>
        <div
            class="shrink-0 rounded-xl border border-zinc-200/80 bg-white px-2.5 py-1.5 shadow-sm dark:border-zinc-800 dark:bg-[#1a1a1a]"
        >
            <PaginationFooter
                count={listQuery.data?.count ?? 0}
                disabled={listQuery.isFetching}
                onPageChange={(value) => (pageNumber = value)}
                onPageSizeChange={(value) => {
                    pageSize = value
                    pageNumber = 1
                }}
                page={pageNumber}
                {pageSize}
            />
        </div>
    </div>
</section>
<Dialog.Root bind:open={() => createOpen, handleCreateOpenChange}>
    <Dialog.Content
        class="max-h-[92vh] max-w-3xl overflow-y-auto border-zinc-200 bg-white p-0 shadow-2xl dark:border-zinc-800 dark:bg-[#1a1a1a]"
    >
        <form
            class="grid gap-0"
            onsubmit={handleCreate}
        >
            <div
                class="h-0.5 bg-linear-to-r from-amber-300 via-amber-500 to-amber-600"
            ></div>
            <Dialog.Header
                class="border-b border-zinc-200/80 bg-zinc-50/70 px-5 py-4 text-left dark:border-zinc-800 dark:bg-[#171717]"
            >
                <div class="mb-1.5 flex items-center gap-2">
                    <span
                        class="inline-flex rounded-md border border-amber-300/70 bg-amber-50 px-2 py-0.5 text-[10px] font-bold tracking-[0.12em] text-amber-800 uppercase dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300"
                        >New Record</span
                    >
                </div>
                <Dialog.Title class="text-lg font-bold tracking-tight"
                    >Create New Borrower</Dialog.Title
                >
                <Dialog.Description class="text-xs/5 "
                    >A borrower record can be created before any loan is issued.</Dialog.Description
                >
            </Dialog.Header>
            <div class="grid gap-3 px-5 py-4">
                <div
                    class="rounded-xl border border-zinc-200/80 bg-white p-3 dark:border-zinc-800 dark:bg-[#181818]"
                >
                    <BorrowerFormFields
                        bind:draft
                        disabled={isCreateWorkflowLocked}
                    />
                </div>
                {#if createdBorrowerPublicId}
                    <Alert.Root
                        class="border-emerald-200 bg-emerald-50/70 dark:border-emerald-900/60 dark:bg-emerald-950/20"
                    >
                        <Alert.Title>Borrower created successfully</Alert.Title>
                        <Alert.Description
                            >The borrower record exists without a loan and can
                            be viewed now.</Alert.Description
                        >
                    </Alert.Root>
                {/if}
                {#if duplicateCandidates.length}
                    <Alert.Root
                        class="border-amber-200 bg-amber-50/70 dark:border-amber-800/60 dark:bg-amber-950/20"
                    >
                        <AlertCircleIcon />
                        <Alert.Title>Possible duplicate records</Alert.Title>
                        <Alert.Description>
                            <div class="mt-1 grid gap-1.5">
                                {#each duplicateCandidates as candidate (candidate.publicId)}
                                    <span
                                        class="block rounded-md border border-amber-200/80 bg-white/70 px-2.5 py-1.5 text-xs font-medium text-zinc-700 dark:border-amber-800/40 dark:bg-black/10 dark:text-zinc-300"
                                        >{candidate.fullName} · {candidate.borrowerNumber}
                                        · {candidate.contactNumber}</span
                                    >
                                {/each}
                            </div>
                        </Alert.Description>
                    </Alert.Root>
                {/if}
            </div>
            <Dialog.Footer
                class="border-t border-zinc-200/80 bg-zinc-50/70 px-5 py-3 dark:border-zinc-800 dark:bg-[#171717]"
            >
                <Button
                    type="button"
                    disabled={isCreating}
                    onclick={() => handleCreateOpenChange(false)}
                    variant="outline"
                    >{createdBorrowerPublicId ? 'Close' : 'Cancel'}</Button
                >
                {#if createdBorrowerPublicId}
                    <Button
                        class="bg-amber-500 font-semibold text-zinc-950 hover:bg-amber-400 dark:bg-amber-400 dark:hover:bg-amber-300"
                        type="button"
                        onclick={() =>
                            void handleViewBorrower(createdBorrowerPublicId!)}
                        >View Borrower</Button
                    >
                {:else}
                    <Button
                        class="bg-amber-500 font-semibold text-zinc-950 hover:bg-amber-400 dark:bg-amber-400 dark:hover:bg-amber-300"
                        type="submit"
                        disabled={isCreating}
                    >
                        {#if isCreating}<Spinner
                                data-icon="inline-start"
                            />{/if} Create Borrower
                    </Button>
                {/if}
            </Dialog.Footer>
        </form>
    </Dialog.Content>
</Dialog.Root>
