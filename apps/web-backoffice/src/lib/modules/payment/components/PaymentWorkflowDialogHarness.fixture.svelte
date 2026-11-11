<script lang="ts">
    import type { ComponentProps } from 'svelte'

    import QueryTestProviders from '$lib/components/testing/QueryTestProviders.fixture.svelte'
    import PaymentWorkflowDialog from './PaymentWorkflowDialog.svelte'

    ////////////////////
    // 01. Properties //
    ////////////////////

    let props: ComponentProps<typeof PaymentWorkflowDialog> = $props()
</script>

<QueryTestProviders>
    <PaymentWorkflowDialog {...props} />
</QueryTestProviders>
