export type RouteSession = {
    isAuthenticated: boolean
    userRoles: readonly string[]
}

export type AppRole =
    | 'admin'
    | 'auditor'
    | 'cashier'
    | 'collector'
    | 'member'
    | 'owner'
    | 'viewer'

const OPERATIONAL_ROLE_ROUTE_PATTERNS: Partial<
    Record<AppRole, readonly RegExp[]>
> = {
    auditor: [
        /^\/app\/auditor\/collections\/?$/,
        /^\/app\/auditor\/loans(?:\/(?!new(?:\/|$))[^/]+)?\/?$/,
        /^\/app\/auditor\/overdue\/?$/,
        /^\/app\/auditor\/reports\/?$/,
    ],
    cashier: [/^\/app\/cashier\/loans(?:\/(?!new(?:\/|$))[^/]+)?\/?$/],
    collector: [/^\/app\/collector\/collections\/?$/],
    member: [/^\/app\/member\/dashboard\/?$/],
    viewer: [
        /^\/app\/viewer\/collections\/?$/,
        /^\/app\/viewer\/loans(?:\/(?!new(?:\/|$))[^/]+)?\/?$/,
        /^\/app\/viewer\/overdue\/?$/,
        /^\/app\/viewer\/reports\/?$/,
    ],
}

export class NavigationGeneration {
    #current = 0

    begin() {
        this.#current += 1
        return this.#current
    }

    isCurrent(generation: number) {
        return generation === this.#current
    }
}

export function getAuthenticatedDestination(userRoles: readonly string[]) {
    return userRoles.length === 1 ? getRoleDefaultRoute(userRoles[0]) : '/app'
}

export function getRoleDefaultRoute(role: string) {
    switch (role) {
        case 'cashier':
            return '/app/cashier/loans'
        case 'collector':
            return '/app/collector/collections'
        case 'auditor':
        case 'viewer':
            return `/app/${role}/reports`
        default:
            return `/app/${role}/dashboard`
    }
}

export function resolveCanonicalDestination(
    pathname: string,
    session: RouteSession,
    apiKeyEnabled: boolean,
    objectStorageEnabled: boolean,
    searchQuery = '',
) {
    const authenticatedDestination = getAuthenticatedDestination(
        session.userRoles,
    )

    if (pathname === '/' || pathname === '/sign-in') {
        if (session.isAuthenticated) {
            return authenticatedDestination
        }

        // Only append searchQuery when unauthenticated.
        return appendSearchQuery(
            pathname === '/' ? '/sign-in' : null,
            searchQuery,
        )
    }

    // Allow navigation outside protected /app routes with or without authentication.
    if (pathname !== '/app' && !pathname.startsWith('/app/')) return null

    // Unauthenticated sessions are redirected to /sign-in
    if (!session.isAuthenticated)
        return appendSearchQuery('/sign-in', searchQuery)

    // Role selection route
    // If user only has one role, automatically redirect to that role page.
    if (pathname === '/app') {
        return session.userRoles.length === 1 ? authenticatedDestination : null
    }

    // If a user navigated to a role page not on the authorized roles list,
    // just return the canonical destination.
    const requestedRole = pathname.split('/')[2]
    if (!session.userRoles.includes(requestedRole)) {
        return authenticatedDestination
    }

    if (!isRoleRouteAllowed(pathname, requestedRole)) {
        return getRoleDefaultRoute(requestedRole)
    }

    if (!isRouteFeatureEnabled(pathname, apiKeyEnabled, objectStorageEnabled)) {
        return getRoleDefaultRoute(requestedRole)
    }

    return null
}

function isRoleRouteAllowed(pathname: string, role: string) {
    const patterns = OPERATIONAL_ROLE_ROUTE_PATTERNS[role as AppRole]
    return patterns ? patterns.some((pattern) => pattern.test(pathname)) : true
}

export function isRouteFeatureEnabled(
    pathname: string,
    apiKeyEnabled: boolean,
    objectStorageEnabled: boolean,
) {
    return (
        (apiKeyEnabled || !isServicePrincipalRoute(pathname)) &&
        (objectStorageEnabled || !isObjectStorageRoute(pathname))
    )
}

function appendSearchQuery(destination: string | null, search: string) {
    return destination ? `${destination}${search}` : null
}

function isServicePrincipalRoute(pathname: string) {
    return /^\/app\/[^/]+\/service-principals(?:\/|$)/.test(pathname)
}

function isObjectStorageRoute(pathname: string) {
    return /^\/app\/[^/]+\/object-storage(?:\/|$)/.test(pathname)
}
