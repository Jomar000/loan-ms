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
    import * as Tabs from '@loanms/ui/components/tabs'
    import { Textarea } from '@loanms/ui/components/textarea'
    import AlertCircleIcon from '@lucide/svelte/icons/alert-circle'
    import ArchiveIcon from '@lucide/svelte/icons/archive'
    import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left'
    import FileTextIcon from '@lucide/svelte/icons/file-text'
    import LandmarkIcon from '@lucide/svelte/icons/landmark'
    import PencilIcon from '@lucide/svelte/icons/pencil'
    import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw'
    import { toast } from 'svelte-sonner'
    import { goto } from '$app/navigation'

    import { createLoanListQuery } from '$lib/modules/loan/queries'
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
    let overrideOpen = $state(false)
    let overrideReason = $state('')
    let overrideTag = $state<BorrowerPaymentTag>('GOOD_PAYER')
    let paymentOpen = $state(false)
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

    function handleRecordPayment() {
        if (!activeLoan) {
            toast.error(
                'This borrower has no active loan available for payment.',
            )
            return
        }
        paymentOpen = true
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

<section class="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4 md:p-6">
    <Button
        class="w-fit"
        onclick={() => void goto(`/app/${role}/borrowers`)}
        size="sm"
        variant="ghost"
    >
        <ArrowLeftIcon data-icon="inline-start" /> Back to borrowers
    </Button>

    {#if detailQuery.isPending}
        <Skeleton class="h-36 w-full" />
    {:else if detailQuery.isError || !borrower}
        <Alert.Root variant="destructive">
            <AlertCircleIcon />
            <Alert.Title>Borrower could not be loaded</Alert.Title>
            <Alert.Description
                >The record may be unavailable or no longer accessible in this
                organization.</Alert.Description
            >
            <Button
                onclick={() => void detailQuery.refetch()}
                size="sm"
                variant="outline"
                ><RefreshCwIcon data-icon="inline-start" /> Refresh</Button
            >
        </Alert.Root>
    {:else}
        <header class="flex flex-wrap items-start justify-between gap-3">
            <div>
                <div class="flex flex-wrap items-center gap-2">
                    <h2 class="text-xl font-semibold text-foreground">
                        {borrower.fullName}
                    </h2>
                    <PaymentTagBadge
                        source={borrower.paymentTagSource}
                        tag={borrower.paymentTag}
                    />
                </div>
                <p class="text-sm text-muted-foreground">
                    {borrower.borrowerNumber} · {borrower.status}
                </p>
            </div>
            <div class="flex flex-wrap gap-2">
                <Button
                    disabled={loansQuery.isPending}
                    onclick={handleRecordPayment}
                    variant="outline">Record Payment</Button
                >
                {#if borrower.status === 'ACTIVE'}
                    <Button onclick={handleCreateLoan}>
                        <LandmarkIcon data-icon="inline-start" /> Create Loan
                    </Button>
                {/if}
                <Button
                    onclick={openEdit}
                    variant="outline"
                    ><PencilIcon data-icon="inline-start" /> Edit Borrower</Button
                >
                {#if borrower.status !== 'ARCHIVED'}
                    <Button
                        onclick={() => (archiveOpen = true)}
                        variant="destructive"
                        ><ArchiveIcon data-icon="inline-start" /> Archive</Button
                    >
                {/if}
            </div>
        </header>

        <Tabs.Root bind:value={selectedTab}>
            <Tabs.List class="w-full justify-start overflow-x-auto">
                <Tabs.Trigger value="overview">Overview</Tabs.Trigger>
                <Tabs.Trigger value="documents">Documents</Tabs.Trigger>
                <Tabs.Trigger value="loans">Loans</Tabs.Trigger>
                <Tabs.Trigger value="payments">Payments</Tabs.Trigger>
            </Tabs.List>
            <Tabs.Content
                value="overview"
                class="pt-4"
            >
                <div class="grid gap-4 lg:grid-cols-2">
                    <Card.Root>
                        <Card.Header
                            ><Card.Title>Borrower details</Card.Title
                            ><Card.Description
                                >Personal and contact information.</Card.Description
                            ></Card.Header
                        >
                        <Card.Content class="grid gap-3 text-sm">
                            <p>
                                <span class="text-muted-foreground"
                                    >Contact:</span
                                >
                                {borrower.contactNumber}
                            </p>
                            <p>
                                <span class="text-muted-foreground">Email:</span
                                >
                                {borrower.email ?? 'Not recorded'}
                            </p>
                            <p>
                                <span class="text-muted-foreground"
                                    >Address:</span
                                >
                                {borrower.addressLine}, {borrower.barangay}, {borrower.cityMunicipality},
                                {borrower.province}
                            </p>
                        </Card.Content>
                    </Card.Root>
                    <Card.Root>
                        <Card.Header
                            ><Card.Title>Payment behavior</Card.Title
                            ><Card.Description
                                >Internal risk information only; it does not
                                block a borrower by itself.</Card.Description
                            ></Card.Header
                        >
                        <Card.Content class="grid gap-3 text-sm">
                            <p>
                                <span class="text-muted-foreground"
                                    >Current tag:</span
                                >
                                <PaymentTagBadge
                                    source={borrower.paymentTagSource}
                                    tag={borrower.paymentTag}
                                />
                            </p>
                            <p>
                                <span class="text-muted-foreground"
                                    >Calculated tag:</span
                                >
                                <PaymentTagBadge
                                    tag={borrower.systemPaymentTag}
                                />
                            </p>
                            <p>
                                <span class="text-muted-foreground"
                                    >Missed scheduled installments:</span
                                >
                                {paymentTag?.missedInstallmentCount ?? '—'}
                            </p>
                            <p>
                                <span class="text-muted-foreground"
                                    >Payment type:</span
                                >
                                {paymentTag?.paymentType ?? 'No loan yet'}
                            </p>
                            {#if borrower.paymentTagSource === 'MANUAL_OVERRIDE'}
                                <p>
                                    <span class="text-muted-foreground"
                                        >Override reason:</span
                                    >
                                    {borrower.paymentTagOverrideReason}
                                </p>
                            {/if}
                        </Card.Content>
                        <Card.Footer class="flex flex-wrap gap-2">
                            <Button
                                onclick={() => (overrideOpen = true)}
                                size="sm"
                                variant="outline">Override tag</Button
                            >
                            {#if borrower.paymentTagSource === 'MANUAL_OVERRIDE'}
                                <Button
                                    disabled={isActionLocked}
                                    onclick={handleResetPaymentTag}
                                    size="sm"
                                    variant="outline"
                                    >Reset to calculated tag</Button
                                >
                            {/if}
                        </Card.Footer>
                    </Card.Root>
                </div>
            </Tabs.Content>
            <Tabs.Content
                value="documents"
                class="pt-4"
            >
                <Card.Root>
                    <Card.Header
                        ><Card.Title>Documents</Card.Title><Card.Description
                            >Registered borrower documents. Upload and
                            registration workflows stay in the existing
                            workspace until a borrower-specific upload flow is
                            approved.</Card.Description
                        ></Card.Header
                    >
                    <Card.Content>
                        {#if documentsQuery.isPending}
                            <Skeleton class="h-20 w-full" />
                        {:else if documents.length}
                            <ul class="grid gap-2">
                                {#each documents as document (document.publicId)}
                                    <li
                                        class="flex items-center gap-2 rounded-md border p-3"
                                    >
                                        <FileTextIcon
                                            class="size-4 text-muted-foreground"
                                            aria-hidden="true"
                                        />
                                        <span>{document.documentType}</span
                                        ><span class="text-muted-foreground"
                                            >{document.documentNumber ??
                                                'No document number'}</span
                                        >
                                    </li>
                                {/each}
                            </ul>
                        {:else}
                            <Empty.Root class="border-0 py-8"
                                ><Empty.Header
                                    ><Empty.Media variant="icon"
                                        ><FileTextIcon /></Empty.Media
                                    ><Empty.Title
                                        >No documents registered</Empty.Title
                                    ><Empty.Description
                                        >Existing workspace uploads can be
                                        registered to this borrower when the API
                                        supports an object-storage ID.</Empty.Description
                                    ></Empty.Header
                                ></Empty.Root
                            >
                        {/if}
                    </Card.Content>
                </Card.Root>
            </Tabs.Content>
            <Tabs.Content
                value="loans"
                class="pt-4"
            >
                <Empty.Root class="border"
                    ><Empty.Header
                        ><Empty.Media variant="icon"
                            ><LandmarkIcon /></Empty.Media
                        ><Empty.Title>No loans yet</Empty.Title
                        ><Empty.Description
                            >This borrower can remain independent of loans, or a
                            new loan can be prepared when needed.</Empty.Description
                        ></Empty.Header
                    ><Button
                        onclick={handleCreateLoan}
                        variant="outline">Create Loan</Button
                    ></Empty.Root
                >
            </Tabs.Content>
            <Tabs.Content
                value="payments"
                class="pt-4"
            >
                <PaymentHistoryTable borrowerPublicId={publicId} />
            </Tabs.Content>
        </Tabs.Root>
    {/if}
</section>

{#if activeLoan}
    <PaymentWorkflowDialog
        bind:open={paymentOpen}
        loanPublicId={activeLoan.publicId}
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
    <Dialog.Content class="max-h-[90vh] max-w-3xl overflow-y-auto">
        <form
            class="grid gap-6"
            onsubmit={handleEdit}
        >
            <Dialog.Header
                ><Dialog.Title>Edit Borrower</Dialog.Title><Dialog.Description
                    >Update the permanent borrower profile. This change is audit
                    logged.</Dialog.Description
                ></Dialog.Header
            >
            {#if editDraft}<BorrowerFormFields
                    bind:draft={editDraft}
                    disabled={isActionLocked}
                />{/if}
            <Dialog.Footer
                ><Button
                    type="button"
                    disabled={isActionLocked}
                    onclick={() => handleEditOpenChange(false)}
                    variant="outline">Cancel</Button
                ><Button
                    type="submit"
                    disabled={isActionLocked}
                    >{#if isActionLocked}<Spinner
                            data-icon="inline-start"
                        />{/if}Save changes</Button
                ></Dialog.Footer
            >
        </form>
    </Dialog.Content>
</Dialog.Root>

<Dialog.Root bind:open={() => overrideOpen, handleOverrideOpenChange}>
    <Dialog.Content>
        <form
            class="grid gap-5"
            onsubmit={handleOverride}
        >
            <Dialog.Header
                ><Dialog.Title>Override payment tag</Dialog.Title
                ><Dialog.Description
                    >The calculated tag remains visible and the reason is
                    retained in the audit history.</Dialog.Description
                ></Dialog.Header
            >
            <Field.Group>
                <Field.Field
                    ><Field.Label for="override-payment-tag"
                        >Payment tag</Field.Label
                    ><NativeSelect.Root
                        id="override-payment-tag"
                        bind:value={overrideTag}
                        disabled={isActionLocked}
                        ><NativeSelect.Option value="GOOD_PAYER"
                            >Good Payer</NativeSelect.Option
                        ><NativeSelect.Option value="BAD_PAYER"
                            >Bad Payer</NativeSelect.Option
                        ><NativeSelect.Option value="SCAMMER"
                            >Scammer</NativeSelect.Option
                        ></NativeSelect.Root
                    ></Field.Field
                >
                <Field.Field
                    ><Field.Label for="override-reason">Reason</Field.Label
                    ><Textarea
                        id="override-reason"
                        bind:value={overrideReason}
                        disabled={isActionLocked}
                        maxlength={500}
                        minlength={3}
                        required
                    /><Field.Description
                        >Required for the audit record.</Field.Description
                    ></Field.Field
                >
            </Field.Group>
            <Dialog.Footer
                ><Button
                    type="button"
                    disabled={isActionLocked}
                    onclick={() => handleOverrideOpenChange(false)}
                    variant="outline">Cancel</Button
                ><Button
                    type="submit"
                    disabled={isActionLocked ||
                        overrideReason.trim().length < 3}
                    >{#if isActionLocked}<Spinner
                            data-icon="inline-start"
                        />{/if}Save override</Button
                ></Dialog.Footer
            >
        </form>
    </Dialog.Content>
</Dialog.Root>

<AlertDialog.Root bind:open={() => archiveOpen, handleArchiveOpenChange}>
    <AlertDialog.Content>
        <AlertDialog.Header
            ><AlertDialog.Title>Archive borrower?</AlertDialog.Title
            ><AlertDialog.Description
                >The borrower remains historically accessible; archiving does
                not delete the record.</AlertDialog.Description
            ></AlertDialog.Header
        >
        <AlertDialog.Footer
            ><AlertDialog.Cancel disabled={isActionLocked}
                >Cancel</AlertDialog.Cancel
            ><AlertDialog.Action
                disabled={isActionLocked}
                onclick={handleArchive}
                >{#if isActionLocked}<Spinner
                        data-icon="inline-start"
                    />{/if}Archive borrower</AlertDialog.Action
            ></AlertDialog.Footer
        >
    </AlertDialog.Content>
</AlertDialog.Root>
