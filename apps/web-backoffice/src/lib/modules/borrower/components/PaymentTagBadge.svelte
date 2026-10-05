<script lang="ts">
    import { Badge } from '@loanms/ui/components/badge'

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

<Badge variant={tag === 'SCAMMER' ? 'destructive' : 'secondary'}>
    {label}{source === 'MANUAL_OVERRIDE' ? ' · Manual' : ''}
</Badge>
