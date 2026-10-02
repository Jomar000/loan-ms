<script lang="ts">
    import * as Sidebar from '@loanms/ui/overrides/sidebar'

    const sidebar = Sidebar.useSidebar()
</script>

<button
    type="button"
    aria-label={sidebar.state === 'collapsed'
        ? 'Expand sidebar'
        : 'Collapse sidebar'}
    onclick={() => sidebar.setOpen(!sidebar.open)}
>
    Toggle sidebar
</button>
