<script lang="ts">
    import StatusBadge from '$lib/components/dataWorkspace/StatusBadge.svelte'

    import type { LoanStatus } from '../types'

    ////////////////////
    // 01. Properties //
    ////////////////////

    let { status }: { status: LoanStatus } = $props()

    /////////////////
    // 04. Derived //
    /////////////////

    const label = $derived(status.replaceAll('_', ' '))
</script>

<StatusBadge
    {status}
    {label}
/>
