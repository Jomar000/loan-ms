<script lang="ts">
    import * as Tooltip from '@loanms/ui/components/tooltip'
    import { QueryClient, QueryClientProvider } from '@tanstack/svelte-query'
    import type { Snippet } from 'svelte'

    ////////////////////
    // 01. Properties //
    ////////////////////

    let {
        children,
        client,
    }: {
        children: Snippet
        client?: QueryClient
    } = $props()

    /////////////////
    // 04. Derived //
    /////////////////

    const queryClient = $derived(
        client ??
            new QueryClient({
                defaultOptions: {
                    mutations: { retry: false },
                    queries: { retry: false },
                },
            }),
    )
</script>

<QueryClientProvider client={queryClient}>
    <Tooltip.Provider>
        {@render children()}
    </Tooltip.Provider>
</QueryClientProvider>
