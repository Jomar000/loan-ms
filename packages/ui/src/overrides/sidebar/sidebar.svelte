<script lang="ts">
    import type { HTMLAttributes } from 'svelte/elements'

    import { SIDEBAR_WIDTH_MOBILE } from '../../components/sidebar/constants.js'
    import { useSidebar } from '../../components/sidebar/context.svelte.js'
    import { cn, type WithElementRef } from '../../utils.js'
    import * as Sheet from '../sheet/index.js'

    let {
        ref = $bindable(null),
        side = 'left',
        variant = 'sidebar',
        collapsible = 'offcanvas',
        class: className,
        children,
        ...restProps
    }: WithElementRef<HTMLAttributes<HTMLDivElement>> & {
        side?: 'left' | 'right'
        variant?: 'sidebar' | 'floating' | 'inset'
        collapsible?: 'offcanvas' | 'icon' | 'none'
    } = $props()

    const sidebar = useSidebar()
</script>

<!-- @component
Project-owned replacement for shadcn-svelte Vega's Sidebar.Root.

Upstream target: the `sidebar/sidebar.svelte` registry primitive.
Defect: the generated mobile Sidebar imports the generated Sheet directly, bypassing the qualified Sheet override, so the panel retains selectors that do not match Bits UI's state attributes and its entrance and exit animations do not run.
Composition limitation: the Sheet dependency is internal to Sidebar.Root and cannot be replaced through props or call-site composition.
Intentional divergence: only the internal mobile Sheet import points to `@hyperion/ui/overrides/sheet`; props, snippets, events, context, desktop behavior, layout, styling, and exports otherwise mirror upstream.
Retirement condition: remove this replacement after shadcn-svelte's generated Sheet uses Bits UI-compatible state selectors and the generated Sidebar consumes that corrected Sheet, then migrate consumers back to `@hyperion/ui/components/sidebar`.

Upstream references:
- https://shadcn-svelte.com/docs/components/sidebar
- https://shadcn-svelte.com/registry/styles/vega/sidebar.json
- https://shadcn-svelte.com/registry/styles/vega/sheet.json
- https://www.bits-ui.com/docs/components/dialog
-->

{#if collapsible === 'none'}
    <div
        class={cn(
            'flex h-full w-(--sidebar-width) flex-col bg-sidebar text-sidebar-foreground',
            className,
        )}
        bind:this={ref}
        {...restProps}
    >
        {@render children?.()}
    </div>
{:else if sidebar.isMobile}
    <Sheet.Root
        bind:open={() => sidebar.openMobile, (v) => sidebar.setOpenMobile(v)}
        {...restProps}
    >
        <Sheet.Content
            bind:ref
            data-sidebar="sidebar"
            data-slot="sidebar"
            data-mobile="true"
            class={cn(
                'w-(--sidebar-width) bg-sidebar p-0 text-sidebar-foreground [&>button]:hidden',
                className,
            )}
            style="--sidebar-width: {SIDEBAR_WIDTH_MOBILE};"
            {side}
        >
            <Sheet.Header class="sr-only">
                <Sheet.Title>Sidebar</Sheet.Title>
                <Sheet.Description
                    >Displays the mobile sidebar.</Sheet.Description
                >
            </Sheet.Header>
            <div class="flex size-full flex-col">
                {@render children?.()}
            </div>
        </Sheet.Content>
    </Sheet.Root>
{:else}
    <div
        bind:this={ref}
        class="group peer hidden text-sidebar-foreground md:block"
        data-state={sidebar.state}
        data-collapsible={sidebar.state === 'collapsed' ? collapsible : ''}
        data-variant={variant}
        data-side={side}
        data-slot="sidebar"
    >
        <!-- This is what handles the sidebar gap on desktop -->
        <div
            data-slot="sidebar-gap"
            class={cn(
                'relative w-(--sidebar-width) bg-transparent transition-[width] duration-200 ease-linear',
                'group-data-[collapsible=offcanvas]:w-0',
                'group-data-[side=right]:rotate-180',
                variant === 'floating' || variant === 'inset'
                    ? 'group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)+(--spacing(4)))]'
                    : 'group-data-[collapsible=icon]:w-(--sidebar-width-icon)',
            )}
        ></div>
        <div
            data-slot="sidebar-container"
            data-side={side}
            class={cn(
                'fixed inset-y-0 z-10 hidden h-svh w-(--sidebar-width) transition-[left,right,width] duration-200 ease-linear data-[side=left]:inset-s-0 data-[side=left]:group-data-[collapsible=offcanvas]:-inset-s-(--sidebar-width) data-[side=right]:inset-e-0 data-[side=right]:group-data-[collapsible=offcanvas]:-inset-e-(--sidebar-width) md:flex',
                // Adjust the padding for floating and inset variants.
                variant === 'floating' || variant === 'inset'
                    ? 'p-2 group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)+(--spacing(4))+2px)]'
                    : 'group-data-[collapsible=icon]:w-(--sidebar-width-icon) group-data-[side=left]:border-e group-data-[side=right]:border-s',
                className,
            )}
            {...restProps}
        >
            <div
                data-sidebar="sidebar"
                data-slot="sidebar-inner"
                class="flex size-full flex-col bg-sidebar group-data-[variant=floating]:rounded-lg group-data-[variant=floating]:shadow-sm group-data-[variant=floating]:ring-1 group-data-[variant=floating]:ring-sidebar-border"
            >
                {@render children?.()}
            </div>
        </div>
    </div>
{/if}
