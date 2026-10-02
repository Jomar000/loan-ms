<script lang="ts">
    import CircleHelpIcon from '@lucide/svelte/icons/circle-help'
    import { mergeProps } from 'bits-ui'

    import { Button } from '$lib/components/button/index.js'
    import * as Popover from '$lib/components/popover/index.js'
    import * as Tooltip from '$lib/components/tooltip/index.js'

    /**
     * Side on which `FieldHelp` displays both its tooltip and popover content.
     *
     * @description Defaults to `top`.
     */
    export type FieldHelpPlacement = 'top' | 'right' | 'bottom' | 'left'

    /** Properties for standalone contextual field guidance. */
    interface Props {
        /** Accessible label for the help trigger and popover. */
        label: string
        /** Guidance shown visually and retained as a screen-reader description. */
        description: string
        /** Id referenced by the associated control's `aria-describedby`. */
        descriptionId: string
        /** Side on which both visual help surfaces appear. */
        placement?: FieldHelpPlacement
    }

    let {
        label,
        description,
        descriptionId,
        placement = 'top',
    }: Props = $props()

    let tooltipDismissed = $state(false)
    let tooltipOpen = $state(false)

    function handleTooltipOpenChange(nextOpen: boolean) {
        tooltipOpen = tooltipDismissed && nextOpen ? false : nextOpen
    }

    function dismissTooltip() {
        tooltipDismissed = true
        tooltipOpen = false
    }

    function resetTooltipDismissal() {
        tooltipDismissed = false
    }
</script>

<!--
@component
`FormFieldLabel` is normally the preferred entry point for field help. Use
`FieldHelp` directly only when contextual guidance is not attached to a standard
field-label row. Import it from `@hyperion/ui/shared/field-help`.

Provide an accessible `label`, the help `description`, and a unique
`descriptionId`; the related control must reference that id with
`aria-describedby`. The component keeps a persistent screen-reader description,
shows a tooltip for hover/focus, and opens a popover for persistent interaction.
`placement` positions both visual surfaces.

```svelte
<script lang="ts">
    import { FieldHelp } from '@hyperion/ui/shared/field-help'
</script>

<FieldHelp
    description="Values are synchronized nightly."
    descriptionId="sync-help"
    label="Synchronization help"
/>
```

Use raw `Tooltip` or `Popover` when the content is not field guidance and does
not need this combined accessible behavior.
-->

<Popover.Root>
    <Tooltip.Provider>
        <Tooltip.Root
            bind:open={tooltipOpen}
            onOpenChange={handleTooltipOpenChange}
        >
            <Tooltip.Trigger>
                {#snippet child({ props: tooltipProps })}
                    <Popover.Trigger {...tooltipProps}>
                        {#snippet child({ props })}
                            {@const triggerProps = mergeProps(props, {
                                onblur: resetTooltipDismissal,
                                onpointerleave: resetTooltipDismissal,
                            })}
                            <Button
                                {...triggerProps}
                                aria-describedby={descriptionId}
                                aria-label={label}
                                size="icon-sm"
                                type="button"
                                variant="ghost"
                            >
                                <CircleHelpIcon aria-hidden="true" />
                            </Button>
                        {/snippet}
                    </Popover.Trigger>
                {/snippet}
            </Tooltip.Trigger>
            <Tooltip.Content
                onEscapeKeydown={dismissTooltip}
                side={placement}
            >
                <span role="tooltip">{description}</span>
            </Tooltip.Content>
        </Tooltip.Root>
    </Tooltip.Provider>
    <Popover.Content side={placement}>
        <div
            aria-label={label}
            role="dialog"
        >
            <Popover.Title class="sr-only">{label}</Popover.Title>
            <Popover.Description>{description}</Popover.Description>
        </div>
    </Popover.Content>
</Popover.Root>

<span
    class="sr-only"
    id={descriptionId}
>
    {description}
</span>
