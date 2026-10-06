<!-- https://shadcn-svelte.com/blocks/login#login-03 -->

<script lang="ts">
    import { Button } from '@loanms/ui/components/button'
    import * as Card from '@loanms/ui/components/card'
    import * as Field from '@loanms/ui/components/field'
    import { Input } from '@loanms/ui/components/input'
    import * as InputGroup from '@loanms/ui/components/input-group'
    import { Spinner } from '@loanms/ui/components/spinner'
    import { cn } from '@loanms/ui/utils'
    import { auth as authValidator } from '@loanms/validator/public'
    import EyeIcon from '@lucide/svelte/icons/eye'
    import EyeOffIcon from '@lucide/svelte/icons/eye-off'
    import { createForm } from '@tanstack/svelte-form'
    import { createMutation } from '@tanstack/svelte-query'
    import { tick } from 'svelte'

    import type { HTMLAttributes } from 'svelte/elements'

    import { page } from '$app/state'
    import { PUBLIC_CF_TURNSTILE_SITE_KEY } from '$env/static/public'
    import { useSessionActionsContext } from '$lib/states/session/context.svelte'
    import { signInWithCaptcha, type SignInPayload } from '../utilities/signIn'

    ////////////////////
    // 01. Properties //
    ////////////////////

    let {
        class: className,
        showCaptchaModal = $bindable(false), // eslint-disable-line no-useless-assignment
        ...restProps
    }: HTMLAttributes<HTMLDivElement> & {
        showCaptchaModal: boolean
    } = $props()

    ///////////////////
    // 02. Constants //
    ///////////////////

    const defaultOrganizationId =
        page.url.searchParams.get('orgSlug')?.trim() ?? ''
    const isOrganizationIdReadonly = defaultOrganizationId.length > 0
    const { transitionSessionBoundary } = useSessionActionsContext()

    ///////////////
    // 03. State //
    ///////////////

    let isSubmitting = $state(false)
    let showPassword = $state(false)

    ///////////////////
    // 06. Mutations //
    ///////////////////

    const authSignInMutation = createMutation(() => ({
        mutationKey: [
            'authSignIn',
        ],
        mutationFn: async (payload: SignInPayload) => {
            showCaptchaModal = true

            // Wait for DOM update
            await tick()

            return signInWithCaptcha({
                onCaptchaResolved: () => {
                    showCaptchaModal = false
                },
                onSuccess: () => transitionSessionBoundary('/app'),
                payload,
                siteKey: PUBLIC_CF_TURNSTILE_SITE_KEY,
            })
        },
    }))

    ///////////////
    // 07. Forms //
    ///////////////

    const {
        Field: AuthSignInFormField,
        Subscribe: AuthSignInFormSubscribe,
        handleSubmit: authSignInFormHandleSubmit,
    } = createForm(() => ({
        onSubmit: async ({ value }) => {
            await handleSignInSubmit(value)
        },
        validators: {
            // Make sure form is valid everytime it changes.
            // Error message does not matter, just return a truthy value.
            onChange: ({ value }) => {
                const { error } =
                    authValidator.signInInputSchema.safeParse(value)
                return error
            },
        },
        defaultValues: {
            organizationId: defaultOrganizationId,
            accountId: '',
            password: '',
        },
    }))

    //////////////////
    // 09. Handlers //
    //////////////////

    async function handleSignInSubmit(value: SignInPayload) {
        if (isSubmitting) return

        isSubmitting = true
        try {
            await authSignInMutation.mutateAsync(value)
        } catch {
            // The sign-in utility already displayed the retryable API error.
        } finally {
            isSubmitting = false
        }
    }

    function handleSignInFormSubmit(event: SubmitEvent) {
        event.preventDefault()
        event.stopPropagation()
        authSignInFormHandleSubmit()
    }

    function togglePasswordVisibility() {
        showPassword = !showPassword
    }
</script>

<div
    class={cn('flex flex-col gap-3', className)}
    {...restProps}
