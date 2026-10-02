<!-- @component
Chart.js canvas chart for every built-in chart type.

Pass a typed Chart.js configuration and an accessible label. The chart is
created in the browser only. Replace the `config` object to update it;
mutating a configuration already passed in is not observed, so hold it in
`$state.raw`. The chart is recreated when `config.type` or the `plugins` list
changes, because Chart.js cannot swap either in place, and destroyed on unmount.

Series, text, and grid colors come from the shared chart tokens for datasets
and options that do not set them, and follow root theme changes. A configured
title uses the foreground token and a configured subtitle the text color. They are set
on each chart's own configuration, so charts under different themes do not
affect one another. The tooltip is semantic HTML built from the Chart.js
tooltip model, so tooltip callbacks apply. Set `options.plugins.tooltip.external`
to replace it; the canvas tooltip is then disabled unless `enabled` is set.
Set `options.plugins.tooltip.enabled` to use Chart.js's own tooltip rendering.

The chart fills its container, which defaults to a 16:9 box; size it with
`class`. Unless set, `maintainAspectRatio` defaults to `false`.
-->
<script
    lang="ts"
    generics="TType extends ChartType = ChartType, TData = DefaultDataPoint<TType>, TLabel = unknown"
>
    import {
        Chart as ChartJs,
        type ChartConfiguration,
        type ChartType,
        type DefaultDataPoint,
    } from 'chart.js/auto'
    import { untrack } from 'svelte'

    import { cn } from '$lib/utils.js'

    import type { ChartProps } from './chartProps.js'
    import {
        applyDatasetColors,
        applyScaleColors,
        applyTitleColors,
        observeRootTheme,
        resolveChartPalette,
        type ChartPalette,
    } from './chartTheme.js'
    import {
        applyHtmlTooltip,
        createTooltipView,
        usesHtmlTooltip,
        type ChartTooltipHandler,
        type ChartTooltipView,
    } from './chartTooltip.js'

    type Config = ChartConfiguration<TType, TData, TLabel>

    let {
        config,
        label,
        description,
        class: className,
    }: ChartProps<TType, TData, TLabel> = $props()

    const uid = $props.id()
    const descriptionId = `${uid}-description`

    let themeRevision = $state(0)
    let tooltip = $state.raw<ChartTooltipView | null>(null)

    const tooltipOffset = 8
    const tooltipTranslateX = {
        left: `${tooltipOffset}px`,
        center: '-50%',
        right: `calc(-100% - ${tooltipOffset}px)`,
    }
    const tooltipTranslateY = {
        top: `${tooltipOffset}px`,
        center: '-50%',
        bottom: `calc(-100% - ${tooltipOffset}px)`,
    }
    const tooltipTransform = $derived(
        tooltip
            ? `translate(${tooltipTranslateX[tooltip.xAlign]}, ${tooltipTranslateY[tooltip.yAlign]})`
            : undefined,
    )

    function attachChart(element: HTMLCanvasElement) {
        let chart: ChartJs<TType, TData, TLabel> | undefined
        let applied: Config | undefined
        let appliedSource: Config | undefined

        const stopObservingTheme = observeRootTheme(() => (themeRevision += 1))

        $effect(() => {
            void themeRevision
            const source = config
            const palette = resolveChartPalette(element)
            const next = createConfig(source, palette)

            untrack(() => {
                if (!usesHtmlTooltip(next, handleTooltip)) tooltip = null

                if (chart && applied && canUpdate(applied, next)) {
                    chart.data = next.data
                    chart.options = next.options!
                    chart.update(source === appliedSource ? 'none' : undefined)
                } else {
                    chart?.destroy()
                    tooltip = null
                    chart = new ChartJs(element, next)
                }
                applied = next
                appliedSource = source
            })
        })

        return () => {
            stopObservingTheme()
            chart?.destroy()
        }
    }

    const handleTooltip: ChartTooltipHandler = ({ tooltip: model }) => {
        tooltip = createTooltipView(model)
    }

    function createConfig(source: Config, palette: ChartPalette): Config {
        const themed = applyTitleColors(
            applyScaleColors(applyDatasetColors(source, palette), palette),
            palette,
        )
        const withTooltip = applyHtmlTooltip(themed, handleTooltip)

        return {
            ...withTooltip,
            options: {
                maintainAspectRatio: false,
                ...withTooltip.options,
            } as Config['options'],
        }
    }

    function canUpdate(current: Config, next: Config) {
        const currentPlugins = current.plugins ?? []
        const nextPlugins = next.plugins ?? []

        return (
            current.type === next.type &&
            currentPlugins.length === nextPlugins.length &&
            currentPlugins.every(
                (plugin, index) => plugin === nextPlugins[index],
            )
        )
    }
</script>

<div
    class={cn('relative aspect-video w-full', className)}
    data-slot="chart"
>
    <div
        class="absolute inset-0"
        data-slot="chart-canvas-container"
        role="img"
        aria-label={label}
        aria-describedby={description ? descriptionId : undefined}
    >
        <canvas {@attach attachChart}></canvas>
    </div>
    {#if description}
        <p
            id={descriptionId}
            class="sr-only"
        >
            {description}
        </p>
    {/if}
    {#if tooltip}
        <div
            role="tooltip"
            data-slot="chart-tooltip"
            class="pointer-events-none absolute z-10 grid w-max max-w-64 gap-1.5 rounded-lg border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-md"
            style:left="{tooltip.x}px"
            style:top="{tooltip.y}px"
            style:transform={tooltipTransform}
        >
            {#each tooltip.title as line, index (index)}
                <p class="font-medium">{line}</p>
            {/each}
            {#each tooltip.beforeBody as line, index (index)}
                <p>{line}</p>
            {/each}
            <ul class="grid gap-1.5">
                {#each tooltip.items as item, index (index)}
                    <li class="flex items-start gap-2">
                        {#if item.backgroundColor || item.borderColor}
                            <span
                                aria-hidden="true"
                                class="mt-0.5 size-2.5 shrink-0 rounded-[2px] border"
                                style:background-color={item.backgroundColor}
                                style:border-color={item.borderColor}
                            ></span>
                        {/if}
                        <span class="grid">
                            {#each item.lines as line, lineIndex (lineIndex)}
                                <span>{line}</span>
                            {/each}
                        </span>
                    </li>
                {/each}
            </ul>
            {#each tooltip.afterBody as line, index (index)}
                <p>{line}</p>
            {/each}
            {#each tooltip.footer as line, index (index)}
                <p class="text-muted-foreground">{line}</p>
            {/each}
        </div>
    {/if}
</div>
