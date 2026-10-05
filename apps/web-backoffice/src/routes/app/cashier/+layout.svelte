<script lang="ts">
    import AppRoleShell from '$lib/modules/app/components/AppRoleShell.svelte'

    let { children } = $props()
</script>

<AppRoleShell
    role="cashier"
    {children}
/>
