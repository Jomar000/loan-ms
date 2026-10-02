import type {
    ChartConfiguration,
    ChartType,
    Plugin,
} from '@hyperion/ui/shared/chart'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-svelte'
import { page, userEvent } from 'vitest/browser'

import '../../../app.css'
import ChartTestHarness from './ChartTestHarness.svelte'

type ChartInstance = Parameters<NonNullable<Plugin['afterInit']>>[0]

const CHART_CLASS = 'h-64 w-80'
const CHART_HEIGHT = 256
const CHART_WIDTH = 320
const EXPLICIT_COLOR = 'rgb(1, 2, 3)'

beforeEach(async () => {
    await page.viewport(1280, 720)
})

/** Root tokens a theme change swaps in, independent of the app palette. */
const PROBE_THEME_CLASS = 'chart-theme-probe'
const PROBE_THEME = {
    border: 'rgb(0, 200, 0)',
    foreground: 'rgb(200, 200, 0)',
    mutedForeground: 'rgb(200, 0, 0)',
    series: 'rgb(0, 0, 200)',
}

afterEach(() => {
    document.documentElement.classList.remove('dark', PROBE_THEME_CLASS)
    document.head
        .querySelectorAll('style[data-chart-theme-probe]')
        .forEach((style) => style.remove())
})

/**
 * Observes the chart lifecycle through a plugin, because the web app has no
 * direct dependency on Chart.js. Keep one plugin object per scenario: a new
 * object counts as a plugin change and recreates the chart.
 */
function createProbe() {
    const probe = {
        instances: [] as ChartInstance[],
        updates: 0,
        destroyed: 0,
    }
    const plugin: Plugin = {
        id: 'lifecycleProbe',
        afterInit(chart) {
            probe.instances.push(chart)
        },
        afterUpdate() {
            probe.updates += 1
        },
        afterDestroy() {
            probe.destroyed += 1
        },
    }

    return { probe, plugin }
}

interface ResolvedScaleOptions {
    angleLines: { color: unknown }
    border: { color: unknown }
    grid: { color: unknown }
    pointLabels: { color: unknown }
    ticks: { color: unknown }
    title: { color: unknown }
}

function getScaleOptions(chart: ChartInstance, id: string) {
    return chart.scales[id]!.options as unknown as ResolvedScaleOptions
}

function getChartType(chart: ChartInstance) {
    return (chart.config as ChartConfiguration).type
}

function getChart(probe: ReturnType<typeof createProbe>['probe']) {
    const chart = probe.instances.at(-1)
    expect(chart).toBeDefined()
    return chart!
}

/** Converts the current value of a CSS color token to an sRGB color string. */
function resolveToken(token: string, opacity = 1) {
    const canvas = document.createElement('canvas')
    canvas.width = 1
    canvas.height = 1
    const context = canvas.getContext('2d', { willReadFrequently: true })!
    context.fillStyle = getComputedStyle(document.documentElement)
        .getPropertyValue(token)
        .trim()
    context.fillRect(0, 0, 1, 1)
    const [
        red,
        green,
        blue,
        alpha,
    ] = context.getImageData(0, 0, 1, 1).data
    const resolved = Math.round((alpha! / 255) * opacity * 1000) / 1000

    return resolved === 1
        ? `rgb(${red}, ${green}, ${blue})`
        : `rgba(${red}, ${green}, ${blue}, ${resolved})`
}

/** Changes the root theme class so it overrides the chart tokens. */
function applyProbeTheme() {
    const style = document.createElement('style')
    style.dataset.chartThemeProbe = ''
    style.textContent = `:root.${PROBE_THEME_CLASS} { --border: ${PROBE_THEME.border}; --chart-1: ${PROBE_THEME.series}; --foreground: ${PROBE_THEME.foreground}; --muted-foreground: ${PROBE_THEME.mutedForeground}; }`
    document.head.append(style)
    document.documentElement.classList.add(PROBE_THEME_CLASS)
}

function createBarConfig(
    plugin: Plugin,
    options: ChartConfiguration<ChartType>['options'] = {},
    data = {
        revenue: [
            10,
            20,
            30,
        ],
        cost: [
            5,
            15,
            25,
        ],
    },
): ChartConfiguration<ChartType> {
    return {
        type: 'bar',
        data: {
            labels: [
                'Jan',
                'Feb',
                'Mar',
            ],
            datasets: [
                { label: 'Revenue', data: data.revenue },
                {
                    label: 'Cost',
                    data: data.cost,
                    backgroundColor: EXPLICIT_COLOR,
                },
            ],
        },
        options: { animation: false, ...options },
        plugins: [plugin],
    }
}

