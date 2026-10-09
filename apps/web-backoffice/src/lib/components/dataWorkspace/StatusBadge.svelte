<script lang="ts">
    import { Badge } from '@loanms/ui/components/badge'
    import ArchiveIcon from '@lucide/svelte/icons/archive'
    import CircleCheckIcon from '@lucide/svelte/icons/circle-check'
    import CirclePauseIcon from '@lucide/svelte/icons/circle-pause'
    import type { Snippet } from 'svelte'

    ////////////////////
    // 01. Properties //
    ////////////////////

    let {
        archived = false,
        children,
        label,
        status,
    }: {
        archived?: boolean
        children?: Snippet
        label?: string
        status: string
    } = $props()

    ///////////////////
    // 02. Constants //
    ///////////////////

    const tones: Record<string, 'success' | 'warning' | 'danger' | 'info'> = {
        ACTIVE: 'success',
        APPROVED: 'success',
        ARCHIVED: 'danger',
        BAD_PAYER: 'warning',
        BLOCKED: 'danger',
        CANCELLED: 'danger',
        DEFAULT: 'info',
        DISABLED: 'warning',
        DRAFT: 'info',
        ENABLED: 'success',
        FAILED: 'danger',
        FULLY_PAID: 'success',
        GOOD_PAYER: 'success',
        INACTIVE: 'warning',
        OVERDUE: 'danger',
        PAID: 'success',
        PARTIAL: 'warning',
        PENDING_APPROVAL: 'warning',
        POSTED: 'success',
        QUEUED: 'warning',
        RELEASED: 'success',
        RENEWED: 'info',
        REVERSED: 'danger',
        REVOKED: 'danger',
        SCAMMER: 'danger',
        UPCOMING: 'warning',
        UPLOADED: 'success',
        UPLOADING: 'info',
        WAIVED: 'info',
        WRITTEN_OFF: 'danger',
    }

    /////////////////
    // 04. Derived //
    /////////////////

    const state = $derived(archived ? 'ARCHIVED' : status)
    const displayLabel = $derived(
        archived
            ? 'Archived'
            : (label ??
                  (state === 'ACTIVE'
                      ? 'Active'
                      : state === 'INACTIVE'
                        ? 'Inactive'
                        : state.replaceAll('_', ' '))),
    )
    const tone = $derived(tones[state] ?? 'neutral')
</script>

<span
    class="status-badge"
    data-tone={tone}
>
    <Badge
        class="h-6 rounded-full"
        variant="outline"
    >
        {#if children}
            {@render children()}
        {:else}
            {#if state === 'ACTIVE'}
                <CircleCheckIcon aria-hidden="true" />
            {:else if state === 'INACTIVE'}
                <CirclePauseIcon aria-hidden="true" />
            {:else if state === 'ARCHIVED'}
                <ArchiveIcon aria-hidden="true" />
            {/if}
            {displayLabel}
        {/if}
    </Badge>
</span>

<style>
    .status-badge {
        display: inline-flex;
        border-radius: 9999px;
        background-color: var(--muted);
        --foreground: var(--muted-foreground);
    }

    .status-badge[data-tone='success'] {
        background-color: var(--success);
        --foreground: var(--success-foreground);
        --border: var(--success-active-border);
    }

    .status-badge[data-tone='warning'] {
        background-color: var(--warning);
        --foreground: var(--warning-foreground);
        --border: var(--warning-active-border);
    }

    .status-badge[data-tone='danger'] {
        background-color: var(--danger);
        --foreground: var(--danger-foreground);
        --border: var(--danger-active-border);
    }

    .status-badge[data-tone='info'] {
        background-color: var(--info);
        --foreground: var(--info-foreground);
        --border: var(--info-active-border);
    }
</style>
