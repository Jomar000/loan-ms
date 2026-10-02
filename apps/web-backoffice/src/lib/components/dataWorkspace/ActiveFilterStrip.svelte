<script lang="ts">
    import { Button } from '@loanms/ui/components/button'
    import XIcon from '@lucide/svelte/icons/x'

    import {
        getManualFilterChips,
        getQuickFilterGroups,
        removeFiltersById,
    } from './filtering'
    import type { ActiveFilter, FilterFieldDefinition } from './types'

    ////////////////////
    // 01. Properties //
    ////////////////////

    let {
        definitions,
        filters,
        onClearAll,
        onFiltersChange,
        onShowMore,
    }: {
        definitions: readonly FilterFieldDefinition[]
        filters: readonly ActiveFilter[]
        onClearAll: () => void
        onFiltersChange: (filters: ActiveFilter[]) => void
        onShowMore: () => void
    } = $props()

    ///////////////////
    // 02. Constants //
    ///////////////////

    const MAX_VISIBLE_CHIPS = 2

    /////////////////
    // 04. Derived //
    /////////////////

    const quickFilterChips = $derived(getQuickFilterGroups(filters))
    const manualFilterChips = $derived(
        getManualFilterChips(filters, definitions),
    )
    const activeFilterChips = $derived([
        ...quickFilterChips,
        ...manualFilterChips,
    ])
    const visibleFilterChips = $derived(
        activeFilterChips.slice(0, MAX_VISIBLE_CHIPS),
    )
    const hiddenFilterCount = $derived(
        Math.max(0, activeFilterChips.length - visibleFilterChips.length),
    )

    //////////////////
    // 09. Handlers //
    //////////////////

    function removeFilters(ids: string[]) {
        onFiltersChange(removeFiltersById(filters, ids))
    }
</script>

{#if activeFilterChips.length > 0}
    <div
        class="flex min-h-10 shrink-0 items-center gap-2 border-b border-border bg-muted/20 px-3 py-1.5"
    >
        <span class="shrink-0 text-[11px] font-medium text-muted-foreground">
            Active filters ({activeFilterChips.length})
        </span>

        <div class="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto">
            {#each visibleFilterChips as chip (chip.id)}
                <div
                    class="border-brand-active-border bg-brand-surface text-brand-foreground flex h-7 max-w-52 shrink-0 items-center gap-1 rounded-full border pl-2.5 text-[11px]"
                >
                    <span
                        class="truncate font-medium"
                        title={chip.label}>{chip.label}</span
                    >
                    <button
                        aria-label={`Remove ${chip.label}`}
                        class="text-brand-foreground hover:bg-brand-active focus-visible:ring-brand-active-ring flex size-6 shrink-0 items-center justify-center rounded-full transition-colors focus-visible:ring-2 focus-visible:outline-none"
                        onclick={() => removeFilters(chip.filterIds)}
                        type="button"
                    >
                        <XIcon class="size-3" />
                    </button>
                </div>
            {/each}

            {#if hiddenFilterCount > 0}
                <Button
                    class="h-7 shrink-0 rounded-full px-2.5 text-[11px] text-muted-foreground"
                    onclick={onShowMore}
                    size="sm"
                    variant="outline"
                >
                    +{hiddenFilterCount} more
                </Button>
            {/if}
        </div>

        <Button
            class="h-7 shrink-0 px-2 text-[11px] text-muted-foreground"
            onclick={onClearAll}
            size="sm"
            variant="ghost"
        >
            Clear all
        </Button>
    </div>
{/if}
