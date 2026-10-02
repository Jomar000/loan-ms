import { expect, test } from '@playwright/test'

const messengerUserAgent =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/MessengerForiOS;FBAV/458.0.0.43.105;]'
const inAppBrowserDetectionEnabled =
    process.env.FEATURE_IN_APP_BROWSER_DETECTION === '1'

test.beforeEach(async ({ page }) => {
    await page.route('**/heartbeat**', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ success: true, data: null }),
        })
    })

    await page.route('**/api/auth/session**', async (route) => {
        await route.fulfill({
            status: 401,
            contentType: 'application/json',
            body: JSON.stringify({ success: false }),
        })
    })
})

test.describe('embedded browser', () => {
    test.use({ userAgent: messengerUserAgent })

    test('shows the root notice only when opted in', async ({ page }) => {
        await page.goto('/sign-in')

        const notice = page
            .getByRole('alert')
            .filter({ hasText: 'For the best experience' })

        if (!inAppBrowserDetectionEnabled) {
            await expect(notice).toHaveCount(0)
            return
        }

        await expect(notice).toBeVisible()
        await expect(notice).toContainText('Facebook Messenger')
        await expect(
            notice.getByRole('button', { name: 'Copy link' }),
        ).toBeVisible()
    })
})

test('keeps the browser notice hidden for a normal user agent', async ({
    page,
}) => {
    await page.goto('/sign-in')

    await expect(
        page.getByRole('alert').filter({ hasText: 'For the best experience' }),
    ).toHaveCount(0)
})

// =============================================================================
// END OF BASE TEMPLATE TESTS - FORK-SPECIFIC TESTS MUST BE ADDED BELOW
// =============================================================================
