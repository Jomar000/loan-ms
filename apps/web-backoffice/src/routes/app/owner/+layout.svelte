<script lang="ts">
    import OwnerLayout from '$lib/modules/owner/components/OwnerLayout.svelte'

    let { children } = $props()
</script>

<OwnerLayout {children} />
