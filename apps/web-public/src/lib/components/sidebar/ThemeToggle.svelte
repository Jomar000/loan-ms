<script lang="ts">
    import { Button } from '@hyperion/ui/components/button'
    import * as Tooltip from '@hyperion/ui/components/tooltip'
    import MoonIcon from '@lucide/svelte/icons/moon'
    import SunIcon from '@lucide/svelte/icons/sun'
    import { mode, toggleMode } from 'mode-watcher'

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
                aria-label={`Switch to ${mode.current === 'dark' ? 'light' : 'dark'} mode`}
                class={className}
                onclick={toggleMode}
                size="icon"
                variant="ghost"
            >
                {#if mode.current === 'dark'}
                    <SunIcon data-icon="inline-start" />
                {:else}
                    <MoonIcon data-icon="inline-start" />
                {/if}
            </Button>
        {/snippet}
    </Tooltip.Trigger>
    <Tooltip.Content side={tooltipSide}>
        Switch to {mode.current === 'dark' ? 'light' : 'dark'} mode
    </Tooltip.Content>
</Tooltip.Root>
