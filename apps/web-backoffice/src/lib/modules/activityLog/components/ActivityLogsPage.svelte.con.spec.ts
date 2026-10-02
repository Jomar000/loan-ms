import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-svelte'

import { ACTIVITY_LOG_STAT_CARDS } from '../config'
import type { ActivityLogPage, ActivityLogSummary } from '../types'
import ActivityLogsPageTestHarness from './ActivityLogsPageTestHarness.svelte'

const mocks = vi.hoisted(() => {
    const alphaPage: ActivityLogPage = {
        count: 100,
        data: [
            {
                action: 'signIn.username',
                actor: {
                    displayName: 'Alpha Owner',
                    identifier: 'owner@example.com',
                    role: 'owner',
                    type: 'user',
                },
                component: 'auth',
                description: 'Alpha activity',
                ipAddress: null,
                loggedAt: '2026-09-04T00:00:00.000Z',
                publicId: '019941bc-0800-7000-8000-000000000001',
                records: [],
                sourceChannel: 'User session',
            },
        ],
        limit: 25,
        offset: 0,
    }

    return {
        afterNavigateCallback: undefined as
            ((navigation: { to: { url: URL } | null }) => void) | undefined,
        alphaPage,
        counts: {} as ActivityLogSummary,
        refetchDetail: vi.fn(async () => undefined),
        refetchList: vi.fn(async () => undefined),
        refetchSummary: vi.fn(async () => undefined),
        pageUrl: new URL('https://example.test/app/owner/activity-logs'),
        replaceState: vi.fn(),
    }
})

Object.assign(
    mocks.counts,
    Object.fromEntries(
        ACTIVITY_LOG_STAT_CARDS.map(({ key }) => [
            key,
            0,
        ]),
    ),
)

vi.mock('$app/navigation', () => ({
    afterNavigate: (
        callback: (navigation: { to: { url: URL } | null }) => void,
    ) => {
        mocks.afterNavigateCallback = callback
    },
    replaceState: (target: string, state: unknown) => {
        mocks.replaceState(target, state)
        mocks.pageUrl = new URL(target, mocks.pageUrl)
    },
}))
vi.mock('$app/state', () => ({
    page: {
        state: {},
        get url() {
            return mocks.pageUrl
        },
    },
}))
vi.mock('../queries', () => ({
    createActivityLogDetailQuery: () => ({
        data: undefined,
        isError: false,
        isPending: false,
        refetch: mocks.refetchDetail,
    }),
    createActivityLogListQuery: (
        scope: { readonly organizationSlug: string },
        options: {
            readonly request: {
                filters: { searchFilter?: string }
            }
        },
    ) => ({
        get data() {
            return scope.organizationSlug === 'alpha'
                ? mocks.alphaPage
                : undefined
        },
        get isError() {
            return (
                scope.organizationSlug === 'beta' ||
                options.request.filters.searchFilter === 'fail'
            )
        },
        isFetching: false,
        isPending: false,
        isPlaceholderData: false,
        refetch: mocks.refetchList,
    }),
    createActivityLogSummaryQuery: (scope: {
        readonly organizationSlug: string
    }) => ({
        get data() {
            if (scope.organizationSlug === 'summary-error') return undefined
            if (scope.organizationSlug === 'summary-stale') {
                return {
                    ...mocks.counts,
                    all: 7,
                }
            }
            return mocks.counts
        },
        get isError() {
            return (
                scope.organizationSlug === 'summary-error' ||
                scope.organizationSlug === 'summary-stale'
            )
        },
        isPending: false,
        refetch: mocks.refetchSummary,
    }),
}))

