export type RouteSession = {
    isAuthenticated: boolean
    userRoles: readonly string[]
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
    return userRoles.length === 1 ? `/app/${userRoles[0]}/dashboard` : '/app'
}

export function resolveCanonicalDestination(
    pathname: string,
    session: RouteSession,
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
    return session.userRoles.includes(requestedRole)
        ? null
        : authenticatedDestination
}

function appendSearchQuery(destination: string | null, search: string) {
    return destination ? `${destination}${search}` : null
}
