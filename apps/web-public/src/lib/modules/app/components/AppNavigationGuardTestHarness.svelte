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
        heartbeatFailed,
        heartbeatReady,
        phase,
        userRoles = [],
    }: {
        heartbeatFailed: boolean
        heartbeatReady: boolean
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
                email: 'member@example.test',
                expiresAt: Math.floor(Date.now() / 1000) + 3600,
                name: 'Member',
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
    {heartbeatFailed}
    {heartbeatReady}
>
    <div>Route content</div>
    <input aria-label="Route state" />
</AppNavigationGuard>
