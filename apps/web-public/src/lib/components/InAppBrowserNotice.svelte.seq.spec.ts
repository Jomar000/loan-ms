import { InAppBrowserNotice } from '@loanms/ui/shared/in-app-browser-notice'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-svelte'

const dismissalKey = 'in-app-browser-notice-dismissed'
const androidMessengerUserAgent =
    'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro Build/AP1A.240405.002; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/124.0.0.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/458.0.0.40.109;]'
const genericIosWebViewUserAgent =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148'
const iosInstagramUserAgent =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 328.0.0.32.119'
const iosSafariUserAgent =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1'

function useUserAgent(userAgent: string): void {
    vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue(userAgent)
}

describe('InAppBrowserNotice', () => {
    beforeEach(() => {
        sessionStorage.removeItem(dismissalKey)
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('renders the detected app name and Android relaunch action', async () => {
        useUserAgent(androidMessengerUserAgent)

        const screen = await render(InAppBrowserNotice)
        const relaunchLink = screen.getByRole('link', {
            name: 'Open in browser',
        })

        await expect
            .element(screen.getByText(/Facebook Messenger/))
            .toBeVisible()
        await expect.element(relaunchLink).toBeVisible()
        expect(
            document
                .querySelector<HTMLAnchorElement>('a[href^="intent://"]')
                ?.getAttribute('href'),
        ).toMatch(/^intent:\/\//)
    })

    it('uses generic copy when the embedded app is unknown', async () => {
        useUserAgent(genericIosWebViewUserAgent)

        const screen = await render(InAppBrowserNotice)

        await expect
            .element(screen.getByRole('alert'))
            .toHaveTextContent(
                'Some features may not work correctly in this in-app browser.',
            )
        await expect
            .element(screen.getByRole('button', { name: 'Copy link' }))
            .toBeVisible()
    })

    it('copies the current link and announces success on iOS', async () => {
        useUserAgent(iosInstagramUserAgent)
        const writeText = vi
            .spyOn(window.navigator.clipboard, 'writeText')
            .mockResolvedValue()

        const screen = await render(InAppBrowserNotice)

        await expect.element(screen.getByText(/Instagram/)).toBeVisible()
        await screen.getByRole('button', { name: 'Copy link' }).click()
        await expect
            .element(screen.getByRole('button', { name: 'Link copied' }))
            .toBeVisible()
        await expect
            .element(
                screen.getByText(
                    'Link copied. Paste it into Safari or Chrome.',
                ),
            )
            .toBeVisible()
        expect(writeText).toHaveBeenCalledWith(window.location.href)
    })

    it('keeps message text left aligned and dismissal out of the content flow', async () => {
        useUserAgent(iosInstagramUserAgent)

        const screen = await render(InAppBrowserNotice)
        const alert = screen.getByRole('alert').element()
        const dismissButton = screen.getByRole('button', {
            name: 'Dismiss browser recommendation',
        })
        const title = alert.querySelector<HTMLElement>(
            '[data-slot="alert-title"]',
        )
        const description = alert.querySelector<HTMLElement>(
            '[data-slot="alert-description"]',
        )

        await expect.element(dismissButton).toBeVisible()
        expect(alert.classList).not.toContain('text-center')
        expect(title?.parentElement?.classList).not.toContain('justify-center')
        expect(title?.parentElement?.classList).toContain('text-base')
        expect(description?.classList).toContain('w-full')
        expect(description?.classList).toContain('max-w-none')
        expect(description?.classList).toContain('text-wrap')
        expect(description?.classList).not.toContain('text-balance')
        expect(dismissButton.element().classList).toContain('absolute')
        expect(document.querySelector('[data-slot="alert-action"]')).toBeNull()
    })

    it('announces a copy failure accessibly', async () => {
        useUserAgent(iosInstagramUserAgent)
        vi.spyOn(window.navigator.clipboard, 'writeText').mockRejectedValue(
            new Error('Clipboard unavailable'),
        )

        const screen = await render(InAppBrowserNotice)

        await screen.getByRole('button', { name: 'Copy link' }).click()
        await expect
            .element(
                screen.getByText(
                    'Could not copy the link. Use your app menu instead.',
                ),
            )
            .toBeVisible()
        expect(document.querySelector('[aria-live="polite"]')).not.toBeNull()
    })

    it('stays hidden in a normal browser', async () => {
        useUserAgent(iosSafariUserAgent)

        const screen = await render(InAppBrowserNotice)

        await expect.element(screen.getByRole('alert')).not.toBeInTheDocument()
    })

    it('persists dismissal for the current browser session', async () => {
        useUserAgent(androidMessengerUserAgent)

        const screen = await render(InAppBrowserNotice)
        await screen
            .getByRole('button', { name: 'Dismiss browser recommendation' })
            .click()

        expect(sessionStorage.getItem(dismissalKey)).toBe('true')
        await expect.element(screen.getByRole('alert')).not.toBeInTheDocument()

        await screen.unmount()
        const remountedScreen = await render(InAppBrowserNotice)

        await expect
            .element(remountedScreen.getByRole('alert'))
            .not.toBeInTheDocument()
    })
})

// =============================================================================
// END OF BASE TEMPLATE TESTS - FORK-SPECIFIC TESTS MUST BE ADDED BELOW
// =============================================================================
