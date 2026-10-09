import DownloadIcon from '@lucide/svelte/icons/download'
import FolderIcon from '@lucide/svelte/icons/folder'
import LayoutDashboardIcon from '@lucide/svelte/icons/layout-dashboard'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-svelte'
import { page as browserPage } from 'vitest/browser'

import type { SessionState } from '$lib/states/session'
import SidebarTestHarness from './SidebarTestHarness.svelte'
import type { AppNavItem } from './types'

const COLLAPSED_NAV_ITEMS: AppNavItem[] = [
    {
        children: [
            {
                href: '#downloads',
                icon: DownloadIcon,
                label: 'Downloads',
            },
        ],
        icon: FolderIcon,
        label: 'Workspace',
    },
    {
        href: '#dashboard',
        icon: LayoutDashboardIcon,
        label: 'Dashboard',
    },
]

const ACTIVE_STATE_NAV_ITEMS: AppNavItem[] = [
    {
        children: [
            {
                href: '/app',
                icon: DownloadIcon,
                label: 'Current Destination',
            },
            {
                href: '#other-destination',
                icon: DownloadIcon,
                label: 'Other Destination',
            },
        ],
        icon: FolderIcon,
        label: 'Workspace',
    },
    {
        href: '/app',
        icon: LayoutDashboardIcon,
        label: 'Overview',
    },
    {
        href: '#dashboard',
        icon: LayoutDashboardIcon,
        label: 'Dashboard',
    },
    {
        disabled: true,
        icon: LayoutDashboardIcon,
        label: 'Reports',
    },
]

const DESKTOP_HEIGHT = 720
const DESKTOP_WIDTH = 1280
const MOBILE_HEIGHT = 844
const MOBILE_WIDTH = 390

let consoleWarnSpy: ReturnType<typeof vi.spyOn>

const mocks = vi.hoisted(() => ({
    hasActiveTenantMutations: vi.fn(),
    setActiveOrganization: vi.fn(),
    toastError: vi.fn(),
    toastWarning: vi.fn(),
    transitionSessionBoundary: vi.fn(),
}))

vi.mock('@tanstack/svelte-query', () => ({
    useQueryClient: () => ({ mutationCache: 'test-cache' }),
}))
vi.mock('svelte-sonner', () => ({
    toast: {
        error: mocks.toastError,
        warning: mocks.toastWarning,
    },
}))

vi.mock('$app/state', () => ({
    page: { url: new URL('http://localhost/app') },
}))
vi.mock('$lib/modules/auth/utilities/organizations', () => ({
    createOrganizationListQuery: () => ({
        data: {
            pages: [
                {
                    data: [
                        {
                            name: 'Target Organization',
                            slug: 'target-organization',
                        },
                    ],
                },
            ],
        },
        fetchNextPage: vi.fn(),
        hasNextPage: false,
        isError: false,
        isFetchingNextPage: false,
        isPending: false,
    }),
    createSetActiveOrganizationMutation: () => ({
        mutateAsync: mocks.setActiveOrganization,
    }),
}))
vi.mock('$lib/states/session/tenant', async (importOriginal) => ({
    ...(await importOriginal()),
    hasActiveTenantMutations: mocks.hasActiveTenantMutations,
}))

beforeEach(async () => {
    await browserPage.viewport(DESKTOP_WIDTH, DESKTOP_HEIGHT)
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
    const warnings = consoleWarnSpy.mock.calls.flat().join('\n')
    consoleWarnSpy.mockRestore()

    expect(warnings).not.toContain('derived_inert')
    expect(warnings).not.toContain('state_proxy_equality_mismatch')
})

