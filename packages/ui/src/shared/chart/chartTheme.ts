import {
    Chart,
    type ChartConfiguration,
    type ChartDataset,
    type ChartType,
    type DefaultDataPoint,
} from 'chart.js/auto'

/** Red, green, blue, and alpha channels of a resolved color. */
type Rgba = readonly [
    red: number,
    green: number,
    blue: number,
    alpha: number,
]

/** Theme colors resolved from the shared CSS tokens for the canvas renderer. */
export interface ChartPalette {
    /** `--chart-1` through `--chart-5`; empty when the tokens are unavailable. */
    series: readonly Rgba[]
    /** `--muted-foreground`: tick, legend, and subtitle text. */
    text?: Rgba
    /** `--foreground`: chart title text. */
    foreground?: Rgba
    /** `--border`: grid lines and scale borders. */
    grid?: Rgba
    /** `--card`: separator between adjacent arc segments. */
    surface?: Rgba
}

/** The parts of a chart configuration that scale discovery reads. */
interface ScaleSourceOptions {
    indexAxis?: string
    datasets?: Record<string, { indexAxis?: string } | undefined>
    scales?: Record<string, Record<string, unknown> | undefined>
}

interface ScaleSourceDataset {
    type?: string
    indexAxis?: string
    [key: string]: unknown
}

type PlainObject = Record<string, unknown>

const SERIES_TOKENS = [
    '--chart-1',
    '--chart-2',
    '--chart-3',
    '--chart-4',
    '--chart-5',
] as const

const ARC_TYPES: ReadonlySet<ChartType> = new Set([
    'doughnut',
    'pie',
    'polarArea',
])

const SOLID_TYPES: ReadonlySet<ChartType> = new Set(['bar'])

let colorContext: CanvasRenderingContext2D | null | undefined

/**
 * Converts any CSS color the browser understands, including the `oklch()`
 * tokens, to sRGB channels. Chart.js parses only legacy color syntaxes when it
 * derives hover colors, so tokens must be resolved before they reach it.
 */
function resolveColor(value: string): Rgba | undefined {
    if (!value || !CSS.supports('color', value)) return undefined

    if (colorContext === undefined) {
        const canvas = document.createElement('canvas')
        canvas.width = 1
        canvas.height = 1
        colorContext = canvas.getContext('2d', { willReadFrequently: true })
    }
    if (!colorContext) return undefined

    colorContext.clearRect(0, 0, 1, 1)
    colorContext.fillStyle = value
    colorContext.fillRect(0, 0, 1, 1)
    const [
        red,
        green,
        blue,
        alpha,
    ] = colorContext.getImageData(0, 0, 1, 1).data

    return [
        red!,
        green!,
        blue!,
        alpha! / 255,
    ]
}

/** Formats resolved channels as a legacy color string, scaling its alpha. */
export function formatColor(color: Rgba, opacity = 1): string {
    const [
        red,
        green,
        blue,
        alpha,
    ] = color
    const resolved = Math.round(alpha * opacity * 1000) / 1000

    return resolved === 1
        ? `rgb(${red}, ${green}, ${blue})`
        : `rgba(${red}, ${green}, ${blue}, ${resolved})`
}

/** Reads the chart tokens as inherited by `element`, so theme classes apply. */
export function resolveChartPalette(element: Element): ChartPalette {
    const style = getComputedStyle(element)
    const read = (token: string) =>
        resolveColor(style.getPropertyValue(token).trim())

    return {
        series: SERIES_TOKENS.map(read).filter(
            (color): color is Rgba => color !== undefined,
        ),
        text: read('--muted-foreground'),
        foreground: read('--foreground'),
        grid: read('--border'),
        surface: read('--card'),
    }
}

/**
 * Calls `onChange` when the root element's theme attributes change.
 *
 * @returns A function that stops observing.
 */
export function observeRootTheme(onChange: () => void): () => void {
    const observer = new MutationObserver(onChange)
    observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: [
            'class',
            'data-theme',
            'style',
        ],
    })

    return () => observer.disconnect()
}

function getDatasetColors(
    type: ChartType,
    index: number,
    dataset: ChartDataset<ChartType>,
    palette: ChartPalette,
): Record<string, string | string[]> {
    const { series, surface } = palette
    const seriesColor = (position: number) => series[position % series.length]!

    if (ARC_TYPES.has(type)) {
        return {
            backgroundColor: Array.from(
                { length: dataset.data.length },
                (_, position) => formatColor(seriesColor(position)),
            ),
            ...(surface && { borderColor: formatColor(surface) }),
        }
    }

    const color = seriesColor(index)

    return {
        backgroundColor: formatColor(color, SOLID_TYPES.has(type) ? 1 : 0.5),
        borderColor: formatColor(color),
    }
}

/**
 * Returns the configuration with token-derived colors on every dataset that
 * does not set them. Colors the caller configured are left untouched.
 */
export function applyDatasetColors<
    TType extends ChartType,
    TData = DefaultDataPoint<TType>,
    TLabel = unknown,
