<script lang="ts">
    import AppWindowIcon from '@lucide/svelte/icons/app-window'
    import CheckIcon from '@lucide/svelte/icons/check'
    import ClipboardIcon from '@lucide/svelte/icons/clipboard'
    import ExternalLinkIcon from '@lucide/svelte/icons/external-link'
    import XIcon from '@lucide/svelte/icons/x'
    import { onMount } from 'svelte'

    import * as Alert from '$lib/components/alert'
    import { Button } from '$lib/components/button'

    import {
        detectInAppBrowser,
        dismissInAppBrowserNotice,
        isInAppBrowserNoticeDismissed,
        type InAppBrowserEnvironment,
    } from './browser'

    ///////////////////
    // 02. Constants //
    ///////////////////

    type CopyStatus = 'idle' | 'success' | 'error'

    ///////////////
    // 03. State //
    ///////////////

    let environment = $state<InAppBrowserEnvironment | null>(null)
    let copyStatus = $state<CopyStatus>('idle')

    /////////////////
    // 08. Effects //
    /////////////////

    onMount(() => {
        if (isInAppBrowserNoticeDismissed()) {
            return
        }

        environment = detectInAppBrowser(
            navigator.userAgent,
            window.location.href,
        )
    })

    //////////////////
    // 09. Handlers //
    //////////////////

    function dismiss(): void {
        dismissInAppBrowserNotice()
        environment = null
    }

    async function copyCurrentLink(): Promise<void> {
        try {
            await navigator.clipboard.writeText(window.location.href)
            copyStatus = 'success'
        } catch {
            copyStatus = 'error'
        }
    }
</script>

{#if environment}
    <!-- z-40 keeps the notice above page content and below z-50 dialogs and overlays. -->
    <div
        class="fixed inset-x-0 top-0 z-40 p-2 pt-[max(0.5rem,env(safe-area-inset-top))]"
    >
        <div
            class="mx-auto max-w-2xl rounded-lg shadow-2xl ring-1 ring-ring/40 motion-safe:animate-in motion-safe:duration-300 motion-safe:fade-in-0 motion-safe:slide-in-from-top-2"
            style:--muted-foreground="var(--foreground)"
        >
            <Alert.Root class="overflow-hidden border-border pt-4">
                <span
                    aria-hidden="true"
                    class="absolute inset-x-0 top-0 h-1 bg-primary"
                ></span>
                <div class="flex items-center gap-2 pr-10 text-base">
                    <AppWindowIcon class="text-primary" />
                    <Alert.Title>For the best experience</Alert.Title>
                </div>
                <Alert.Description class="w-full max-w-none text-wrap">
                    {#if environment.appName}
                        Some features may not work correctly in
                        {environment.appName}.
                    {:else}
                        Some features may not work correctly in this in-app
                        browser.
                    {/if}
                    {#if environment.intentHref}
                        Continue in your default browser for full support.
                    {:else}
                        Use the app menu and choose Open in browser. If that
                        option isn’t available, copy this link and paste it into
                        Safari or Chrome.
                    {/if}
                </Alert.Description>

                <div
                    class="mt-3 flex flex-col items-center justify-center gap-2 sm:flex-row"
                >
                    {#if environment.intentHref}
                        <Button
                            class="w-full sm:w-auto"
                            href={environment.intentHref}
                            size="sm"
                        >
                            <ExternalLinkIcon data-icon="inline-start" />
                            Open in browser
                        </Button>
                    {:else}
                        <Button
                            class="w-full sm:w-auto"
                            onclick={copyCurrentLink}
                            size="sm"
                        >
                            {#if copyStatus === 'success'}
                                <CheckIcon data-icon="inline-start" />
                                Link copied
                            {:else}
                                <ClipboardIcon data-icon="inline-start" />
                                Copy link
                            {/if}
                        </Button>

                        <span
                            aria-live="polite"
                            class="text-xs"
                        >
                            {#if copyStatus === 'success'}
                                Link copied. Paste it into Safari or Chrome.
                            {:else if copyStatus === 'error'}
                                Could not copy the link. Use your app menu
                                instead.
                            {/if}
                        </span>
                    {/if}
                </div>

                <Button
                    aria-label="Dismiss browser recommendation"
                    class="absolute top-2.5 right-3"
                    onclick={dismiss}
                    size="icon-sm"
                    variant="ghost"
                >
                    <XIcon />
                </Button>
            </Alert.Root>
        </div>
    </div>
{/if}
