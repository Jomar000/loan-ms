<script lang="ts">
    import GalleryVerticalEndIcon from '@lucide/svelte/icons/gallery-vertical-end'

    import { PUBLIC_NAME } from '$env/static/public'
    import CaptchaModal from '$lib/components/modal/CaptchaModal.svelte'
    import SignInForm from '$lib/modules/auth/components/SignInForm.svelte'

    ///////////////
    // 03. State //
    ///////////////

    let showCaptchaModal = $state(false)
</script>

<svelte:head>
    <title>Sign-in | {PUBLIC_NAME}</title>
</svelte:head>

<main
    class="flex min-h-svh flex-col items-center justify-center gap-3 overflow-x-hidden overflow-y-auto bg-zinc-50/80 p-3 md:p-4 dark:bg-[#171717]"
>
    <div class="flex w-full max-w-sm flex-col gap-3">
        <div class="flex items-center gap-2 self-center font-medium">
            <div
                class="flex size-6 items-center justify-center rounded-md bg-primary text-primary-foreground"
            >
                <GalleryVerticalEndIcon
                    aria-hidden="true"
                    class="size-4"
                />
            </div>
            {PUBLIC_NAME}
        </div>
        <SignInForm bind:showCaptchaModal />
    </div>
</main>
<CaptchaModal open={showCaptchaModal} />
