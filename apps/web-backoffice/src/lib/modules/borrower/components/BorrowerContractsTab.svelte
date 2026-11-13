<script lang="ts">
    import * as Alert from '@loanms/ui/components/alert'
    import { Button } from '@loanms/ui/components/button'
    import * as Empty from '@loanms/ui/components/empty'
    import * as Field from '@loanms/ui/components/field'
    import { Input } from '@loanms/ui/components/input'
    import * as NativeSelect from '@loanms/ui/components/native-select'
    import { Skeleton } from '@loanms/ui/components/skeleton'
    import { Spinner } from '@loanms/ui/components/spinner'
    import FileTextIcon from '@lucide/svelte/icons/file-text'
    import PrinterIcon from '@lucide/svelte/icons/printer'
    import { toast } from 'svelte-sonner'

    import PaginationFooter from '$lib/components/dataWorkspace/PaginationFooter.svelte'
    import {
        createLoanDetailQuery,
        createLoanListQuery,
    } from '$lib/modules/loan/queries'
    import { useSessionContext } from '$lib/states/session'
    import { getErrorMessage } from '$lib/utilities/helpers'
    import type { Borrower } from '../types'
    import { printContract } from '../utilities/printContract'
    import LoanContractDocument from './LoanContractDocument.svelte'

    ////////////////////
    // 01. Properties //
    ////////////////////
    let { borrower }: { borrower: Borrower } = $props()

    ///////////////////
    // 02. Constants //
    ///////////////////
    const session = useSessionContext()
    const id = $props.id()
    const scope = {
        get organizationSlug() {
            return session.data.organizationSlug
        },
    }

    ///////////////
    // 03. State //
    ///////////////
    let pageNumber = $state(1)
    let pageSize = $state(25)
    let selectedPublicId = $state('')
    let lenderAddress = $state(
        'Del Corro St. Brgy. San Vicente Gapan City, Nueva Ecija',
    )
    let ownerName = $state(
        session.data.userRoles?.includes('owner') ? session.data.name : '',
    )
    let documentElement = $state<HTMLDivElement>()
    let isPrinting = $state(false)

    /////////////////
    // 04. Derived //
    /////////////////
    const loans = $derived.by(() => loansQuery.data?.data ?? [])
    const selectedLoanId = $derived(
        loans.find((loan) => loan.publicId === selectedPublicId)?.publicId ??
            loans[0]?.publicId ??
            '',
    )
    const loan = $derived.by(() =>
        contractQuery.data?.publicId === selectedLoanId &&
        contractQuery.data?.borrowerPublicId === borrower.publicId
            ? contractQuery.data
            : undefined,
    )
    const hasCompleteSchedule = $derived(
        Boolean(
            loan &&
            loan.installments.length ===
                loan.formulaSnapshot.installmentCount &&
            loan.installments.reduce(
                (sum, item) => sum + item.amountDueMinor,
                0,
            ) === loan.totalPayableMinor,
        ),
    )
    const canPrint = $derived.by(() =>
        Boolean(
            loan &&
            hasCompleteSchedule &&
            lenderAddress.trim() &&
            ownerName.trim() &&
            !loansQuery.isFetching &&
            !loansQuery.isError &&
            !contractQuery.isFetching &&
            !contractQuery.isError,
        ),
    )

    /////////////////
    // 05. Queries //
    /////////////////
    const loansQuery = createLoanListQuery(scope, {
        get request() {
            return {
                filters: { borrowerPublicId: borrower.publicId },
                limit: pageSize,
                offset: (pageNumber - 1) * pageSize,
                sortOrder: 'desc' as const,
            }
        },
    })
    const contractQuery = createLoanDetailQuery(scope, {
        get publicId() {
            return selectedLoanId
        },
    })

    //////////////////
    // 09. Handlers //
    //////////////////
    function handleLoanChange(event: Event) {
        selectedPublicId = (event.currentTarget as HTMLSelectElement).value
    }
    function handlePageChange(page: number) {
        selectedPublicId = ''
        pageNumber = page
    }
    function handlePageSizeChange(size: number) {
        selectedPublicId = ''
        pageSize = size
        pageNumber = 1
    }
    async function handlePrint() {
        if (isPrinting || !canPrint || !documentElement || !loan) return
        isPrinting = true
        try {
            await printContract(
                documentElement,
                `Loan contract - ${loan.loanNumber}`,
            )
        } catch (error) {
            toast.error(getErrorMessage(error, 'Could not print the contract.'))
        } finally {
            isPrinting = false
        }
    }
</script>

<div
    class="flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-card p-3 text-card-foreground"
