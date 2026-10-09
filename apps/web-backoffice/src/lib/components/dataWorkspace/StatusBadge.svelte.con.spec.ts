import { afterEach, describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-svelte'

import '../../../app.css'
import StatusBadge from './StatusBadge.svelte'

const colors = {
    danger: { light: 'rgb(159, 18, 57)', dark: 'rgb(253, 164, 175)' },
    info: { light: 'rgb(30, 64, 175)', dark: 'rgb(191, 219, 254)' },
    success: { light: 'rgb(6, 95, 70)', dark: 'rgb(167, 243, 208)' },
    warning: { light: 'rgb(133, 77, 14)', dark: 'rgb(253, 230, 138)' },
}

describe.each([
    'light',
    'dark',
] as const)('status badges in %s mode', (theme) => {
    afterEach(() => {
        document.documentElement.classList.remove('dark')
    })

    it.each([
        { status: 'PAID', label: 'PAID', tone: 'success' },
        { status: 'FULLY_PAID', label: 'FULLY PAID', tone: 'success' },
        { status: 'UPCOMING', label: 'UPCOMING', tone: 'warning' },
        { status: 'PARTIAL', label: 'PARTIAL', tone: 'warning' },
        { status: 'OVERDUE', label: 'OVERDUE', tone: 'danger' },
        { status: 'REVERSED', label: 'REVERSED', tone: 'danger' },
        { status: 'WAIVED', label: 'WAIVED', tone: 'info' },
        { status: 'DEFAULT', label: 'DEFAULT', tone: 'info' },
    ] as const)(
        'shows $status with its semantic color and readable text',
        async ({ status, label, tone }) => {
            document.documentElement.classList.toggle('dark', theme === 'dark')
            const screen = await render(StatusBadge, { status })
            const text = screen.getByText(label, { exact: true })

            await expect.element(text).toBeVisible()
            const badge = text.element()
            expect(badge.getAttribute('data-slot')).toBe('badge')
            expect(getComputedStyle(badge).color).toBe(colors[tone][theme])
            expect(
                getComputedStyle(badge.parentElement!).backgroundColor,
            ).not.toBe('rgba(0, 0, 0, 0)')
        },
    )
})

it('preserves custom labels and provides a neutral badge for unknown statuses', async () => {
    const screen = await render(StatusBadge, {
        status: 'NEW_STATE',
        label: 'Awaiting review',
    })

    await expect.element(screen.getByText('Awaiting review')).toBeVisible()
    expect(
        screen.getByText('Awaiting review').element().getAttribute('data-slot'),
    ).toBe('badge')
})
