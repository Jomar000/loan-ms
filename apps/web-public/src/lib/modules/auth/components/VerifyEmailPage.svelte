<script lang="ts">
    import { Button } from '@hyperion/ui/components/button'
    import * as Card from '@hyperion/ui/components/card'
    import CircleCheckIcon from '@lucide/svelte/icons/circle-check'
    import CircleXIcon from '@lucide/svelte/icons/circle-x'
    import LoaderCircleIcon from '@lucide/svelte/icons/loader-circle'
    import { createMutation } from '@tanstack/svelte-query'
    import { onMount } from 'svelte'

    import { page } from '$app/state'
    import { PUBLIC_NAME } from '$env/static/public'
    import { authClient, heartbeatClient } from '$lib/clients'

    ///////////////////
    // 02. Constants //
    ///////////////////

    const token = page.url.searchParams.get('token')?.trim() ?? ''
    const fallbackErrorMessage =
        'Email verification failed. The token may be invalid or expired.'

    ///////////////////
    // 06. Mutations //
    ///////////////////

    const verificationMutation = createMutation(() => ({
        mutationKey: [
            'verifyEmail',
        ],
        mutationFn: async (verificationToken: string) => {
            const heartbeatResponse = await heartbeatClient.index.$get()
            if (!heartbeatResponse.ok) throw new Error('API unavailable.')

            const response = await authClient.verifyEmail.$post({
                json: { token: verificationToken },
            })
            const responseJson = await response.json()

            if (!responseJson.success) {
                throw new Error(responseJson.error.message)
            }
        },
    }))

    onMount(() => {
        if (token) verificationMutation.mutate(token)
    })

    /////////////////
    // 10. Helpers //
    /////////////////

    function getErrorMessage() {
        if (!token) {
            return 'Email verification failed. The verification token is missing.'
        }

        return verificationMutation.error instanceof Error
            ? verificationMutation.error.message
            : fallbackErrorMessage
    }
</script>

<svelte:head>
    <title>Email verification | {PUBLIC_NAME}</title>
</svelte:head>

<main class="flex min-h-svh items-center justify-center bg-muted p-6">
    <Card.Root class="w-full max-w-md">
        <Card.Header
            aria-busy={token !== '' &&
                !verificationMutation.isSuccess &&
                !verificationMutation.isError}
            aria-live="polite"
            class="items-center text-center"
        >
            {#if token && !verificationMutation.isSuccess && !verificationMutation.isError}
                <LoaderCircleIcon
                    aria-hidden="true"
                    class="size-12 animate-spin text-muted-foreground motion-reduce:animate-none"
                />
                <Card.Title><h1>Verifying your email</h1></Card.Title>
                <Card.Description>
                    Please wait while we verify your email address.
                </Card.Description>
            {:else if verificationMutation.isSuccess}
                <CircleCheckIcon
                    aria-hidden="true"
                    class="size-12 text-foreground"
                />
                <Card.Title><h1>Email verified</h1></Card.Title>
                <Card.Description>
                    Your email address has been successfully verified.
                </Card.Description>
            {:else}
                <CircleXIcon
                    aria-hidden="true"
                    class="size-12 text-destructive"
                />
                <Card.Title><h1>Email verification failed</h1></Card.Title>
                <Card.Description>{getErrorMessage()}</Card.Description>
            {/if}
        </Card.Header>
        {#if !token || verificationMutation.isSuccess || verificationMutation.isError}
            <Card.Footer>
                <Button
                    class="w-full"
                    href="/sign-in"
                >
                    Continue to sign-in
                </Button>
            </Card.Footer>
        {/if}
    </Card.Root>
</main>
