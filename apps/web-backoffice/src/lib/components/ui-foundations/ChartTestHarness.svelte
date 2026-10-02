<script lang="ts">
    import {
        Chart,
        type ChartConfiguration,
        type ChartType,
    } from '@hyperion/ui/shared/chart'

    ////////////////////
    // 01. Properties //
    ////////////////////

    let {
        config,
        label,
        description,
        class: className,
    }: {
        config: ChartConfiguration<ChartType>
        label: string
        description?: string
        class?: string
    } = $props()
</script>

<Chart
    {config}
    {label}
    {description}
    class={className}
/>
