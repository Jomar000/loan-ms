<script lang="ts">
    import { useSessionContext } from './context.svelte'

    ///////////////////
    // 02. Constants //
    ///////////////////

    const session = useSessionContext()
</script>

<output data-testid="session-phase">{session.phase}</output>
<output data-testid="session-name">{session.data.name}</output>
