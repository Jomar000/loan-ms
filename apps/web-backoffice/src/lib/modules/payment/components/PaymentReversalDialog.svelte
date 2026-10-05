<script lang="ts">
    import { Button } from '@loanms/ui/components/button'
    import * as Dialog from '@loanms/ui/components/dialog'
    import * as Field from '@loanms/ui/components/field'
    import { Spinner } from '@loanms/ui/components/spinner'
    import { Textarea } from '@loanms/ui/components/textarea'
    import { toast } from 'svelte-sonner'

    import { useSessionContext } from '$lib/states/session'
    import { getErrorMessage } from '$lib/utilities/helpers'
    import { createPaymentReverseMutation } from '../queries'

    ////////////////////
    // 01. Properties //
    ////////////////////

    let {
        onReversed,
        open = $bindable(false),
        paymentPublicId,
        paymentNumber,
    }: {
        onReversed?: () => void | Promise<void>
        open?: boolean
        paymentNumber: string
        paymentPublicId: string
    } = $props()

    ///////////////////
    // 02. Constants //
    ///////////////////

    const session = useSessionContext()

    ///////////////
    // 03. State //
    ///////////////

    let isReversing = $state(false)
    let reason = $state('')

    ///////////////////
    // 06. Mutations //
    ///////////////////

    const reverseMutation = createPaymentReverseMutation({
        get organizationSlug() {
            return session.data.organizationSlug
        },
    })

    //////////////////
    // 09. Handlers //
    //////////////////

    function handleOpenChange(nextOpen: boolean) {
        if (isReversing) return
        open = nextOpen
        if (!nextOpen) reason = ''
    }

    async function handleReverse(event: SubmitEvent) {
        event.preventDefault()
        if (isReversing || reason.trim().length < 3) return

        isReversing = true
        try {
            await reverseMutation.mutateAsync({
                publicId: paymentPublicId,
                reason: reason.trim(),
            })
            toast.success(
                'Payment reversed and the cash-out correction was recorded.',
            )
            handleOpenChange(false)
            await onReversed?.()
        } catch (error) {
            toast.error(
                getErrorMessage(error, 'Could not reverse the payment.'),
            )
        } finally {
            isReversing = false
        }
    }
</script>

<Dialog.Root bind:open={() => open, handleOpenChange}>
    <Dialog.Content>
        <form
            class="grid gap-5"
            onsubmit={handleReverse}
        >
            <Dialog.Header>
                <Dialog.Title>Reverse payment?</Dialog.Title>
                <Dialog.Description>
                    {paymentNumber} remains in the record with a reversal and an audited
                    cash-out correction.
                </Dialog.Description>
            </Dialog.Header>
            <Field.Field>
                <Field.Label for="payment-reversal-reason"
                    >Reversal reason</Field.Label
                >
                <Textarea
                    id="payment-reversal-reason"
                    bind:value={reason}
                    disabled={isReversing}
                    maxlength={500}
                    minlength={3}
                    required
                />
                <Field.Description
                    >Required for the financial audit record.</Field.Description
                >
            </Field.Field>
            <Dialog.Footer>
                <Button
                    disabled={isReversing}
                    onclick={() => handleOpenChange(false)}
                    type="button"
                    variant="outline">Cancel</Button
                >
                <Button
                    disabled={isReversing || reason.trim().length < 3}
                    type="submit"
                    variant="destructive"
                    >{#if isReversing}<Spinner
                            data-icon="inline-start"
                        />{/if}Reverse payment</Button
                >
            </Dialog.Footer>
        </form>
    </Dialog.Content>
</Dialog.Root>
