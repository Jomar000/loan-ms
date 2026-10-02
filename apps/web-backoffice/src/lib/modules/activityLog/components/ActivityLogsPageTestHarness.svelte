<script lang="ts">
    import QueryTestProviders from '$lib/components/testing/QueryTestProviders.fixture.svelte'
    import { SessionState, setSessionContext } from '$lib/states/session'
    import ActivityLogsPage from './ActivityLogsPage.svelte'

    ///////////////////
    // 02. Constants //
    ///////////////////

    const session = new SessionState()
    let organizationSlug = $state('alpha')

    setSessionContext(session)
    session.apply(createSessionData('alpha'))

    //////////////////
    // 09. Handlers //
    //////////////////

    function handleOrganizationSwitch() {
        organizationSlug = organizationSlug === 'alpha' ? 'beta' : 'alpha'
        session.apply(createSessionData(organizationSlug))
    }

    function handleStaleSummary() {
        session.apply(createSessionData('summary-stale'))
    }

    function handleSummaryError() {
        session.apply(createSessionData('summary-error'))
    }

    function handleZeroSummary() {
        session.apply(createSessionData('zero'))
    }

    /////////////////
    // 10. Helpers //
    /////////////////

    function createSessionData(organizationSlug: string) {
        const currentEpochSeconds = Math.floor(Date.now() / 1000)

        return {
            avatar: '',
            email: 'owner@example.com',
            expiresAt: currentEpochSeconds + 3600,
            name: 'Owner',
            organizationName: organizationSlug,
            organizationSlug,
            refreshAt: currentEpochSeconds + 1800,
            userRoles: [
                'owner',
            ],
        }
    }
</script>

<QueryTestProviders>
    <button
        onclick={handleOrganizationSwitch}
        type="button"
    >
        Switch organization
    </button>
    <button
        onclick={handleSummaryError}
        type="button">Show summary error</button
    >
    <button
        onclick={handleStaleSummary}
        type="button">Show stale summary</button
    >
    <button
        onclick={handleZeroSummary}
        type="button">Show zero summary</button
    >
    <ActivityLogsPage />
</QueryTestProviders>
