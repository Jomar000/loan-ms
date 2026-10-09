<script lang="ts">
    import * as Alert from '@loanms/ui/components/alert'
    import * as AlertDialog from '@loanms/ui/components/alert-dialog'
    import { Button } from '@loanms/ui/components/button'
    import * as Card from '@loanms/ui/components/card'
    import * as Dialog from '@loanms/ui/components/dialog'
    import * as Empty from '@loanms/ui/components/empty'
    import * as Field from '@loanms/ui/components/field'
    import * as NativeSelect from '@loanms/ui/components/native-select'
    import { Skeleton } from '@loanms/ui/components/skeleton'
    import { Spinner } from '@loanms/ui/components/spinner'
    import { Textarea } from '@loanms/ui/components/textarea'
    import * as Tabs from '@loanms/ui/overrides/tabs'
    import AlertCircleIcon from '@lucide/svelte/icons/alert-circle'
    import ArchiveIcon from '@lucide/svelte/icons/archive'
    import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left'
    import FileTextIcon from '@lucide/svelte/icons/file-text'
    import LandmarkIcon from '@lucide/svelte/icons/landmark'
    import PencilIcon from '@lucide/svelte/icons/pencil'
    import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw'
    import { toast } from 'svelte-sonner'
    import { goto } from '$app/navigation'
    import {
        createLoanDetailQuery,
        createLoanListQuery,
    } from '$lib/modules/loan/queries'
    import type { CollectionItem } from '$lib/modules/payment/types'
    import { useSessionContext } from '$lib/states/session'
    import { getErrorMessage } from '$lib/utilities/helpers'
    import PaymentHistoryTable from '../../payment/components/PaymentHistoryTable.svelte'
    import PaymentWorkflowDialog from '../../payment/components/PaymentWorkflowDialog.svelte'
    import {
        createBorrowerArchiveMutation,
        createBorrowerDetailQuery,
        createBorrowerDocumentsQuery,
        createBorrowerPaymentTagOverrideMutation,
        createBorrowerPaymentTagQuery,
        createBorrowerPaymentTagResetMutation,
        createBorrowerUpdateMutation,
    } from '../queries'
    import type {
        Borrower,
        BorrowerCreateInput,
        BorrowerPaymentTag,
    } from '../types'
    import BorrowerFormFields from './BorrowerFormFields.svelte'
    import BorrowerLoansTable from './BorrowerLoansTable.svelte'
    import PaymentTagBadge from './PaymentTagBadge.svelte'
    ////////////////////
    // 01. Properties //
    ////////////////////
    let {
        publicId,
        role,
    }: {
        publicId: string
        role: 'admin' | 'owner'
    } = $props()
    ///////////////////
    // 02. Constants //
    ///////////////////
    const session = useSessionContext()
    ///////////////
    // 03. State //
    ///////////////
    let archiveOpen = $state(false)
    let editOpen = $state(false)
    let editDraft = $state<BorrowerCreateInput | null>(null)
    let isActionLocked = $state(false)
    let isLoadingPayment = $state(false)
    let overrideOpen = $state(false)
    let overrideReason = $state('')
    let overrideTag = $state<BorrowerPaymentTag>('GOOD_PAYER')
    let paymentOpen = $state(false)
    let selectedCollection = $state<CollectionItem | null>(null)
    let selectedTab = $state('overview')
    /////////////////
    // 05. Queries //
    /////////////////
    const detailQuery = createBorrowerDetailQuery(
        {
            get organizationSlug() {
                return session.data.organizationSlug
            },
        },
        {
            get publicId() {
                return publicId
            },
        },
    )
    const documentsQuery = createBorrowerDocumentsQuery(
        {
            get organizationSlug() {
                return session.data.organizationSlug
            },
        },
        {
            get publicId() {
                return publicId
            },
        },
    )
    const paymentTagQuery = createBorrowerPaymentTagQuery(
        {
            get organizationSlug() {
                return session.data.organizationSlug
            },
        },
        {
            get publicId() {
                return publicId
            },
        },
    )
    const loansQuery = createLoanListQuery(
        {
            get organizationSlug() {
                return session.data.organizationSlug
            },
        },
        {
            get request() {
                return {
                    filters: { borrowerPublicId: publicId },
                    limit: 25,
                    offset: 0,
                    sortOrder: 'desc' as const,
                }
            },
        },
    )
    const borrower = $derived(detailQuery.data)
    const documents = $derived(documentsQuery.data ?? [])
    const activeLoan = $derived(
        (loansQuery.data?.data ?? []).find(
            (loan) => loan.status === 'ACTIVE' || loan.status === 'OVERDUE',
        ),
    )
    const paymentTag = $derived(paymentTagQuery.data)
    const activeLoanQuery = createLoanDetailQuery(
        {
            get organizationSlug() {
                return session.data.organizationSlug
            },
        },
        {
            get publicId() {
                return activeLoan?.publicId ?? ''
            },
        },
    )
    ///////////////////
    // 06. Mutations //
    ///////////////////
    const archiveMutation = createBorrowerArchiveMutation({
        get organizationSlug() {
            return session.data.organizationSlug
        },
    })
    const overrideMutation = createBorrowerPaymentTagOverrideMutation({
        get organizationSlug() {
            return session.data.organizationSlug
        },
    })
    const resetMutation = createBorrowerPaymentTagResetMutation({
        get organizationSlug() {
            return session.data.organizationSlug
        },
    })
    const updateMutation = createBorrowerUpdateMutation({
        get organizationSlug() {
            return session.data.organizationSlug
        },
    })
    //////////////////
    // 09. Handlers //
    //////////////////
    async function handleArchive() {
        if (isActionLocked) return
        isActionLocked = true
        try {
            await archiveMutation.mutateAsync(publicId)
            toast.success('Borrower archived.')
            archiveOpen = false
        } catch (error) {
            toast.error(getErrorMessage(error, 'Could not archive borrower.'))
        } finally {
            isActionLocked = false
        }
    }
    function handleArchiveOpenChange(open: boolean) {
        if (isActionLocked) return
        archiveOpen = open
    }
    function handleEditOpenChange(open: boolean) {
        if (isActionLocked) return
        editOpen = open
        if (!open) editDraft = null
    }
    async function handleEdit(event: SubmitEvent) {
        event.preventDefault()
        if (isActionLocked || !editDraft) return
        isActionLocked = true
        try {
            await updateMutation.mutateAsync({
                ...normalizeBorrowerDraft(editDraft),
                publicId,
            })
            toast.success('Borrower information updated.')
            handleEditOpenChange(false)
        } catch (error) {
            toast.error(getErrorMessage(error, 'Could not update borrower.'))
        } finally {
            isActionLocked = false
        }
    }
    function handleOverrideOpenChange(open: boolean) {
        if (isActionLocked) return
        overrideOpen = open
        if (!open) overrideReason = ''
    }
    async function handleOverride(event: SubmitEvent) {
        event.preventDefault()
        if (isActionLocked || !overrideReason.trim()) return
        isActionLocked = true
        try {
            await overrideMutation.mutateAsync({
                paymentTag: overrideTag,
                publicId,
                reason: overrideReason.trim(),
            })
            toast.success('Payment tag override saved.')
            handleOverrideOpenChange(false)
        } catch (error) {
            toast.error(
                getErrorMessage(error, 'Could not override payment tag.'),
            )
        } finally {
            isActionLocked = false
        }
    }
    async function handleResetPaymentTag() {
        if (isActionLocked) return
        isActionLocked = true
        try {
            await resetMutation.mutateAsync(publicId)
            toast.success('Payment tag returned to the calculated value.')
        } catch (error) {
            toast.error(getErrorMessage(error, 'Could not reset payment tag.'))
        } finally {
            isActionLocked = false
        }
    }
    function openEdit() {
        if (!borrower) return
        editDraft = toDraft(borrower)
        editOpen = true
    }
    async function handleCreateLoan() {
        await goto(
            `/app/${role}/loans/new?borrowerPublicId=${encodeURIComponent(publicId)}`,
        )
    }
    async function handleRecordPayment() {
        if (isLoadingPayment) return
        if (!activeLoan) {
            toast.error(
                'This borrower has no active loan available for payment.',
            )
            return
        }
        const loanPublicId = activeLoan.publicId
        isLoadingPayment = true
        try {
            const result = await activeLoanQuery.refetch()
            if (result.error) throw result.error
            const loan = result.data
            if (!loan || loan.publicId !== loanPublicId) {
                throw new Error('Could not load the loan collection amount.')
            }
            const installment = loan.installments.find(
                (item) =>
                    item.status !== 'WAIVED' &&
                    item.amountPaidMinor < item.amountDueMinor,
            )
            if (
                !installment ||
                (loan.status !== 'ACTIVE' && loan.status !== 'OVERDUE')
            ) {
                toast.error('This loan has no unpaid collection available.')
                return
            }
            selectedCollection = {
                ...installment,
                borrowerName: borrower?.fullName ?? '',
                borrowerPublicId: loan.borrowerPublicId,
                loanNumber: loan.loanNumber,
                loanPublicId: loan.publicId,
                loanStatus: loan.status,
                paymentFrequency: loan.formulaSnapshot.paymentFrequency,
                remainingAmountMinor:
                    installment.amountDueMinor - installment.amountPaidMinor,
            }
            paymentOpen = true
        } catch (error) {
            toast.error(
                getErrorMessage(error, 'Could not load the collection amount.'),
            )
        } finally {
            isLoadingPayment = false
        }
    }
    /////////////////
    // 10. Helpers //
    /////////////////
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
            province: value.province.trim(),
            ...(value.secondaryContactNumber?.trim()
                ? {
                      secondaryContactNumber:
                          value.secondaryContactNumber.trim(),
                  }
                : {}),
        }
    }
    function toDraft(value: Borrower): BorrowerCreateInput {
        return {
            addressLine: value.addressLine,
            barangay: value.barangay,
            cityMunicipality: value.cityMunicipality,
            contactNumber: value.contactNumber,
            email: value.email ?? '',
            fullName: value.fullName,
            gender: value.gender,
            idempotencyKey: '',
            notes: value.notes ?? '',
            province: value.province,
            secondaryContactNumber: value.secondaryContactNumber ?? '',
        }
    }
