<script lang="ts">
    import { cn } from '@loanms/ui/utils'
    import ArchiveIcon from '@lucide/svelte/icons/archive'
    import CircleCheckIcon from '@lucide/svelte/icons/circle-check'
    import CirclePauseIcon from '@lucide/svelte/icons/circle-pause'

    ////////////////////
    // 01. Properties //
    ////////////////////

    let {
        archived = false,
        status,
    }: {
        archived?: boolean
        status: 'ACTIVE' | 'INACTIVE'
    } = $props()

    /////////////////
    // 04. Derived //
    /////////////////

    const state = $derived(archived ? 'ARCHIVED' : status)
    const label = $derived(
        state === 'ACTIVE'
            ? 'Active'
            : state === 'INACTIVE'
              ? 'Inactive'
              : 'Archived',
    )
</script>

<span
    class={cn(
        'inline-flex h-6 items-center gap-1 rounded-sm border px-2 text-[11px] font-medium',
        state === 'ACTIVE' &&
            'border-success-active-border bg-success text-success-foreground',
        state === 'INACTIVE' &&
            'border-warning-active-border bg-warning text-warning-foreground',
        state === 'ARCHIVED' &&
            'border-danger-active-border bg-danger text-danger-foreground',
    )}
>
    {#if state === 'ACTIVE'}
        <CircleCheckIcon class="size-3" />
    {:else if state === 'INACTIVE'}
        <CirclePauseIcon class="size-3" />
    {:else}
        <ArchiveIcon class="size-3" />
    {/if}
    {label}
</span>
