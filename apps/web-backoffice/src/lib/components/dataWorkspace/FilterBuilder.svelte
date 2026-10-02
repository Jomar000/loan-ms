<script lang="ts">
    import { Button } from '@loanms/ui/components/button'
    import { Input } from '@loanms/ui/components/input'
    import * as Popover from '@loanms/ui/components/popover'
    import * as Select from '@loanms/ui/components/select'
    import { cn } from '@loanms/ui/utils'
    import ChevronDownIcon from '@lucide/svelte/icons/chevron-down'
    import PlusIcon from '@lucide/svelte/icons/plus'
    import SearchIcon from '@lucide/svelte/icons/search'
    import SlidersHorizontalIcon from '@lucide/svelte/icons/sliders-horizontal'
    import XIcon from '@lucide/svelte/icons/x'
    import { createQuery } from '@tanstack/svelte-query'

    import { debounce } from '$lib/utilities/helpers'
    import {
        createActiveFilter,
        getActiveFilterCategoryCount,
        getManualFilters,
        getQuickFilterGroups,
        removeFiltersById,
    } from './filtering'
    import type {
        ActiveFilter,
        FilterFieldDefinition,
        FilterOption,
        FilterOperator,
    } from './types'

    ////////////////////
    // 01. Properties //
    ////////////////////

    let {
        class: className,
        definitions,
        filters,
        onClearAll,
        onFiltersChange,
        onSearchChange,
        open = $bindable(false),
        optionQueryKey,
        search,
        searchPlaceholder = 'Search',
    }: {
        class?: string
        definitions: readonly FilterFieldDefinition[]
        filters: readonly ActiveFilter[]
        onClearAll: () => void
        onFiltersChange: (filters: ActiveFilter[]) => void
        onSearchChange: (search: string) => void
        open?: boolean
        optionQueryKey: readonly unknown[]
        search: string
        searchPlaceholder?: string
    } = $props()

    ///////////////////
    // 02. Constants //
    ///////////////////

    const OPERATOR_LABELS: Record<FilterOperator, string> = {
        is: 'is',
        is_not: 'is not',
    }

    ///////////////
    // 03. State //
    ///////////////

    let optionSearch = $state('')
    let optionSearchInput = $state('')

    /////////////////
    // 04. Derived //
    /////////////////

    const manualFilters = $derived(getManualFilters(filters))
    const quickFilterGroups = $derived(getQuickFilterGroups(filters))
    const activeFilterCategoryCount = $derived(
        getActiveFilterCategoryCount(filters),
    )
    const asyncDefinition = $derived(
        definitions.find((definition) => definition.asyncOptionProvider),
    )
    const showAsyncSearch = $derived(
        Boolean(
            asyncDefinition &&
            manualFilters.some(
                (filter) => filter.field === asyncDefinition.key,
            ),
        ),
    )

    /////////////////
    // 05. Queries //
    /////////////////

    const asyncOptionsQuery = createQuery(() => ({
        enabled: Boolean(open && asyncDefinition?.asyncOptionProvider),
        queryKey: [
            ...optionQueryKey,
            asyncDefinition?.key ?? 'none',
            optionSearch,
        ],
        queryFn: () => asyncDefinition!.asyncOptionProvider!(optionSearch),
    }))

    //////////////////
    // 09. Handlers //
    //////////////////

    const handleOptionSearch = debounce(() => {
        optionSearch = optionSearchInput.trim()
    }, 250)

    function addFilter() {
        const firstDefinition = definitions[0]
        if (!firstDefinition) return

        const firstOption = getOptions(firstDefinition)[0]
        if (!firstOption) return

        onFiltersChange([
            ...filters,
            {
                ...createActiveFilter({
                    field: firstDefinition.key,
                    label: firstOption.label,
                    operator: 'is',
                    value: firstOption.value,
                }),
                id: crypto.randomUUID(),
            },
        ])
    }

    async function changeField(filter: ActiveFilter, field: string) {
        const definition = definitions.find((item) => item.key === field)
        if (!definition) return

        let firstOption: FilterOption | undefined = getOptions(definition)[0]
        if (!firstOption && definition.asyncOptionProvider) {
            const result = await asyncOptionsQuery.refetch()
            firstOption = result.data?.[0]
        }
        if (!firstOption) return

        updateFilter(filter.id, {
            ...filter,
            field: definition.key,
            label: firstOption.label,
            value: firstOption.value,
        })
    }

    function changeValue(filter: ActiveFilter, value: string) {
        const definition = definitions.find((item) => item.key === filter.field)
        const option = definition
            ? getOptions(definition).find((item) => item.value === value)
            : undefined

        updateFilter(filter.id, {
            ...filter,
            label: option?.label,
            value,
        })
    }

    function updateFilter(id: string, updatedFilter: ActiveFilter) {
        onFiltersChange(
            filters.map((filter) =>
                filter.id === id ? updatedFilter : filter,
            ),
        )
    }

    function removeFilter(id: string) {
        onFiltersChange(filters.filter((filter) => filter.id !== id))
    }

    function removeFilters(ids: string[]) {
        onFiltersChange(removeFiltersById(filters, ids))
    }

    /////////////////
    // 10. Helpers //
    /////////////////

    function getOptions(definition: FilterFieldDefinition): FilterOption[] {
        if (definition.asyncOptionProvider) {
            return asyncOptionsQuery.data ?? []
        }

        return [...(definition.options ?? [])]
    }

    function getValueLabel(
        filter: ActiveFilter,
        definition: FilterFieldDefinition | undefined,
    ) {
        if (!definition) return filter.label ?? filter.value

        return (
            getOptions(definition).find(
                (option) => option.value === filter.value,
            )?.label ??
            filter.label ??
            filter.value
        )
    }
