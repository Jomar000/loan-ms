<script lang="ts">
    // Keep the compile constant local; an accessor is folded too late for Vite to prune this import.
    const servicePrincipalManagementPage = __FEATURE_API_KEY__
        ? import('$lib/modules/apiKey/components/ServicePrincipalManagementPage.svelte')
        : undefined
</script>

{#if servicePrincipalManagementPage}
    {#await servicePrincipalManagementPage then { default: ServicePrincipalManagementPage }}
        <ServicePrincipalManagementPage />
    {/await}
{/if}
