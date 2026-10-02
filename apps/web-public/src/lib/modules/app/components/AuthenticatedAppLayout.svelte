<script lang="ts">
    import type { Snippet } from 'svelte'

    import { useSessionContext } from '$lib/states/session'

    ////////////////////
    // 01. Properties //
    ////////////////////

    let { children } = $props<{ children: Snippet }>()

    ///////////////////
    // 02. Constants //
    ///////////////////

    const session = useSessionContext()
</script>

{#if session.isValid()}
    {@render children()}
{/if}
