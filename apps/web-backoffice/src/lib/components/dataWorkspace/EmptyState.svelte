<script lang="ts">
    import { Button } from '@loanms/ui/components/button'
    import * as Empty from '@loanms/ui/components/empty'
    import SearchXIcon from '@lucide/svelte/icons/search-x'

    ////////////////////
    // 01. Properties //
    ////////////////////

    let {
        actionLabel,
        description,
        onaction,
        title,
    }: {
        actionLabel?: string
        description: string
        onaction?: () => void
        title: string
    } = $props()
</script>

<Empty.Root class="size-full border-0 px-6 py-10">
    <Empty.Header>
        <Empty.Media variant="icon">
            <SearchXIcon />
        </Empty.Media>
        <Empty.Title>{title}</Empty.Title>
        <Empty.Description>
            {description}
        </Empty.Description>
    </Empty.Header>
    {#if actionLabel && onaction}
        <Empty.Content>
            <Button
                onclick={onaction}
                size="sm"
                variant="outline"
            >
                {actionLabel}
            </Button>
        </Empty.Content>
    {/if}
</Empty.Root>
