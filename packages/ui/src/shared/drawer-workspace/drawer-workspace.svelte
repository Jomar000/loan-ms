<script
    lang="ts"
    module
>
    import type { Snippet } from 'svelte'

    /** A related-list or section tab rendered by `DrawerWorkspace`. */
    export interface DrawerWorkspaceTab {
        /** Stable tab value used for selection and keyed rendering. */
        id: string
        /** Visible tab trigger text. */
        label: string
        /** Optional item count displayed as an accessible badge. */
        count?: number
        /** Content rendered when the tab is active. */
        content: Snippet
    }
</script>

<script lang="ts">
    import { untrack } from 'svelte'

    import { Badge } from '$lib/components/badge/index.js'
    import * as Tabs from '$lib/overrides/tabs/index.js'

    /** Properties for the summary-and-tabs workspace inside a wide drawer. */
    interface Props {
        /** Bindable id of the selected tab. */
        activeTab: string
        /** Tab selected whenever `recordKey` changes. */
        defaultTab: string
        /** Record identity used to reset selection when workspace context changes. */
        recordKey: string | number
        /** Persistent summary rendered beside or above the tabs. */
        summary: Snippet
        /** Related lists or sections rendered as tab triggers and content. */
        tabs: DrawerWorkspaceTab[]
    }

    let {
        activeTab = $bindable(),
        defaultTab,
        recordKey,
        summary,
        tabs,
    }: Props = $props()

    let previousRecordKey = untrack(() => recordKey)

    $effect(() => {
        const nextRecordKey = recordKey

        if (nextRecordKey !== previousRecordKey) {
            previousRecordKey = nextRecordKey
            activeTab = defaultTab
        }
    })
</script>

<!--
@component
Use `DrawerWorkspace` inside `DrawerShell size="workspace"` when a record needs
a persistent summary plus related lists or sections. Import it from
`@hyperion/ui/shared/drawer-workspace`.

Render the record overview through the `summary` snippet and provide tab objects
with stable `id`, `label`, optional `count`, and snippet-based `content`. Bind
`activeTab` when the parent needs selection state. Changing `recordKey` resets
selection to `defaultTab`. The component supplies the tab list relationship,
workspace label, and accessible count badges. Below `lg`, the whole workspace is
the single vertical scroller. From `lg` upward, the summary and active tab
content scroll independently while the tab rail remains fixed.

```svelte
<script lang="ts">
    import { DrawerWorkspace } from '@hyperion/ui/shared/drawer-workspace'

    let activeTab = $state('orders')
</script>

{#snippet orders()}<OrderList />{/snippet}

<DrawerWorkspace
    bind:activeTab
    defaultTab="orders"
    recordKey={account.id}
    tabs={[{ id: 'orders', label: 'Orders', count: 3, content: orders }]}
>
    {#snippet summary()}<AccountSummary />{/snippet}
</DrawerWorkspace>
```

Use raw `Tabs` for ordinary page or section navigation that does not use the
drawer workspace pattern.
-->

<div
    class="size-full min-h-0 overflow-y-auto lg:grid lg:grid-cols-[18rem_minmax(0,1fr)] lg:overflow-hidden"
    data-slot="drawer-workspace"
>
    <aside
        class="border-b p-4 lg:min-h-0 lg:overflow-y-auto lg:border-r lg:border-b-0"
        data-slot="drawer-workspace-summary"
    >
        {@render summary()}
    </aside>
    <Tabs.Root
        bind:value={activeTab}
        class="min-w-0 p-4 lg:min-h-0 lg:overflow-hidden"
    >
        <Tabs.List
            aria-label="Workspace sections"
            class="w-full shrink-0 justify-start overflow-x-auto"
            variant="line"
        >
            {#each tabs as tab (tab.id)}
                <Tabs.Trigger value={tab.id}>
                    {tab.label}
                    {#if tab.count !== undefined}
                        <Badge
                            aria-label={`${tab.count} items`}
                            variant="secondary"
                        >
                            {tab.count}
                        </Badge>
                    {/if}
                </Tabs.Trigger>
            {/each}
        </Tabs.List>
        {#each tabs as tab (tab.id)}
            <Tabs.Content
                class="pt-4 lg:min-h-0 lg:overflow-y-auto"
                data-slot="drawer-workspace-content"
                value={tab.id}
            >
                {@render tab.content()}
            </Tabs.Content>
        {/each}
    </Tabs.Root>
</div>