describe('Sidebar branding', () => {
    it('uses the logo and LoanMS name in the expanded header and retains the logo when collapsed', async () => {
        const screen = await render(SidebarTestHarness, {
            session: createSessionFixture(),
            transitionSessionBoundary: mocks.transitionSessionBoundary,
        })
        const image = screen.getByRole('img', {
            name: 'Loan Management System logo',
        })

        await expect
            .element(screen.getByText('LoanMS', { exact: true }))
            .toBeVisible()
        await expect
            .element(screen.getByText('Management System', { exact: true }))
            .toBeVisible()
        await expect.element(image).toBeVisible()
        await vi.waitFor(() => {
            expect(
                (image.element() as HTMLImageElement).naturalWidth,
            ).toBeGreaterThan(0)
        })
        await screen.getByRole('button', { name: 'Collapse sidebar' }).click()

        await expect
            .element(screen.getByRole('button', { name: 'Expand sidebar' }))
            .toBeVisible()
        await expect
            .element(
                screen.getByRole('img', {
                    name: 'Loan Management System logo',
                }),
            )
            .toBeVisible()
        await expect
            .element(screen.getByText('LoanMS', { exact: true }))
            .not.toBeInTheDocument()
    })
})

describe('Sidebar mobile drawer motion', () => {
    it('uses Vega sheet motion and closes after navigation', async () => {
        await browserPage.viewport(MOBILE_WIDTH, MOBILE_HEIGHT)
        const onNavigate = vi.fn()
        const screen = await render(SidebarTestHarness, {
            navItems: COLLAPSED_NAV_ITEMS,
            onNavigate,
            session: createSessionFixture(),
            showTrigger: true,
            transitionSessionBoundary: mocks.transitionSessionBoundary,
        })

        await screen.getByRole('button', { name: 'Open navigation' }).click()
        const drawer = screen.getByRole('dialog', { name: 'Sidebar' })
        const drawerElement = drawer.element()
        const overlayElement = getRequiredElement('[data-slot="sheet-overlay"]')

        expectVegaSheetMotion(drawerElement, overlayElement, 'enter')

        await screen.getByRole('link', { name: 'Dashboard' }).click()

        expect(onNavigate).toHaveBeenCalledOnce()
        expectVegaSheetMotion(drawerElement, overlayElement, 'exit')
        await expect.element(drawer).not.toBeInTheDocument()
        await screen.unmount()
    })
})