describe('Activity Logs page states', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mocks.afterNavigateCallback = undefined
        mocks.pageUrl = new URL('https://example.test/app/owner/activity-logs')
    })

    it('defaults date controls to the browser-local current day', async () => {
        const now = new Date()
        const expectedDate = [
            now.getFullYear(),
            String(now.getMonth() + 1).padStart(2, '0'),
            String(now.getDate()).padStart(2, '0'),
        ].join('-')
        const screen = await render(ActivityLogsPageTestHarness)

        await expect
            .element(screen.getByLabelText('Date from'))
            .toHaveValue(`${expectedDate}T00:00`)
        await expect
            .element(screen.getByLabelText('Date to'))
            .toHaveValue(`${expectedDate}T23:59`)
    })

    it('keeps Event ID searchable without adding a table column', async () => {
        const screen = await render(ActivityLogsPageTestHarness)
        await expect
            .element(
                screen.getByRole('columnheader', {
                    name: 'Event ID',
                }),
            )
            .not.toBeInTheDocument()
        await expect
            .element(
                screen.getByRole('columnheader', {
                    name: 'Affected records',
                }),
            )
            .not.toBeInTheDocument()
        await expect
            .element(
                screen.getByPlaceholder(
                    'Search activity, actor, event ID, record, or IP',
                ),
            )
            .toBeVisible()
    })

    it('serializes local date-minute boundaries into explicit URL instants', async () => {
        const screen = await render(ActivityLogsPageTestHarness)
        const dateFrom = '2026-09-10T01:02'
        const dateTo = '2026-09-11T03:04'

        await screen.getByLabelText('Date from').fill(dateFrom)
        await screen.getByLabelText('Date to').fill(dateTo)

        await expect
            .poll(() => {
                const target = String(
                    mocks.replaceState.mock.calls.at(-1)?.[0] ?? '',
                )
                return new URL(target, 'https://example.test').searchParams.get(
                    'dateTo',
                )
            })
            .toBe(toIsoMinuteBoundary(dateTo, 'end'))
        const target = String(mocks.replaceState.mock.calls.at(-1)?.[0])
        const url = new URL(target, 'https://example.test')

        expect(url.searchParams.get('dateFrom')).toBe(
            toIsoMinuteBoundary(dateFrom, 'start'),
        )
        expect(url.searchParams.get('dateTo')).toBe(
            toIsoMinuteBoundary(dateTo, 'end'),
        )
    })

    it('restores every workspace control from browser history navigation', async () => {
        const screen = await render(ActivityLogsPageTestHarness)
        mocks.pageUrl = new URL(
            'https://example.test/app/owner/activity-logs?filter=components%3Ais%3Aauth&group=accessSecurity&searchFilter=restored&page=2&pageSize=50&sortOrder=asc&dateFrom=2026-09-10T01%3A02%3A00.000Z&dateTo=2026-09-11T03%3A04%3A59.999Z',
        )

        mocks.afterNavigateCallback?.({ to: { url: mocks.pageUrl } })

        await expect
            .element(
                screen.getByPlaceholder(
                    'Search activity, actor, event ID, record, or IP',
                ),
            )
            .toHaveValue('restored')
        await expect
            .element(screen.getByRole('button', { name: /access & security/i }))
            .toHaveAttribute('aria-pressed', 'true')
        await expect
            .element(
                screen.getByRole('button', { name: 'Remove Module: Auth' }),
            )
            .toBeVisible()
        await expect
            .element(screen.getByLabelText('Rows per page'))
            .toHaveValue('50')
        await expect.element(screen.getByText(/Page 2 of/)).toBeVisible()
        await expect
            .element(screen.getByLabelText('Sort order'))
            .toHaveValue('asc')
        await expect
            .element(screen.getByLabelText('Date from'))
            .toHaveValue(toLocalDateTime('2026-09-10T01:02:00.000Z'))
        await expect
            .element(screen.getByLabelText('Date to'))
            .toHaveValue(toLocalDateTime('2026-09-11T03:04:59.999Z'))
        await expect
            .poll(() => mocks.pageUrl.searchParams.get('searchFilter'))
            .toBe('restored')
    })

    it('cancels pending search input before restoring browser history', async () => {
        const screen = await render(ActivityLogsPageTestHarness)
        const searchInput = screen.getByPlaceholder(
            'Search activity, actor, event ID, record, or IP',
        )
        await searchInput.fill('pending search')
        mocks.pageUrl = new URL(
            'https://example.test/app/owner/activity-logs?searchFilter=restored',
        )

        mocks.afterNavigateCallback?.({ to: { url: mocks.pageUrl } })
        await expect.element(searchInput).toHaveValue('restored')
        await new Promise((resolve) => setTimeout(resolve, 350))

        await expect.element(searchInput).toHaveValue('restored')
        expect(mocks.pageUrl.searchParams.get('searchFilter')).toBe('restored')
    })

    it('distinguishes unavailable summary counts from genuine zeroes', async () => {
        const screen = await render(ActivityLogsPageTestHarness)
        await screen.getByRole('button', { name: 'Show summary error' }).click()

        await expect
            .element(screen.getByRole('button', { name: /— all activity/i }))
            .toBeVisible()
        await expect
            .element(screen.getByText('Activity summary is unavailable.'))
            .toBeVisible()

        await screen.getByRole('button', { name: 'Show zero summary' }).click()
        await expect
            .element(screen.getByRole('button', { name: /0 all activity/i }))
            .toBeVisible()
    })

    it('labels retained summary counts after a failed refresh', async () => {
        const screen = await render(ActivityLogsPageTestHarness)
        await screen.getByRole('button', { name: 'Show stale summary' }).click()

        await expect
            .element(screen.getByRole('button', { name: /7 all activity/i }))
            .toBeVisible()
        await expect
            .element(
                screen.getByText(
                    'Latest summary refresh failed. Previously loaded counts are still shown.',
                ),
            )
            .toBeVisible()
    })

    it('keeps same-tenant rows visible after a failed list refresh', async () => {
        const screen = await render(ActivityLogsPageTestHarness)

        await screen
            .getByPlaceholder('Search activity, actor, event ID, record, or IP')
            .fill('fail')

        await expect.element(screen.getByText('Alpha activity')).toBeVisible()
        await expect
            .element(
                screen.getByText(
                    'Latest refresh failed. Previously loaded events are still shown.',
                ),
            )
            .toBeVisible()
    })

    it('never reuses a previous organization page after a tenant change', async () => {
        const screen = await render(ActivityLogsPageTestHarness)

        await expect.element(screen.getByText('Alpha activity')).toBeVisible()
        await screen.getByText('Alpha activity').click()
        await expect
            .element(screen.getByRole('dialog', { name: 'Activity details' }))
            .toBeVisible()
        ;(
            screen
                .getByRole('button', { name: 'Switch organization' })
                .element() as HTMLButtonElement
        ).click()

        await expect
            .element(screen.getByText('Alpha activity'))
            .not.toBeInTheDocument()
        await expect
            .element(screen.getByText('Unable to load activity'))
            .toBeVisible()
        await expect
            .element(screen.getByRole('dialog', { name: 'Activity details' }))
            .not.toBeInTheDocument()

        ;(
            screen
                .getByRole('button', { name: 'Switch organization' })
                .element() as HTMLButtonElement
        ).click()
        await expect.element(screen.getByText('Alpha activity')).toBeVisible()
        await expect
            .element(screen.getByRole('dialog', { name: 'Activity details' }))
            .not.toBeInTheDocument()
    })
})

function toLocalDateTime(value: string) {
    const instant = new Date(value)
    return new Date(instant.getTime() - instant.getTimezoneOffset() * 60_000)
        .toISOString()
        .slice(0, 16)
}

function toIsoMinuteBoundary(value: string, boundary: 'start' | 'end') {
    const minuteStart = Math.floor(Date.parse(value) / 60_000) * 60_000
    return new Date(
        minuteStart + (boundary === 'end' ? 59_999 : 0),
    ).toISOString()
}

// =============================================================================
// END OF BASE TEMPLATE TESTS - FORK-SPECIFIC TESTS MUST BE ADDED BELOW
// =============================================================================
