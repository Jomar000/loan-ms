<script
    lang="ts"
    module
>
    export type Side = 'top' | 'right' | 'bottom' | 'left'
</script>

<script lang="ts">
    import XIcon from '@lucide/svelte/icons/x'
    import { Dialog as SheetPrimitive } from 'bits-ui'
    import type { ComponentProps, Snippet } from 'svelte'

    import { Button } from '../../components/button/index.js'
    import SheetOverlay from '../../components/sheet/sheet-overlay.svelte'
    import SheetPortal from '../../components/sheet/sheet-portal.svelte'
    import { cn, type WithoutChildrenOrChild } from '../../utils.js'

    let {
        ref = $bindable(null),
        class: className,
        side = 'right',
        showCloseButton = true,
        portalProps,
        children,
        ...restProps
    }: WithoutChildrenOrChild<SheetPrimitive.ContentProps> & {
        portalProps?: WithoutChildrenOrChild<ComponentProps<typeof SheetPortal>>
        side?: Side
        showCloseButton?: boolean
        children: Snippet
    } = $props()
</script>

<!-- @component
Project-owned replacement for shadcn-svelte Vega's Sheet.Content.

Upstream target: the `sheet/sheet-content.svelte` registry primitive.
Defect: the generated `data-open` and `data-closed` animation variants do not match Bits UI's `data-state="open|closed"` attributes, so Sheet content does not run its entrance or exit animations.
Composition limitation: correcting this at each call site leaves the exported primitive defective and makes every consumer repeat the complete side-specific animation workaround.
Intentional divergence: only the open and closed selectors use Bits UI's `data-state` contract. Props, snippets, events, generated dependencies, layout, visual styling, close-button behavior, default immediate backdrop, and default 200ms ease-in-out panel fade and subtle slide otherwise mirror Vega upstream.
Retirement condition: remove this replacement after shadcn-svelte emits Bits UI-compatible selectors, then migrate all consumers back to `@loanms/ui/components/sheet` and verify open and close animations.

Upstream references:
- https://shadcn-svelte.com/docs/components/sheet
- https://shadcn-svelte.com/registry/styles/vega/sheet.json
- https://www.bits-ui.com/docs/components/dialog
-->

<SheetPortal {...portalProps}>
    <SheetOverlay />
    <SheetPrimitive.Content
        bind:ref
        data-slot="sheet-content"
        data-side={side}
        class={cn(
            'fixed z-50 flex flex-col gap-4 bg-popover bg-clip-padding text-sm text-popover-foreground shadow-lg transition duration-200 ease-in-out data-[side=bottom]:inset-x-0 data-[side=bottom]:bottom-0 data-[side=bottom]:h-auto data-[side=bottom]:border-t data-[side=left]:inset-y-0 data-[side=left]:left-0 data-[side=left]:h-full data-[side=left]:w-3/4 data-[side=left]:border-r data-[side=right]:inset-y-0 data-[side=right]:right-0 data-[side=right]:h-full data-[side=right]:w-3/4 data-[side=right]:border-l data-[side=top]:inset-x-0 data-[side=top]:top-0 data-[side=top]:h-auto data-[side=top]:border-b data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[side=bottom]:data-[state=closed]:slide-out-to-bottom-10 data-[side=left]:data-[state=closed]:slide-out-to-left-10 data-[side=right]:data-[state=closed]:slide-out-to-right-10 data-[side=top]:data-[state=closed]:slide-out-to-top-10 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[side=bottom]:data-[state=open]:slide-in-from-bottom-10 data-[side=left]:data-[state=open]:slide-in-from-left-10 data-[side=right]:data-[state=open]:slide-in-from-right-10 data-[side=top]:data-[state=open]:slide-in-from-top-10 data-[side=left]:sm:max-w-sm data-[side=right]:sm:max-w-sm',
            className,
        )}
        {...restProps}
    >
        {@render children?.()}
        {#if showCloseButton}
            <SheetPrimitive.Close data-slot="sheet-close">
                {#snippet child({ props })}
                    <Button
                        variant="ghost"
                        class="absolute top-4 right-4"
                        size="icon-sm"
                        {...props}
                    >
                        <XIcon />
                        <span class="sr-only">Close</span>
                    </Button>
                {/snippet}
            </SheetPrimitive.Close>
        {/if}
    </SheetPrimitive.Content>
</SheetPortal>