describe('Sidebar collapsed navigation', () => {
    it('runs the navigation callback for a direct destination', async () => {
        const onNavigate = vi.fn()
        const screen = await render(SidebarTestHarness, {
            collapsed: true,
            navItems: COLLAPSED_NAV_ITEMS,
            onNavigate,
            session: createSessionFixture(),
            transitionSessionBoundary: mocks.transitionSessionBoundary,
        })

        const dashboardLink = screen.getByRole('link', { name: 'Dashboard' })
        const expandButton = screen.getByRole('button', {
            name: 'Expand sidebar',
        })

        const dashboardMenuItem = dashboardLink
            .element()
            .closest('[data-slot="sidebar-menu-item"]')
        const dashboardLabel = dashboardLink.element().querySelector('span')
        const sidebarHeader = expandButton
            .element()
            .closest('[data-slot="sidebar-header"]')
        const sidebarContainer = document.querySelector(
            '[data-slot="sidebar-container"]',
        )
        const expandLogo = expandButton.element().querySelector('img')
        const dashboardIcon = dashboardLink.element().querySelector('svg')

        await expect.element(expandButton).toHaveClass(/mx-auto/)
        await expect.element(expandButton).toHaveClass(/size-9/)
        await expect.element(expandButton).toHaveClass(/justify-center/)
        expect(sidebarHeader).toHaveClass('items-center')
        expect(dashboardMenuItem).toHaveClass(
            'group-data-[collapsible=icon]:justify-center',
        )
        expect(dashboardLabel).toHaveClass(
            'group-data-[collapsible=icon]:hidden',
        )
        expect(sidebarContainer).not.toBeNull()
        expect(dashboardLabel).not.toBeNull()
        expect(expandLogo).not.toBeNull()
        expect(dashboardIcon).not.toBeNull()
        expect(getComputedStyle(dashboardLabel!).display).toBe('none')
        expectHorizontalCentersToMatch(
            sidebarContainer!,
            expandButton.element(),
        )
        expectHorizontalCentersToMatch(
            sidebarContainer!,
            dashboardLink.element(),
        )
        expectHorizontalCentersToMatch(expandButton.element(), expandLogo!)
        expectHorizontalCentersToMatch(dashboardLink.element(), dashboardIcon!)
        await dashboardLink.click()

        expect(onNavigate).toHaveBeenCalledOnce()
        await dashboardLink.unhover()
        await expectNoOverlayContent()
        await screen.unmount()
    })

    it('reopens a collapsed group on repeated hover and closes after navigation', async () => {
        const onNavigate = vi.fn()
        const screen = await render(SidebarTestHarness, {
            collapsed: true,
            navItems: COLLAPSED_NAV_ITEMS,
            onNavigate,
            session: createSessionFixture(),
            transitionSessionBoundary: mocks.transitionSessionBoundary,
        })
        const workspaceTrigger = screen.getByRole('button', {
            name: 'Workspace',
        })
        const workspaceIcon = workspaceTrigger.element().querySelector('svg')
        const sidebarContainer = document.querySelector(
            '[data-slot="sidebar-container"]',
        )

        await expect.element(workspaceTrigger).toHaveClass(/mx-auto/)
        await expect.element(workspaceTrigger).toHaveClass(/justify-center/)
        expect(sidebarContainer).not.toBeNull()
        expect(workspaceIcon).not.toBeNull()
        expectHorizontalCentersToMatch(
            sidebarContainer!,
            workspaceTrigger.element(),
        )
        expectHorizontalCentersToMatch(
            workspaceTrigger.element(),
            workspaceIcon!,
        )

        await workspaceTrigger.hover()
        const downloadsLink = screen.getByRole('link', { name: 'Downloads' })
        await expect.element(downloadsLink).toBeVisible()
        expect(
            downloadsLink.element().closest('[data-slot="popover-content"]'),
        ).toHaveClass('p-1.5')
        await workspaceTrigger.unhover()
        await expect.element(downloadsLink).not.toBeInTheDocument()
        await waitForAnimationFrame()

        await workspaceTrigger.hover()
        const reopenedDownloadsLink = screen.getByRole('link', {
            name: 'Downloads',
        })
        await expect.element(reopenedDownloadsLink).toBeVisible()
        await reopenedDownloadsLink.hover()
        await reopenedDownloadsLink.click()

        expect(onNavigate).toHaveBeenCalledOnce()
        await expect.element(reopenedDownloadsLink).not.toBeInTheDocument()
        await workspaceTrigger.unhover()
        await expectNoOverlayContent()
        await screen.unmount()
    })
})

describe('Sidebar active states', () => {
    it('emits active state only for the current destination', async () => {
        const screen = await render(SidebarTestHarness, {
            navItems: ACTIVE_STATE_NAV_ITEMS,
            session: createSessionFixture(),
            transitionSessionBoundary: mocks.transitionSessionBoundary,
        })
        const workspaceTrigger = screen.getByRole('button', {
            name: 'Workspace',
        })
        const overviewLink = screen.getByRole('link', { name: 'Overview' })
        const dashboardLink = screen.getByRole('link', { name: 'Dashboard' })
        const headerButton = screen.getByRole('button', {
            name: 'Collapse sidebar',
        })
        const headerIcon = headerButton.element().querySelector('svg')
        const disabledButton = screen
            .getByText('Reports')
            .element()
            .closest('[aria-disabled="true"]')

        await expect
            .element(workspaceTrigger)
            .toHaveAttribute('data-active', 'true')
        await expect
            .element(overviewLink)
            .toHaveAttribute('data-active', 'true')
        await expect.element(dashboardLink).not.toHaveAttribute('data-active')
        await expect.element(headerButton).not.toHaveAttribute('data-active')
        await expect.element(headerButton).toHaveClass(/justify-center/)
        expect(headerIcon).not.toBeNull()
        expectHorizontalCentersToMatch(headerButton.element(), headerIcon!)
        expect(disabledButton).not.toBeNull()
        expect(disabledButton?.hasAttribute('data-active')).toBe(false)

        const currentDestination = screen.getByRole('link', {
            name: 'Current Destination',
        })
        const otherDestination = screen.getByRole('link', {
            name: 'Other Destination',
        })
        await expect
            .element(currentDestination)
            .toHaveAttribute('data-active', 'true')
        await expect
            .element(otherDestination)
            .not.toHaveAttribute('data-active')
        await screen.unmount()
    })
})

