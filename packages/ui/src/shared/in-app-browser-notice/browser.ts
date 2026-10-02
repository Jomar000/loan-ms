import InAppSpy from 'inapp-spy'

export const IN_APP_BROWSER_NOTICE_DISMISSED_KEY =
    'in-app-browser-notice-dismissed'

export type InAppBrowserEnvironment = {
    appName: string | undefined
    intentHref: string | null
}

let dismissedInMemory = false

export function buildAndroidBrowserIntent(currentHref: string): string | null {
    let currentUrl: URL

    try {
        currentUrl = new URL(currentHref)
    } catch {
        return null
    }

    if (
        ![
            'http:',
            'https:',
        ].includes(currentUrl.protocol)
    ) {
        return null
    }

    const directLocation = `${currentUrl.host}${currentUrl.pathname}${currentUrl.search}`
    const fallbackLocation = encodeURIComponent(currentUrl.href)

    return `intent://${directLocation}#Intent;scheme=https;S.browser_fallback_url=${fallbackLocation};end`
}

export function detectInAppBrowser(
    userAgent: string,
    currentHref: string,
): InAppBrowserEnvironment | null {
    const detection = InAppSpy({ ua: userAgent })

    if (!detection.isInApp) {
        return null
    }

    const isAndroid = /\bAndroid\b/i.test(userAgent)

    return {
        appName: detection.appName,
        intentHref: isAndroid ? buildAndroidBrowserIntent(currentHref) : null,
    }
}

export function isInAppBrowserNoticeDismissed(): boolean {
    if (dismissedInMemory) {
        return true
    }

    try {
        return (
            sessionStorage.getItem(IN_APP_BROWSER_NOTICE_DISMISSED_KEY) ===
            'true'
        )
    } catch {
        return dismissedInMemory
    }
}

export function dismissInAppBrowserNotice(): void {
    dismissedInMemory = true

    try {
        sessionStorage.setItem(IN_APP_BROWSER_NOTICE_DISMISSED_KEY, 'true')
    } catch {
        // The module-level value keeps dismissal working when storage is unavailable.
    }
}
