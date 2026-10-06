<script lang="ts">
    import { Button } from '@loanms/ui/components/button'
    import * as NativeSelect from '@loanms/ui/components/native-select'
    import ChevronLeftIcon from '@lucide/svelte/icons/chevron-left'
    import ChevronRightIcon from '@lucide/svelte/icons/chevron-right'

    import { isWorkspacePageSize, WORKSPACE_PAGE_SIZES } from './constants'

    ////////////////////
    // 01. Properties //
    ////////////////////

    let {
        count,
        disabled = false,
        onPageChange,
        onPageSizeChange,
        page,
        pageSize,
    }: {
        count: number
        disabled?: boolean
        onPageChange: (page: number) => void
        onPageSizeChange: (pageSize: number) => void
        page: number
        pageSize: number
    } = $props()

    /////////////////
    // 04. Derived //
    /////////////////

    const pageCount = $derived(Math.max(1, Math.ceil(count / pageSize)))

    //////////////////
    // 09. Handlers //
    //////////////////

    function handlePageSizeChange(event: Event) {
        const nextPageSize = Number(
            (event.currentTarget as HTMLSelectElement).value,
        )
        if (!isWorkspacePageSize(nextPageSize)) return

        onPageSizeChange(nextPageSize)
    }
</script>

<footer
    class="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-zinc-100 bg-zinc-50/70 px-2 py-1.5 dark:border-zinc-800 dark:bg-zinc-900/35"
>
    <span class="text-[12px] text-muted-foreground tabular-nums">
        {count.toLocaleString()} record{count === 1 ? '' : 's'}
        <span class="mx-1.5 opacity-40">·</span>
        Page {page} of {pageCount}
    </span>
    <div class="flex items-center gap-1">
        <label class="flex items-center gap-2">
            <span class="hidden text-[12px] text-muted-foreground sm:inline"
                >Rows</span
            >
            <NativeSelect.Root
                aria-label="Rows per page"
                class="[&_select]:rounded-sm [&_select]:text-[12px]"
                {disabled}
                onchange={handlePageSizeChange}
                size="sm"
                value={pageSize}
            >
                {#each WORKSPACE_PAGE_SIZES as size (size)}
                    <NativeSelect.Option value={size}
                        >{size}</NativeSelect.Option
                    >
                {/each}
            </NativeSelect.Root>
        </label>
        <Button
            aria-label="Previous page"
            class="size-7"
            disabled={disabled || page <= 1}
            onclick={() => onPageChange(page - 1)}
            size="icon"
            variant="outline"
        >
            <ChevronLeftIcon />
        </Button>
        <Button
            aria-label="Next page"
            class="size-7"
            disabled={disabled || page >= pageCount}
            onclick={() => onPageChange(page + 1)}
            size="icon"
            variant="outline"
        >
            <ChevronRightIcon />
        </Button>
    </div>
</footer>