>
    <Card.Root
        class="rounded-xl border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-[#202020]"
    >
        <Card.Header class="text-center">
            <Card.Title><h1>Welcome back</h1></Card.Title>
            <Card.Description>Sign-in with your credentials</Card.Description>
        </Card.Header>
        <Card.Content>
            <form onsubmit={handleSignInFormSubmit}>
                <Field.Group>
                    <AuthSignInFormField
                        name="organizationId"
                        validators={{
                            onBlur: ({ value }) => {
                                const { error } =
                                    authValidator.signInInputSchema.shape.organizationId.safeParse(
                                        value,
                                    )
                                return error
                                    ? error.issues[0].message
                                    : undefined
                            },
                        }}
                    >
                        {#snippet children(field)}
                            {@const { isValid, errors } = field.state.meta}
                            <Field.Field data-invalid={!isValid}>
                                <Field.Label for="organizationId"
                                    >Organization ID</Field.Label
                                >
                                <Input
                                    aria-describedby={!isValid
                                        ? 'organizationId-error'
                                        : undefined}
                                    aria-invalid={!isValid}
                                    autocomplete="organization"
                                    id="organizationId"
                                    name={field.name}
                                    onblur={field.handleBlur}
                                    oninput={(
                                        e: Event & {
                                            currentTarget: HTMLInputElement
                                        },
                                    ) =>
                                        field.handleChange(
                                            e.currentTarget.value,
                                        )}
                                    placeholder="acme-inc"
                                    readonly={isOrganizationIdReadonly}
                                    required
                                    type="text"
                                    value={field.state.value}
                                    class={cn(
                                        isOrganizationIdReadonly &&
                                            'cursor-not-allowed',
                                    )}
                                />
                                {#if !isValid}
                                    <Field.Error id="organizationId-error"
                                        >{errors.join('\n')}</Field.Error
                                    >
                                {/if}
                            </Field.Field>
                        {/snippet}
                    </AuthSignInFormField>
                    <AuthSignInFormField
                        name="accountId"
                        validators={{
                            onBlur: ({ value }) => {
                                const { error } =
                                    authValidator.signInInputSchema.shape.accountId.safeParse(
                                        value,
                                    )
                                return error
                                    ? error.issues[0].message
                                    : undefined
                            },
                        }}
                    >
                        {#snippet children(field)}
                            {@const { isValid, errors } = field.state.meta}
                            <Field.Field data-invalid={!isValid}>
                                <Field.Label for="accountId"
                                    >Account ID</Field.Label
                                >
                                <Input
                                    aria-describedby={!isValid
                                        ? 'accountId-error'
                                        : undefined}
                                    aria-invalid={!isValid}
                                    autocomplete="username"
                                    id="accountId"
                                    name={field.name}
                                    onblur={field.handleBlur}
                                    oninput={(
                                        e: Event & {
                                            currentTarget: HTMLInputElement
                                        },
                                    ) =>
                                        field.handleChange(
                                            e.currentTarget.value,
                                        )}
                                    placeholder="john.doe@acme.inc"
                                    required
                                    type="text"
                                    value={field.state.value}
                                />
                                {#if !isValid}
                                    <Field.Error id="accountId-error"
                                        >{errors.join('\n')}</Field.Error
                                    >
                                {/if}
                            </Field.Field>
                        {/snippet}
                    </AuthSignInFormField>
                    <AuthSignInFormField
                        name="password"
                        validators={{
                            onBlur: ({ value }) => {
                                const { error } =
                                    authValidator.signInInputSchema.shape.password.safeParse(
                                        value,
                                    )
                                return error
                                    ? error.issues[0].message
                                    : undefined
                            },
                        }}
                    >
                        {#snippet children(field)}
                            {@const { isValid, errors } = field.state.meta}
                            <Field.Field data-invalid={!isValid}>
                                <div class="flex items-center">
                                    <Field.Label for="password"
                                        >Password</Field.Label
                                    >
                                    <span
                                        class="ml-auto text-sm text-muted-foreground"
                                    >
                                        Forgot your password?
                                    </span>
                                </div>
                                <InputGroup.Root>
                                    <InputGroup.Input
                                        aria-describedby={!isValid
                                            ? 'password-error'
                                            : undefined}
                                        aria-invalid={!isValid}
                                        autocomplete="current-password"
                                        id="password"
                                        name={field.name}
                                        onblur={field.handleBlur}
                                        oninput={(
                                            e: Event & {
                                                currentTarget: HTMLInputElement
                                            },
                                        ) =>
                                            field.handleChange(
                                                e.currentTarget.value,
                                            )}
                                        placeholder="⊛⊛⊛⊛⊛⊛⊛⊛"
                                        required
                                        type={showPassword
                                            ? 'text'
                                            : 'password'}
                                        value={field.state.value}
                                    />
                                    <InputGroup.Addon align="inline-end">
                                        <InputGroup.Button
                                            aria-label={showPassword
                                                ? 'Hide password'
                                                : 'Show password'}
                                            aria-pressed={showPassword}
                                            onclick={togglePasswordVisibility}
                                            size="icon-sm"
                                        >
                                            {#if showPassword}
                                                <EyeIcon aria-hidden="true" />
                                            {:else}
                                                <EyeOffIcon
                                                    aria-hidden="true"
                                                />
                                            {/if}
                                        </InputGroup.Button>
                                    </InputGroup.Addon>
                                </InputGroup.Root>
                                {#if !isValid}
                                    <Field.Error id="password-error"
                                        >{errors.join('\n')}</Field.Error
                                    >
                                {/if}
                            </Field.Field>
                        {/snippet}
                    </AuthSignInFormField>
                    <AuthSignInFormSubscribe>
                        <!--
                            README: canSubmit is always true on first form render
                            https://github.com/TanStack/form/issues/723

                            README: Set field errors based on response
                            https://github.com/TanStack/form/discussions/623
                        -->
                        {#snippet children(form)}
                            {@const isSigningIn =
                                isSubmitting ||
                                form.isSubmitting ||
                                authSignInMutation.isPending}
                            {@const isDisabled =
                                !form.canSubmit ||
                                form.isPristine ||
                                isSigningIn}
                            <Field.Field>
                                <Button
                                    disabled={isDisabled}
                                    id="signIn"
                                    type="submit"
                                >
                                    {#if isSigningIn}<Spinner
                                            data-icon="inline-start"
                                        />{/if}
                                    {isSigningIn ? 'Signing-in...' : 'Sign-in'}
                                </Button>
                                <Field.Description class="text-center">
                                    Don't have an account?
                                    <span>Sign-up</span>
                                </Field.Description>
                            </Field.Field>
                        {/snippet}
                    </AuthSignInFormSubscribe>
                </Field.Group>
            </form>
        </Card.Content>
    </Card.Root>
    <Field.Description class="px-6 text-center">
        By clicking continue, you agree to our
        <span>Terms of Service</span>
        and
        <span>Privacy Policy</span>.
    </Field.Description>
</div>