describe('Sidebar organization switching', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mocks.hasActiveTenantMutations.mockReturnValue(false)
        mocks.setActiveOrganization.mockResolvedValue(undefined)
        mocks.transitionSessionBoundary.mockResolvedValue(undefined)
    })

    it('updates one stable warning toast for repeated blocked switches', async () => {
        mocks.hasActiveTenantMutations.mockReturnValue(true)
        const { organizationTrigger, screen, targetOrganization } =
            await renderOpenSidebar()

        await targetOrganization.click()
        await targetOrganization.click()

        expect(mocks.setActiveOrganization).not.toHaveBeenCalled()
        expect(mocks.toastWarning).toHaveBeenCalledTimes(2)
        expect(mocks.toastWarning).toHaveBeenNthCalledWith(
            1,
            'Organization switch unavailable',
            {
                description:
                    'Finish the active organization operation, then try again.',
                duration: 8000,
                id: 'organization-switch',
            },
        )
        expect(mocks.toastWarning).toHaveBeenNthCalledWith(
            2,
            'Organization switch unavailable',
            expect.objectContaining({ id: 'organization-switch' }),
        )

        await organizationTrigger.click()
        await expect
            .element(screen.getByPlaceholder('Search organization...'))
            .not.toBeInTheDocument()
        await organizationTrigger.unhover()
        await expectNoOverlayContent()
        await screen.unmount()
    })

    it('prevents duplicate organization switches while one is pending', async () => {
        const deferred = createDeferred<void>()
        mocks.setActiveOrganization.mockReturnValueOnce(deferred.promise)
        const { screen, targetOrganization } = await renderOpenSidebar()

        await targetOrganization.click()
        await targetOrganization.click()

        expect(mocks.setActiveOrganization).toHaveBeenCalledOnce()

        deferred.resolve()
        await expect
            .poll(() => mocks.transitionSessionBoundary.mock.calls.length)
            .toBe(1)
        await expect
            .element(screen.getByPlaceholder('Search organization...'))
            .not.toBeInTheDocument()
        await targetOrganization.unhover()
        await expectNoOverlayContent()
        await screen.unmount()
    })

    it('shows a retryable error and releases the lock after mutation failure', async () => {
        mocks.setActiveOrganization.mockRejectedValueOnce(
            new Error('Switch failed.'),
        )
        const { screen, targetOrganization } = await renderOpenSidebar()

        await targetOrganization.click()

        await expect.poll(() => mocks.toastError.mock.calls.length).toBe(1)
        expect(mocks.toastError).toHaveBeenCalledWith(
            'Organization switch failed',
            {
                description: 'Switch failed.',
                duration: 8000,
                id: 'organization-switch',
            },
        )
        await expect.element(targetOrganization).toBeEnabled()

        await targetOrganization.click()
        await expect
            .poll(() => mocks.setActiveOrganization.mock.calls.length)
            .toBe(2)
        await expect
            .element(screen.getByPlaceholder('Search organization...'))
            .not.toBeInTheDocument()
        await targetOrganization.unhover()
        await expectNoOverlayContent()
        await screen.unmount()
    })

    it('warns after a persisted switch fails to refresh and releases the lock', async () => {
        mocks.transitionSessionBoundary.mockRejectedValueOnce(
            new Error('Refresh failed.'),
        )
        const { organizationTrigger, screen, targetOrganization } =
            await renderOpenSidebar()

        await targetOrganization.click()

        await expect.poll(() => mocks.toastWarning.mock.calls.length).toBe(1)
        expect(mocks.toastWarning).toHaveBeenCalledWith(
            'Organization changed',
            {
                description:
                    'The organization changed, but the page could not finish refreshing. Reload the page to continue.',
                duration: 8000,
                id: 'organization-switch',
            },
        )

        await organizationTrigger.click()
        const retryTarget = screen.getByText('Target Organization')
        await retryTarget.click()
        await expect
            .poll(() => mocks.setActiveOrganization.mock.calls.length)
            .toBe(2)
        await expect
            .element(screen.getByPlaceholder('Search organization...'))
            .not.toBeInTheDocument()
        await retryTarget.unhover()
        await expectNoOverlayContent()
        await screen.unmount()
    })
})

