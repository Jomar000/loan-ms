import ArchiveIcon from '@lucide/svelte/icons/archive'
import { describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-svelte'

import ActiveFilterStrip from './ActiveFilterStrip.svelte'
import { createActiveFilter, parseWorkspaceUrl } from './filtering'
import PaginationFooter from './PaginationFooter.svelte'
import StatCard from './StatCard.svelte'
import StatusBadge from './StatusBadge.svelte'

describe('data workspace components', () => {
    it('renders status text and iconography independently of color', async () => {
        const screen = await render(StatusBadge, {
            archived: true,
            status: 'INACTIVE',
        })

        await expect.element(screen.getByText('Archived')).toBeVisible()
    })

    it('exposes stat cards as pressed buttons and invokes selection', async () => {
        const onclick = vi.fn()
        const screen = await render(StatCard, {
            active: true,
            count: 12,
            icon: ArchiveIcon,
            label: 'Archived',
            onclick,
        })
        const card = screen.getByRole('button', { name: /12 archived/i })

        await expect.element(card).toHaveAttribute('aria-pressed', 'true')
        await card.click()
        expect(onclick).toHaveBeenCalledOnce()
    })

    it('distinguishes unavailable stat counts from genuine zeroes', async () => {
        const unavailable = await render(StatCard, {
            icon: ArchiveIcon,
            label: 'Unavailable',
            onclick: vi.fn(),
        })
        await expect
            .element(
                unavailable.getByRole('button', { name: /— unavailable/i }),
            )
            .toBeVisible()
        unavailable.unmount()

        const zero = await render(StatCard, {
            count: 0,
            icon: ArchiveIcon,
            label: 'Zero',
            onclick: vi.fn(),
        })
        await expect
            .element(zero.getByRole('button', { name: /0 zero/i }))
            .toBeVisible()
    })

    it('groups chips, collapses extra categories, and delegates clearing', async () => {
        const onClearAll = vi.fn()
        const onShowMore = vi.fn()
        const screen = await render(ActiveFilterStrip, {
            definitions: [
                { key: 'states', label: 'State' },
                { key: 'regions', label: 'Region' },
                { key: 'parents', label: 'Parent' },
            ],
            filters: [
                createActiveFilter({
                    field: 'states',
                    label: 'Active',
                    operator: 'is',
                    value: 'ACTIVE',
                }),
                createActiveFilter({
                    field: 'regions',
                    operator: 'is',
                    value: 'NCR',
                }),
                createActiveFilter({
                    field: 'parents',
                    operator: 'is_not',
                    value: 'parent-1',
                }),
            ],
            onClearAll,
            onFiltersChange: vi.fn(),
            onShowMore,
        })

        const showMore = screen.getByText('+1 more')
        await expect.element(showMore).toBeVisible()
        await expect.element(screen.getByText('State: Active')).toBeVisible()
        await expect.element(screen.getByText('Region: NCR')).toBeVisible()

        await showMore.click()
        expect(onShowMore).toHaveBeenCalledOnce()

        await screen.getByText('Clear all').click()
        expect(onClearAll).toHaveBeenCalledOnce()
    })

    it('keeps rows-per-page controlled and emits validated numeric values', async () => {
        const onPageSizeChange = vi.fn()
        const props = {
            count: 200,
            onPageChange: vi.fn(),
            onPageSizeChange,
            page: 1,
            pageSize: 25,
        }
        const screen = await render(PaginationFooter, props)
        const rows = screen.getByRole('combobox', { name: 'Rows per page' })

        await expect.element(rows).toHaveValue('25')

        await screen.rerender({ ...props, pageSize: 50 })
        await expect.element(rows).toHaveValue('50')

        const restored = parseWorkspaceUrl(
            new URLSearchParams('pageSize=100'),
            [],
        )
        await screen.rerender({ ...props, pageSize: restored.pageSize })
        await expect.element(rows).toHaveValue('100')

        const select = rows.element() as HTMLSelectElement
        select.value = '10'
        select.dispatchEvent(new Event('change', { bubbles: true }))

        await expect.poll(() => onPageSizeChange.mock.calls.length).toBe(1)
        expect(onPageSizeChange).toHaveBeenCalledWith(10)

        select.value = '999'
        select.dispatchEvent(new Event('change', { bubbles: true }))
        expect(onPageSizeChange).toHaveBeenCalledOnce()
    })
})

// =============================================================================
// END OF BASE TEMPLATE TESTS - FORK-SPECIFIC TESTS MUST BE ADDED BELOW
// =============================================================================
