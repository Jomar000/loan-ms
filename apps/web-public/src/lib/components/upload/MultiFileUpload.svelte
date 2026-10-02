<script lang="ts">
    import * as Alert from '@loanms/ui/components/alert'
    import * as Avatar from '@loanms/ui/components/avatar'
    import { Badge } from '@loanms/ui/components/badge'
    import { Button } from '@loanms/ui/components/button'
    import * as Card from '@loanms/ui/components/card'
    import * as DropdownMenu from '@loanms/ui/components/dropdown-menu'
    import * as Empty from '@loanms/ui/components/empty'
    import { Progress } from '@loanms/ui/components/progress'
    import * as Table from '@loanms/ui/components/table'
    import { cn } from '@loanms/ui/utils'
    import AlertCircleIcon from '@lucide/svelte/icons/alert-circle'
    import CheckCheckIcon from '@lucide/svelte/icons/check-check'
    import CircleCheckIcon from '@lucide/svelte/icons/circle-check'
    import CircleXIcon from '@lucide/svelte/icons/circle-x'
    import CloudUploadIcon from '@lucide/svelte/icons/cloud-upload'
    import EllipsisVerticalIcon from '@lucide/svelte/icons/ellipsis-vertical'
    import FileIcon from '@lucide/svelte/icons/file'
    import LoaderCircleIcon from '@lucide/svelte/icons/loader-circle'
    import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw'
    import Trash2Icon from '@lucide/svelte/icons/trash-2'
    import { createMutation } from '@tanstack/svelte-query'
    import { onDestroy } from 'svelte'
    import { toast } from 'svelte-sonner'

    import { useSessionContext } from '$lib/states/session'
    import { createTenantKey } from '$lib/states/session/tenant'
    import { formatBytes, getErrorMessage } from '$lib/utilities/helpers'
    import { createIdempotencyKeyLifecycle } from '$lib/utilities/idempotencyKey'
    import {
        commitUploadSession,
        createUploadId,
        prepareUploadFiles,
        removeUploadFile,
        retryUploadFile,
        revokePreviewUrls,
        uploadQueuedFiles,
        type UploadMetadata,
    } from './utilities/singleFileUpload'

    ////////////////////
    // 01. Properties //
    ////////////////////

    let {
        allowedMimeTypes = [],
        class: className = '',
        disabled = false,
        isCommitted = $bindable(false),
        isPublic = false,
        maxItems = 10,
        onCommit,
        uploadId = $bindable(''),
    }: {
        allowedMimeTypes?: string[]
        class?: string
        disabled?: boolean
        isCommitted?: boolean
        isPublic?: boolean
        maxItems?: number
        onCommit?: (data: {
            attachments: string[]
            uploadId: string
        }) => void | Promise<void>
        uploadId?: string
    } = $props()

    ///////////////////
    // 02. Constants //
    ///////////////////

    const TOAST_FEEDBACK_DURATION = 8000
    const UPLOAD_COMMIT_TOAST_ID = 'upload-commit'
    const session = useSessionContext()
    const attachmentBatchIdempotencyKey = createIdempotencyKeyLifecycle()
    const uploadIdempotencyKey = createIdempotencyKeyLifecycle()

    ///////////////
    // 03. State //
    ///////////////

    let fileInput = $state<HTMLInputElement | null>(null)
    let fileList = $state.raw<UploadMetadata[]>([])
    let isActionLocked = $state(false)
    let uploadMessage = $state('')

    /////////////////
    // 04. Derived //
    /////////////////

    const acceptedMimeTypes = $derived(allowedMimeTypes.join(','))
    const completedFiles = $derived(
        fileList.filter((file) => file.status === 'UPLOADED'),
    )
    const failedFiles = $derived(
        fileList.filter((file) => file.status === 'FAILED'),
    )
    const pendingFiles = $derived(
        fileList.filter(
            (file) => file.status === 'QUEUED' || file.status === 'UPLOADING',
        ),
    )
    const progressValue = $derived(
        fileList.length === 0
            ? 0
            : Math.round((completedFiles.length / fileList.length) * 100),
    )
    const canCommit = $derived(
        !disabled &&
            !isActionLocked &&
            !isCommitted &&
            completedFiles.length > 0 &&
            pendingFiles.length === 0,
    )

    ///////////////////
    // 06. Mutations //
    ///////////////////

    const createUploadMutation = createMutation(() => ({
        mutationKey: createTenantKey(
            session.data.organizationSlug,
            'objectStorage',
            'upload',
            'create',
        ),
        mutationFn: createUploadId,
    }))

    const uploadQueuedFilesMutation = createMutation(() => ({
        mutationKey: createTenantKey(
            session.data.organizationSlug,
            'objectStorage',
            'upload',
            'attachment',
            'create',
        ),
        mutationFn: uploadQueuedFiles,
    }))

    const retryUploadFileMutation = createMutation(() => ({
        mutationKey: createTenantKey(
            session.data.organizationSlug,
            'objectStorage',
            'upload',
            'attachment',
            'retry',
        ),
        mutationFn: retryUploadFile,
    }))

    const commitUploadMutation = createMutation(() => ({
        mutationKey: createTenantKey(
            session.data.organizationSlug,
            'objectStorage',
            'upload',
            'commit',
        ),
        mutationFn: commitUploadSession,
    }))

    /////////////////
    // 08. Effects //
    /////////////////

    onDestroy(() => revokePreviewUrls(fileList))

    //////////////////
    // 09. Handlers //
    //////////////////

    async function handleCommitUpload() {
        if (!canCommit) return

        isActionLocked = true
        uploadMessage = ''

        try {
            const data = await commitUploadMutation.mutateAsync({
                uploadId,
                objectIds: completedFiles.map((file) => file.objectId),
            })

            isCommitted = true

            try {
                await onCommit?.(data)
            } catch {
                toast.warning('Upload saved', {
                    id: UPLOAD_COMMIT_TOAST_ID,
                    duration: TOAST_FEEDBACK_DURATION,
                    description:
                        'The upload completed, but the page could not finish updating.',
                })
                return
            }

            toast.success('Upload complete', {
                id: UPLOAD_COMMIT_TOAST_ID,
            })
        } catch (error) {
            uploadMessage = getErrorMessage(error, 'Upload action failed.')
        } finally {
            isActionLocked = false
        }
    }

    async function handleFileInputChange(event: Event) {
        if (disabled || isActionLocked || isCommitted) return

        const input = event.target as HTMLInputElement
        const selectedFiles = input.files
        if (!selectedFiles) return

        isActionLocked = true
        uploadMessage = ''

        try {
            const result = await prepareUploadFiles({
                allowedMimeTypes,
                existingFiles: fileList,
                isPublic,
                maxItems,
                selectedFiles,
            })

            if (result.maxItemsReached) {
                uploadMessage = `Maximum of ${maxItems} files reached.`
            }

            if (result.queuedFiles.length === 0) return

            try {
                await ensureUploadId()
            } catch (error) {
                revokePreviewUrls(result.queuedFiles)
                throw error
            }

            const queuedHashes = new Set(
                result.queuedFiles.map((file) => file.hashSha256),
            )

            fileList = [
                ...fileList,
                ...result.queuedFiles,
            ]

            const queuedFiles = fileList.filter((file) =>
                queuedHashes.has(file.hashSha256),
            )

            await uploadQueuedFilesMutation.mutateAsync({
                idempotencyKey: attachmentBatchIdempotencyKey.current,
                onFileChange: refreshFileList,
                queuedFiles,
                uploadId,
            })
            attachmentBatchIdempotencyKey.confirmSuccess()

            fileList = [...fileList]

            if (queuedFiles.some((file) => file.status === 'FAILED')) {
                uploadMessage = 'Some files failed to upload.'
            }
        } catch (error) {
            uploadMessage = getErrorMessage(error, 'Upload action failed.')
        } finally {
            input.value = ''
            isActionLocked = false
        }
    }

    async function handleFileRetry(index: number) {
        if (disabled || isActionLocked || isCommitted) return

        isActionLocked = true
        uploadMessage = ''

        try {
            await retryUploadFileMutation.mutateAsync({
                file: fileList[index],
                onFileChange: refreshFileList,
                uploadId,
            })
            fileList = [...fileList]
        } catch (error) {
            uploadMessage = getErrorMessage(error, 'Upload action failed.')
        } finally {
            isActionLocked = false
        }
    }

    async function handleFileRetrySelect(event: Event) {
        const index = Number((event.currentTarget as HTMLElement).dataset.index)
        await handleFileRetry(index)
    }

    function handleOpenFileInput() {
        if (disabled || isActionLocked || isCommitted) return
        fileInput?.click()
    }

    function handleRemoveFileSelect(event: Event) {
        if (disabled || isActionLocked || isCommitted) return

        const hashSha256 = (event.currentTarget as HTMLElement).dataset.hash
        if (hashSha256) {
            removeFile(hashSha256)
        }
    }

    function clearFiles() {
        if (disabled || isActionLocked || isCommitted) return

        revokePreviewUrls(fileList)
        fileList = []
        uploadMessage = ''
    }

    /////////////////
    // 10. Helpers //
    /////////////////

    async function ensureUploadId() {
        if (uploadId !== '') return

        uploadId = await createUploadMutation.mutateAsync(
            uploadIdempotencyKey.current,
        )
        uploadIdempotencyKey.confirmSuccess()
    }

    function removeFile(hashSha256: string) {
        if (disabled || isActionLocked || isCommitted) return
        fileList = removeUploadFile(fileList, hashSha256)
    }

    function refreshFileList() {
        fileList = [...fileList]
    }
