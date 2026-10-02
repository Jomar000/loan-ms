<script lang="ts">
    import { Badge } from '@loanms/ui/components/badge'
    import { Button } from '@loanms/ui/components/button'
    import * as Sheet from '@loanms/ui/components/sheet'
    import { Skeleton } from '@loanms/ui/components/skeleton'
    import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw'

    import { useSessionContext } from '$lib/states/session'
    import { activityActionLabel, activityComponentLabel } from '../config'
    import { createActivityLogDetailQuery } from '../queries'

    ////////////////////
    // 01. Properties //
    ////////////////////

    let {
        open = $bindable(false),
        publicId,
    }: {
        open?: boolean
        publicId: string
    } = $props()

    ///////////////////
    // 02. Constants //
    ///////////////////

    const session = useSessionContext()

    /////////////////
    // 05. Queries //
    /////////////////

    const detailQuery = createActivityLogDetailQuery(
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

    /////////////////
    // 10. Helpers //
    /////////////////

    function formatDateTime(value: string) {
        return new Intl.DateTimeFormat(undefined, {
            dateStyle: 'medium',
            timeStyle: 'long',
        }).format(new Date(value))
    }

    function formatValue(value: boolean | null | number | string | undefined) {
        if (value === undefined) return 'Not recorded'
        if (value === null) return 'None'
        if (typeof value === 'boolean') return value ? 'Yes' : 'No'
        return String(value)
    }
</script>

<Sheet.Root bind:open>
    <Sheet.Content class="w-full overflow-y-auto sm:max-w-2xl">
        <Sheet.Header class="border-b border-border px-5 py-4">
            <Sheet.Title>Activity details</Sheet.Title>
            <Sheet.Description>
                Immutable event metadata and recorded field changes.
            </Sheet.Description>
        </Sheet.Header>

        <div class="flex flex-col gap-5 px-5 pb-6">
            {#if detailQuery.isPending}
                {#each [0, 1, 2, 3] as item (item)}
                    <Skeleton class="h-16 w-full" />
                {/each}
            {:else if detailQuery.isError}
                <div class="flex flex-col items-center gap-3 py-12 text-center">
                    <p class="text-sm text-muted-foreground">
                        Activity details could not be loaded.
                    </p>
                    <Button
                        onclick={() => detailQuery.refetch()}
                        size="sm"
                        variant="outline"
                    >
                        <RefreshCwIcon data-icon="inline-start" /> Retry
                    </Button>
                </div>
            {:else if detailQuery.data}
                {@const detail = detailQuery.data}
                <section class="flex flex-col gap-2">
                    <div class="flex flex-wrap items-center gap-2">
                        <Badge variant="secondary">
                            {activityActionLabel(detail.action)}
                        </Badge>
                        <span class="text-xs text-muted-foreground">
                            {activityComponentLabel(detail.component)}
                        </span>
                    </div>
                    <p class="text-base font-medium">{detail.description}</p>
                    <dl class="grid gap-x-4 gap-y-2 text-xs sm:grid-cols-2">
                        <div>
                            <dt class="text-muted-foreground">Date and time</dt>
                            <dd>{formatDateTime(detail.loggedAt)}</dd>
                        </div>
                        <div>
                            <dt class="text-muted-foreground">Event ID</dt>
                            <dd class="font-mono break-all">
                                {detail.publicId}
                            </dd>
                        </div>
                        <div>
                            <dt class="text-muted-foreground">Actor</dt>
                            <dd>
                                {detail.actor.displayName ?? 'Not recorded'}
                            </dd>
                        </div>
                        <div>
                            <dt class="text-muted-foreground">Actor role</dt>
                            <dd>
                                {detail.actor.role
                                    ? detail.actor.role
                                          .split(',')
                                          .map((role) =>
                                              activityComponentLabel(
                                                  role.trim(),
                                              ),
                                          )
                                          .join(', ')
                                    : 'Not recorded'}
                            </dd>
                        </div>
                        <div>
                            <dt class="text-muted-foreground">Actor type</dt>
                            <dd>
                                {detail.actor.type
                                    ? activityComponentLabel(detail.actor.type)
                                    : 'Not recorded'}
                            </dd>
                        </div>
                        <div>
                            <dt class="text-muted-foreground">
                                Actor identifier
                            </dt>
                            <dd class="wrap-break-word">
                                {detail.actor.identifier ?? 'N/A'}
                            </dd>
                        </div>
                        <div>
                            <dt class="text-muted-foreground">Source</dt>
                            <dd>
                                {detail.sourceChannel} · {detail.ipAddress ??
                                    'N/A'}
                            </dd>
                        </div>
                        <div>
                            <dt class="text-muted-foreground">User agent</dt>
                            <dd class="wrap-break-word">
                                {detail.userAgent ?? 'N/A'}
                            </dd>
                        </div>
                    </dl>
                </section>

                <section class="flex flex-col gap-3">
                    <h3 class="text-sm font-semibold">Affected records</h3>
                    {#if detail.records.length === 0}
                        <p class="text-sm text-muted-foreground">
                            No affected record was attached to this event.
                        </p>
                    {:else}
                        {#each detail.records as record (`${record.entityType}:${record.id}`)}
                            <article
                                class="flex flex-col gap-3 rounded-sm border border-border p-3"
                            >
                                <div>
                                    <p class="text-sm font-medium">
                                        {record.label ??
                                            record.code ??
                                            activityComponentLabel(
                                                record.entityType,
                                            )}
                                    </p>
                                    <p
                                        class="font-mono text-[11px] break-all text-muted-foreground"
                                    >
                                        {record.id}
                                    </p>
                                </div>

                                {#if record.changes.length > 0}
                                    <dl class="flex flex-col gap-2">
                                        {#each record.changes as change (change.field)}
                                            <div
                                                class="grid gap-1 text-xs sm:grid-cols-[9rem_1fr_1fr]"
                                            >
                                                <dt class="font-medium">
                                                    {change.label}
                                                </dt>
                                                <dd
                                                    class="rounded-sm bg-muted px-2 py-1 line-through opacity-70"
                                                >
                                                    {formatValue(change.before)}
                                                </dd>
                                                <dd
                                                    class="rounded-sm bg-muted px-2 py-1"
                                                >
                                                    {formatValue(change.after)}
                                                </dd>
                                            </div>
                                        {/each}
                                    </dl>
                                {:else if record.snapshotRecorded}
                                    <dl class="grid gap-2 sm:grid-cols-2">
                                        {#each record.snapshot as entry (entry.field)}
                                            <div class="text-xs">
                                                <dt
                                                    class="text-muted-foreground"
                                                >
                                                    {entry.label}
                                                </dt>
                                                <dd>
                                                    {formatValue(entry.value)}
                                                </dd>
                                            </div>
                                        {/each}
                                    </dl>
                                {:else}
                                    <p class="text-xs text-muted-foreground">
                                        Snapshot not recorded.
                                    </p>
                                {/if}
                            </article>
                        {/each}
                    {/if}
                </section>
            {/if}
        </div>
    </Sheet.Content>
</Sheet.Root>