>(
    config: ChartConfiguration<TType, TData, TLabel>,
    palette: ChartPalette,
): ChartConfiguration<TType, TData, TLabel> {
    if (palette.series.length === 0) return config

    const datasets = config.data.datasets.map((dataset, index) => {
        const defaults = getDatasetColors(
            (dataset.type ?? config.type) as ChartType,
            index,
            dataset as ChartDataset<ChartType>,
            palette,
        )
        const missing = Object.fromEntries(
            Object.entries(defaults).filter(
                ([key]) =>
                    (dataset as unknown as PlainObject)[key] === undefined,
            ),
        )

        return { ...dataset, ...missing }
    })

    return { ...config, data: { ...config.data, datasets } }
}

function getIndexAxis(type: string, options: ScaleSourceOptions) {
    const datasetDefaults = (
        Chart.defaults.datasets as unknown as Record<
            string,
            { indexAxis?: string } | undefined
        >
    )[type]

    return (
        options.datasets?.[type]?.indexAxis ||
        options.indexAxis ||
        datasetDefaults?.indexAxis ||
        'x'
    )
}

/**
 * Lists the scales Chart.js will build for a configuration, with each axis.
 * It mirrors how Chart.js merges scale options: the scales the caller
 * declares, then the default scales of every dataset type. Naming only
 * scales that exist avoids creating extra axes.
 */
function resolveScaleAxes<TType extends ChartType, TData, TLabel>(
    config: ChartConfiguration<TType, TData, TLabel>,
) {
    const options = (config.options ?? {}) as ScaleSourceOptions
    const typeOverrides = Chart.overrides as unknown as Record<
        string,
        { scales?: PlainObject } | undefined
    >
    const axes = new Map<string, string | undefined>()

    for (const [
        id,
        scale,
    ] of Object.entries(options.scales ?? {})) {
        axes.set(
            id,
            (scale?.axis as string | undefined) ??
                (scale?.type === 'radialLinear' || id === 'r'
                    ? 'r'
                    : id === 'x' || id === 'y'
                      ? id
                      : undefined),
        )
    }

    for (const dataset of config.data.datasets as ScaleSourceDataset[]) {
        const type = dataset.type ?? config.type
        const indexAxis = dataset.indexAxis || getIndexAxis(type, options)

        for (const defaultId of Object.keys(
            typeOverrides[type]?.scales ?? {},
        )) {
            const axis =
                defaultId === '_index_'
                    ? indexAxis
                    : defaultId === '_value_'
                      ? indexAxis === 'x'
                          ? 'y'
                          : 'x'
                      : defaultId
            const id = (dataset[`${axis}AxisID`] as string | undefined) || axis

            if (!axes.has(id)) axes.set(id, axis)
        }
    }

    return axes
}

/** Fills `color` into `explicit`, keeping any value the caller set. */
function withColor(explicit: unknown, color: Rgba | undefined): PlainObject {
    const options = (explicit ?? {}) as PlainObject

    return color && options.color === undefined
        ? { ...options, color: formatColor(color) }
        : options
}

/**
 * Returns the configuration with token-derived text and grid colors on the
 * chart's own options. Chart.js reads its default scale colors from global
 * state that every chart shares, so the colors are set on each scale instead.
 * Options the caller configured are left untouched.
 */
export function applyScaleColors<
    TType extends ChartType,
    TData = DefaultDataPoint<TType>,
    TLabel = unknown,
>(
    config: ChartConfiguration<TType, TData, TLabel>,
    palette: ChartPalette,
): ChartConfiguration<TType, TData, TLabel> {
    const { text, grid } = palette
    if (!text && !grid) return config

    const options = (config.options ?? {}) as PlainObject & ScaleSourceOptions
    const scales: PlainObject = { ...options.scales }

    for (const [
        id,
        axis,
    ] of resolveScaleAxes(config)) {
        const scale = (options.scales?.[id] ?? {}) as PlainObject

        scales[id] = {
            ...scale,
            ticks: withColor(scale.ticks, text),
            grid: withColor(scale.grid, grid),
            border: withColor(scale.border, grid),
            title: withColor(scale.title, text),
            ...(axis === 'r' && {
                angleLines: withColor(scale.angleLines, grid),
                pointLabels: withColor(scale.pointLabels, text),
            }),
        }
    }

    return {
        ...config,
        options: {
            ...options,
            ...(options.color === undefined &&
                text && { color: formatColor(text) }),
            scales,
        } as typeof config.options,
    }
}

/**
 * Returns the configuration with token-derived colors on a configured title
 * (foreground) and subtitle (text). Chart.js otherwise draws both in its global
 * default color. A color the caller configured, or a disabled heading, is left
 * untouched.
 */
export function applyTitleColors<
    TType extends ChartType,
    TData = DefaultDataPoint<TType>,
    TLabel = unknown,
>(
    config: ChartConfiguration<TType, TData, TLabel>,
    palette: ChartPalette,
): ChartConfiguration<TType, TData, TLabel> {
    const plugins = config.options?.plugins as PlainObject | undefined
    const headings = {
        title: palette.foreground,
        subtitle: palette.text,
    }
    const themed: PlainObject = {}

    for (const [
        name,
        color,
    ] of Object.entries(headings)) {
        const heading = plugins?.[name] as
            { color?: unknown } | false | undefined

        if (color && heading && heading.color === undefined) {
            themed[name] = { ...heading, color: formatColor(color) }
        }
    }
    if (Object.keys(themed).length === 0) return config

    return {
        ...config,
        options: {
            ...config.options,
            plugins: { ...plugins, ...themed },
        } as typeof config.options,
    }
}
