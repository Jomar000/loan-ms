import type { ChartConfiguration, ChartType, DefaultDataPoint } from 'chart.js'

/** Properties for the Chart.js canvas chart. */
export interface ChartProps<
    TType extends ChartType = ChartType,
    TData = DefaultDataPoint<TType>,
    TLabel = unknown,
> {
    /** Chart.js configuration. Replace the object to update the chart. */
    config: ChartConfiguration<TType, TData, TLabel>
    /** Accessible name announced for the chart. */
    label: string
    /** Longer summary of what the chart shows, announced after the label. */
    description?: string
    /** Additional classes forwarded to the responsive container */
    class?: string
}
