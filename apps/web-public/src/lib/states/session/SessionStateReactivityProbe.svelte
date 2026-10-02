<script lang="ts">
    import type { SessionState } from './context.svelte'

    ////////////////////
    // 01. Properties //
    ////////////////////

    let { onExpiresAt, onOrganizationSlug, session } = $props<{
        onExpiresAt: (expiresAt: number) => void
        onOrganizationSlug: (organizationSlug: string) => void
        session: SessionState
    }>()

    /////////////////
    // 08. Effects //
    /////////////////

    $effect(() => {
        onExpiresAt(session.data.expiresAt)
    })

    $effect(() => {
        onOrganizationSlug(session.data.organizationSlug)
    })
</script>
