<script lang="ts">
    import { setSessionActionsContext } from '$lib/states/session/context.svelte'
    import SignInForm from './SignInForm.svelte'

    ///////////////
    // 03. State //
    ///////////////

    let showCaptchaModal = $state(false)

    /////////////////
    // 08. Effects //
    /////////////////

    setSessionActionsContext({
        signOut: async () => {},
        transitionSessionBoundary: async () => {},
    })
</script>

<SignInForm bind:showCaptchaModal />
