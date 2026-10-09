<script lang="ts">
    import StatusBadge from '$lib/components/dataWorkspace/StatusBadge.svelte'

    import type { BorrowerPaymentTag, BorrowerPaymentTagSource } from '../types'

    ////////////////////
    // 01. Properties //
    ////////////////////

    let {
        source,
        tag,
    }: {
        source?: BorrowerPaymentTagSource
        tag: BorrowerPaymentTag
    } = $props()

    /////////////////
    // 04. Derived //
    /////////////////

    const label = $derived(
        tag === 'GOOD_PAYER'
            ? 'Good Payer'
            : tag === 'BAD_PAYER'
              ? 'Bad Payer'
              : 'Scammer',
    )
</script>

<StatusBadge
    status={tag}
    label={`${label}${source === 'MANUAL_OVERRIDE' ? ' · Manual' : ''}`}
/>
