import type {
    ChartConfiguration,
    ChartType,
    Color,
    DefaultDataPoint,
    TooltipModel,
} from 'chart.js'

/** One tooltip body entry, typically one dataset at the hovered index. */
export interface ChartTooltipItem {
    /** Lines produced by the `before`, `label`, and `after` callbacks. */
    lines: string[]
    /** Swatch fill, or `undefined` when colors are hidden or not a string. */
    backgroundColor?: string
    /** Swatch outline, or `undefined` when colors are hidden or not a string. */
    borderColor?: string
}

/** Tooltip content and placement, derived from the Chart.js tooltip model. */
export interface ChartTooltipView {
    title: string[]
    beforeBody: string[]
    items: ChartTooltipItem[]
    afterBody: string[]
    footer: string[]
    /** Caret position in CSS pixels from the canvas origin. */
    x: number
    y: number
    xAlign: TooltipModel<ChartType>['xAlign']
    yAlign: TooltipModel<ChartType>['yAlign']
}

export type ChartTooltipHandler = (context: {
    tooltip: TooltipModel<ChartType>
}) => void

function toCssColor(color: Color | undefined) {
    return typeof color === 'string' ? color : undefined
}

/**
 * Builds the view of a Chart.js tooltip. Chart.js has already run the
 * `title`, `label`, and other callbacks, so their output is shown as is.
 *
 * @returns `null` while the tooltip is hidden.
 */
export function createTooltipView(
    tooltip: TooltipModel<ChartType>,
): ChartTooltipView | null {
    if (tooltip.opacity === 0 || tooltip.body.length === 0) return null

    const showColors = tooltip.options.displayColors !== false

    return {
        title: tooltip.title,
        beforeBody: tooltip.beforeBody,
        items: tooltip.body.map((body, index) => ({
            lines: [
                ...body.before,
                ...body.lines,
                ...body.after,
            ],
            backgroundColor: showColors
                ? toCssColor(tooltip.labelColors[index]?.backgroundColor)
                : undefined,
            borderColor: showColors
                ? toCssColor(tooltip.labelColors[index]?.borderColor)
                : undefined,
        })),
        afterBody: tooltip.afterBody,
        footer: tooltip.footer,
        x: tooltip.caretX,
        y: tooltip.caretY,
        xAlign: tooltip.xAlign,
        yAlign: tooltip.yAlign,
    }
}

/**
 * Routes the tooltip to `handler` instead of drawing it on the canvas.
 *
 * - The configuration is returned unchanged when the caller disabled the
 *   `tooltip` plugin or set `enabled` explicitly, whatever its value.
 * - A caller supplied `external` tooltip replaces `handler`, and the canvas
 *   tooltip is disabled so only the external one shows.
 *
 * Every other tooltip option, including the callbacks, is kept.
 */
export function applyHtmlTooltip<
    TType extends ChartType,
    TData = DefaultDataPoint<TType>,
    TLabel = unknown,
>(
    config: ChartConfiguration<TType, TData, TLabel>,
    handler: ChartTooltipHandler,
): ChartConfiguration<TType, TData, TLabel> {
    const plugins = config.options?.plugins
    const tooltip = plugins?.tooltip

    if ((tooltip as unknown) === false || tooltip?.enabled !== undefined) {
        return config
    }

    return {
        ...config,
        options: {
            ...config.options,
            plugins: {
                ...plugins,
                tooltip: {
                    ...tooltip,
                    enabled: false,
                    external: tooltip?.external ?? handler,
                },
            },
        } as typeof config.options,
    }
}

/** Whether {@link applyHtmlTooltip} left `handler` as the tooltip renderer. */
export function usesHtmlTooltip<
    TType extends ChartType,
    TData = DefaultDataPoint<TType>,
    TLabel = unknown,
>(
    config: ChartConfiguration<TType, TData, TLabel>,
    handler: ChartTooltipHandler,
): boolean {
    return (config.options?.plugins?.tooltip?.external as unknown) === handler
}
