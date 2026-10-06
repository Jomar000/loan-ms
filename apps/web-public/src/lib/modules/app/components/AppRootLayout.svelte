<script lang="ts">
    import { Toaster as Sonner } from '@loanms/ui/components/sonner'
    import {
        createQuery,
        QueryClient,
        QueryClientProvider,
    } from '@tanstack/svelte-query'
    import { ModeWatcher } from 'mode-watcher'

    import { PUBLIC_NAME } from '$env/static/public'
    import { heartbeatClient } from '$lib/clients'
    import { SessionProvider } from '$lib/states/session'
    import AppNavigationGuard from './AppNavigationGuard.svelte'

    ////////////////////
    // 01. Properties //
    ////////////////////

    let { children } = $props()

    ///////////////////
    // 02. Constants //
    ///////////////////

    const queryClient = new QueryClient({
        defaultOptions: {
            queries: {
                retry: false,
                staleTime: 1000 * 60 * 5, // 5 minutes
            },
        },
    })

    /** Keeps Sonner clickable above open sheet overlays. */
    const sonnerRootClass = 'toaster group pointer-events-auto'

    /////////////////
    // 05. Queries //
    /////////////////

    // Checks liveness and sets the environment-scoped CSRF cookie in one request.
    const heartbeatQuery = createQuery(
        () => ({
            queryKey: [
                'heartbeat',
            ],
            gcTime: Infinity,
            queryFn: async () => {
                const response = await heartbeatClient.index.$get()
                if (!response.ok) throw new Error('API unavailable.')
                return response
            },
            refetchOnMount: false,
            refetchOnReconnect: false,
            refetchOnWindowFocus: false,
            staleTime: Infinity,
        }),
        () => queryClient,
    )
</script>

<svelte:head>
    <title>{PUBLIC_NAME}</title>
</svelte:head>

<ModeWatcher defaultMode="dark" />

<div class="size-full bg-zinc-50/80 dark:bg-[#171717]">
    <QueryClientProvider client={queryClient}>
        <SessionProvider>
            <AppNavigationGuard
                heartbeatFailed={heartbeatQuery.isError}
                heartbeatReady={heartbeatQuery.isSuccess}
            >
                <Sonner
                    class={sonnerRootClass}
                    closeButton={true}
                    pauseWhenPageIsHidden={true}
                    position="top-center"
                />
                {@render children()}
            </AppNavigationGuard>
        </SessionProvider>
    </QueryClientProvider>
</div>
