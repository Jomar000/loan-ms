<script lang="ts">
    import { Button } from '@loanms/ui/components/button'
    import { DrawerShell } from '@loanms/ui/shared/drawer-shell'
    import { DrawerWorkspace } from '@loanms/ui/shared/drawer-workspace'
    import { FormDialogShell } from '@loanms/ui/shared/form-dialog-shell'
    import { FormFieldLabel } from '@loanms/ui/shared/form-field-label'

    ////////////////////
    // 01. Properties //
    ////////////////////

    let {
        mode,
        drawerSize = 'workspace',
        dialogInitialFocus = 'custom',
        longDrawerTitle = false,
    }: {
        mode: 'dialog' | 'drawer' | 'field' | 'workspace'
        drawerSize?: 'standard' | 'workspace'
        dialogInitialFocus?:
            'custom' | 'default' | 'disconnected' | 'unfocusable'
        longDrawerTitle?: boolean
    } = $props()

    ///////////////
    // 03. State //
    ///////////////

    let activeTab = $state('overview')
    let dialogUnfocusable = $state<HTMLElement | null>(null)
    let dialogLocked = $state(false)
    let dialogOpen = $state(false)
    let dialogPrimaryInput = $state<HTMLInputElement | null>(null)
    let drawerEntered = $state(false)
    let drawerLocked = $state(false)
    let drawerOpen = $state(false)
    let recordKey = $state('record-one')

    //////////////////
    // 09. Handlers //
    //////////////////

    function handleDrawerEntered() {
        drawerEntered = true
    }

    function handleOpenDrawer() {
        drawerEntered = false
        drawerOpen = true
    }

    /////////////////
    // 10. Helpers //
    /////////////////

    function resolveDialogInitialFocus() {
        if (dialogInitialFocus === 'disconnected')
            return document.createElement('input')
        if (dialogInitialFocus === 'unfocusable') return dialogUnfocusable
        return dialogPrimaryInput
    }
</script>

{#snippet summary()}
    <div style="height: 120rem">Record summary</div>
{/snippet}

{#snippet overviewContent()}
    <div style="height: 120rem">Overview content</div>
{/snippet}

{#snippet activityContent()}
    <div style="height: 120rem">Activity content</div>
{/snippet}

{#if mode === 'dialog'}
    <Button onclick={() => (dialogOpen = true)}>Open dialog</Button>
    <FormDialogShell
        bind:open={dialogOpen}
        description="Update the selected record."
        initialFocus={dialogInitialFocus === 'default'
            ? undefined
            : resolveDialogInitialFocus}
        locked={dialogLocked}
        size="lg"
        title="Edit record"
    >
        <Button variant="outline">Default dialog action</Button>
        <FormFieldLabel
            for="dialog-primary-input"
            helpDescription="Enter the primary record value."
            label="Primary value"
        />
        <input
            bind:this={dialogPrimaryInput}
            id="dialog-primary-input"
        />
        <div bind:this={dialogUnfocusable}>Unfocusable dialog content</div>
        <div style="height: 120rem">Scrollable dialog content</div>
        {#snippet footer()}
            <Button variant="outline">Cancel dialog</Button>
            <Button onclick={() => (dialogLocked = !dialogLocked)}>
                {dialogLocked ? 'Unlock dialog' : 'Lock dialog'}
            </Button>
        {/snippet}
    </FormDialogShell>
{:else if mode === 'drawer'}
    <Button onclick={handleOpenDrawer}>Open drawer</Button>
    <output aria-label="Drawer entered">
        {drawerEntered ? 'yes' : 'no'}
    </output>
    <DrawerShell
        bind:open={drawerOpen}
        description="Review the selected record."
        locked={drawerLocked}
        onEntered={handleDrawerEntered}
        size={drawerSize}
        title={longDrawerTitle
            ? 'Record details with a title that is intentionally too long to fit beside its actions'
            : 'Record details'}
    >
        {#if drawerSize === 'workspace'}
            <DrawerWorkspace
                bind:activeTab
                defaultTab="overview"
                {recordKey}
                {summary}
                tabs={[
                    {
                        id: 'overview',
                        label: 'Overview',
                        count: 2,
                        content: overviewContent,
                    },
                    {
                        id: 'activity',
                        label: 'Activity',
                        count: 4,
                        content: activityContent,
                    },
                ]}
            />
        {:else}
            <div style="height: 120rem">Scrollable drawer content</div>
        {/if}
        {#snippet headerActions()}
            <Button variant="outline">Header action</Button>
        {/snippet}
        {#snippet actions()}
            <Button onclick={() => (drawerLocked = !drawerLocked)}>
                {drawerLocked ? 'Unlock drawer' : 'Lock drawer'}
            </Button>
        {/snippet}
    </DrawerShell>
{:else if mode === 'field'}
    <FormFieldLabel
        for="display-name"
        label="Display name"
    />
    <input id="display-name" />
    <FormFieldLabel
        for="password"
        label="Password"
        required
    />
    <input
        id="password"
        required
    />
    <FormFieldLabel
        for="email"
        helpDescription="We use this address for account notifications."
        helpDescriptionId="email-help"
        label="Email"
        helpPlacement="right"
        showOptional
    />
    <input id="email" />
    <FormFieldLabel
        for="recovery-email"
        label="Recovery email"
        required
        showOptional
    />
    <input
        id="recovery-email"
        aria-required="true"
        required
    />
{:else}
    <Button onclick={() => (recordKey = 'record-two')}>Change record</Button>
    <output aria-label="Active workspace tab">{activeTab}</output>
    <div class="h-80">
        <DrawerWorkspace
            bind:activeTab
            defaultTab="overview"
            {recordKey}
            {summary}
            tabs={[
                {
                    id: 'overview',
                    label: 'Overview',
                    count: 2,
                    content: overviewContent,
                },
                {
                    id: 'activity',
                    label: 'Activity',
                    count: 4,
                    content: activityContent,
                },
            ]}
        />
    </div>
{/if}
