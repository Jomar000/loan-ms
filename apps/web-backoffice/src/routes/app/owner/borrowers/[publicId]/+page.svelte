<script lang="ts">
    import { page } from '$app/state'
    import BorrowerProfilePage from '$lib/modules/borrower/components/BorrowerProfilePage.svelte'
</script>

<BorrowerProfilePage
    publicId={page.params.publicId ?? ''}
    role="owner"
/>
