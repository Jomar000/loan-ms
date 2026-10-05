<script lang="ts">
    import { page } from '$app/state'
    import LoanDetailPage from '$lib/modules/loan/components/LoanDetailPage.svelte'
</script>

<LoanDetailPage
    publicId={page.params.publicId ?? ''}
    role="owner"
/>
