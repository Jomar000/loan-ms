type TSessionBoundaryOptions = {
    broadcast?: () => void
    cancelTenantQueries: () => Promise<void>
    clearLocalSession: () => void
    clearTenantCaches: () => void
    closeWebSockets: () => void
    navigate: () => void
}

export async function executeSessionBoundary({
    broadcast,
    cancelTenantQueries,
    clearLocalSession,
    clearTenantCaches,
    closeWebSockets,
    navigate,
}: TSessionBoundaryOptions) {
    const runBestEffort = (operation: () => void) => {
        try {
            operation()
        } catch {
            // Authentication boundary navigation must continue.
        }
    }

    try {
        runBestEffort(clearLocalSession)
        runBestEffort(closeWebSockets)

        try {
            await cancelTenantQueries()
        } catch {
            // Cached requests must not prevent authentication boundary navigation.
        }

        runBestEffort(clearTenantCaches)
        if (broadcast) runBestEffort(broadcast)
    } finally {
        navigate()
    }
}
