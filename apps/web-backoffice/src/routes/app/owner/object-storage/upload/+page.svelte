<script lang="ts">
    // Keep the compile constant local; an accessor is folded too late for Vite to prune this import.
    const objectStorageUploadPage = __FEATURE_OBJECT_STORAGE__
        ? import('$lib/modules/objectStorage/components/ObjectStorageUploadPage.svelte')
        : undefined
</script>

{#if objectStorageUploadPage}
    {#await objectStorageUploadPage then { default: ObjectStorageUploadPage }}
        <ObjectStorageUploadPage />
    {/await}
{/if}
