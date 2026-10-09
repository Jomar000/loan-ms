import { afterEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-svelte'
import { page } from 'vitest/browser'

import '../../../app.css'
import LoadingScreen from './LoadingScreen.svelte'

afterEach(() => {
    document.documentElement.classList.remove('dark')
})

describe.each([
    'light',
    'dark',
] as const)('loading screen in %s mode', (theme) => {
    it('loads the brand image and keeps the loading message within a mobile viewport', async () => {
        document.documentElement.classList.toggle('dark', theme === 'dark')
        await page.viewport(320, 568)
        const screen = await render(LoadingScreen)

        await expect
            .element(screen.getByRole('status', { name: 'Loading' }))
            .toBeVisible()
        await expect
            .element(screen.getByText('Loading your workspace…'))
            .toBeVisible()
        const image = screen.getByRole('img', {
            name: 'Loan Management System logo',
        })
        await expect.element(image).toBeVisible()
        await vi.waitFor(() => {
            expect(
                (image.element() as HTMLImageElement).naturalWidth,
            ).toBeGreaterThan(0)
        })
        const bounds = screen
            .getByText('Loan Management System', { exact: true })
            .element()
            .getBoundingClientRect()
        expect(bounds.left).toBeGreaterThanOrEqual(0)
        expect(bounds.right).toBeLessThanOrEqual(320)
    })
})
