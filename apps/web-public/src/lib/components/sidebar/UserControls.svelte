<script lang="ts">
    import * as Avatar from '@hyperion/ui/components/avatar'
    import { Button } from '@hyperion/ui/components/button'
    import * as DropdownMenu from '@hyperion/ui/components/dropdown-menu'
    import { cn } from '@hyperion/ui/utils'
    import LogOutIcon from '@lucide/svelte/icons/log-out'
    import SettingsIcon from '@lucide/svelte/icons/settings'
    import UserIcon from '@lucide/svelte/icons/user'
    import {
        type SessionState,
        useSessionActionsContext,
    } from '$lib/states/session/context.svelte'
    import NotificationButton from './NotificationButton.svelte'
    import ThemeToggle from './ThemeToggle.svelte'

    ////////////////////
    // 01. Properties //
    ////////////////////

    let {
        class: className,
        role,
        session,
        variant = 'desktop',
    }: {
        class?: string
        role: string
        session: SessionState
        variant?: 'desktop' | 'mobile'
    } = $props()

    ///////////////////
    // 02. Constants //
    ///////////////////

    const { signOut } = useSessionActionsContext()

    ///////////////
    // 03. State //
    ///////////////

    let isSigningOut = $state(false)

    /////////////////
    // 04. Derived //
    /////////////////

    const initials = $derived(getInitials(session.data.name))
    const roleLabel = $derived(role.charAt(0).toUpperCase() + role.slice(1))

    //////////////////
    // 09. Handlers //
    //////////////////

    async function handleSignOut() {
        if (isSigningOut) return

        isSigningOut = true
        try {
            await signOut()
        } finally {
            isSigningOut = false
        }
    }

    /////////////////
    // 10. Helpers //
    /////////////////

    function getInitials(name: string) {
        return name
            .split(/\s+/)
            .filter(Boolean)
            .slice(0, 2)
            .map((part) => part.charAt(0).toUpperCase())
            .join('')
    }
</script>

{#if variant === 'mobile'}
    <div class={cn('p-2', className)}>
        <div class="grid grid-cols-2 gap-1">
            <ThemeToggle
                class="h-9 w-full rounded-md text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
                tooltipSide="top"
            />

            <DropdownMenu.Root>
                <DropdownMenu.Trigger>
                    {#snippet child({ props })}
                        <Button
                            {...props}
                            aria-label="User menu"
                            class="h-9 w-full rounded-md text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
                            size="icon"
                            variant="ghost"
                        >
                            <UserIcon data-icon="inline-start" />
                        </Button>
                    {/snippet}
                </DropdownMenu.Trigger>
                <DropdownMenu.Content
                    align="end"
                    class="w-56"
                    side="top"
                    sideOffset={8}
                >
                    <DropdownMenu.Label class="flex flex-col">
                        <span class="truncate font-medium">
                            {session.data.name}
                        </span>
                        {#if session.data.organizationName}
                            <span
                                class="truncate text-xs font-normal text-primary/80"
                            >
                                {session.data.organizationName}
                            </span>
                        {/if}
                        <span
                            class="truncate text-xs font-normal text-muted-foreground"
                        >
                            {roleLabel} - {session.data.email}
                        </span>
                    </DropdownMenu.Label>
                    <DropdownMenu.Separator />
                    <DropdownMenu.Item disabled>
                        <UserIcon /> Profile
                    </DropdownMenu.Item>
                    <DropdownMenu.Item disabled>
                        <SettingsIcon /> Settings
                    </DropdownMenu.Item>
                    <DropdownMenu.Separator />
                    <DropdownMenu.Item
                        class="text-destructive"
                        disabled={isSigningOut}
                        onclick={handleSignOut}
                    >
                        <LogOutIcon /> Sign out
                    </DropdownMenu.Item>
                </DropdownMenu.Content>
            </DropdownMenu.Root>
        </div>
    </div>
{:else}
    <div class={cn('flex shrink-0 items-center gap-1', className)}>
        <ThemeToggle />
        <NotificationButton />

        <DropdownMenu.Root>
            <DropdownMenu.Trigger>
                {#snippet child({ props })}
                    <Button
                        {...props}
                        aria-label="User menu"
                        class="h-8 gap-2 px-2"
                        variant="ghost"
                    >
                        <Avatar.Root class="size-7">
                            <Avatar.Image
                                alt={session.data.name}
                                src={session.data.avatar}
                            />
                            <Avatar.Fallback
                                class="bg-primary text-[11px] font-semibold text-primary-foreground"
                            >
                                {initials || 'HY'}
                            </Avatar.Fallback>
                        </Avatar.Root>
                        <span
                            class="hidden max-w-40 truncate text-sm font-medium sm:block"
                        >
                            {session.data.name}
                        </span>
                    </Button>
                {/snippet}
            </DropdownMenu.Trigger>
            <DropdownMenu.Content
                align="end"
                class="w-56"
            >
                <DropdownMenu.Label class="flex flex-col">
                    <span class="truncate font-medium">
                        {session.data.name}
                    </span>
                    {#if session.data.organizationName}
                        <span
                            class="truncate text-xs font-normal text-primary/80"
                        >
                            {session.data.organizationName}
                        </span>
                    {/if}
                    <span
                        class="truncate text-xs font-normal text-muted-foreground"
                    >
                        {roleLabel} - {session.data.email}
                    </span>
                </DropdownMenu.Label>
                <DropdownMenu.Separator />
                <DropdownMenu.Item disabled>
                    <UserIcon /> Profile
                </DropdownMenu.Item>
                <DropdownMenu.Item disabled>
                    <SettingsIcon /> Settings
                </DropdownMenu.Item>
                <DropdownMenu.Separator />
                <DropdownMenu.Item
                    class="text-destructive"
                    disabled={isSigningOut}
                    onclick={handleSignOut}
                >
                    <LogOutIcon /> Sign out
                </DropdownMenu.Item>
            </DropdownMenu.Content>
        </DropdownMenu.Root>
    </div>
{/if}