async function renderOpenSidebar() {
    const screen = await render(SidebarTestHarness, {
        session: createSessionFixture(),
        transitionSessionBoundary: mocks.transitionSessionBoundary,
    })
    const organizationTrigger = screen.getByRole('button', {
        name: 'Current organization: Current Organization',
    })
    await organizationTrigger.click()

    await expect
        .element(screen.getByPlaceholder('Search organization...'))
        .toHaveAccessibleName('Search organizations')

    const targetOrganization = screen.getByText('Target Organization')
    await expect.element(targetOrganization).toBeVisible()

    return { organizationTrigger, screen, targetOrganization }
}

async function expectNoOverlayContent() {
    await waitForAnimationFrame()
    await expect
        .poll(
            () =>
                document.querySelectorAll(
                    '[data-slot="popover-content"], [data-slot="tooltip-content"]',
                ).length,
        )
        .toBe(0)
}

async function waitForAnimationFrame() {
    await new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve())
    })
}

function createDeferred<T>() {
    let resolve!: (value: T | PromiseLike<T>) => void
    let reject!: (reason?: unknown) => void
    const promise = new Promise<T>((resolvePromise, rejectPromise) => {
        resolve = resolvePromise
        reject = rejectPromise
    })

    return { promise, reject, resolve }
}

function createSessionFixture() {
    const currentEpochSeconds = Math.floor(Date.now() / 1000)

    return {
        data: {
            avatar: '',
            email: 'member@example.com',
            expiresAt: currentEpochSeconds + 3600,
            name: 'Member',
            organizationName: 'Current Organization',
            organizationSlug: 'current-organization',
            refreshAt: currentEpochSeconds + 1800,
            userRoles: ['member'],
        },
    } as unknown as SessionState
}

function expectHorizontalCentersToMatch(container: Element, control: Element) {
    const containerBounds = container.getBoundingClientRect()
    const controlBounds = control.getBoundingClientRect()
    const containerCenter = containerBounds.left + containerBounds.width / 2
    const controlCenter = controlBounds.left + controlBounds.width / 2

    expect(Math.abs(containerCenter - controlCenter)).toBeLessThanOrEqual(1)
}

function expectVegaSheetMotion(
    content: Element,
    overlay: Element,
    animationName: 'enter' | 'exit',
) {
    const expectedState = animationName === 'enter' ? 'open' : 'closed'
    const contentStyle = getComputedStyle(content)
    const overlayStyle = getComputedStyle(overlay)

    expect(content).toHaveAttribute('data-state', expectedState)
    expect(overlay).toHaveAttribute('data-state', expectedState)
    expect(contentStyle.animationName).toContain(animationName)
    expect(overlayStyle.animationName).not.toContain(animationName)
    expect(contentStyle.animationDuration).toBe('0.2s')
    expect(contentStyle.animationDelay).toBe('0s')
    expect(contentStyle.animationTimingFunction).toBe(
        'cubic-bezier(0.4, 0, 0.2, 1)',
    )
}

function getRequiredElement(selector: string) {
    const element = document.querySelector<HTMLElement>(selector)
    expect(element).not.toBeNull()
    return element!
}

// =============================================================================
// END OF BASE TEMPLATE TESTS - FORK-SPECIFIC TESTS MUST BE ADDED BELOW
// =============================================================================
