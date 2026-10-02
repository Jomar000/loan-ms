<script lang="ts">
    import { page } from '$app/state'
    import { PUBLIC_NAME } from '$env/static/public'

    ///////////////////
    // 02. Constants //
    ///////////////////

    const statusMessages: Record<number, string> = {
        403: 'You do not have the necessary permissions to access this resource.',
        404: 'The page you are looking for could not be found.',
        500: 'The server could not complete your request. Please try again later.',
    }

    const fallbackMessage =
        'Something went wrong while processing your request.'

    /////////////////
    // 04. Derived //
    /////////////////

    const message = $derived.by(
        () => statusMessages[page.status] ?? fallbackMessage,
    )
</script>

<svelte:head>
    <title>Error {page.status} | {PUBLIC_NAME}</title>
</svelte:head>

<main class="flex min-h-svh flex-col items-center justify-center gap-4 p-6">
    <h1 class="text-6xl font-bold">{page.status}</h1>
    <p class="max-w-md text-center text-muted-foreground">{message}</p>
    <a
        class="text-sm font-medium underline underline-offset-4"
        href="/"
    >
        Return home
    </a>
</main>
