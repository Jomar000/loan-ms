<script lang="ts">
    import QueryTestProviders from '$lib/components/testing/QueryTestProviders.fixture.svelte'
    import AppNavigationGuard from '$lib/modules/app/components/AppNavigationGuard.svelte'
    import { SessionProvider } from '$lib/states/session'
    import VerifyEmailPage from './VerifyEmailPage.svelte'
</script>

<QueryTestProviders>
    <SessionProvider>
        <AppNavigationGuard
            heartbeatFailed={false}
            heartbeatReady={true}
        >
            <VerifyEmailPage />
        </AppNavigationGuard>
    </SessionProvider>
</QueryTestProviders>
