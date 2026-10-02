<script lang="ts">
    import type { Snippet } from 'svelte'

    import * as Sheet from '$lib/overrides/sheet/index.js'
    import { cn } from '$lib/utils.js'

    type DrawerSize = 'standard' | 'workspace'

    /** Properties for the standard record detail/edit side-panel shell. */
    interface Props {
        /** Bindable drawer visibility. */
        open: boolean
        title: string
        description?: string
        /** Optional fixed actions rendered beside the header text. */
        headerActions?: Snippet
        /** Optional fixed action/footer content. */
        actions?: Snippet
        /** Scrollable drawer body content. */
        children: Snippet
        /** Prevents dismissal and exposes a busy state while work is in progress. */
        locked?: boolean
        /** Runs after an allowed visibility change. */
        onOpenChange?: (open: boolean) => void
        /** Runs after the drawer panel finishes its opening animation. */
        onEntered?: () => void
        /** Standard record panel or wide summary-and-tabs workspace layout. */
        size?: DrawerSize
    }

    let {
        open = $bindable(false),
        title,
        description,
        headerActions,
        actions,
        children,
        locked = false,
        onOpenChange,
        onEntered,
        size = 'standard',
    }: Props = $props()

    const sizeClasses: Record<DrawerSize, string> = {
        standard: 'data-[side=right]:w-full data-[side=right]:sm:max-w-md',
        workspace:
            'data-[side=right]:w-full data-[side=right]:sm:w-[94vw] data-[side=right]:sm:max-w-7xl',
    }

    const bodyClasses: Record<DrawerSize, string> = {
        standard: 'overflow-y-auto p-6',
        workspace: 'flex overflow-hidden p-0',
    }

    function handleOpenChange(nextOpen: boolean) {
        if (locked && !nextOpen) return

        open = nextOpen
        onOpenChange?.(nextOpen)
    }

    function handleAnimationEnd(event: AnimationEvent) {
        if (event.currentTarget !== event.target) return
        if (!open || !event.animationName.includes('enter')) return
        onEntered?.()
    }
</script>

<!--
@component
Use `DrawerShell` for record profile, detail, and edit side panels. Import it
from `@loanms/ui/shared/drawer-shell`.

Bind `open`, render the body as the default snippet, and optionally provide
`headerActions` beside the truncating header text or `actions` for the fixed
footer. Use `size="standard"` for a focused record panel with shell-owned body
padding and scrolling. Use `size="workspace"` with `DrawerWorkspace` for a wide
summary-and-related-lists layout whose body delegates layout and scrolling to
the workspace. `locked` prevents escape-key, outside-click, and close-button
dismissal while marking the sheet busy. The shell supplies the accessible title
and optional description.
Use `onEntered` to defer expensive or visually disruptive work until the Vega
panel entrance animation has completed.

```svelte
<script lang="ts">
    import { DrawerShell } from '@loanms/ui/shared/drawer-shell'

    let open = $state(false)
</script>

<DrawerShell bind:open title="Account details">
    <AccountDetails />
    {#snippet headerActions()}<AccountHeaderActions />{/snippet}
    {#snippet actions()}<DrawerActions />{/snippet}
</DrawerShell>
```

Use raw `Sheet` only for panels whose layout genuinely falls outside this
contract.
-->

<Sheet.Root bind:open={() => open, handleOpenChange}>
    <Sheet.Content
        aria-busy={locked}
        class={cn('gap-0 overflow-hidden p-0', sizeClasses[size])}
        data-locked={locked}
        data-size={size}
        data-slot="drawer-shell"
        escapeKeydownBehavior={locked ? 'ignore' : 'close'}
        interactOutsideBehavior={locked ? 'ignore' : 'close'}
        onanimationend={handleAnimationEnd}
        side="right"
        showCloseButton={!locked}
    >
        <Sheet.Header
            class="shrink-0 border-b px-6 py-4 pr-14"
            data-slot="drawer-shell-header"
        >
            <div class="flex min-w-0 items-start gap-4">
                <div class="min-w-0 flex-1">
                    <Sheet.Title class="block truncate">{title}</Sheet.Title>
                    {#if description}
                        <Sheet.Description class="block truncate">
                            {description}
                        </Sheet.Description>
                    {/if}
                </div>
                {#if headerActions}
                    <div
                        class="shrink-0"
                        data-slot="drawer-shell-header-actions"
                    >
                        {@render headerActions()}
                    </div>
                {/if}
            </div>
        </Sheet.Header>
        <div
            class={cn('min-h-0 flex-1', bodyClasses[size])}
            data-slot="drawer-shell-body"
        >
            {@render children()}
        </div>
        {#if actions}
            <Sheet.Footer
                class="shrink-0 border-t p-6"
                data-slot="drawer-shell-actions"
            >
                {@render actions()}
            </Sheet.Footer>
        {/if}
    </Sheet.Content>
</Sheet.Root>
