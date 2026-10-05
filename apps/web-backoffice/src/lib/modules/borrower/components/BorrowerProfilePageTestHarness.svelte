<script lang="ts">
    import QueryTestProviders from '$lib/components/testing/QueryTestProviders.fixture.svelte'
    import BorrowerProfilePage from './BorrowerProfilePage.svelte'
</script>

<QueryTestProviders>
    <BorrowerProfilePage
        publicId="019936e2-b837-7000-8000-000000000001"
        role="owner"
    />
</QueryTestProviders>
