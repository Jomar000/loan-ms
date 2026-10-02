import { describe, expect, it } from 'vitest'

import {
    buildAndroidBrowserIntent,
    detectInAppBrowser,
} from '../../../../../packages/ui/src/shared/in-app-browser-notice/browser'

const androidMessengerUserAgent =
    'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro Build/AP1A.240405.002; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/124.0.0.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/458.0.0.40.109;]'
const genericIosWebViewUserAgent =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148'
const iosInstagramUserAgent =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 328.0.0.32.119'
const iosWhatsappUserAgent =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 WAiOS/24.7.75'
const iosSafariUserAgent =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1'
const androidChromeUserAgent =
    'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36'

describe('in-app browser detection', () => {
    it('identifies Android Messenger and creates a relaunch intent', () => {
        const result = detectInAppBrowser(
            androidMessengerUserAgent,
            'https://example.com/account?tab=profile#security',
        )

        expect(result).toEqual({
            appName: 'Facebook Messenger',
            intentHref:
                'intent://example.com/account?tab=profile#Intent;scheme=https;S.browser_fallback_url=https%3A%2F%2Fexample.com%2Faccount%3Ftab%3Dprofile%23security;end',
        })
    })

    it('identifies Instagram on iOS without an Android intent', () => {
        expect(
            detectInAppBrowser(
                iosInstagramUserAgent,
                'https://example.com/promotions',
            ),
        ).toEqual({ appName: 'Instagram', intentHref: null })
    })

    it('supports an unnamed embedded browser', () => {
        expect(
            detectInAppBrowser(
                genericIosWebViewUserAgent,
                'https://example.com/promotions',
            ),
        ).toEqual({ appName: undefined, intentHref: null })
    })

    it('identifies another supported embedded app', () => {
        expect(
            detectInAppBrowser(
                iosWhatsappUserAgent,
                'https://example.com/promotions',
            )?.appName,
        ).toBe('WhatsApp')
    })

    it('does not classify normal Safari as an in-app browser', () => {
        expect(
            detectInAppBrowser(
                iosSafariUserAgent,
                'https://example.com/promotions',
            ),
        ).toBeNull()
    })

    it('does not classify normal Chrome as an in-app browser', () => {
        expect(
            detectInAppBrowser(
                androidChromeUserAgent,
                'https://example.com/promotions',
            ),
        ).toBeNull()
    })

    it('rejects non-web locations when building Android intents', () => {
        expect(
            buildAndroidBrowserIntent('mailto:support@example.com'),
        ).toBeNull()
    })
})

// =============================================================================
// END OF BASE TEMPLATE TESTS - FORK-SPECIFIC TESTS MUST BE ADDED BELOW
// =============================================================================
