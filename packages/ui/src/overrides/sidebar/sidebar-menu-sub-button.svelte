<script lang="ts">
    import type { Snippet } from 'svelte'
    import type { HTMLAnchorAttributes } from 'svelte/elements'

    import { cn, type WithElementRef } from '../../utils.js'

    let {
        ref = $bindable(null),
        children,
        child,
        class: className,
        size = 'md',
        isActive = false,
        ...restProps
    }: WithElementRef<HTMLAnchorAttributes> & {
        child?: Snippet<[{ props: Record<string, unknown> }]>
        size?: 'sm' | 'md'
        isActive?: boolean
    } = $props()

    const mergedProps = $derived({
        class: cn(
            'text-sidebar-foreground ring-sidebar-ring hover:bg-sidebar-accent hover:text-sidebar-accent-foreground active:bg-sidebar-accent active:text-sidebar-accent-foreground [&>svg]:text-sidebar-accent-foreground data-active:bg-sidebar-accent data-active:text-sidebar-accent-foreground h-7 gap-2 rounded-md px-2 focus-visible:ring-2 data-[size=md]:text-sm data-[size=sm]:text-xs [&>svg]:size-4 flex min-w-0 -translate-x-px items-center overflow-hidden outline-hidden group-data-[collapsible=icon]:hidden disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&>span:last-child]:truncate [&>svg]:shrink-0',
            className,
        ),
        'data-slot': 'sidebar-menu-sub-button',
        'data-sidebar': 'menu-sub-button',
        'data-size': size,
        'data-active': isActive ? true : undefined,
        ...restProps,
    })
</script>

<!-- @component
Project-owned replacement for shadcn-svelte Vega's Sidebar.MenuSubButton.

Upstream target: the `sidebar/sidebar-menu-sub-button.svelte` registry primitive.
Defect: the generated component emits `data-active="false"` while its `data-active:*` Tailwind variants match attribute presence, so inactive submenu links render with active styling.
Composition limitation: call-site composition cannot remove the internally emitted attribute without replacing the component.
Intentional divergence: inactive submenu links omit `data-active`; active links emit `data-active="true"`. Props, snippets, events, sizes, layout, styling, and exports otherwise mirror upstream.
Retirement condition: remove this replacement after the supported shadcn-svelte Vega registry emits value-sensitive active selectors or omits `data-active` when false, then migrate consumers back to `@loanms/ui/components/sidebar`.

Upstream references:
- https://shadcn-svelte.com/docs/components/sidebar
- https://shadcn-svelte.com/registry/styles/vega/sidebar.json
-->

{#if child}
    {@render child({ props: mergedProps })}
{:else}
    <a
        bind:this={ref}
        {...mergedProps}
    >
        {@render children?.()}
    </a>
{/if}
