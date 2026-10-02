<script lang="ts">
    import * as Tooltip from '@hyperion/ui/components/tooltip'
    import {
        setSessionActionsContext,
        type SessionState,
    } from '$lib/states/session'
    import UserControls from './UserControls.svelte'

    ////////////////////
    // 01. Properties //
    ////////////////////

    let {
        session,
        signOut,
    }: {
        session: SessionState
        signOut: () => Promise<void>
    } = $props()

    /////////////////
    // 08. Effects //
    /////////////////

    setSessionActionsContext({
        signOut: () => signOut(),
        transitionSessionBoundary: async () => {},
    })
</script>

<Tooltip.Provider delayDuration={0}>
    <UserControls
        role="member"
        {session}
    />
</Tooltip.Provider>
