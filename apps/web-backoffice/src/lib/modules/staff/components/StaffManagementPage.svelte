<script lang="ts">
    import * as Alert from '@loanms/ui/components/alert'
    import * as AlertDialog from '@loanms/ui/components/alert-dialog'
    import { Badge } from '@loanms/ui/components/badge'
    import { Button } from '@loanms/ui/components/button'
    import * as Empty from '@loanms/ui/components/empty'
    import * as NativeSelect from '@loanms/ui/components/native-select'
    import * as Pagination from '@loanms/ui/components/pagination'
    import { Skeleton } from '@loanms/ui/components/skeleton'
    import * as Table from '@loanms/ui/components/table'
    import AlertCircleIcon from '@lucide/svelte/icons/alert-circle'
    import LockIcon from '@lucide/svelte/icons/lock'
    import ShieldCheckIcon from '@lucide/svelte/icons/shield-check'
    import UnlockIcon from '@lucide/svelte/icons/unlock'
    import { toast } from 'svelte-sonner'

    import { useSessionContext } from '$lib/states/session'
    import { getErrorMessage } from '$lib/utilities/helpers'
    import {
        createStaffAccessMutation,
        createStaffQuery,
        createStaffRoleMutation,
    } from '../queries'
    import type { StaffMember, StaffRole } from '../types'

    ////////////////////
    // 01. Properties //
    ////////////////////

    let { role }: { role: 'admin' | 'owner' } = $props()

    ///////////////////
    // 02. Constants //
    ///////////////////

    const PAGE_SIZE = 25
    const session = useSessionContext()

    ///////////////
    // 03. State //
    ///////////////

    let confirmationOpen = $state(false)
    let isSubmitting = $state(false)
    let offset = $state(0)
    let selectedAction = $state<'access' | 'role' | null>(null)
    let selectedMember = $state<StaffMember | null>(null)
    let selectedRole = $state<StaffRole>('member')

    /////////////////
    // 04. Derived //
    /////////////////

    const canManage = $derived(role === 'owner')
    const isLocked = $derived(isSubmitting)
    const request = $derived({ limit: PAGE_SIZE, offset })
    const currentPage = $derived(Math.floor(offset / PAGE_SIZE) + 1)

    /////////////////
    // 05. Queries //
    /////////////////

    const staffQuery = createStaffQuery(
        {
            get organizationSlug() {
                return session.data.organizationSlug
            },
        },
        {
            get request() {
                return request
            },
        },
    )

    ///////////////////
    // 06. Mutations //
    ///////////////////

    const accessMutation = createStaffAccessMutation({
        get organizationSlug() {
            return session.data.organizationSlug
        },
    })
    const roleMutation = createStaffRoleMutation({
        get organizationSlug() {
            return session.data.organizationSlug
        },
    })

    //////////////////
    // 09. Handlers //
    //////////////////

    function handleConfirmationOpenChange(open: boolean) {
        if (isLocked) return
        confirmationOpen = open
        if (!open) {
            selectedAction = null
            selectedMember = null
        }
    }

    function openAccessConfirmation(member: StaffMember) {
        if (!canManage || isLocked) return
        selectedAction = 'access'
        selectedMember = member
        confirmationOpen = true
    }

    function openRoleConfirmation(member: StaffMember) {
        if (!canManage || isLocked) return
        selectedAction = 'role'
        selectedMember = member
        selectedRole = member.roles.includes('admin') ? 'admin' : 'member'
        confirmationOpen = true
    }

    async function handleConfirm() {
        if (!canManage || isLocked || !selectedAction || !selectedMember) return

        isSubmitting = true
        try {
            if (selectedAction === 'access') {
                await accessMutation.mutateAsync({
                    isLocked: !selectedMember.isLocked,
                    userPublicId: selectedMember.userPublicId,
                })
                toast.success(
                    selectedMember.isLocked
                        ? 'Staff access enabled.'
                        : 'Staff access disabled.',
                )
            } else {
                await roleMutation.mutateAsync({
                    role: selectedRole,
                    userPublicId: selectedMember.userPublicId,
                })
                toast.success('Staff role updated.')
            }
            handleConfirmationOpenChange(false)
        } catch (error) {
            toast.error(
                getErrorMessage(error, 'Could not update staff access.'),
            )
        } finally {
            isSubmitting = false
        }
    }

    function handlePreviousPage() {
        offset = Math.max(0, offset - PAGE_SIZE)
    }

    function handleNextPage() {
        if (offset + PAGE_SIZE >= (staffQuery.data?.count ?? 0)) return
        offset += PAGE_SIZE
    }

    /////////////////
    // 10. Helpers //
    /////////////////

    function memberName(member: StaffMember) {
        return member.name || member.username || member.email || 'Unnamed user'
    }

    function actionTitle() {
        if (selectedAction === 'access') {
            return selectedMember?.isLocked
                ? 'Enable staff access?'
                : 'Disable staff access?'
        }
        return 'Change staff role?'
    }

    function actionDescription() {
        if (!selectedMember) return ''
        if (selectedAction === 'access') {
            return selectedMember.isLocked
                ? `${memberName(selectedMember)} can sign in and use permitted areas again.`
                : `${memberName(selectedMember)} will be prevented from signing in until an owner re-enables access.`
        }
        return `${memberName(selectedMember)} will have the ${selectedRole} role. This change is audited.`
    }

    function getTotalPages() {
        return Math.max(1, Math.ceil((staffQuery.data?.count ?? 0) / PAGE_SIZE))
    }
