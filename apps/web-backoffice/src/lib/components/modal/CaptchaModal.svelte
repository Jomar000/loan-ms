<script lang="ts">
    import * as Dialog from '@hyperion/ui/components/dialog'

    import { PUBLIC_CF_TURNSTILE_SITE_KEY } from '$env/static/public'
    import { IMG_default } from '$lib/assets/image'

    ////////////////////
    // 01. Properties //
    ////////////////////

    let {
        open,
    }: {
        open: boolean
    } = $props()
</script>

<Dialog.Root {open}>
    <Dialog.Content
        class="max-h-[calc(100svh-2rem)] w-[calc(100vw-2rem)] max-w-sm overflow-y-auto"
        escapeKeydownBehavior="ignore"
        interactOutsideBehavior="ignore"
        showCloseButton={false}
    >
        <Dialog.Header class="text-center">
            <Dialog.Title>CAPTCHA Verification</Dialog.Title>
            <Dialog.Description>
                Hang on, we are checking a few things...
            </Dialog.Description>
        </Dialog.Header>
        <div
            class="relative mx-auto flex h-auto w-full flex-col gap-2 overflow-auto rounded-md md:gap-4"
        >
            <img
                src={IMG_default}
                class="mx-auto h-20"
                alt=""
            />
            <div
                id="captchaRenderArea"
                data-sitekey={PUBLIC_CF_TURNSTILE_SITE_KEY}
                class="flex justify-center"
            ></div>
        </div>
    </Dialog.Content>
</Dialog.Root>
