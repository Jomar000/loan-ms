<script lang="ts">
    import * as Card from '@loanms/ui/components/card'
</script>

<section
    class="flex min-h-0 page-scroll flex-1 flex-col gap-3 bg-zinc-50/80 p-3 md:p-4 dark:bg-[#171717]"
>
    <Card.Root
        class="border-amber-200/70 bg-white shadow-sm dark:border-amber-500/15 dark:bg-[#202020]"
    >
        <Card.Header class="p-3">
            <Card.Title class="text-lg font-semibold tracking-tight md:text-xl"
                >Member dashboard</Card.Title
            >
            <Card.Description class="text-xs"
                >Your organization workspace</Card.Description
            >
        </Card.Header>
    </Card.Root>
</section>