</script>

<section
    class="flex min-h-0 page-scroll flex-1 flex-col bg-zinc-50/80 p-3 md:p-4 dark:bg-[#171717]"
>
    <div class="mb-2 flex items-center">
        <Button
            class="h-8 gap-1.5 px-2 text-xs text-zinc-600 hover:bg-amber-50 hover:text-amber-800 dark:text-zinc-300 dark:hover:bg-amber-500/10 dark:hover:text-amber-300"
            onclick={() => void goto(`/app/${role}/borrowers`)}
            size="sm"
            variant="ghost"
        >
            <ArrowLeftIcon
                class="size-3.5"
                data-icon="inline-start"
            /> Back to borrowers
        </Button>
    </div>
    {#if detailQuery.isPending}
        <div class="grid min-h-0 flex-1 gap-3">
            <Skeleton class="h-32 w-full rounded-xl" />
            <Skeleton class="min-h-64 w-full rounded-xl" />
        </div>
    {:else if detailQuery.isError || !borrower}
        <div class="flex flex-1 items-start">
            <Alert.Root
                class="w-full rounded-xl border-red-200 bg-white shadow-sm dark:border-red-500/20 dark:bg-[#202020]"
                variant="destructive"
            >
                <AlertCircleIcon />
                <Alert.Title>Borrower could not be loaded</Alert.Title>
                <Alert.Description>
                    The record may be unavailable or no longer accessible in
                    this organization.
                </Alert.Description>
                <Button
                    class="mt-2 h-8"
                    onclick={() => void detailQuery.refetch()}
                    size="sm"
                    variant="outline"
                >
                    <RefreshCwIcon
                        class="size-3.5"
                        data-icon="inline-start"
                    /> Refresh
                </Button>
            </Alert.Root>
        </div>
    {:else}
        <div
            class="mb-3 overflow-hidden rounded-xl border border-amber-200/70 bg-white shadow-sm dark:border-amber-500/15 dark:bg-[#202020]"
        >
            <div
                class="h-1 bg-linear-to-r from-amber-500 via-yellow-400 to-amber-600"
            ></div>
            <header
                class="flex flex-col gap-3 p-3 lg:flex-row lg:items-center lg:justify-between"
            >
                <div class="min-w-0">
                    <div class="flex flex-wrap items-center gap-2">
                        <h1
                            class="truncate text-lg font-semibold tracking-tight text-zinc-950 md:text-xl dark:text-zinc-50"
                        >
                            {borrower.fullName}
                        </h1>
                        <PaymentTagBadge
                            source={borrower.paymentTagSource}
                            tag={borrower.paymentTag}
                        />
                        <span
                            class="inline-flex h-6 items-center rounded-full border border-zinc-200 bg-zinc-50 px-2 text-[10px] font-semibold tracking-wider text-zinc-600 uppercase dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
                        >
                            {borrower.status}
                        </span>
                    </div>
                    <div
                        class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400"
                    >
                        <span
                            class="font-mono font-medium text-zinc-700 dark:text-zinc-300"
                            >{borrower.borrowerNumber}</span
                        >
                        <span
                            class="hidden text-zinc-300 sm:inline dark:text-zinc-700"
                            >•</span
                        >
                        <span>Borrower profile and account workspace</span>
                    </div>
                </div>
                <div class="flex flex-wrap items-center gap-1.5">
                    <Button
                        class="h-8 border-zinc-200 bg-white px-2.5 text-xs shadow-none hover:border-amber-300 hover:bg-amber-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-amber-500/40 dark:hover:bg-amber-500/10"
                        disabled={loansQuery.isPending || isLoadingPayment}
                        onclick={handleRecordPayment}
                        size="sm"
                        variant="outline"
                    >
                        {#if isLoadingPayment}
                            <Spinner data-icon="inline-start" />
                        {/if}
                        Record Payment
                    </Button>
                    {#if borrower.status === 'ACTIVE'}
                        <Button
                            class="h-8 bg-amber-500 px-2.5 text-xs font-semibold text-zinc-950 shadow-sm hover:bg-amber-400 dark:bg-amber-400 dark:hover:bg-amber-300"
                            onclick={handleCreateLoan}
                            size="sm"
                        >
                            <LandmarkIcon
                                class="size-3.5"
                                data-icon="inline-start"
                            /> Create Loan
                        </Button>
                    {/if}
                    <Button
                        class="h-8 border-zinc-200 bg-white px-2.5 text-xs shadow-none hover:border-amber-300 hover:bg-amber-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-amber-500/40 dark:hover:bg-amber-500/10"
                        onclick={openEdit}
                        size="sm"
                        variant="outline"
                    >
                        <PencilIcon
                            class="size-3.5"
                            data-icon="inline-start"
                        /> Edit
                    </Button>
                    {#if borrower.status !== 'ARCHIVED'}
                        <Button
                            class="h-8 px-2.5 text-xs"
                            onclick={() => (archiveOpen = true)}
                            size="sm"
                            variant="destructive"
                        >
                            <ArchiveIcon
                                class="size-3.5"
                                data-icon="inline-start"
                            /> Archive
                        </Button>
                    {/if}
                </div>
            </header>
        </div>
        <Tabs.Root
            class="flex min-h-96 flex-1 flex-col"
            bind:value={selectedTab}
        >
            <Tabs.List
                class="mb-3 h-11 w-full shrink-0 justify-start gap-1 overflow-x-auto p-1"
            >
                <Tabs.Trigger
                    class="h-9 flex-none shrink-0 px-4"
                    value="overview"
                >
                    Overview
                </Tabs.Trigger>
                <Tabs.Trigger
                    class="h-9 flex-none shrink-0 px-4"
                    value="documents"
                >
                    Documents
                </Tabs.Trigger>
                <Tabs.Trigger
                    class="h-9 flex-none shrink-0 px-4"
                    value="loans"
                >
                    Loans
                </Tabs.Trigger>
                <Tabs.Trigger
                    class="h-9 flex-none shrink-0 px-4"
                    value="payments"
                >
                    Payments
                </Tabs.Trigger>
            </Tabs.List>
            <Tabs.Content
                value="overview"
                class="mt-0 min-h-0 flex-1 overflow-auto"
            >
                <div class="grid gap-3 xl:grid-cols-12">
                    <Card.Root
                        class="overflow-hidden border-zinc-200 bg-white shadow-sm xl:col-span-7 dark:border-zinc-800 dark:bg-[#202020]"
                    >
                        <Card.Header
                            class="border-b border-zinc-100 px-4 py-3 dark:border-zinc-800"
                        >
                            <div class="flex items-center gap-2">
                                <div
                                    class="flex size-8 items-center justify-center rounded-lg bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300"
                                >
                                    <FileTextIcon class="size-4" />
                                </div>
                                <div>
                                    <Card.Title class="text-sm font-semibold"
                                        >Borrower details</Card.Title
                                    >
                                    <Card.Description class="text-xs"
                                        >Personal and contact information.</Card.Description
                                    >
                                </div>
                            </div>
                        </Card.Header>
                        <Card.Content
                            class="grid gap-0 p-0 text-sm sm:grid-cols-2"
                        >
                            <div
                                class="border-b border-zinc-100 px-4 py-3 sm:border-r dark:border-zinc-800"
                            >
                                <p
                                    class="text-[10px] font-semibold tracking-wider text-zinc-400 uppercase"
                                >
                                    Primary contact
                                </p>
                                <p
                                    class="mt-1 font-medium text-zinc-900 dark:text-zinc-100"
                                >
                                    {borrower.contactNumber}
                                </p>
                            </div>
                            <div
                                class="border-b border-zinc-100 px-4 py-3 dark:border-zinc-800"
                            >
                                <p
                                    class="text-[10px] font-semibold tracking-wider text-zinc-400 uppercase"
                                >
                                    Email address
                                </p>
                                <p
                                    class="mt-1 font-medium break-all text-zinc-900 dark:text-zinc-100"
                                >
                                    {borrower.email ?? 'Not recorded'}
                                </p>
                            </div>
                            <div class="px-4 py-3 sm:col-span-2">
                                <p
                                    class="text-[10px] font-semibold tracking-wider text-zinc-400 uppercase"
                                >
                                    Registered address
                                </p>
                                <p
                                    class="mt-1 leading-5 text-zinc-800 dark:text-zinc-200"
                                >
                                    {borrower.addressLine}, {borrower.barangay}, {borrower.cityMunicipality},
                                    {borrower.province}
                                </p>
                            </div>
                        </Card.Content>
                    </Card.Root>
                    <Card.Root
                        class="overflow-hidden border-amber-200/70 bg-white shadow-sm xl:col-span-5 dark:border-amber-500/15 dark:bg-[#202020]"
                    >
                        <Card.Header
                            class="border-b border-zinc-100 px-4 py-3 dark:border-zinc-800"
                        >
                            <div
                                class="flex items-center justify-between gap-3"
                            >
                                <div>
                                    <Card.Title class="text-sm font-semibold"
                                        >Payment behavior</Card.Title
                                    >
                                    <Card.Description class="text-xs"
                                        >Internal risk and payment
                                        classification.</Card.Description
                                    >
                                </div>
                                <PaymentTagBadge
                                    source={borrower.paymentTagSource}
                                    tag={borrower.paymentTag}
                                />
                            </div>
                        </Card.Header>
                        <Card.Content class="grid gap-0 p-0 text-sm">
                            <div
                                class="grid grid-cols-[1fr_auto] items-center gap-3 border-b border-zinc-100 px-4 py-2.5 dark:border-zinc-800"
                            >
                                <span
                                    class="text-xs text-zinc-500 dark:text-zinc-400"
                                    >Calculated tag</span
                                >
                                <PaymentTagBadge
                                    tag={borrower.systemPaymentTag}
                                />
                            </div>
                            <div
                                class="grid grid-cols-[1fr_auto] items-center gap-3 border-b border-zinc-100 px-4 py-2.5 dark:border-zinc-800"
                            >
                                <span
                                    class="text-xs text-zinc-500 dark:text-zinc-400"
                                    >Missed installments</span
                                >
                                <span
                                    class="font-semibold text-zinc-900 dark:text-zinc-100"
                                    >{paymentTag?.missedInstallmentCount ??
                                        '—'}</span
                                >
                            </div>
                            <div
                                class="grid grid-cols-[1fr_auto] items-center gap-3 border-b border-zinc-100 px-4 py-2.5 dark:border-zinc-800"
                            >
                                <span
                                    class="text-xs text-zinc-500 dark:text-zinc-400"
                                    >Payment type</span
                                >
                                <span
                                    class="font-medium text-zinc-900 dark:text-zinc-100"
                                    >{paymentTag?.paymentType ??
                                        'No loan yet'}</span
                                >
                            </div>
                            {#if borrower.paymentTagSource === 'MANUAL_OVERRIDE'}
                                <div
                                    class="bg-amber-50/60 px-4 py-2.5 dark:bg-amber-500/5"
                                >
                                    <p
                                        class="text-[10px] font-semibold tracking-wider text-amber-700 uppercase dark:text-amber-300"
                                    >
                                        Override reason
                                    </p>
                                    <p
                                        class="mt-1 text-xs/5 text-zinc-700 dark:text-zinc-300"
                                    >
                                        {borrower.paymentTagOverrideReason}
                                    </p>
                                </div>
                            {/if}
                        </Card.Content>
                        <Card.Footer
                            class="flex flex-wrap gap-1.5 border-t border-zinc-100 px-4 py-2.5 dark:border-zinc-800"
                        >
                            <Button
                                class="h-8 border-zinc-200 px-2.5 text-xs hover:border-amber-300 hover:bg-amber-50 dark:border-zinc-700 dark:hover:border-amber-500/40 dark:hover:bg-amber-500/10"
                                onclick={() => (overrideOpen = true)}
                                size="sm"
                                variant="outline"
                            >
                                Override tag
                            </Button>
                            {#if borrower.paymentTagSource === 'MANUAL_OVERRIDE'}
                                <Button
                                    class="h-8 border-zinc-200 px-2.5 text-xs dark:border-zinc-700"
                                    disabled={isActionLocked}
                                    onclick={handleResetPaymentTag}
                                    size="sm"
                                    variant="outline"
                                >
                                    Reset to calculated tag
                                </Button>
                            {/if}
                        </Card.Footer>
                    </Card.Root>
                </div>
            </Tabs.Content>
            <Tabs.Content
                value="documents"
                class="mt-0 min-h-0 flex-1 overflow-auto"
            >
                <Card.Root
                    class="min-h-full overflow-hidden border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-[#202020]"
                >
                    <Card.Header
                        class="border-b border-zinc-100 px-4 py-3 dark:border-zinc-800"
                    >
                        <div class="flex items-center gap-2">
                            <div
                                class="flex size-8 items-center justify-center rounded-lg bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300"
                            >
                                <FileTextIcon class="size-4" />
                            </div>
                            <div>
                                <Card.Title class="text-sm font-semibold"
                                    >Documents</Card.Title
                                >
                                <Card.Description class="text-xs">
                                    Registered borrower documents and
                                    identification records.
                                </Card.Description>
                            </div>
                        </div>
                    </Card.Header>
                    <Card.Content class="p-3">
                        {#if documentsQuery.isPending}
                            <Skeleton class="h-20 w-full rounded-lg" />
                        {:else if documents.length}
                            <ul
                                class="grid gap-2 md:grid-cols-2 xl:grid-cols-3"
                            >
                                {#each documents as document (document.publicId)}
                                    <li
                                        class="group flex min-w-0 items-center gap-3 rounded-lg border border-zinc-200 bg-zinc-50/60 px-3 py-2.5 transition-colors hover:border-amber-300 hover:bg-amber-50/60 dark:border-zinc-800 dark:bg-zinc-900/40 dark:hover:border-amber-500/30 dark:hover:bg-amber-500/5"
                                    >
                                        <div
                                            class="flex size-8 shrink-0 items-center justify-center rounded-md bg-white text-amber-700 shadow-sm ring-1 ring-zinc-200 dark:bg-zinc-900 dark:text-amber-300 dark:ring-zinc-700"
                                        >
                                            <FileTextIcon
                                                class="size-4"
                                                aria-hidden="true"
                                            />
                                        </div>
                                        <div class="min-w-0">
                                            <p
                                                class="truncate text-xs font-semibold text-zinc-900 dark:text-zinc-100"
                                            >
                                                {document.documentType}
                                            </p>
                                            <p
                                                class="truncate text-[11px] text-zinc-500 dark:text-zinc-400"
                                            >
                                                {document.documentNumber ??
                                                    'No document number'}
                                            </p>
                                        </div>
                                    </li>
                                {/each}
                            </ul>
                        {:else}
                            <Empty.Root class="min-h-52 border-0 py-8">
                                <Empty.Header>
                                    <Empty.Media
                                        class="bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300"
                                        variant="icon"
                                    >
                                        <FileTextIcon />
                                    </Empty.Media>
                                    <Empty.Title
                                        >No documents registered</Empty.Title
                                    >
                                    <Empty.Description>
                                        Existing workspace uploads can be
                                        registered to this borrower when the API
                                        supports an object-storage ID.
                                    </Empty.Description>
                                </Empty.Header>
                            </Empty.Root>
                        {/if}
                    </Card.Content>
                </Card.Root>
            </Tabs.Content>
            <Tabs.Content
                value="loans"
                class="mt-0 flex min-h-0 flex-1 flex-col"
            >
                {#key publicId}
                    <BorrowerLoansTable
                        borrowerPublicId={publicId}
                        {role}
                    />
                {/key}
            </Tabs.Content>
            <Tabs.Content
                value="payments"
                class="mt-0 flex min-h-192 flex-1 flex-col sm:min-h-128 lg:min-h-96"
            >
                <div
                    class="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-[#202020]"
                >
                    <div
                        class="flex shrink-0 items-center justify-between border-b border-zinc-100 px-3 py-2 dark:border-zinc-800"
                    >
                        <div>
                            <h3
                                class="text-xs font-semibold text-zinc-900 dark:text-zinc-100"
                            >
                                Payment history
                            </h3>
                            <p
                                class="text-[11px] text-zinc-500 dark:text-zinc-400"
                            >
                                Transaction and collection history for this
                                borrower.
                            </p>
                        </div>
                    </div>
                    <div class="flex min-h-0 flex-1 flex-col overflow-hidden">
                        <PaymentHistoryTable borrowerPublicId={publicId} />
                    </div>
                </div>
            </Tabs.Content>
        </Tabs.Root>
    {/if}
</section>
{#if selectedCollection}
    <PaymentWorkflowDialog
        bind:open={paymentOpen}
        collection={selectedCollection}
        loanPublicId={selectedCollection.loanPublicId}
        onRecorded={async () => {
            await Promise.all([
                detailQuery.refetch(),
                loansQuery.refetch(),
                paymentTagQuery.refetch(),
            ])
        }}
    />
{/if}
<Dialog.Root bind:open={() => editOpen, handleEditOpenChange}>
    <Dialog.Content
        class="flex max-h-[calc(100svh-2rem)] flex-col gap-0 overflow-hidden border-amber-200/70 bg-white p-0 shadow-2xl sm:max-w-3xl dark:border-amber-500/20 dark:bg-[#202020]"
    >
        <form
            class="flex min-h-0 flex-col"
            onsubmit={handleEdit}
        >
            <Dialog.Header
                class="shrink-0 border-b border-zinc-100 p-4 pr-14 sm:px-5 sm:pr-14 dark:border-zinc-800"
            >
                <Dialog.Title class="text-base">Edit Borrower</Dialog.Title>
                <Dialog.Description class="text-xs">
                    Update the permanent borrower profile. This change is audit
                    logged.
                </Dialog.Description>
            </Dialog.Header>
            <div class="min-h-0 overflow-y-auto overscroll-contain p-4 sm:p-5">
                {#if editDraft}
                    <BorrowerFormFields
                        bind:draft={editDraft}
                        disabled={isActionLocked}
                    />
                {/if}
            </div>
            <Dialog.Footer
                class="shrink-0 border-t border-zinc-100 bg-zinc-50/70 px-4 py-3 sm:px-5 dark:border-zinc-800 dark:bg-zinc-900/40"
            >
                <Button
                    class="h-8 text-xs"
                    type="button"
                    disabled={isActionLocked}
                    onclick={() => handleEditOpenChange(false)}
                    size="sm"
                    variant="outline"
                >
                    Cancel
                </Button>
                <Button
                    class="h-8 bg-amber-500 text-xs font-semibold text-zinc-950 hover:bg-amber-400 dark:bg-amber-400 dark:hover:bg-amber-300"
                    type="submit"
                    disabled={isActionLocked}
                    size="sm"
                >
                    {#if isActionLocked}<Spinner
                            data-icon="inline-start"
                        />{/if}Save changes
                </Button>
            </Dialog.Footer>
        </form>
    </Dialog.Content>
</Dialog.Root>
<Dialog.Root bind:open={() => overrideOpen, handleOverrideOpenChange}>
    <Dialog.Content
        class="flex max-h-[calc(100svh-2rem)] flex-col gap-0 overflow-hidden border-amber-200/70 bg-white p-0 shadow-2xl sm:max-w-lg dark:border-amber-500/20 dark:bg-[#202020]"
    >
        <form
            class="flex min-h-0 flex-col"
            onsubmit={handleOverride}
        >
            <Dialog.Header
                class="shrink-0 border-b border-zinc-100 p-4 pr-14 sm:px-5 sm:pr-14 dark:border-zinc-800"
            >
                <Dialog.Title class="text-base"
                    >Override payment tag</Dialog.Title
                >
                <Dialog.Description class="text-xs">
                    The calculated tag remains visible and the reason is
                    retained in the audit history.
                </Dialog.Description>
            </Dialog.Header>
            <div class="min-h-0 overflow-y-auto overscroll-contain p-4 sm:p-5">
                <Field.Group class="gap-4">
                    <Field.Field>
                        <Field.Label for="override-payment-tag"
                            >Payment tag</Field.Label
                        >
                        <NativeSelect.Root
                            id="override-payment-tag"
                            bind:value={overrideTag}
                            disabled={isActionLocked}
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
                    </Field.Field>
                    <Field.Field>
                        <Field.Label for="override-reason">Reason</Field.Label>
                        <Textarea
                            class="min-h-24 resize-none"
                            id="override-reason"
                            bind:value={overrideReason}
                            disabled={isActionLocked}
                            maxlength={500}
                            minlength={3}
                            required
                        />
                        <Field.Description
                            >Required for the audit record.</Field.Description
                        >
                    </Field.Field>
                </Field.Group>
            </div>
            <Dialog.Footer
                class="shrink-0 border-t border-zinc-100 bg-zinc-50/70 px-4 py-3 sm:px-5 dark:border-zinc-800 dark:bg-zinc-900/40"
            >
                <Button
                    class="h-8 text-xs"
                    type="button"
                    disabled={isActionLocked}
                    onclick={() => handleOverrideOpenChange(false)}
                    size="sm"
                    variant="outline"
                >
                    Cancel
                </Button>
                <Button
                    class="h-8 bg-amber-500 text-xs font-semibold text-zinc-950 hover:bg-amber-400 dark:bg-amber-400 dark:hover:bg-amber-300"
                    type="submit"
                    disabled={isActionLocked ||
                        overrideReason.trim().length < 3}
                    size="sm"
                >
                    {#if isActionLocked}<Spinner
                            data-icon="inline-start"
                        />{/if}Save override
                </Button>
            </Dialog.Footer>
        </form>
    </Dialog.Content>
</Dialog.Root>
<AlertDialog.Root bind:open={() => archiveOpen, handleArchiveOpenChange}>
    <AlertDialog.Content
        class="max-h-[calc(100svh-2rem)] max-w-[calc(100vw-2rem)] overflow-y-auto overscroll-contain border-amber-200/70 bg-white shadow-2xl dark:border-amber-500/20 dark:bg-[#202020]"
    >
        <AlertDialog.Header>
            <div
                class="mb-1 flex size-9 items-center justify-center rounded-lg bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400"
            >
                <ArchiveIcon class="size-4" />
            </div>
            <AlertDialog.Title>Archive borrower?</AlertDialog.Title>
            <AlertDialog.Description>
                The borrower remains historically accessible; archiving does not
                delete the record.
            </AlertDialog.Description>
        </AlertDialog.Header>
        <AlertDialog.Footer>
            <AlertDialog.Cancel disabled={isActionLocked}
                >Cancel</AlertDialog.Cancel
            >
            <AlertDialog.Action
                disabled={isActionLocked}
                onclick={handleArchive}
            >
                {#if isActionLocked}<Spinner
                        data-icon="inline-start"
                    />{/if}Archive borrower
            </AlertDialog.Action>
        </AlertDialog.Footer>
    </AlertDialog.Content>
</AlertDialog.Root>
