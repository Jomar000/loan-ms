<script lang="ts">
    import { Button } from '@hyperion/ui/components/button'
    import * as Tooltip from '@hyperion/ui/components/tooltip'
    import { cn } from '@hyperion/ui/utils'
    import BellIcon from '@lucide/svelte/icons/bell'

    ////////////////////
    // 01. Properties //
    ////////////////////

    let {
        class: className,
        tooltipSide = 'bottom',
    }: {
        class?: string
        tooltipSide?: 'top' | 'right' | 'bottom' | 'left'
    } = $props()
</script>

<Tooltip.Root>
    <Tooltip.Trigger>
        {#snippet child({ props })}
            <Button
                {...props}
                aria-label="Notifications unavailable"
                class={cn('relative', className)}
                disabled
                size="icon"
                variant="ghost"
            >
                <BellIcon
                    aria-hidden="true"
                    data-icon="inline-start"
                />
            </Button>
        {/snippet}
    </Tooltip.Trigger>
    <Tooltip.Content side={tooltipSide}
        >Notifications coming soon</Tooltip.Content
    >
</Tooltip.Root>
