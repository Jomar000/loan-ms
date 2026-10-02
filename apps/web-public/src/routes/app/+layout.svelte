<script lang="ts">
    import AuthenticatedAppLayout from '$lib/modules/app/components/AuthenticatedAppLayout.svelte'

    let { children } = $props()
</script>

<AuthenticatedAppLayout {children} />
