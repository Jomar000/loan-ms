<script lang="ts">
    import { Tabs as TabsPrimitive } from 'bits-ui'
    import { cn } from '../../utils.js'

    let {
        ref = $bindable(null),
        class: className,
        ...restProps
    }: TabsPrimitive.TriggerProps = $props()
</script>

<!-- @component
Project-owned replacement for shadcn-svelte Vega's Tabs.Trigger.

Upstream target: the `tabs/tabs-trigger.svelte` registry primitive.
Defect: the generated `data-active` variants do not match Bits UI's
`data-state="active"` attribute, so selected-tab background, text, shadow, and
line indicators are not applied.
Composition limitation: correcting this at call sites leaves the exported
primitive defective and requires every consumer to repeat all default and line
variant state selectors.
Intentional divergence: only active-state selectors use Bits UI's `data-state`
contract. Props, bindings, generated dependencies, layout, visual styling,
variants, disabled behavior, focus indication, and exports otherwise mirror
Vega upstream.
Retirement condition: remove this replacement after shadcn-svelte emits Bits
UI-compatible Tabs active-state selectors, then migrate consumers back to
`@hyperion/ui/components/tabs` and verify both default and line variants.

Upstream references:
- https://shadcn-svelte.com/docs/components/tabs
- https://shadcn-svelte.com/registry/styles/vega/tabs.json
- https://www.bits-ui.com/docs/components/tabs
-->

<TabsPrimitive.Trigger
    bind:ref
    data-slot="tabs-trigger"
    class={cn(
        "relative inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-sm font-medium whitespace-nowrap text-foreground/60 transition-all group-data-vertical/tabs:w-full group-data-vertical/tabs:justify-start hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 group-data-[variant=default]/tabs-list:data-[state=active]:shadow-sm group-data-[variant=line]/tabs-list:data-[state=active]:shadow-none dark:text-muted-foreground dark:hover:text-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        'group-data-[variant=line]/tabs-list:bg-transparent group-data-[variant=line]/tabs-list:data-[state=active]:bg-transparent dark:group-data-[variant=line]/tabs-list:data-[state=active]:border-transparent dark:group-data-[variant=line]/tabs-list:data-[state=active]:bg-transparent',
        'data-[state=active]:bg-background data-[state=active]:text-foreground dark:data-[state=active]:border-input dark:data-[state=active]:bg-input/30 dark:data-[state=active]:text-foreground',
        'after:absolute after:bg-foreground after:opacity-0 after:transition-opacity group-data-horizontal/tabs:after:inset-x-0 group-data-horizontal/tabs:after:bottom-[-5px] group-data-horizontal/tabs:after:h-0.5 group-data-vertical/tabs:after:inset-y-0 group-data-vertical/tabs:after:-right-1 group-data-vertical/tabs:after:w-0.5 group-data-[variant=line]/tabs-list:data-[state=active]:after:opacity-100',
        className,
    )}
    {...restProps}
/>
