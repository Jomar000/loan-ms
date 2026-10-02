export { shouldRedirectInvalidSession } from './routePolicy'

export type TSessionRefreshAction = 'apply' | 'invalidate' | 'retry'

export function getSessionRefreshAction(status: number): TSessionRefreshAction {
    if (status === 401 || status === 403) return 'invalidate'
    if (status < 200 || status >= 300) return 'retry'
    return 'apply'
}

type TSessionRefreshResponse = {
    status: number
    json: () => Promise<unknown>
}

export async function reconcileSessionRefresh({
    apply,
    invalidate,
    request,
    retry,
}: {
    apply: (data: unknown) => boolean
    invalidate: () => Promise<void> | void
    request: () => Promise<TSessionRefreshResponse>
    retry: () => void
}) {
    let response: TSessionRefreshResponse

    try {
        response = await request()
    } catch {
        retry()
        return
    }

    const action = getSessionRefreshAction(response.status)
    if (action === 'retry') {
        retry()
        return
    }
    if (action === 'invalidate') {
        await invalidate()
        return
    }

    try {
        const responseJson = await response.json()
        if (
            typeof responseJson !== 'object' ||
            responseJson === null ||
            !('success' in responseJson) ||
            responseJson.success !== true ||
            !('data' in responseJson) ||
            !apply(responseJson.data)
        ) {
            retry()
        }
    } catch {
        retry()
    }
}
