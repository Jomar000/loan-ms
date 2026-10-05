<script lang="ts">
    import { page } from '$app/state'

    import RenewalOriginationPage from '$lib/modules/renewal/components/RenewalOriginationPage.svelte'
</script>

<RenewalOriginationPage
    previousLoanPublicId={page.url.searchParams.get('previousLoanPublicId') ??
        ''}
    role="owner"
/>