</script>

<div class={cn('flex min-w-0 flex-wrap items-center gap-2', className)}>
    <div class="relative min-w-40 flex-1 sm:max-w-xs sm:min-w-52">
        <SearchIcon
            class="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
        />
        <Input
            class="h-8 bg-background pl-8 text-[13px]"
            oninput={(event) => onSearchChange(event.currentTarget.value)}
            placeholder={searchPlaceholder}
            value={search}
        />
    </div>

    <Popover.Root bind:open>
        <Popover.Trigger>
            {#snippet child({ props })}
                <Button
                    {...props}
                    class={cn(
                        'h-8 gap-1.5 text-[13px] transition-colors',
                        filters.length > 0 &&
                            'border-brand-active-border bg-brand-surface text-brand-foreground hover:bg-brand-active',
                    )}
                    size="sm"
                    variant="outline"
                >
                    <SlidersHorizontalIcon class="size-3.5" />
                    <span class="hidden sm:inline">More filters</span>
                    <span
                        aria-hidden={activeFilterCategoryCount === 0}
                        class={cn(
                            'flex size-4 items-center justify-center rounded-full bg-primary text-[10px] leading-none font-semibold text-primary-foreground tabular-nums',
                            activeFilterCategoryCount === 0 && 'invisible',
                        )}>{activeFilterCategoryCount}</span
                    >
                    <ChevronDownIcon
                        class={cn(
                            'size-3 text-muted-foreground transition-transform duration-150',
                            open && 'rotate-180',
                        )}
                    />
                </Button>
            {/snippet}
        </Popover.Trigger>

        <Popover.Content
            align="start"
            class="w-[min(94vw,520px)] p-0 shadow-lg"
            sideOffset={6}
        >
            <div
                class="flex h-10 items-center justify-between border-b border-border px-3"
            >
                <span
                    class="text-[12px] font-semibold tracking-wide text-foreground uppercase"
                    >Filters</span
                >
                <div class="flex h-7 w-16 items-center justify-end">
                    {#if filters.length > 0 || search.trim()}
                        <Button
                            class="h-7 px-2 text-[12px] text-muted-foreground"
                            onclick={onClearAll}
                            size="sm"
                            variant="ghost"
                        >
                            Clear all
                        </Button>
                    {/if}
                </div>
            </div>

            <div
                class={cn(
                    'max-h-80 min-h-20 overflow-y-auto px-3 py-2',
                    filters.length === 0 && 'flex items-center justify-center',
                )}
            >
                {#if filters.length === 0}
                    <p class="text-center text-[12px] text-muted-foreground">
                        No filters applied. Add one below.
                    </p>
                {:else}
                    {#if quickFilterGroups.length > 0}
                        <div class="flex flex-col gap-1.5">
                            <span
                                class="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase"
                                >Quick filters</span
                            >
                            {#each quickFilterGroups as quickFilter (quickFilter.id)}
                                <div
                                    class="flex h-8 items-center gap-2 rounded-md border border-border bg-muted/30 px-2"
                                >
                                    <span
                                        class="bg-brand-surface text-brand-foreground rounded-sm px-1.5 py-0.5 text-[10px] font-semibold uppercase"
                                        >Preset</span
                                    >
                                    <span
                                        class="min-w-0 flex-1 truncate text-[12px] font-medium"
                                        >{quickFilter.label}</span
                                    >
                                    <Button
                                        aria-label={`Remove ${quickFilter.label} filter`}
                                        class="size-6 text-muted-foreground"
                                        onclick={() =>
                                            removeFilters(
                                                quickFilter.filterIds,
                                            )}
                                        size="icon"
                                        variant="ghost"
                                    >
                                        <XIcon class="size-3.5" />
                                    </Button>
                                </div>
                            {/each}
                        </div>
                    {/if}

                    {#if manualFilters.length > 0}
                        <div
                            class={cn(
                                'flex flex-col gap-1.5',
                                quickFilterGroups.length > 0 &&
                                    'mt-3 border-t border-border pt-2',
                            )}
                        >
                            <span
                                class="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase"
                                >Manual filters</span
                            >

                            {#if showAsyncSearch && asyncDefinition}
                                <div class="relative">
                                    <SearchIcon
                                        class="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
                                    />
                                    <Input
                                        aria-label={`Search ${asyncDefinition.label}`}
                                        bind:value={optionSearchInput}
                                        class="h-7 bg-background pl-8 text-[12px]"
                                        oninput={handleOptionSearch}
                                        placeholder={`Search ${asyncDefinition.label.toLowerCase()}`}
                                    />
                                </div>
                            {/if}

                            {#each manualFilters as filter, index (filter.id)}
                                {@const definition = definitions.find(
                                    (field) => field.key === filter.field,
                                )}
                                <div
                                    class="grid grid-cols-[1fr_96px_1fr_28px] items-center gap-1.5 max-sm:grid-cols-[1fr_28px]"
                                >
                                    <Select.Root
                                        onValueChange={(value) =>
                                            void changeField(
                                                filter,
                                                String(value),
                                            )}
                                        type="single"
                                        value={filter.field}
                                    >
                                        <Select.Trigger
                                            aria-label={`Filter ${index + 1} field`}
                                            class="h-7 w-full text-[12px]"
                                        >
                                            {definition?.label}
                                        </Select.Trigger>
                                        <Select.Content>
                                            {#each definitions as field (field.key)}
                                                <Select.Item value={field.key}
                                                    >{field.label}</Select.Item
                                                >
                                            {/each}
                                        </Select.Content>
                                    </Select.Root>

                                    <Select.Root
                                        onValueChange={(value) =>
                                            updateFilter(filter.id, {
                                                ...filter,
                                                operator: String(
                                                    value,
                                                ) as FilterOperator,
                                            })}
                                        type="single"
                                        value={filter.operator}
                                    >
                                        <Select.Trigger
                                            aria-label={`Filter ${index + 1} operator`}
                                            class="h-7 w-full text-[12px] max-sm:col-start-1 max-sm:row-start-2"
                                        >
                                            {OPERATOR_LABELS[filter.operator]}
                                        </Select.Trigger>
                                        <Select.Content>
                                            {#each Object.entries(OPERATOR_LABELS) as [value, label] (value)}
                                                <Select.Item {value}
                                                    >{label}</Select.Item
                                                >
                                            {/each}
                                        </Select.Content>
                                    </Select.Root>

                                    <Select.Root
                                        disabled={Boolean(
                                            definition?.asyncOptionProvider &&
                                            asyncOptionsQuery.isFetching,
                                        )}
                                        onValueChange={(value) =>
                                            changeValue(filter, String(value))}
                                        type="single"
                                        value={filter.value}
                                    >
                                        <Select.Trigger
                                            aria-label={`Filter ${index + 1} value`}
                                            class="h-7 w-full text-[12px] max-sm:col-start-1"
                                        >
                                            {definition?.asyncOptionProvider &&
                                            asyncOptionsQuery.isFetching
                                                ? 'Loading…'
                                                : getValueLabel(
                                                      filter,
                                                      definition,
                                                  )}
                                        </Select.Trigger>
                                        <Select.Content>
                                            {#each definition ? getOptions(definition) : [] as option (option.value)}
                                                <Select.Item
                                                    value={option.value}
                                                    >{option.label}</Select.Item
                                                >
                                            {/each}
                                        </Select.Content>
                                    </Select.Root>

                                    <Button
                                        aria-label="Remove filter"
                                        class="size-7 text-muted-foreground max-sm:col-start-2 max-sm:row-start-1"
                                        onclick={() => removeFilter(filter.id)}
                                        size="icon"
                                        variant="ghost"
                                    >
                                        <XIcon class="size-3.5" />
                                    </Button>
                                </div>
                            {/each}
                        </div>
                    {/if}
                {/if}
            </div>

            <div
                class="flex min-h-10 items-center border-t border-border px-3 py-1.5"
            >
                <Button
                    class="h-7 gap-1.5 px-2 text-[12px] text-muted-foreground"
                    onclick={addFilter}
                    size="sm"
                    variant="ghost"
                >
                    <PlusIcon class="size-3.5" /> Add filter
                </Button>
            </div>
        </Popover.Content>
    </Popover.Root>
</div>
