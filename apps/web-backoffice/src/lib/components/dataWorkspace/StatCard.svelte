<script lang="ts">
    import { cn } from '@loanms/ui/utils'
    import type { Component } from 'svelte'

    ////////////////////
    // 01. Properties //
    ////////////////////

    let {
        active = false,
        count,
        description,
        icon: Icon,
        label,
        onclick,
        tone = 'neutral',
    }: {
        active?: boolean
        count?: number
        description?: string
        icon: Component
        label: string
        onclick: () => void
        tone?: 'success' | 'warning' | 'danger' | 'neutral'
    } = $props()

    ///////////////////
    // 02. Constants //
    ///////////////////

    const TONE_CLASSES = {
        success: {
            active: 'border-success-active-border bg-success-active ring-success-active-ring/30',
            activeIcon: 'bg-success-foreground/15 text-success-foreground',
            hover: 'hover:border-success-active-border hover:bg-success-active hover:ring-1 hover:ring-success-active-ring/30',
            hoverIcon: 'group-hover:bg-success-foreground/15',
            icon: 'bg-success/15 text-success-foreground',
            value: 'text-success-foreground',
        },
        warning: {
            active: 'border-warning-active-border bg-warning-active ring-warning-active-ring/30',
            activeIcon: 'bg-warning-foreground/15 text-warning-foreground',
            hover: 'hover:border-warning-active-border hover:bg-warning-active hover:ring-1 hover:ring-warning-active-ring/30',
            hoverIcon: 'group-hover:bg-warning-foreground/15',
            icon: 'bg-warning/15 text-warning-foreground',
            value: 'text-warning-foreground',
        },
        danger: {
            active: 'border-danger-active-border bg-danger-active ring-danger-active-ring/30',
            activeIcon: 'bg-danger-foreground/15 text-danger-foreground',
            hover: 'hover:border-danger-active-border hover:bg-danger-active hover:ring-1 hover:ring-danger-active-ring/30',
            hoverIcon: 'group-hover:bg-danger-foreground/15',
            icon: 'bg-danger/15 text-danger-foreground',
            value: 'text-danger-foreground',
        },
        neutral: {
            active: 'border-neutral-active-border bg-neutral-active ring-neutral-active-ring/30',
            activeIcon: 'bg-muted text-muted-foreground',
            hover: 'hover:border-neutral-active-border hover:bg-neutral-active hover:ring-1 hover:ring-neutral-active-ring/30',
            hoverIcon: 'group-hover:bg-muted',
            icon: 'bg-muted text-muted-foreground',
            value: 'text-foreground',
        },
    } as const

    /////////////////
    // 04. Derived //
    /////////////////

    const colors = $derived(TONE_CLASSES[tone])
    const formattedCount = $derived(
        count === undefined ? '—' : count.toLocaleString(),
    )
</script>

<button
    aria-pressed={active}
    class={cn(
        'group flex min-w-0 items-center gap-3 rounded-lg border border-border bg-card p-3 text-left transition-[border-color,background-color,box-shadow] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
        colors.hover,
        active && ['ring-1', colors.active],
    )}
    type="button"
    {onclick}
>
    <div
        class={cn(
            'flex size-9 shrink-0 items-center justify-center rounded-md',
            active ? colors.activeIcon : [colors.icon, colors.hoverIcon],
        )}
    >
        <Icon class="size-4.5" />
    </div>
    <div class="flex min-w-0 flex-col">
        <span class={cn('text-xl/tight font-bold tabular-nums', colors.value)}
            >{formattedCount}</span
        >
        <span class="truncate text-[12px] leading-snug font-medium"
            >{label}</span
        >
        {#if description}
            <span
                class="truncate text-[11px] leading-snug text-muted-foreground"
                >{description}</span
            >
        {/if}
    </div>
</button>
