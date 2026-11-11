<script lang="ts">
    import { Badge } from '@loanms/ui/components/badge'
    import { Button } from '@loanms/ui/components/button'
    import * as Card from '@loanms/ui/components/card'

    import type { LoanInstallment, LoanListItem } from '$lib/modules/loan/types'
    import {
        formatCurrency,
        formatDate,
    } from '$lib/modules/loan/utilities/format'

    ////////////////////
    // 01. Properties //
    ////////////////////

    let {
        installments,
        isError = false,
        loan,
        loanHref,
        onRefresh,
    }: {
        installments?: LoanInstallment[]
        isError?: boolean
        loan: LoanListItem
        loanHref: string
        onRefresh: () => void
    } = $props()

    ///////////////////
    // 02. Constants //
    ///////////////////

    const today = new Intl.DateTimeFormat('en-CA', {
        day: '2-digit',
        month: '2-digit',
        timeZone: 'Asia/Manila',
        year: 'numeric',
    }).format(new Date())

    /////////////////
    // 04. Derived //
    /////////////////

    const unpaid = $derived(
        installments
            ?.filter(
                (item) =>
                    item.amountPaidMinor < item.amountDueMinor &&
                    item.status !== 'PAID' &&
                    item.status !== 'WAIVED',
            )
            .sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
    )
    const overdue = $derived(
        (unpaid ?? []).filter((item) => item.dueDate < today),
    )
    const overdueMinor = $derived(
        overdue.reduce(
            (total, item) => total + item.amountDueMinor - item.amountPaidMinor,
            0,
        ),
    )
    const oldest = $derived(unpaid?.[0])
</script>

<section aria-label="Borrower unpaid collections">
    <Card.Root class="gap-3 py-4 shadow-none">
        <Card.Header
            class="flex flex-wrap items-start justify-between gap-3 px-4"
        >
            <div class="min-w-0 space-y-1">
                <Card.Title class="text-sm">Unpaid collections</Card.Title>
                <p
                    class="font-mono text-2xl font-bold tabular-nums sm:text-3xl"
                >
                    {formatCurrency(loan.actualOutstandingBalanceMinor)}
                </p>
                <Card.Description
                    >Total unpaid balance · {loan.loanNumber}</Card.Description
                >
            </div>
            <Badge
                variant="outline"
                class={overdue.length > 0
                    ? 'border-danger-active-border text-danger-foreground'
                    : loan.actualOutstandingBalanceMinor > 0
                      ? 'border-warning-active-border text-warning-foreground'
                      : 'border-border text-muted-foreground'}
            >
                {#if overdue.length > 0}Overdue collection{:else if loan.actualOutstandingBalanceMinor > 0}Payment
                    pending{:else}No unpaid balance{/if}
            </Badge>
        </Card.Header>
        <Card.Content class="px-4">
            {#if unpaid !== undefined}
                <dl class="grid gap-3 border-t pt-3 sm:grid-cols-3">
                    <div>
                        <dt class="text-xs text-muted-foreground">
                            Unpaid dates
                        </dt>
                        <dd class="mt-1 text-lg font-semibold tabular-nums">
                            {unpaid.length}
                        </dd>
                    </div>
                    <div>
                        <dt class="text-xs text-muted-foreground">
                            Overdue amount
                        </dt>
                        <dd
                            class="mt-1 font-mono text-lg font-semibold tabular-nums"
                        >
                            {formatCurrency(overdueMinor)}
                        </dd>
                        <dd class="text-xs text-muted-foreground">
                            {overdue.length} overdue {overdue.length === 1
                                ? 'date'
                                : 'dates'}
                        </dd>
                    </div>
                    <div>
                        <dt class="text-xs text-muted-foreground">
                            Oldest unpaid date
                        </dt>
                        <dd class="mt-1 text-sm font-semibold">
                            {oldest
                                ? formatDate(oldest.dueDate)
                                : 'No unpaid dates'}
                        </dd>
                        {#if oldest}<dd
                                class="mt-1 font-mono text-sm tabular-nums"
                            >
                                {formatCurrency(
                                    oldest.amountDueMinor -
                                        oldest.amountPaidMinor,
                                )} remaining
                            </dd>{/if}
                    </div>
                </dl>
            {:else if isError}
                <p class="text-sm">
                    Unpaid dates could not be loaded. The balance above is from
                    the loan summary.
                </p>
                <Button
                    type="button"
                    variant="outline"
                    class="mt-2"
                    onclick={onRefresh}>Refresh unpaid dates</Button
                >
            {:else}
                <p
                    class="text-sm"
                    role="status"
                >
                    Loading unpaid dates…
                </p>
            {/if}
        </Card.Content>
        <Card.Footer class="px-4">
            <Button
                href={loanHref}
                size="sm"
                variant="outline">View loan and unpaid dates</Button
            >
        </Card.Footer>
    </Card.Root>
</section>
