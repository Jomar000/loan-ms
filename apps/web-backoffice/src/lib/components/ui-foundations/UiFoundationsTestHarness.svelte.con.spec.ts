import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-svelte'
import { page, userEvent } from 'vitest/browser'

import '../../../app.css'
import UiFoundationsTestHarness from './UiFoundationsTestHarness.svelte'

const DESKTOP_HEIGHT = 720
const DESKTOP_WIDTH = 1280
const MOBILE_HEIGHT = 844
const MOBILE_WIDTH = 390

let consoleWarnSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
    const warnings = consoleWarnSpy.mock.calls.flat().join('\n')
    consoleWarnSpy.mockRestore()

    expect(warnings).not.toContain('derived_inert')
})

function getSlot(root: ParentNode, slot: string) {
    const element = root.querySelector<HTMLElement>(`[data-slot="${slot}"]`)
    expect(element).not.toBeNull()
    return element!
}

async function waitForAnimationFrame() {
    await new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve())
    })
}

describe('UI foundation consumers', () => {
    it('fills the mobile viewport with the dialog', async () => {
        await page.viewport(MOBILE_WIDTH, MOBILE_HEIGHT)
        const screen = await render(UiFoundationsTestHarness, {
            props: { mode: 'dialog' },
        })

        await screen.getByRole('button', { name: 'Open dialog' }).click()

        const dialog = screen.getByRole('dialog', { name: 'Edit record' })
        const dialogElement = dialog.element()
        const bounds = dialogElement.getBoundingClientRect()
        const footer = getSlot(dialogElement, 'form-dialog-shell-footer')
        const footerStyle = getComputedStyle(footer)
        const footerContentWidth =
            footer.clientWidth -
            Number.parseFloat(footerStyle.paddingLeft) -
            Number.parseFloat(footerStyle.paddingRight)
        const footerButtons = footer.querySelectorAll<HTMLElement>(
            '[data-slot="button"]',
        )

        expect(bounds.left).toBeCloseTo(0, 0)
        expect(bounds.top).toBeCloseTo(0, 0)
        expect(bounds.width).toBeCloseTo(window.innerWidth, 0)
        expect(bounds.height).toBeCloseTo(window.innerHeight, 0)
        expect(footerStyle.flexDirection).toBe('column')
        expect(footerButtons).toHaveLength(2)
        expect(footerButtons[0]!.getBoundingClientRect().width).toBeCloseTo(
            footerContentWidth,
            0,
        )
        expect(footerButtons[1]!.getBoundingClientRect().width).toBeCloseTo(
            footerContentWidth,
            0,
        )
        expect(footerButtons[1]!.getBoundingClientRect().top).toBeGreaterThan(
            footerButtons[0]!.getBoundingClientRect().bottom,
        )

        await userEvent.keyboard('{Escape}')
        await expect.element(dialog).not.toBeInTheDocument()
        await screen.unmount()
    })

    it('bounds the desktop dialog and scrolls only its body', async () => {
        await page.viewport(DESKTOP_WIDTH, DESKTOP_HEIGHT)
        const screen = await render(UiFoundationsTestHarness, {
            props: { mode: 'dialog' },
        })

        await screen.getByRole('button', { name: 'Open dialog' }).click()

        const dialog = screen.getByRole('dialog', { name: 'Edit record' })
        const dialogElement = dialog.element()
        const header = getSlot(dialogElement, 'form-dialog-shell-header')
        const body = getSlot(dialogElement, 'form-dialog-shell-body')
        const footer = getSlot(dialogElement, 'form-dialog-shell-footer')
        const dialogBounds = dialogElement.getBoundingClientRect()
        const headerTop = header.getBoundingClientRect().top
        const footerTop = footer.getBoundingClientRect().top
        const footerButtons = footer.querySelectorAll<HTMLElement>(
            '[data-slot="button"]',
        )

        expect(dialogBounds.height).toBeLessThanOrEqual(DESKTOP_HEIGHT - 32)
        expect(body.scrollHeight).toBeGreaterThan(body.clientHeight)
        expect(header.getBoundingClientRect().top).toBeGreaterThanOrEqual(
            dialogBounds.top,
        )
        expect(footer.getBoundingClientRect().bottom).toBeLessThanOrEqual(
            dialogBounds.bottom,
        )
        expect(getComputedStyle(footer).flexDirection).toBe('row')
        expect(footerButtons).toHaveLength(2)
        expect(footerButtons[0]!.getBoundingClientRect().width).toBeLessThan(
            footer.clientWidth / 2,
        )
        expect(footerButtons[1]!.getBoundingClientRect().width).toBeLessThan(
            footer.clientWidth / 2,
        )
        expect(footerButtons[0]!.getBoundingClientRect().top).toBeCloseTo(
            footerButtons[1]!.getBoundingClientRect().top,
            0,
        )

        body.scrollTop = body.scrollHeight
        await waitForAnimationFrame()

        expect(body.scrollTop).toBeGreaterThan(0)
        expect(header.getBoundingClientRect().top).toBeCloseTo(headerTop, 0)
        expect(footer.getBoundingClientRect().top).toBeCloseTo(footerTop, 0)

        await userEvent.keyboard('{Escape}')
        await expect.element(dialog).not.toBeInTheDocument()
        await screen.unmount()
    })

    it('prevents dialog dismissal while locked', async () => {
        await page.viewport(DESKTOP_WIDTH, DESKTOP_HEIGHT)
        const screen = await render(UiFoundationsTestHarness, {
            props: { mode: 'dialog' },
        })

        await screen.getByRole('button', { name: 'Open dialog' }).click()
        await screen.getByRole('button', { name: 'Lock dialog' }).click()

        const dialog = screen.getByRole('dialog', { name: 'Edit record' })
        await expect.element(dialog).toHaveAttribute('aria-busy', 'true')
        await expect
            .element(screen.getByRole('button', { name: 'Close' }))
            .not.toBeInTheDocument()

        await userEvent.keyboard('{Escape}')
        await expect.element(dialog).toBeVisible()

        await screen.getByRole('button', { name: 'Unlock dialog' }).click()
        await screen.getByRole('button', { name: 'Close' }).click()
        await expect.element(dialog).not.toBeInTheDocument()
        await screen.unmount()
    })

    it('focuses the requested dialog field without opening field help', async () => {
        await page.viewport(DESKTOP_WIDTH, DESKTOP_HEIGHT)
        const screen = await render(UiFoundationsTestHarness, {
            props: { mode: 'dialog' },
        })
        const opener = screen.getByRole('button', { name: 'Open dialog' })

        await opener.click()

        const primaryInput = screen.getByLabelText('Primary value', {
            exact: true,
        })
        await expect
            .poll(() => document.activeElement)
            .toBe(primaryInput.element())
        expect(
            document.querySelector('[data-slot="tooltip-content"]'),
        ).toBeNull()
        expect(
            document.querySelector('[data-slot="popover-content"]'),
        ).toBeNull()

        await userEvent.keyboard('{Escape}')
        await expect.element(opener).toHaveFocus()
        await screen.unmount()
    })

    it('preserves default dialog autofocus when no usable target resolves', async () => {
        await page.viewport(DESKTOP_WIDTH, DESKTOP_HEIGHT)
        const screen = await render(UiFoundationsTestHarness, {
            props: { dialogInitialFocus: 'default', mode: 'dialog' },
        })

        for (const dialogInitialFocus of [
            'default',
            'disconnected',
            'unfocusable',
        ] as const) {
            await screen.rerender({ dialogInitialFocus, mode: 'dialog' })
            await screen.getByRole('button', { name: 'Open dialog' }).click()
            const defaultAction = screen.getByRole('button', {
                name: 'Default dialog action',
            })

            await expect
                .poll(() => document.activeElement)
                .toBe(defaultAction.element())

            await userEvent.keyboard('{Escape}')
            await expect
                .element(screen.getByRole('dialog', { name: 'Edit record' }))
                .not.toBeInTheDocument()
        }

        await screen.unmount()
    })

    it('renders field requirement states and interactive help', async () => {
        await page.viewport(DESKTOP_WIDTH, DESKTOP_HEIGHT)
        const screen = await render(UiFoundationsTestHarness, {
            props: { mode: 'field' },
        })
        const help = screen.getByRole('button', { name: 'Email help' })
        const defaultLabel = getFieldLabel('display-name')
        const requiredLabel = getFieldLabel('password')
        const optionalLabel = getFieldLabel('email')
        const conflictingLabel = getFieldLabel('recovery-email')

        expect(defaultLabel.textContent).not.toContain('Optional')
        expect(defaultLabel.textContent).not.toContain('(required)')
        expect(requiredLabel.textContent).toContain('*')
        expect(requiredLabel.textContent).toContain('(required)')
        expect(optionalLabel.textContent).toContain('Optional')
        expect(optionalLabel.textContent).not.toContain('(required)')
        expect(conflictingLabel.textContent).toContain('*')
        expect(conflictingLabel.textContent).toContain('(required)')
        expect(conflictingLabel.textContent).not.toContain('Optional')
        expect(document.getElementById('display-name')).not.toHaveAttribute(
            'required',
        )
        await expect
            .element(help)
            .toHaveAttribute('aria-describedby', 'email-help')
        expect(document.getElementById('email-help')).not.toBeNull()

        await userEvent.hover(help)
        const tooltip = screen.getByRole('tooltip')
        await expect.element(tooltip).toBeVisible()
        await userEvent.unhover(help)
        await expect.element(tooltip).not.toBeInTheDocument()

        await help.click()
        const popover = screen.getByRole('dialog', { name: 'Email help' })
        await expect.element(popover).toBeVisible()

        await userEvent.keyboard('{Escape}')
        await expect.element(popover).not.toBeInTheDocument()
        await screen.unmount()
    })

    it('shows focused field help and dismisses it with Escape', async () => {
        await page.viewport(DESKTOP_WIDTH, DESKTOP_HEIGHT)
        const screen = await render(UiFoundationsTestHarness, {
            props: { mode: 'field' },
        })
        const help = screen.getByRole('button', { name: 'Email help' })

        help.element().focus()
        const tooltip = screen.getByRole('tooltip')
        await expect.element(tooltip).toBeVisible()

        await userEvent.keyboard('{Escape}')
        await expect.element(tooltip).not.toBeInTheDocument()
        await screen.unmount()
    })

    it('fills the mobile viewport width with the drawer', async () => {
        await page.viewport(MOBILE_WIDTH, MOBILE_HEIGHT)
        const screen = await render(UiFoundationsTestHarness, {
            props: { drawerSize: 'standard', mode: 'drawer' },
        })

        await screen.getByRole('button', { name: 'Open drawer' }).click()

        const drawer = screen.getByRole('dialog', { name: 'Record details' })
        const drawerElement = drawer.element()
        const overlayElement = getSlot(document, 'sheet-overlay')
        const entered = screen.getByLabelText('Drawer entered')

        await expect.element(entered).toHaveTextContent('no')
        expectVegaSheetMotion(drawerElement, overlayElement, 'enter')
        await expect.poll(() => entered.element().textContent).toContain('yes')
        await expect
            .poll(() => drawerElement.getBoundingClientRect().width)
            .toBeCloseTo(window.innerWidth, 0)
        await expect
            .poll(() => drawerElement.getBoundingClientRect().right)
            .toBeCloseTo(window.innerWidth, 0)

        await userEvent.keyboard('{Escape}')
        expectVegaSheetMotion(drawerElement, overlayElement, 'exit')
        await expect.element(drawer).not.toBeInTheDocument()
        await screen.unmount()
    })

    it('owns standard scrolling and delegates workspace scrolling', async () => {
        await page.viewport(DESKTOP_WIDTH, DESKTOP_HEIGHT)
        const screen = await render(UiFoundationsTestHarness, {
            props: { drawerSize: 'standard', mode: 'drawer' },
        })

        await screen.getByRole('button', { name: 'Open drawer' }).click()
        const standardDrawer = screen.getByRole('dialog', {
            name: 'Record details',
        })
        const standardDrawerElement = standardDrawer.element()
        const standardHeader = getSlot(
            standardDrawerElement,
            'drawer-shell-header',
        )
        const standardBody = getSlot(standardDrawerElement, 'drawer-shell-body')
        const standardActions = getSlot(
            standardDrawerElement,
            'drawer-shell-actions',
        )
        const standardHeaderTop = standardHeader.getBoundingClientRect().top
        const standardActionsTop = standardActions.getBoundingClientRect().top

        expect(standardDrawerElement.getBoundingClientRect().width).toBeCloseTo(
            448,
            0,
        )
        expect(getComputedStyle(standardBody).overflowY).toBe('auto')
        expect(getComputedStyle(standardBody).paddingTop).toBe('24px')
        expect(standardBody.scrollHeight).toBeGreaterThan(
            standardBody.clientHeight,
        )

        standardBody.scrollTop = standardBody.scrollHeight
        await waitForAnimationFrame()

        expect(standardBody.scrollTop).toBeGreaterThan(0)
        expect(standardHeader.getBoundingClientRect().top).toBeCloseTo(
            standardHeaderTop,
            0,
        )
        expect(standardActions.getBoundingClientRect().top).toBeCloseTo(
            standardActionsTop,
            0,
        )

        await userEvent.keyboard('{Escape}')
        await expect.element(standardDrawer).not.toBeInTheDocument()
        await screen.rerender({ drawerSize: 'workspace', mode: 'drawer' })
        await screen.getByRole('button', { name: 'Open drawer' }).click()

        const workspaceDrawer = screen.getByRole('dialog', {
            name: 'Record details',
        })
        const drawerElement = workspaceDrawer.element()
        const header = getSlot(drawerElement, 'drawer-shell-header')
        const body = getSlot(drawerElement, 'drawer-shell-body')
        const actions = getSlot(drawerElement, 'drawer-shell-actions')
        const workspace = getSlot(body, 'drawer-workspace')
        const summary = getSlot(workspace, 'drawer-workspace-summary')
        const tabList = getSlot(workspace, 'tabs-list')
        const tabContent = getActiveWorkspaceContent(workspace)
        const headerTop = header.getBoundingClientRect().top
        const actionsTop = actions.getBoundingClientRect().top
        const tabListTop = tabList.getBoundingClientRect().top

        expect(drawerElement.getBoundingClientRect().width).toBeCloseTo(
            DESKTOP_WIDTH * 0.94,
            0,
        )
        expect(getComputedStyle(body).overflowY).toBe('hidden')
        expect(getComputedStyle(body).paddingTop).toBe('0px')
        expect(body.scrollHeight).toBe(body.clientHeight)
        expect(summary.getBoundingClientRect().width).toBeCloseTo(288, 0)
        expect(summary.scrollHeight).toBeGreaterThan(summary.clientHeight)
        expect(tabContent.scrollHeight).toBeGreaterThan(tabContent.clientHeight)
        expect(getComputedStyle(tabList).overflowX).toBe('auto')

        body.scrollTop = body.scrollHeight
        summary.scrollTop = summary.scrollHeight
        await waitForAnimationFrame()
        const summaryScrollTop = summary.scrollTop

        expect(body.scrollTop).toBe(0)
        expect(summaryScrollTop).toBeGreaterThan(0)
        expect(tabContent.scrollTop).toBe(0)
        expect(header.getBoundingClientRect().top).toBeCloseTo(headerTop, 0)
        expect(actions.getBoundingClientRect().top).toBeCloseTo(actionsTop, 0)
        expect(tabList.getBoundingClientRect().top).toBeCloseTo(tabListTop, 0)

        tabContent.scrollTop = tabContent.scrollHeight
        await waitForAnimationFrame()

        expect(tabContent.scrollTop).toBeGreaterThan(0)
        expect(summary.scrollTop).toBe(summaryScrollTop)
        expect(header.getBoundingClientRect().top).toBeCloseTo(headerTop, 0)
        expect(actions.getBoundingClientRect().top).toBeCloseTo(actionsTop, 0)
        expect(tabList.getBoundingClientRect().top).toBeCloseTo(tabListTop, 0)

        await userEvent.keyboard('{Escape}')
        await expect.element(workspaceDrawer).not.toBeInTheDocument()
        await screen.unmount()
    })

    it('truncates a long drawer title without shrinking header actions', async () => {
        await page.viewport(DESKTOP_WIDTH, DESKTOP_HEIGHT)
        const screen = await render(UiFoundationsTestHarness, {
            props: {
                drawerSize: 'standard',
                longDrawerTitle: true,
                mode: 'drawer',
            },
        })

        await screen.getByRole('button', { name: 'Open drawer' }).click()
        const drawer = screen.getByRole('dialog', {
            name: /Record details with a title/,
        })
        const drawerElement = drawer.element()
        const title = getSlot(drawerElement, 'sheet-title')
        const headerActions = getSlot(
            drawerElement,
            'drawer-shell-header-actions',
        )
        const headerAction = screen
            .getByRole('button', { name: 'Header action' })
            .element()
        const titleBounds = title.getBoundingClientRect()
        const actionBounds = headerAction.getBoundingClientRect()

        expect(getComputedStyle(title).textOverflow).toBe('ellipsis')
        expect(title.scrollWidth).toBeGreaterThan(title.clientWidth)
        expect(getComputedStyle(headerActions).flexShrink).toBe('0')
        expect(actionBounds.width).toBeGreaterThan(80)
        expect(titleBounds.right).toBeLessThanOrEqual(actionBounds.left)

        await userEvent.keyboard('{Escape}')
        await expect.element(drawer).not.toBeInTheDocument()
        await screen.unmount()
    })

    it('guards locked drawer dismissal', async () => {
        await page.viewport(DESKTOP_WIDTH, DESKTOP_HEIGHT)
        const screen = await render(UiFoundationsTestHarness, {
            props: { mode: 'drawer' },
        })

        await screen.getByRole('button', { name: 'Open drawer' }).click()
        await screen.getByRole('button', { name: 'Lock drawer' }).click()

        const drawer = screen.getByRole('dialog', { name: 'Record details' })
        await userEvent.keyboard('{Escape}')
        await expect.element(drawer).toBeVisible()

        await screen.getByRole('button', { name: 'Unlock drawer' }).click()
        await userEvent.keyboard('{Escape}')
        await expect.element(drawer).not.toBeInTheDocument()
        await screen.unmount()
    })

    it('uses one mobile workspace scroller without nested vertical scrolling', async () => {
        await page.viewport(MOBILE_WIDTH, MOBILE_HEIGHT)
        const screen = await render(UiFoundationsTestHarness, {
            props: { mode: 'workspace' },
        })
        const workspace = getSlot(document, 'drawer-workspace')
        const summary = getSlot(workspace, 'drawer-workspace-summary')
        const tabList = getSlot(workspace, 'tabs-list')
        const tabContent = getActiveWorkspaceContent(workspace)

        expect(getComputedStyle(workspace).overflowY).toBe('auto')
        expect(workspace.scrollHeight).toBeGreaterThan(workspace.clientHeight)
        expect(summary.scrollHeight).toBe(summary.clientHeight)
        expect(tabContent.scrollHeight).toBe(tabContent.clientHeight)
        expect(getComputedStyle(tabList).overflowX).toBe('auto')

        summary.scrollTop = summary.scrollHeight
        tabContent.scrollTop = tabContent.scrollHeight
        workspace.scrollTop = workspace.scrollHeight
        await waitForAnimationFrame()

        expect(workspace.scrollTop).toBeGreaterThan(0)
        expect(summary.scrollTop).toBe(0)
        expect(tabContent.scrollTop).toBe(0)
        await screen.unmount()
    })

    it('preserves workspace tab state and record reset behavior', async () => {
        await page.viewport(DESKTOP_WIDTH, DESKTOP_HEIGHT)
        const screen = await render(UiFoundationsTestHarness, {
            props: { mode: 'workspace' },
        })
        const activityTab = screen.getByRole('tab', { name: /Activity/ })
        const overviewTab = screen.getByRole('tab', { name: /Overview/ })
        await expect.element(screen.getByLabelText('2 items')).toBeVisible()
        await expect.element(screen.getByLabelText('4 items')).toBeVisible()
        await expect
            .element(overviewTab)
            .toHaveAttribute('data-state', 'active')
        expect(getComputedStyle(overviewTab.element(), '::after').opacity).toBe(
            '1',
        )

        activityTab.element().focus()
        await userEvent.keyboard('{Enter}')
        await expect
            .element(screen.getByLabelText('Active workspace tab'))
            .toHaveTextContent('activity')
        await expect
            .element(activityTab)
            .toHaveAttribute('data-state', 'active')
        await expect
            .poll(
                () =>
                    getComputedStyle(activityTab.element(), '::after').opacity,
            )
            .toBe('1')
        await expect
            .poll(
                () =>
                    getComputedStyle(overviewTab.element(), '::after').opacity,
            )
            .toBe('0')
        expect(activityTab.element()).toBe(document.activeElement)
        expect(activityTab.element().className).toContain(
            'focus-visible:ring-[3px]',
        )

        await userEvent.keyboard('{ArrowLeft}')
        await expect
            .element(screen.getByLabelText('Active workspace tab'))
            .toHaveTextContent('overview')

        await activityTab.click()
        await screen.getByRole('button', { name: 'Change record' }).click()
        await expect
            .element(screen.getByLabelText('Active workspace tab'))
            .toHaveTextContent('overview')
        await screen.unmount()
    })
})

function getActiveWorkspaceContent(root: ParentNode) {
    const content = root.querySelector<HTMLElement>(
        '[data-slot="drawer-workspace-content"][data-state="active"]',
    )
    expect(content).not.toBeNull()
    return content!
}

function getFieldLabel(htmlFor: string) {
    const label = document.querySelector<HTMLLabelElement>(
        `[data-slot="form-field-label"] label[for="${htmlFor}"]`,
    )
    expect(label).not.toBeNull()

    const fieldLabel = label!.closest<HTMLElement>(
        '[data-slot="form-field-label"]',
    )
    expect(fieldLabel).not.toBeNull()
    return fieldLabel!
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

// =============================================================================
// END OF BASE TEMPLATE TESTS - FORK-SPECIFIC TESTS MUST BE ADDED BELOW
// =============================================================================