</script>

<section class="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4 md:p-6">
    <header class="flex flex-col gap-1">
        <h2 class="text-xl font-semibold text-foreground">Users and roles</h2>
        <p class="text-sm text-muted-foreground">
            Review staff access for this organization. Role and sign-in changes
            are restricted to owners and recorded in Activity Logs.
        </p>
    </header>

    {#if !canManage}
        <Alert.Root>
            <ShieldCheckIcon />
            <Alert.Title>Read-only access</Alert.Title>
            <Alert.Description>
                Administrators can review staff access. Only an owner can change
                roles or enable and disable sign-in.
            </Alert.Description>
        </Alert.Root>
    {/if}

    {#if staffQuery.isPending}
        <div class="grid gap-2">
            {#each [0, 1, 2, 3] as row (row)}
                <Skeleton class="h-14 w-full" />
            {/each}
        </div>
    {:else if staffQuery.isError}
        <Empty.Root class="min-h-64 border">
            <Empty.Header>
                <Empty.Media variant="icon"><AlertCircleIcon /></Empty.Media>
                <Empty.Title>Unable to load staff</Empty.Title>
                <Empty.Description>
                    {getErrorMessage(
                        staffQuery.error,
                        'Try refreshing the list.',
                    )}
                </Empty.Description>
            </Empty.Header>
            <Button
                onclick={() => staffQuery.refetch()}
                variant="outline"
            >
                Try again
            </Button>
        </Empty.Root>
    {:else if (staffQuery.data?.data.length ?? 0) === 0}
        <Empty.Root class="min-h-64 border">
            <Empty.Header>
                <Empty.Media variant="icon"><ShieldCheckIcon /></Empty.Media>
                <Empty.Title>No staff accounts found</Empty.Title>
                <Empty.Description>
                    Staff accounts appear here after they join this
                    organization.
                </Empty.Description>
            </Empty.Header>
        </Empty.Root>
    {:else}
        <div class="overflow-x-auto rounded-md border border-border">
            <Table.Root class="min-w-190">
                <Table.Header>
                    <Table.Row>
                        <Table.Head>User</Table.Head>
                        <Table.Head>Contact</Table.Head>
                        <Table.Head>Roles</Table.Head>
                        <Table.Head>Access</Table.Head>
                        <Table.Head class="text-right">Actions</Table.Head>
                    </Table.Row>
                </Table.Header>
                <Table.Body>
                    {#each staffQuery.data?.data ?? [] as member (member.userPublicId)}
                        <Table.Row>
                            <Table.Cell class="font-medium"
                                >{memberName(member)}</Table.Cell
                            >
                            <Table.Cell class="text-muted-foreground">
                                {member.email ??
                                    member.username ??
                                    'Not recorded'}
                            </Table.Cell>
                            <Table.Cell>
                                <div class="flex flex-wrap gap-1">
                                    {#each member.roles as membershipRole (membershipRole)}
                                        <Badge variant="secondary"
                                            >{membershipRole}</Badge
                                        >
                                    {/each}
                                </div>
                            </Table.Cell>
                            <Table.Cell>
                                <Badge
                                    variant={member.isLocked
                                        ? 'destructive'
                                        : 'secondary'}
                                >
                                    {member.isLocked ? 'Disabled' : 'Enabled'}
                                </Badge>
                            </Table.Cell>
                            <Table.Cell>
                                <div class="flex justify-end gap-2">
                                    <Button
                                        disabled={!canManage || isLocked}
                                        onclick={() =>
                                            openRoleConfirmation(member)}
                                        size="sm"
                                        variant="outline">Change role</Button
                                    >
                                    <Button
                                        disabled={!canManage || isLocked}
                                        onclick={() =>
                                            openAccessConfirmation(member)}
                                        size="sm"
                                        variant={member.isLocked
                                            ? 'outline'
                                            : 'destructive'}
                                        >{#if member.isLocked}<UnlockIcon
                                                data-icon="inline-start"
                                            />Enable{:else}<LockIcon
                                                data-icon="inline-start"
                                            />Disable{/if}</Button
                                    >
                                </div>
                            </Table.Cell>
                        </Table.Row>
                    {/each}
                </Table.Body>
            </Table.Root>
        </div>

        <Pagination.Root
            class="justify-between"
            count={getTotalPages()}
        >
            <p class="text-sm text-muted-foreground">
                Page {currentPage} of {getTotalPages()} · {staffQuery.data
                    ?.count ?? 0} users
            </p>
            <div class="flex gap-2">
                <Button
                    disabled={offset === 0 || isLocked}
                    onclick={handlePreviousPage}
                    size="sm"
                    variant="outline">Previous</Button
                >
                <Button
                    disabled={offset + PAGE_SIZE >=
                        (staffQuery.data?.count ?? 0) || isLocked}
                    onclick={handleNextPage}
                    size="sm"
                    variant="outline">Next</Button
                >
            </div>
        </Pagination.Root>
    {/if}
</section>

<AlertDialog.Root
    bind:open={() => confirmationOpen, handleConfirmationOpenChange}
>
    <AlertDialog.Content>
        <AlertDialog.Header>
            <AlertDialog.Title>{actionTitle()}</AlertDialog.Title>
            <AlertDialog.Description
                >{actionDescription()}</AlertDialog.Description
            >
        </AlertDialog.Header>
        {#if selectedAction === 'role'}
            <NativeSelect.Root
                aria-label="New staff role"
                bind:value={selectedRole}
                disabled={isLocked}
            >
                <NativeSelect.Option value="member">Member</NativeSelect.Option>
                <NativeSelect.Option value="admin">Admin</NativeSelect.Option>
            </NativeSelect.Root>
        {/if}
        <AlertDialog.Footer>
            <AlertDialog.Cancel disabled={isLocked}>Cancel</AlertDialog.Cancel>
            <AlertDialog.Action
                disabled={isLocked}
                onclick={handleConfirm}
                variant={selectedAction === 'access' &&
                !selectedMember?.isLocked
                    ? 'destructive'
                    : 'default'}>Confirm</AlertDialog.Action
            >
        </AlertDialog.Footer>
    </AlertDialog.Content>
</AlertDialog.Root>
