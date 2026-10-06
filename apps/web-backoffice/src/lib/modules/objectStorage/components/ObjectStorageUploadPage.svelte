<script lang="ts">
    import { Checkbox } from '@loanms/ui/components/checkbox'
    import * as Field from '@loanms/ui/components/field'

    import MultiFileUpload from '$lib/components/upload/MultiFileUpload.svelte'
    import SingleFileUpload from '$lib/components/upload/SingleFileUpload.svelte'

    ///////////////
    // 03. State //
    ///////////////

    let isMultiCommitted = $state(false)
    let isMultiPublic = $state(false)
    let isSingleCommitted = $state(false)
    let isSinglePublic = $state(false)
    let multiUploadId = $state('')
    let singleObjectId = $state('')
    let singleUploadId = $state('')
</script>

<div
    class="flex min-h-0 flex-1 flex-col gap-3 overflow-x-hidden overflow-y-auto overscroll-contain bg-zinc-50/80 p-3 md:p-4 dark:bg-[#171717]"
>
    <header class="flex flex-col gap-1">
        <h2 class="text-2xl font-semibold tracking-normal">Object Storage</h2>
        <p class="text-xs text-zinc-500 dark:text-zinc-400">
            Upload files through the object storage flow.
        </p>
    </header>

    <section class="grid gap-3 xl:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]">
        <div class="flex flex-col gap-3">
            <Field.Group>
                <Field.Field orientation="horizontal">
                    <Checkbox
                        id="single-public"
                        bind:checked={isSinglePublic}
                    />
                    <Field.Label for="single-public">Public object</Field.Label>
                </Field.Field>
            </Field.Group>
            <SingleFileUpload
                bind:isCommitted={isSingleCommitted}
                bind:objectId={singleObjectId}
                bind:uploadId={singleUploadId}
                isPublic={isSinglePublic}
            />
            <pre
                class="overflow-auto rounded-md border bg-muted p-3 text-xs text-muted-foreground">singleUploadId: {singleUploadId ||
                    'pending'}
singleObjectId: {singleObjectId || 'pending'}
singlePublic: {String(isSinglePublic)}
singleCommitted: {String(isSingleCommitted)}</pre>
        </div>

        <div class="flex flex-col gap-3">
            <Field.Group>
                <Field.Field orientation="horizontal">
                    <Checkbox
                        id="multi-public"
                        bind:checked={isMultiPublic}
                    />
                    <Field.Label for="multi-public">Public objects</Field.Label>
                </Field.Field>
            </Field.Group>
            <MultiFileUpload
                bind:isCommitted={isMultiCommitted}
                bind:uploadId={multiUploadId}
                isPublic={isMultiPublic}
                maxItems={10}
            />
            <pre
                class="overflow-auto rounded-md border bg-muted p-3 text-xs text-muted-foreground">multiUploadId: {multiUploadId ||
                    'pending'}
multiPublic: {String(isMultiPublic)}
multiCommitted: {String(isMultiCommitted)}</pre>
        </div>
    </section>
</div>
