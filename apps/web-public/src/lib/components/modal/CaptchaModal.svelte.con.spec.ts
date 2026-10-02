import { describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-svelte'
import { userEvent } from 'vitest/browser'

import CaptchaModal from './CaptchaModal.svelte'

vi.mock('$env/static/public', () => ({
    PUBLIC_CF_TURNSTILE_SITE_KEY: 'test-site-key',
}))

describe('CaptchaModal', () => {
    it('is accessible, viewport-safe, and locked against dismissal', async () => {
        const screen = await render(CaptchaModal, { props: { open: true } })
        const dialog = screen.getByRole('dialog', {
            name: 'CAPTCHA Verification',
        })

        await expect
            .element(dialog)
            .toHaveAccessibleDescription(
                'Hang on, we are checking a few things...',
            )
        expect(dialog.element().className).toContain('w-[calc(100vw-2rem)]')
        expect(dialog.element().className).toContain(
            'max-h-[calc(100svh-2rem)]',
        )
        expect(
            document.querySelectorAll('[data-slot="dialog-overlay"]'),
        ).toHaveLength(1)

        await userEvent.keyboard('{Escape}')
        await expect.element(dialog).toBeVisible()

        const overlay = document.querySelector<HTMLElement>(
            '[data-slot="dialog-overlay"]',
        )
        expect(overlay).not.toBeNull()
        overlay!.dispatchEvent(
            new PointerEvent('pointerdown', { bubbles: true }),
        )
        overlay!.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }))
        await expect.element(dialog).toBeVisible()
    })
})

// =============================================================================
// END OF BASE TEMPLATE TESTS - FORK-SPECIFIC TESTS MUST BE ADDED BELOW
// =============================================================================
