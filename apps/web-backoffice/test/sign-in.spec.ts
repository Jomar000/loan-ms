import { expect, test } from '@playwright/test'

test('renders the sign-in page', async ({ baseURL, page }) => {
    const apiHeaders = {
        'access-control-allow-credentials': 'true',
        'access-control-allow-origin': new URL(baseURL!).origin,
        'content-type': 'application/json',
    }

    await page.route('**/api/heartbeat', (route) =>
        route.fulfill({ body: '{}', headers: apiHeaders, status: 200 }),
    )
    await page.route('**/api/auth/session', (route) =>
        route.fulfill({ body: '{}', headers: apiHeaders, status: 401 }),
    )

    const response = await page.goto('/sign-in')

    expect(response?.ok()).toBe(true)
    await expect(
        page.getByRole('heading', { name: 'Welcome back' }),
    ).toBeVisible()
})

// =============================================================================
// END OF BASE TEMPLATE TESTS - FORK-SPECIFIC TESTS MUST BE ADDED BELOW
// =============================================================================
