<script lang="ts">
    // Keep the compile constant local; an accessor is folded too late for Vite to prune this import.
    const objectStorageDownloadListPage = __FEATURE_OBJECT_STORAGE__
        ? import('$lib/modules/objectStorage/components/ObjectStorageDownloadListPage.svelte')
        : undefined
</script>

{#if objectStorageDownloadListPage}
    {#await objectStorageDownloadListPage then { default: ObjectStorageDownloadListPage }}
        <ObjectStorageDownloadListPage />
    {/await}
{/if}
