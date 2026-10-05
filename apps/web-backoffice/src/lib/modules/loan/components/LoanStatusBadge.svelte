<script lang="ts">
    import { Badge } from '@loanms/ui/components/badge'

    import type { LoanStatus } from '../types'

    ////////////////////
    // 01. Properties //
    ////////////////////

    let { status }: { status: LoanStatus } = $props()

    /////////////////
    // 04. Derived //
    /////////////////

    const label = $derived(status.replaceAll('_', ' '))
    const variant = $derived(
        status === 'CANCELLED' || status === 'WRITTEN_OFF'
            ? 'destructive'
            : status === 'ACTIVE' || status === 'APPROVED'
              ? 'default'
              : 'secondary',
    )
</script>

<Badge {variant}>{label}</Badge>
