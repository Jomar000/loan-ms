<script lang="ts">
    import AdminLayout from '$lib/modules/admin/components/AdminLayout.svelte'

    let { children } = $props()
</script>

<AdminLayout {children} />