</script>

<Card.Root class={cn('w-full', className)}>
    <Card.Header class="gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
        <div class="min-w-0">
            <Card.Title>File uploads</Card.Title>
            <Card.Description>
                {completedFiles.length}/{fileList.length} uploaded
            </Card.Description>
        </div>
        <div class="flex flex-wrap items-center gap-2">
            <Button
                aria-label="Clear selected files"
                disabled={disabled ||
                    isActionLocked ||
                    isCommitted ||
                    fileList.length === 0}
                onclick={clearFiles}
                size="icon"
                variant="outline"
            >
                <Trash2Icon
                    aria-hidden="true"
                    data-icon="inline-start"
                />
            </Button>
            <Button
                disabled={disabled || isActionLocked || isCommitted}
                onclick={handleOpenFileInput}
            >
                <CloudUploadIcon
                    aria-hidden="true"
                    data-icon="inline-start"
                />
                Upload
            </Button>
            <Button
                disabled={!canCommit}
                onclick={handleCommitUpload}
                variant="secondary"
            >
                <CheckCheckIcon
                    aria-hidden="true"
                    data-icon="inline-start"
                />
                Commit
            </Button>
        </div>
    </Card.Header>
    <Card.Content
        aria-busy={isActionLocked}
        class="flex flex-col gap-4"
    >
        {#if uploadMessage}
            <Alert.Root variant="destructive">
                <AlertCircleIcon aria-hidden="true" />
                <Alert.Title>Upload issue</Alert.Title>
                <Alert.Description>{uploadMessage}</Alert.Description>
            </Alert.Root>
        {/if}

        <div class="flex flex-col gap-2">
            <Progress
                aria-label="Overall upload progress"
                value={progressValue}
            />
            <div
                aria-live="polite"
                class="flex items-center justify-between text-xs text-muted-foreground"
            >
                <span>{failedFiles.length} failed</span>
                <span>{progressValue}%</span>
            </div>
        </div>

        {#if fileList.length === 0}
            <Empty.Root>
                <Empty.Header>
                    <Empty.Title>No files selected</Empty.Title>
                    <Empty.Description>
                        Select files to begin an upload.
                    </Empty.Description>
                </Empty.Header>
            </Empty.Root>
        {:else}
            <div class="overflow-hidden rounded-md border">
                <Table.Root>
                    <Table.Caption class="sr-only">
                        Selected files and upload status
                    </Table.Caption>
                    <Table.Header>
                        <Table.Row>
                            <Table.Head class="w-16">Preview</Table.Head>
                            <Table.Head>Filename</Table.Head>
                            <Table.Head class="w-28">Size</Table.Head>
                            <Table.Head class="w-32">Status</Table.Head>
                            <Table.Head class="w-16 text-right">
                                <span class="sr-only">Actions</span>
                            </Table.Head>
                        </Table.Row>
                    </Table.Header>
                    <Table.Body>
                        {#each fileList as file, index (file.hashSha256)}
                            <Table.Row>
                                <Table.Cell>
                                    <Avatar.Root class="size-10 rounded-md">
                                        {#if file.previewUrl}
                                            <Avatar.Image
                                                src={file.previewUrl}
                                                alt=""
                                                class="rounded-md object-cover"
                                            />
                                        {/if}
                                        <Avatar.Fallback
                                            class="rounded-md bg-muted"
                                        >
                                            <FileIcon
                                                aria-hidden="true"
                                                class="size-5 text-muted-foreground"
                                            />
                                        </Avatar.Fallback>
                                    </Avatar.Root>
                                </Table.Cell>
                                <Table.Cell>
                                    <div class="min-w-0">
                                        <p
                                            class="truncate font-medium"
                                            title={file.file.name}
                                        >
                                            {file.file.name}
                                        </p>
                                        <p
                                            class="truncate text-xs text-muted-foreground"
                                        >
                                            {file.mimeType}
                                        </p>
                                    </div>
                                </Table.Cell>
                                <Table.Cell class="text-muted-foreground">
                                    {formatBytes(file.file.size)}
                                </Table.Cell>
                                <Table.Cell>
                                    {#if file.status === 'UPLOADED'}
                                        <Badge variant="secondary">
                                            <CircleCheckIcon
                                                aria-hidden="true"
                                            />
                                            Uploaded
                                        </Badge>
                                    {:else if file.status === 'FAILED'}
                                        <Badge variant="destructive">
                                            <CircleXIcon aria-hidden="true" />
                                            Failed
                                        </Badge>
                                    {:else if file.status === 'UPLOADING'}
                                        <Badge variant="secondary">
                                            <LoaderCircleIcon
                                                aria-hidden="true"
                                                class="animate-spin motion-reduce:animate-none"
                                            />
                                            Uploading
                                        </Badge>
                                    {:else}
                                        <Badge variant="outline">Queued</Badge>
                                    {/if}
                                </Table.Cell>
                                <Table.Cell class="text-right">
                                    <DropdownMenu.Root>
                                        <DropdownMenu.Trigger>
                                            {#snippet child({ props })}
                                                <Button
                                                    {...props}
                                                    aria-label={`Actions for ${file.file.name}`}
                                                    disabled={disabled ||
                                                        isActionLocked ||
                                                        isCommitted}
                                                    size="icon"
                                                    variant="ghost"
                                                >
                                                    <EllipsisVerticalIcon
                                                        aria-hidden="true"
                                                        data-icon="inline-start"
                                                    />
                                                </Button>
                                            {/snippet}
                                        </DropdownMenu.Trigger>
                                        <DropdownMenu.Content align="end">
                                            {#if file.status === 'FAILED'}
                                                <DropdownMenu.Item
                                                    data-index={index}
                                                    disabled={disabled ||
                                                        isActionLocked ||
                                                        isCommitted}
                                                    onclick={handleFileRetrySelect}
                                                >
                                                    <RefreshCwIcon
                                                        aria-hidden="true"
                                                    />
                                                    Retry
                                                </DropdownMenu.Item>
                                            {/if}
                                            <DropdownMenu.Item
                                                data-hash={file.hashSha256}
                                                disabled={disabled ||
                                                    isActionLocked ||
                                                    isCommitted}
                                                onclick={handleRemoveFileSelect}
                                                variant="destructive"
                                            >
                                                <Trash2Icon
                                                    aria-hidden="true"
                                                />
                                                Delete
                                            </DropdownMenu.Item>
                                        </DropdownMenu.Content>
                                    </DropdownMenu.Root>
                                </Table.Cell>
                            </Table.Row>
                        {/each}
                    </Table.Body>
                </Table.Root>
            </div>
        {/if}

        <input
            bind:this={fileInput}
            accept={acceptedMimeTypes}
            class="hidden"
            disabled={disabled || isActionLocked || isCommitted}
            multiple
            onchange={handleFileInputChange}
            type="file"
        />
    </Card.Content>
</Card.Root>
