<script lang="ts">
    import MemberLayout from '$lib/modules/member/components/MemberLayout.svelte'

    let { children } = $props()
</script>

<MemberLayout {children} />
