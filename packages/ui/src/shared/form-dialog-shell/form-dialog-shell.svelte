<script lang="ts">
    import { onDestroy, type Snippet } from 'svelte'

    import * as Dialog from '$lib/components/dialog/index.js'
    import { cn } from '$lib/utils.js'

    const FOCUSABLE_SELECTOR = [
        'a[href]',
        'area[href]',
        'button:not([disabled])',
        'input:not([disabled]):not([type="hidden"])',
        'select:not([disabled])',
        'textarea:not([disabled])',
        '[contenteditable="true"]',
        '[tabindex]:not([tabindex="-1"])',
    ].join(',')

    type DialogSize = 'sm' | 'md' | 'lg' | 'xl'

    /** Properties for the standard create/edit form dialog shell. */
    interface Props {
        /** Bindable dialog visibility. */
        open: boolean
        title: string
        description?: string
        /** Scrollable form-body content. */
        children: Snippet
        /** Optional fixed footer, usually containing form actions. */
        footer?: Snippet
        /** Prevents dismissal and exposes a busy state while work is in progress. */
        locked?: boolean
        /** Resolves the preferred focus target after dialog content mounts. */
        initialFocus?: () => HTMLElement | null
        /** Runs after an allowed visibility change. */
        onOpenChange?: (open: boolean) => void
        /** Responsive maximum width used above the full-screen mobile layout. */
        size?: DialogSize
    }

    let dialogContent = $state<HTMLElement | null>(null)
    let initialFocusFrame: number | undefined

    let {
        open = $bindable(false),
        title,
        description,
        children,
        footer,
        locked = false,
        initialFocus,
        onOpenChange,
        size = 'md',
    }: Props = $props()

    const sizeClasses: Record<DialogSize, string> = {
        sm: 'sm:max-w-sm',
        md: 'sm:max-w-md',
        lg: 'sm:max-w-lg',
        xl: 'sm:max-w-xl',
    }

    function handleOpenChange(nextOpen: boolean) {
        if (locked && !nextOpen) return
        if (!nextOpen) cancelInitialFocus()

        open = nextOpen
        onOpenChange?.(nextOpen)
    }

    function handleOpenAutoFocus(event: Event) {
        if (!initialFocus) return

        event.preventDefault()
        cancelInitialFocus()
        initialFocusFrame = requestAnimationFrame(() => {
            initialFocusFrame = undefined
            if (!open || !dialogContent?.isConnected) return

            let target: HTMLElement | null = null
            try {
                target = initialFocus()
            } catch {
                // Fall through to the dialog's default focus target.
            }

            if (focusElement(target)) return
            if (focusElement(getDefaultFocusTarget())) return
            dialogContent.focus()
        })
    }

    function cancelInitialFocus() {
        if (initialFocusFrame === undefined) return
        cancelAnimationFrame(initialFocusFrame)
        initialFocusFrame = undefined
    }

    function focusElement(target: HTMLElement | null) {
        if (!target?.isConnected || !dialogContent?.contains(target))
            return false

        try {
            target.focus()
        } catch {
            return false
        }

        return document.activeElement === target
    }

    function getDefaultFocusTarget() {
        if (!dialogContent) return null

        return (
            Array.from(
                dialogContent.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
            ).find((candidate) => {
                if (candidate.tabIndex < 0 || candidate.closest('[inert]'))
                    return false
                const style = getComputedStyle(candidate)
                return (
                    style.display !== 'none' &&
                    style.visibility !== 'hidden' &&
                    candidate.getClientRects().length > 0
                )
            }) ?? null
        )
    }

    onDestroy(cancelInitialFocus)
</script>

<!--
@component
Use `FormDialogShell` for create and edit workflows that need a fixed header and
optional footer around a scrollable form body. Import it from
`@hyperion/ui/shared/form-dialog-shell`.

Bind `open`, render the form as the default snippet, and optionally provide a
`footer` snippet. `locked` prevents escape-key, outside-click, and close-button
dismissal while marking the dialog busy. `size` controls the responsive maximum
width (`sm`, `md`, `lg`, or `xl`); mobile remains full-screen. Footer actions
stack at full width on mobile and return to auto-width horizontal actions from
`sm` upward. The shell supplies the accessible dialog title and optional
description. `initialFocus` resolves a connected, focusable element after the
dialog content mounts. Returning `null`, throwing, or resolving an element that
cannot be focused preserves the Dialog primitive's first-focusable fallback.

```svelte
<script lang="ts">
    import { FormDialogShell } from '@hyperion/ui/shared/form-dialog-shell'

    let open = $state(false)
    let primaryInput = $state<HTMLInputElement | null>(null)
</script>

<FormDialogShell bind:open initialFocus={() => primaryInput} title="Edit account">
    <input bind:this={primaryInput} />
    {#snippet footer()}<FormActions />{/snippet}
</FormDialogShell>
```

Use `AlertDialog` for destructive confirmation. Use the raw `Dialog` primitive
only for simple non-form content that does not need this shell contract.
-->

<Dialog.Root bind:open={() => open, handleOpenChange}>
    <Dialog.Content
        bind:ref={dialogContent}
        aria-busy={locked}
        class={cn(
            'flex size-full max-w-none flex-col gap-0 overflow-hidden rounded-none p-0 sm:h-auto sm:max-h-[calc(100svh-2rem)] sm:rounded-xl',
            sizeClasses[size],
        )}
        data-locked={locked}
        data-size={size}
        data-slot="form-dialog-shell"
        escapeKeydownBehavior={locked ? 'ignore' : 'close'}
        interactOutsideBehavior={locked ? 'ignore' : 'close'}
        onOpenAutoFocus={handleOpenAutoFocus}
        showCloseButton={!locked}
    >
        <Dialog.Header
            class="shrink-0 border-b px-6 py-4 pr-14"
            data-slot="form-dialog-shell-header"
        >
            <Dialog.Title>{title}</Dialog.Title>
            {#if description}
                <Dialog.Description>{description}</Dialog.Description>
            {/if}
        </Dialog.Header>
        <div
            class="min-h-0 flex-1 overflow-y-auto p-6"
            data-slot="form-dialog-shell-body"
        >
            {@render children()}
        </div>
        {#if footer}
            <Dialog.Footer
                class="shrink-0 flex-col border-t p-6 *:data-[slot=button]:w-full sm:flex-row sm:*:data-[slot=button]:w-auto"
                data-slot="form-dialog-shell-footer"
            >
                {@render footer()}
            </Dialog.Footer>
        {/if}
    </Dialog.Content>
</Dialog.Root>
