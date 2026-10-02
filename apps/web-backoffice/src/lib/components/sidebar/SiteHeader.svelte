<script lang="ts">
    import * as Breadcrumb from '@hyperion/ui/components/breadcrumb'

    import type { SessionState } from '$lib/states/session'
    import type { AppRouteMeta } from './types'
    import UserControls from './UserControls.svelte'

    ////////////////////
    // 01. Properties //
    ////////////////////

    let {
        role,
        routeMeta,
        session,
    }: {
        role: string
        routeMeta: AppRouteMeta
        session: SessionState
    } = $props()
</script>

<header
    class="flex h-15 shrink-0 items-center gap-4 border-b border-border bg-background px-4 sm:px-6"
>
    <div class="mr-auto flex min-w-0 flex-col justify-center">
        {#if routeMeta.breadcrumb?.length}
            <Breadcrumb.Root class="mb-0.5">
                <Breadcrumb.List
                    class="gap-1 text-[11px] leading-tight text-muted-foreground sm:gap-1"
                >
                    {#each routeMeta.breadcrumb as crumb, index (crumb)}
                        {#if index > 0}
                            <Breadcrumb.Separator class="opacity-40">
                                /
                            </Breadcrumb.Separator>
                        {/if}
                        <Breadcrumb.Item class="flex items-center gap-1">
                            {#if index === routeMeta.breadcrumb.length - 1}
                                <Breadcrumb.Page
                                    class="font-normal text-muted-foreground"
                                    >{crumb}</Breadcrumb.Page
                                >
                            {:else}
                                <span>{crumb}</span>
                            {/if}
                        </Breadcrumb.Item>
                    {/each}
                </Breadcrumb.List>
            </Breadcrumb.Root>
        {/if}
        <h1
            class="truncate text-[15px] leading-tight font-semibold text-foreground"
        >
            {routeMeta.title}
        </h1>
    </div>

    <UserControls
        {role}
        {session}
    />
</header>
