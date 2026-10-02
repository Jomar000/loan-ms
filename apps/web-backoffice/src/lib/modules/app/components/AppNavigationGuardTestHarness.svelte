<script lang="ts">
    import {
        SessionState,
        setSessionContext,
    } from '$lib/states/session/context.svelte'
    import AppNavigationGuard from './AppNavigationGuard.svelte'

    ////////////////////
    // 01. Properties //
    ////////////////////

    let {
        apiKeyEnabled = true,
        heartbeatFailed,
        heartbeatReady,
        objectStorageEnabled = true,
        phase,
        userRoles = [],
    }: {
        apiKeyEnabled?: boolean
        heartbeatFailed: boolean
        heartbeatReady: boolean
        objectStorageEnabled?: boolean
        phase:
            | 'checking'
            | 'authenticated'
            | 'unauthenticated'
            | 'unavailable'
            | 'transitioning'
        userRoles?: string[]
    } = $props()

    ///////////////////
    // 02. Constants //
    ///////////////////

    const session = new SessionState()

    /////////////////
    // 08. Effects //
    /////////////////

    setSessionContext(session)

    $effect(() => {
        if (phase === 'authenticated') {
            session.apply({
                avatar: '',
                email: 'owner@example.test',
                expiresAt: Math.floor(Date.now() / 1000) + 3600,
                name: 'Owner',
                organizationName: 'Test Organization',
                organizationSlug: 'test-organization',
                refreshAt: Math.floor(Date.now() / 1000) + 1800,
                userRoles,
            })
            return
        }

        session.setPhase(phase)
    })
</script>

<AppNavigationGuard
    {apiKeyEnabled}
    {heartbeatFailed}
    {heartbeatReady}
    {objectStorageEnabled}
>
    <div>Route content</div>
    <input aria-label="Route state" />
</AppNavigationGuard>
