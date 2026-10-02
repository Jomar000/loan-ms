<script lang="ts">
    import * as Tooltip from '@hyperion/ui/components/tooltip'
    import { InAppBrowserNotice } from '@hyperion/ui/shared/in-app-browser-notice'

    import { inAppBrowserDetectionFeatureEnabled } from '$lib/config/inAppBrowserDetection'
    import AppRootLayout from '$lib/modules/app/components/AppRootLayout.svelte'
    import '../app.css'

    let { children } = $props()

    const isStagingBuild = import.meta.env.MODE === 'staging'
</script>

{#if isStagingBuild}
    <div
        aria-hidden="true"
        class="pointer-events-none fixed inset-0 z-2147483647 border-4 border-environment-staging"
    ></div>
{/if}

{#if inAppBrowserDetectionFeatureEnabled}
    <InAppBrowserNotice />
{/if}

<Tooltip.Provider>
    <AppRootLayout {children} />
</Tooltip.Provider>
