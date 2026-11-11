<script lang="ts">
    import type { ComponentProps } from 'svelte'

    import QueryTestProviders from '$lib/components/testing/QueryTestProviders.fixture.svelte'
    import BorrowerUnpaidCollections from './BorrowerUnpaidCollections.svelte'

    ////////////////////
    // 01. Properties //
    ////////////////////

    let props: ComponentProps<typeof BorrowerUnpaidCollections> = $props()
</script>

<QueryTestProviders>
    <BorrowerUnpaidCollections {...props} />
</QueryTestProviders>