>
    <header class="flex flex-wrap items-start justify-between gap-3">
        <div>
            <h2 class="text-sm font-semibold">Contracts</h2>
            <p class="text-xs text-muted-foreground">
                Generate and print a loan agreement from the saved loan terms.
            </p>
        </div>
        <Button
            disabled={!canPrint || isPrinting}
            onclick={handlePrint}
            size="sm"
        >
            {#if isPrinting}<Spinner
                    data-icon="inline-start"
                />{:else}<PrinterIcon data-icon="inline-start" />{/if}
            Print contract
        </Button>
    </header>

    {#if loansQuery.isPending}
        <div
            role="status"
            class="flex flex-col gap-2"
        >
            <span class="sr-only">Loading contracts</span>
            <Skeleton class="h-10 w-full" />
            <Skeleton class="h-64 w-full" />
        </div>
    {:else if loansQuery.isError}
        <Alert.Root variant="destructive">
            <Alert.Title>Contracts could not be loaded</Alert.Title>
            <Alert.Description
                >{getErrorMessage(
                    loansQuery.error,
                    'Please refresh the borrower loans.',
                )}</Alert.Description
            >
            <Button
                onclick={() => void loansQuery.refetch()}
                size="sm"
                variant="outline">Refresh contracts</Button
            >
        </Alert.Root>
    {:else if !loans.length}
        <Empty.Root>
            <Empty.Header>
                <Empty.Media variant="icon"><FileTextIcon /></Empty.Media>
                <Empty.Title>No contracts yet</Empty.Title>
                <Empty.Description
                    >A contract is automatically available once a loan is
                    created for this borrower.</Empty.Description
                >
            </Empty.Header>
        </Empty.Root>
    {:else}
        <Field.Group class="grid gap-3 sm:grid-cols-2">
            <Field.Field>
                <Field.Label for={`${id}-loan`}>Loan</Field.Label>
                <NativeSelect.Root
                    id={`${id}-loan`}
                    class="w-full"
                    value={selectedLoanId}
                    onchange={handleLoanChange}
                    disabled={isPrinting || loansQuery.isFetching}
                >
                    {#each loans as item (item.publicId)}
                        <NativeSelect.Option value={item.publicId}
                            >{item.loanNumber} · {item.status.replaceAll(
                                '_',
                                ' ',
                            )}</NativeSelect.Option
                        >
                    {/each}
                </NativeSelect.Root>
            </Field.Field>
            <Field.Field>
                <Field.Label for={`${id}-owner`}>Owner’s full name</Field.Label>
                <Input
                    id={`${id}-owner`}
                    bind:value={ownerName}
                    disabled={isPrinting}
                    maxlength={250}
                    required
                />
            </Field.Field>
            <Field.Field>
                <Field.Label for={`${id}-address`}>Lender’s address</Field.Label
                >
                <Input
                    id={`${id}-address`}
                    bind:value={lenderAddress}
                    disabled={isPrinting}
                    maxlength={500}
                    required
                />
            </Field.Field>
        </Field.Group>
        <p class="text-xs text-muted-foreground">
            Complete the lender details to print. These details apply to this
            preview only.
        </p>
        <Alert.Root>
            <Alert.Title>Review before signing</Alert.Title>
            <Alert.Description>
                This generated template needs review by Philippine legal counsel
                before business use. It does not replace required lending
                disclosures. Verify the parties, loan status, and terms, then
                print for signatures. Printing does not approve or release a
                loan.
            </Alert.Description>
        </Alert.Root>
        {#if contractQuery.isError}
            <Alert.Root variant="destructive">
                <Alert.Title>Contract details could not be loaded</Alert.Title>
                <Alert.Description
                    >{getErrorMessage(
                        contractQuery.error,
                        'Please refresh the selected loan.',
                    )}</Alert.Description
                >
                <Button
                    onclick={() => void contractQuery.refetch()}
                    size="sm"
                    variant="outline">Refresh contract details</Button
                >
            </Alert.Root>
        {:else if contractQuery.isPending || !loan}
            <div role="status">
                <span class="sr-only">Loading contract details</span>
                <Skeleton class="h-96 w-full" />
            </div>
        {:else if !hasCompleteSchedule}
            <Alert.Root variant="destructive">
                <Alert.Title>Repayment schedule is incomplete</Alert.Title>
                <Alert.Description
                    >Refresh the loan details before printing this contract.</Alert.Description
                >
                <Button
                    onclick={() => void contractQuery.refetch()}
                    size="sm"
                    variant="outline">Refresh contract details</Button
                >
            </Alert.Root>
        {:else}
            <div bind:this={documentElement}>
                <LoanContractDocument
                    {borrower}
                    {loan}
                    {lenderAddress}
                    {ownerName}
                />
            </div>
        {/if}
    {/if}
    {#if (loansQuery.data?.count ?? 0) > 0 && !loansQuery.isError}
        <PaginationFooter
            count={loansQuery.data?.count ?? 0}
            disabled={loansQuery.isFetching || isPrinting}
            page={pageNumber}
            {pageSize}
            onPageChange={handlePageChange}
            onPageSizeChange={handlePageSizeChange}
        />
    {/if}
</div>
