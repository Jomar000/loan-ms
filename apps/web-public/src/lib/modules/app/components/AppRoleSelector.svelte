<script lang="ts">
    import { Button } from '@loanms/ui/components/button'
    import * as Card from '@loanms/ui/components/card'
    import * as Field from '@loanms/ui/components/field'
    import * as Select from '@loanms/ui/components/select'
    import GalleryVerticalEndIcon from '@lucide/svelte/icons/gallery-vertical-end'
    import UserStarIcon from '@lucide/svelte/icons/user-star'

    import { goto } from '$app/navigation'
    import { PUBLIC_NAME } from '$env/static/public'
    import { useSessionContext } from '$lib/states/session'

    ///////////////////
    // 02. Constants //
    ///////////////////

    const session = useSessionContext()

    ///////////////
    // 03. State //
    ///////////////

    let selectedRole = $state('')

    //////////////////
    // 09. Handlers //
    //////////////////

    function handleRoleSubmit(event: SubmitEvent) {
        event.preventDefault()
        if (!selectedRole) return

        void goto(`/app/${selectedRole}/dashboard`)
    }
</script>

<svelte:head>
    <title>Role Selection | {PUBLIC_NAME}</title>
</svelte:head>

<main
    class="flex min-h-svh flex-col items-center justify-center gap-3 overflow-x-hidden overflow-y-auto bg-zinc-50/80 p-3 md:p-4 dark:bg-[#171717]"
>
    <div class="flex w-full max-w-sm flex-col gap-3">
        <a
            href="/app"
            class="flex items-center gap-2 self-center font-medium"
        >
            <div
                class="flex size-6 items-center justify-center rounded-md bg-primary text-primary-foreground"
            >
                <GalleryVerticalEndIcon
                    aria-hidden="true"
                    class="size-4"
                />
            </div>
            {PUBLIC_NAME}
        </a>
        <Card.Root class="w-full max-w-sm">
            <Card.Header class="m-auto w-full">
                <div class="flex items-center justify-center">
                    <UserStarIcon
                        aria-hidden="true"
                        size={56}
                    />
                </div>
                <Card.Title class="text-center text-xl">
                    <h1>Role Selection</h1>
                </Card.Title>
            </Card.Header>
            <form onsubmit={handleRoleSubmit}>
                <Card.Content>
                    <Field.Group>
                        <Field.Field>
                            <Field.Label for="role">Role</Field.Label>
                            <Select.Root
                                bind:value={selectedRole}
                                name="role"
                                required
                                type="single"
                            >
                                <Select.Trigger
                                    aria-label="Role"
                                    class="w-full"
                                    id="role"
                                    name="role"
                                >
                                    {selectedRole.toUpperCase() ||
                                        '--- SELECT ---'}
                                </Select.Trigger>
                                <Select.Content>
                                    <Select.Group>
                                        {#each session.getRoles() as role (role)}
                                            <Select.Item value={role}
                                                >{role.toUpperCase()}</Select.Item
                                            >
                                        {/each}
                                    </Select.Group>
                                </Select.Content>
                            </Select.Root>
                        </Field.Field>
                    </Field.Group>
                </Card.Content>
                <Card.Footer class="flex-col">
                    <Button
                        class="w-full"
                        disabled={selectedRole === ''}
                        type="submit">Proceed to Dashboard</Button
                    >
                </Card.Footer>
            </form>
        </Card.Root>
    </div>
</main>
