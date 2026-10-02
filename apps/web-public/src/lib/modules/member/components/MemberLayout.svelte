<script lang="ts">
    import AppRoleShell from '$lib/modules/app/components/AppRoleShell.svelte'

    ////////////////////
    // 01. Properties //
    ////////////////////

    let { children } = $props()
</script>

<AppRoleShell
    role="member"
    {children}
/>
