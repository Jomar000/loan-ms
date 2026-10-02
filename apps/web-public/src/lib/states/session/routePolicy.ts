export type TRouteSessionPolicy = 'protected' | 'entry' | 'independent'

export function getRouteSessionPolicy(pathname: string): TRouteSessionPolicy {
    if (pathname === '/app' || pathname.startsWith('/app/')) {
        return 'protected'
    }

    if (pathname === '/' || pathname === '/sign-in') {
        return 'entry'
    }

    return 'independent'
}

export function requiresSessionResolution(pathname: string) {
    return getRouteSessionPolicy(pathname) !== 'independent'
}

export function shouldRedirectInvalidSession(pathname: string) {
    return getRouteSessionPolicy(pathname) === 'protected'
}
