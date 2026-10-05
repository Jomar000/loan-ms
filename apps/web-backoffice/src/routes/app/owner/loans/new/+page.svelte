<script lang="ts">
    import { page } from '$app/state'
    import LoanOriginationPage from '$lib/modules/loan/components/LoanOriginationPage.svelte'
</script>

<LoanOriginationPage
    borrowerPublicId={page.url.searchParams.get('borrowerPublicId') ?? ''}
    role="owner"
/>