function createTitleOptions(
    title: { color?: string } = {},
    subtitle: { color?: string } = {},
): ChartConfiguration<ChartType>['options'] {
    return {
        plugins: {
            title: { display: true, text: 'Monthly revenue', ...title },
            subtitle: { display: true, text: 'USD', ...subtitle },
        },
    }
}

function createHoverOptions(
    tooltip?: NonNullable<
        NonNullable<ChartConfiguration<ChartType>['options']>['plugins']
    >['tooltip'],
): ChartConfiguration<ChartType>['options'] {
    return {
        interaction: { mode: 'index', intersect: false },
        ...(tooltip && { plugins: { tooltip } }),
    }
}

function getLegendColor(chart: ChartInstance) {
    return chart.legend!.options.labels.color
}

async function waitForAnimationFrame() {
    await new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve())
    })
}

describe('Chart shared component', () => {
    it('renders a Cartesian chart with token colors and an accessible name', async () => {
        const { probe, plugin } = createProbe()
        const config = createBarConfig(plugin)
        const screen = await render(ChartTestHarness, {
            props: {
                config,
                label: 'Monthly revenue',
                description: 'Revenue grows every month.',
                class: CHART_CLASS,
            },
        })

        const image = screen.getByRole('img', { name: 'Monthly revenue' })
        await expect.element(image).toBeVisible()
        const describedBy = image.element().getAttribute('aria-describedby')
        expect(describedBy).toBeTruthy()
        expect(document.getElementById(describedBy!)?.textContent).toBe(
            'Revenue grows every month.',
        )

        await expect.poll(() => probe.instances.length).toBe(1)
        const chart = getChart(probe)
        expect(getChartType(chart)).toBe('bar')
        expect(chart.width).toBeCloseTo(CHART_WIDTH, 0)
        expect(chart.height).toBeCloseTo(CHART_HEIGHT, 0)

        const [
            revenue,
            cost,
        ] = chart.data.datasets
        expect(revenue!.backgroundColor).toBe(resolveToken('--chart-1'))
        expect(revenue!.borderColor).toBe(resolveToken('--chart-1'))
        expect(cost!.backgroundColor).toBe(EXPLICIT_COLOR)
        expect(cost!.borderColor).toBe(resolveToken('--chart-2'))
        expect(getScaleOptions(chart, 'x').ticks.color).toBe(
            resolveToken('--muted-foreground'),
        )
        expect(getScaleOptions(chart, 'y').grid.color).toBe(
            resolveToken('--border'),
        )
        expect(config.data.datasets[0]!.backgroundColor).toBeUndefined()
    })

    it('renders a line chart with translucent fills', async () => {
        const { probe, plugin } = createProbe()
        const config = createBarConfig(plugin)
        config.type = 'line'
        await render(ChartTestHarness, {
            props: { config, label: 'Trend', class: CHART_CLASS },
        })

        await expect.poll(() => probe.instances.length).toBe(1)
        const [revenue] = getChart(probe).data.datasets
        expect(revenue!.borderColor).toBe(resolveToken('--chart-1'))
        expect(revenue!.backgroundColor).toBe(resolveToken('--chart-1', 0.5))
    })

    it('renders a doughnut chart with one token color per segment', async () => {
        const { probe, plugin } = createProbe()
        await render(ChartTestHarness, {
            props: {
                config: {
                    type: 'doughnut',
                    data: {
                        labels: [
                            'A',
                            'B',
                            'C',
                        ],
                        datasets: [
                            {
                                data: [
                                    3,
                                    2,
                                    1,
                                ],
                            },
                        ],
                    },
                    options: { animation: false },
                    plugins: [plugin],
                },
                label: 'Share of traffic',
                class: CHART_CLASS,
            },
        })

        await expect.poll(() => probe.instances.length).toBe(1)
        const [dataset] = getChart(probe).data.datasets
        expect(dataset!.backgroundColor).toEqual([
            resolveToken('--chart-1'),
            resolveToken('--chart-2'),
            resolveToken('--chart-3'),
        ])
        expect(dataset!.borderColor).toBe(resolveToken('--card'))
        expect(Object.keys(getChart(probe).scales)).toEqual([])
        expect(getLegendColor(getChart(probe))).toBe(
            resolveToken('--muted-foreground'),
        )
    })

    it('themes the radial scale of a radar chart', async () => {
        const { probe, plugin } = createProbe()
        await render(ChartTestHarness, {
            props: {
                config: {
                    type: 'radar',
                    data: {
                        labels: [
                            'A',
                            'B',
                            'C',
                        ],
                        datasets: [
                            {
                                label: 'Score',
                                data: [
                                    3,
                                    2,
                                    1,
                                ],
                            },
                        ],
                    },
                    options: { animation: false },
                    plugins: [plugin],
                },
                label: 'Skill profile',
                class: CHART_CLASS,
            },
        })

        await expect.poll(() => probe.instances.length).toBe(1)
        const chart = getChart(probe)
        const radial = getScaleOptions(chart, 'r')
        expect(chart.data.datasets[0]!.borderColor).toBe(
            resolveToken('--chart-1'),
        )
        expect(radial.grid.color).toBe(resolveToken('--border'))
        expect(radial.ticks.color).toBe(resolveToken('--muted-foreground'))
        expect(radial.pointLabels.color).toBe(
            resolveToken('--muted-foreground'),
        )
        expect(radial.angleLines.color).toBe(resolveToken('--border'))
    })

    it('colors a configured title and subtitle with the foreground and text tokens', async () => {
        const { probe, plugin } = createProbe()
        await render(ChartTestHarness, {
            props: {
                config: createBarConfig(plugin, createTitleOptions()),
                label: 'Monthly revenue',
                class: CHART_CLASS,
            },
        })
        await expect.poll(() => probe.instances.length).toBe(1)
        const chart = getChart(probe)
        const initialForeground = resolveToken('--foreground')
        expect(chart.options.plugins?.title?.color).toBe(initialForeground)
        expect(chart.options.plugins?.subtitle?.color).toBe(
            resolveToken('--muted-foreground'),
        )

        applyProbeTheme()

        await expect
            .poll(() => chart.options.plugins?.title?.color)
            .toBe(PROBE_THEME.foreground)
        expect(PROBE_THEME.foreground).not.toBe(initialForeground)
        expect(chart.options.plugins?.subtitle?.color).toBe(
            PROBE_THEME.mutedForeground,
        )
        expect(probe.instances).toEqual([chart])
    })

    it('keeps the title and subtitle colors the caller configured', async () => {
        const { probe, plugin } = createProbe()
        await render(ChartTestHarness, {
            props: {
                config: createBarConfig(
                    plugin,
                    createTitleOptions(
                        { color: EXPLICIT_COLOR },
                        { color: 'rgb(4, 5, 6)' },
                    ),
                ),
                label: 'Monthly revenue',
                class: CHART_CLASS,
            },
        })
        await expect.poll(() => probe.instances.length).toBe(1)

        const { plugins } = getChart(probe).options
        expect(plugins?.title?.color).toBe(EXPLICIT_COLOR)
        expect(plugins?.subtitle?.color).toBe('rgb(4, 5, 6)')
    })

    it('updates in place when the configuration is replaced', async () => {
        const { probe, plugin } = createProbe()
        const props = {
            label: 'Monthly revenue',
            class: CHART_CLASS,
        }
        const screen = await render(ChartTestHarness, {
            props: { ...props, config: createBarConfig(plugin) },
        })
        await expect.poll(() => probe.instances.length).toBe(1)
        const chart = getChart(probe)
        const updatesBefore = probe.updates

        await screen.rerender({
            ...props,
            config: createBarConfig(
                plugin,
                { scales: { y: { max: 80 } } },
                {
                    revenue: [
                        40,
                        50,
                        60,
                    ],
                    cost: [
                        1,
                        2,
                        3,
                    ],
                },
            ),
        })

        await expect
            .poll(() => chart.data.datasets[0]!.data)
            .toEqual([
                40,
                50,
                60,
            ])
        expect(chart.scales.y!.max).toBe(80)
        expect(probe.updates).toBeGreaterThan(updatesBefore)
        expect(probe.instances).toEqual([chart])
        expect(probe.destroyed).toBe(0)
    })

    it('recreates the chart when the chart type changes', async () => {
        const { probe, plugin } = createProbe()
        const props = { label: 'Monthly revenue', class: CHART_CLASS }
        const screen = await render(ChartTestHarness, {
            props: { ...props, config: createBarConfig(plugin) },
        })
        await expect.poll(() => probe.instances.length).toBe(1)

        const line = createBarConfig(plugin)
        line.type = 'line'
        await screen.rerender({ ...props, config: line })

        await expect.poll(() => probe.instances.length).toBe(2)
        expect(probe.destroyed).toBe(1)
        expect(getChartType(getChart(probe))).toBe('line')
    })

    it('recreates the chart when the plugin list changes', async () => {
        const { probe, plugin } = createProbe()
        const props = { label: 'Monthly revenue', class: CHART_CLASS }
        const screen = await render(ChartTestHarness, {
            props: { ...props, config: createBarConfig(plugin) },
        })
        await expect.poll(() => probe.instances.length).toBe(1)

        const next = createBarConfig(plugin)
        next.plugins = [
            plugin,
            { id: 'extraPlugin' },
        ]
        await screen.rerender({ ...props, config: next })

        await expect.poll(() => probe.instances.length).toBe(2)
        expect(probe.destroyed).toBe(1)
    })

    it('refreshes resolved colors when the root theme changes', async () => {
        const { probe, plugin } = createProbe()
        await render(ChartTestHarness, {
            props: {
                config: createBarConfig(plugin),
                label: 'Monthly revenue',
                class: CHART_CLASS,
            },
        })
        await expect.poll(() => probe.instances.length).toBe(1)
        const chart = getChart(probe)
        const initialSeries = resolveToken('--chart-1')
        const initialText = resolveToken('--muted-foreground')
        const initialGrid = resolveToken('--border')
        expect(chart.data.datasets[0]!.backgroundColor).toBe(initialSeries)

        applyProbeTheme()

        const themedSeries = resolveToken('--chart-1')
        expect(themedSeries).toBe(PROBE_THEME.series)
        expect(themedSeries).not.toBe(initialSeries)
        await expect
            .poll(() => chart.data.datasets[0]!.backgroundColor)
            .toBe(themedSeries)
        expect(chart.data.datasets[0]!.borderColor).toBe(themedSeries)
        expect(chart.data.datasets[1]!.backgroundColor).toBe(EXPLICIT_COLOR)
        expect(chart.data.datasets[1]!.borderColor).toBe(
            resolveToken('--chart-2'),
        )
        expect(getScaleOptions(chart, 'x').ticks.color).toBe(
            PROBE_THEME.mutedForeground,
        )
        expect(getScaleOptions(chart, 'x').ticks.color).not.toBe(initialText)
        expect(getScaleOptions(chart, 'y').grid.color).toBe(PROBE_THEME.border)
        expect(getScaleOptions(chart, 'y').grid.color).not.toBe(initialGrid)
        expect(probe.instances).toEqual([chart])
        expect(probe.destroyed).toBe(0)
    })

    it('shows a semantic tooltip that keeps the Chart.js callbacks', async () => {
        const { probe, plugin } = createProbe()
        const screen = await render(ChartTestHarness, {
            props: {
                config: createBarConfig(plugin, {
                    interaction: { mode: 'index', intersect: false },
                    plugins: {
                        tooltip: {
                            callbacks: {
                                title: ([item]) => `Month ${item!.label}`,
                                label: (item) =>
                                    `${item.dataset.label}: ${item.formattedValue} USD`,
                                footer: () => 'Totals exclude tax',
                            },
                        },
                    },
                }),
                label: 'Monthly revenue',
                class: CHART_CLASS,
            },
        })
        await expect.poll(() => probe.instances.length).toBe(1)

        await userEvent.hover(
            screen.getByRole('img', { name: 'Monthly revenue' }),
        )

        const tooltip = screen.getByRole('tooltip')
        await expect.element(tooltip).toBeVisible()
        await expect.element(tooltip).toHaveTextContent('Month Feb')
        await expect.element(tooltip).toHaveTextContent('Totals exclude tax')
        const items = tooltip.getByRole('listitem').elements()
        expect(items.map((item) => item.textContent?.trim())).toEqual([
            'Revenue: 20 USD',
            'Cost: 15 USD',
        ])
        const swatches = tooltip
            .element()
            .querySelectorAll<HTMLElement>('[aria-hidden="true"]')
        expect(swatches).toHaveLength(2)
        expect(swatches[0]!.style.backgroundColor).toBe(
            resolveToken('--chart-1'),
        )
        expect(swatches[1]!.style.backgroundColor).toBe(EXPLICIT_COLOR)

        await userEvent.unhover(
            screen.getByRole('img', { name: 'Monthly revenue' }),
        )
        await expect.element(tooltip).not.toBeInTheDocument()
    })

    it('disables the canvas tooltip when a caller supplies only external', async () => {
        const { probe, plugin } = createProbe()
        const external = vi.fn()
        const screen = await render(ChartTestHarness, {
            props: {
                config: createBarConfig(
                    plugin,
                    createHoverOptions({ external }),
                ),
                label: 'Monthly revenue',
                class: CHART_CLASS,
            },
        })
        await expect.poll(() => probe.instances.length).toBe(1)

        await userEvent.hover(
            screen.getByRole('img', { name: 'Monthly revenue' }),
        )

        await expect
            .poll(() =>
                external.mock.calls.some(
                    ([context]) => context.tooltip.opacity > 0,
                ),
            )
            .toBe(true)
        expect(getChart(probe).tooltip!.options.enabled).toBe(false)
        await expect
            .element(screen.getByRole('tooltip'))
            .not.toBeInTheDocument()
    })

    it('keeps the canvas tooltip when the caller enables it explicitly', async () => {
        const { probe, plugin } = createProbe()
        const screen = await render(ChartTestHarness, {
            props: {
                config: createBarConfig(
                    plugin,
                    createHoverOptions({ enabled: true }),
                ),
                label: 'Monthly revenue',
                class: CHART_CLASS,
            },
        })
        await expect.poll(() => probe.instances.length).toBe(1)

        await userEvent.hover(
            screen.getByRole('img', { name: 'Monthly revenue' }),
        )

        const chart = getChart(probe)
        await expect.poll(() => chart.tooltip!.opacity).toBe(1)
        expect(chart.tooltip!.options.enabled).toBe(true)
        expect(document.querySelector('[role="tooltip"]')).toBeNull()
    })

    it('keeps the canvas tooltip when the caller sets external and enabled', async () => {
        const { probe, plugin } = createProbe()
        const external = vi.fn()
        const screen = await render(ChartTestHarness, {
            props: {
                config: createBarConfig(
                    plugin,
                    createHoverOptions({ enabled: true, external }),
                ),
                label: 'Monthly revenue',
                class: CHART_CLASS,
            },
        })
        await expect.poll(() => probe.instances.length).toBe(1)

        await userEvent.hover(
            screen.getByRole('img', { name: 'Monthly revenue' }),
        )

        await expect.poll(() => external.mock.calls.length).toBeGreaterThan(0)
        expect(getChart(probe).tooltip!.options.enabled).toBe(true)
        expect(document.querySelector('[role="tooltip"]')).toBeNull()
    })

    it('shows no tooltip when the caller disables it', async () => {
        const { probe, plugin } = createProbe()
        const screen = await render(ChartTestHarness, {
            props: {
                config: createBarConfig(
                    plugin,
                    createHoverOptions({ enabled: false }),
                ),
                label: 'Monthly revenue',
                class: CHART_CLASS,
            },
        })
        await expect.poll(() => probe.instances.length).toBe(1)

        await userEvent.hover(
            screen.getByRole('img', { name: 'Monthly revenue' }),
        )
        await waitForAnimationFrame()
        await waitForAnimationFrame()

        expect(getChart(probe).tooltip!.options.enabled).toBe(false)
        expect(document.querySelector('[role="tooltip"]')).toBeNull()
    })

    it.each([
        [
            'disabled',
            { enabled: false },
        ],
        [
            'explicitly enabled',
            { enabled: true },
        ],
        [
            'caller supplied external',
            { external: vi.fn() },
        ],
    ])(
        'clears the shared tooltip when the configuration switches to a %s tooltip',
        async (_name, replacement) => {
            const { probe, plugin } = createProbe()
            const props = { label: 'Monthly revenue', class: CHART_CLASS }
            const screen = await render(ChartTestHarness, {
                props: {
                    ...props,
                    config: createBarConfig(plugin, createHoverOptions()),
                },
            })
            await expect.poll(() => probe.instances.length).toBe(1)
            await userEvent.hover(
                screen.getByRole('img', { name: 'Monthly revenue' }),
            )
            const tooltip = screen.getByRole('tooltip')
            await expect.element(tooltip).toBeVisible()

            await screen.rerender({
                ...props,
                config: createBarConfig(
                    plugin,
                    createHoverOptions(replacement),
                ),
            })

            await expect.element(tooltip).not.toBeInTheDocument()
            expect(probe.instances).toHaveLength(1)
        },
    )

    it('clears the shared tooltip when the chart is recreated', async () => {
        const { probe, plugin } = createProbe()
        const props = { label: 'Monthly revenue', class: CHART_CLASS }
        const screen = await render(ChartTestHarness, {
            props: {
                ...props,
                config: createBarConfig(plugin, createHoverOptions()),
            },
        })
        await expect.poll(() => probe.instances.length).toBe(1)
        await userEvent.hover(
            screen.getByRole('img', { name: 'Monthly revenue' }),
        )
        const tooltip = screen.getByRole('tooltip')
        await expect.element(tooltip).toBeVisible()

        const line = createBarConfig(plugin, createHoverOptions())
        line.type = 'line'
        await screen.rerender({ ...props, config: line })

        await expect.element(tooltip).not.toBeInTheDocument()
        await expect.poll(() => probe.instances.length).toBe(2)
    })

    it('keeps the scale and legend colors the caller configured', async () => {
        const { probe, plugin } = createProbe()
        await render(ChartTestHarness, {
            props: {
                config: createBarConfig(plugin, {
                    color: 'rgb(10, 11, 12)',
                    scales: {
                        x: {
                            ticks: { color: EXPLICIT_COLOR },
                            grid: { color: 'rgb(4, 5, 6)' },
                        },
                        y: { border: { color: 'rgb(7, 8, 9)' } },
                    },
                }),
                label: 'Monthly revenue',
                class: CHART_CLASS,
            },
        })
        await expect.poll(() => probe.instances.length).toBe(1)

        const chart = getChart(probe)
        const x = getScaleOptions(chart, 'x')
        const y = getScaleOptions(chart, 'y')
        expect(x.ticks.color).toBe(EXPLICIT_COLOR)
        expect(x.grid.color).toBe('rgb(4, 5, 6)')
        expect(x.border.color).toBe(resolveToken('--border'))
        expect(y.border.color).toBe('rgb(7, 8, 9)')
        expect(y.ticks.color).toBe(resolveToken('--muted-foreground'))
        expect(getLegendColor(chart)).toBe('rgb(10, 11, 12)')
    })

    it.each([
        {
            name: 'horizontal bars',
            scales: [
                'x',
                'y',
            ],
            create: (plugin: Plugin): ChartConfiguration<ChartType> =>
                createBarConfig(plugin, { indexAxis: 'y' }),
        },
        {
            name: 'a custom axis id',
            scales: [
                'x',
                'y2',
            ],
            create: (plugin: Plugin): ChartConfiguration<ChartType> => {
                const config = createBarConfig(plugin, {
                    scales: { y2: { position: 'right' } },
                })
                config.data.datasets.forEach((dataset) =>
                    Object.assign(dataset, { yAxisID: 'y2' }),
                )
                return config
            },
        },
        {
            name: 'a mixed bar and line chart',
            scales: [
                'x',
                'y',
            ],
            create: (plugin: Plugin): ChartConfiguration<ChartType> => {
                const config = createBarConfig(plugin)
                Object.assign(config.data.datasets[1]!, { type: 'line' })
                return config
            },
        },
    ])('themes exactly the scales of $name', async ({ create, scales }) => {
        const { probe, plugin } = createProbe()
        await render(ChartTestHarness, {
            props: {
                config: create(plugin),
                label: 'Monthly revenue',
                class: CHART_CLASS,
            },
        })
        await expect.poll(() => probe.instances.length).toBe(1)

        const chart = getChart(probe)
        expect(Object.keys(chart.scales).sort()).toEqual(scales)
        for (const id of scales) {
            const options = getScaleOptions(chart, id)
            expect(options.ticks.color).toBe(resolveToken('--muted-foreground'))
            expect(options.grid.color).toBe(resolveToken('--border'))
            expect(options.border.color).toBe(resolveToken('--border'))
            expect(options.title.color).toBe(resolveToken('--muted-foreground'))
        }
    })

    it('themes the radial scale of a polar area chart', async () => {
        const { probe, plugin } = createProbe()
        await render(ChartTestHarness, {
            props: {
                config: {
                    type: 'polarArea',
                    data: {
                        labels: [
                            'A',
                            'B',
                            'C',
                        ],
                        datasets: [
                            {
                                data: [
                                    3,
                                    2,
                                    1,
                                ],
                            },
                        ],
                    },
                    options: { animation: false },
                    plugins: [plugin],
                },
                label: 'Share of traffic',
                class: CHART_CLASS,
            },
        })
        await expect.poll(() => probe.instances.length).toBe(1)

        const chart = getChart(probe)
        expect(Object.keys(chart.scales)).toEqual(['r'])
        const radial = getScaleOptions(chart, 'r')
        expect(radial.grid.color).toBe(resolveToken('--border'))
        expect(radial.angleLines.color).toBe(resolveToken('--border'))
        expect(radial.ticks.color).toBe(resolveToken('--muted-foreground'))
        expect(radial.pointLabels.color).toBe(
            resolveToken('--muted-foreground'),
        )
    })

    it('keeps theme colors scoped to each chart', async () => {
        const first = createProbe()
        const second = createProbe()
        const scopedTokens =
            '[--muted-foreground:rgb(200,0,0)] [--border:rgb(0,200,0)] [--chart-1:rgb(0,0,200)]'
        await render(ChartTestHarness, {
            props: {
                config: createBarConfig(first.plugin),
                label: 'First chart',
                class: CHART_CLASS,
            },
        })
        await expect.poll(() => first.probe.instances.length).toBe(1)
        await render(ChartTestHarness, {
            props: {
                config: createBarConfig(second.plugin),
                label: 'Second chart',
                class: `${CHART_CLASS} ${scopedTokens}`,
            },
        })
        await expect.poll(() => second.probe.instances.length).toBe(1)

        const firstChart = getChart(first.probe)
        const secondChart = getChart(second.probe)
        expect(getScaleOptions(secondChart, 'x').ticks.color).toBe(
            'rgb(200, 0, 0)',
        )
        expect(getScaleOptions(secondChart, 'y').grid.color).toBe(
            'rgb(0, 200, 0)',
        )
        expect(getLegendColor(secondChart)).toBe('rgb(200, 0, 0)')
        expect(secondChart.data.datasets[0]!.backgroundColor).toBe(
            'rgb(0, 0, 200)',
        )
        expect(getScaleOptions(firstChart, 'x').ticks.color).toBe(
            resolveToken('--muted-foreground'),
        )
        expect(getScaleOptions(firstChart, 'y').grid.color).toBe(
            resolveToken('--border'),
        )
        expect(getLegendColor(firstChart)).toBe(
            resolveToken('--muted-foreground'),
        )
        expect(firstChart.data.datasets[0]!.backgroundColor).toBe(
            resolveToken('--chart-1'),
        )

        document.documentElement.classList.add('dark')

        await expect
            .poll(() => getScaleOptions(firstChart, 'x').ticks.color)
            .toBe(resolveToken('--muted-foreground'))
        expect(getLegendColor(firstChart)).toBe(
            resolveToken('--muted-foreground'),
        )
        expect(getScaleOptions(secondChart, 'x').ticks.color).toBe(
            'rgb(200, 0, 0)',
        )
        expect(getLegendColor(secondChart)).toBe('rgb(200, 0, 0)')
    })

    it('destroys the chart and stops observing the theme on unmount', async () => {
        const { probe, plugin } = createProbe()
        const screen = await render(ChartTestHarness, {
            props: {
                config: createBarConfig(plugin),
                label: 'Monthly revenue',
                class: CHART_CLASS,
            },
        })
        await expect.poll(() => probe.instances.length).toBe(1)

        await screen.unmount()

        expect(probe.destroyed).toBe(1)
        expect(document.querySelector('canvas')).toBeNull()
        const updatesAfterUnmount = probe.updates
        document.documentElement.classList.add('dark')
        await waitForAnimationFrame()
        await waitForAnimationFrame()
        expect(probe.updates).toBe(updatesAfterUnmount)
        expect(probe.destroyed).toBe(1)
    })
})

// =============================================================================
// END OF BASE TEMPLATE TESTS - FORK-SPECIFIC TESTS MUST BE ADDED BELOW
// =============================================================================
