<script lang="ts">
    import * as Alert from '@loanms/ui/components/alert'
    import { Badge } from '@loanms/ui/components/badge'
    import { Button } from '@loanms/ui/components/button'
    import * as Card from '@loanms/ui/components/card'
    import * as Empty from '@loanms/ui/components/empty'
    import * as Pagination from '@loanms/ui/components/pagination'
    import { Skeleton } from '@loanms/ui/components/skeleton'
    import { Spinner } from '@loanms/ui/components/spinner'
    import * as Table from '@loanms/ui/components/table'
    import AlertCircleIcon from '@lucide/svelte/icons/alert-circle'
    import DownloadIcon from '@lucide/svelte/icons/download'
    import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw'
    import { createMutation, createQuery } from '@tanstack/svelte-query'
    import { toast } from 'svelte-sonner'

    import { objectStorageClient } from '$lib/clients'
    import { useSessionContext } from '$lib/states/session'
    import { createTenantKey } from '$lib/states/session/tenant'
    import { formatBytes, getErrorMessage } from '$lib/utilities/helpers'

    ///////////////////
    // 02. Constants //
    ///////////////////

    const DOWNLOAD_TOAST_ID = 'object-storage-download'
    const DOWNLOAD_PAGE_SIZE = 25
    const TOAST_FEEDBACK_DURATION = 8000
    const downloadDateFormatter = new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
    })
    const session = useSessionContext()

    ///////////////
    // 03. State //
    ///////////////

    let currentPage = $state(1)
    let selectedObjectStorageId = $state('')

    /////////////////
    // 04. Derived //
    /////////////////

    const files = $derived.by(() => downloadListQuery.data?.data ?? [])
    const offset = $derived((currentPage - 1) * DOWNLOAD_PAGE_SIZE)
    const isInteractionLocked = $derived.by(
        () => downloadListQuery.isFetching || selectedObjectStorageId !== '',
    )

    /////////////////
    // 05. Queries //
    /////////////////

    const downloadListQuery = createQuery(() => {
        const input = {
            limit: DOWNLOAD_PAGE_SIZE,
            offset,
            sortOrder: 'desc' as const,
        }

        return {
            enabled: Boolean(session.data.organizationSlug),
            queryKey: createTenantKey(
                session.data.organizationSlug,
                'objectStorage',
                'download',
                'readMany',
                input,
            ),
            queryFn: async () => {
                const response =
                    await objectStorageClient.download.readMany.$query({
                        json: input,
                    })
                const responseJson = await response.json()

                if (!responseJson.success) {
                    throw new Error(responseJson.error.message)
                }

                return {
                    data: responseJson.data,
                    count: responseJson.count,
                    limit: responseJson.limit,
                    offset: responseJson.offset,
                }
            },
        }
    })

    ///////////////////
    // 06. Mutations //
    ///////////////////

    const downloadLinkMutation = createMutation(() => ({
        mutationKey: createTenantKey(
            session.data.organizationSlug,
            'objectStorage',
            'download',
            'link',
            'create',
        ),
        mutationFn: createDownloadLink,
    }))

    //////////////////
    // 09. Handlers //
    //////////////////

    async function handleDownloadSelect(event: Event) {
        if (selectedObjectStorageId !== '') return

        const objectStorageId = (event.currentTarget as HTMLElement).dataset
            .objectStorageId
        const file = files.find(
            (candidate) => candidate.objectStorageId === objectStorageId,
        )

        if (!file) return

        const downloadWindow = window.open('about:blank', '_blank')
        if (!downloadWindow) {
            toast.error('Download blocked', {
                id: DOWNLOAD_TOAST_ID,
                duration: TOAST_FEEDBACK_DURATION,
                description: 'Allow popups for this site, then try again.',
            })
            return
        }

        downloadWindow.opener = null
        selectedObjectStorageId = file.objectStorageId

        try {
            const downloadUrl = await downloadLinkMutation.mutateAsync(file)
            downloadWindow.location.replace(downloadUrl)
        } catch (error) {
            downloadWindow.close()
            toast.error('Download failed', {
                id: DOWNLOAD_TOAST_ID,
                duration: TOAST_FEEDBACK_DURATION,
                description: getErrorMessage(error, 'Download action failed.'),
            })
        } finally {
            selectedObjectStorageId = ''
        }
    }

    function handleRefresh() {
        void downloadListQuery.refetch()
    }

    /////////////////
    // 10. Helpers //
    /////////////////

    async function createDownloadLink(file: (typeof files)[number]) {
        const response = await objectStorageClient.download.link.create.$get({
            query: {
                uploadId: file.uploadId,
            },
        })
        const responseJson = await response.json()

        if (!responseJson.success) {
            throw new Error(responseJson.error.message)
        }

        const downloadData = responseJson.data.downloadUrls.find(
            (candidate) => candidate.objectStorageId === file.objectStorageId,
        )

        if (!downloadData?.downloadUrl) {
            throw new Error('Download link is not available.')
        }

        return downloadData.downloadUrl
    }

    function formatDate(date: string | Date) {
        return downloadDateFormatter.format(new Date(date))
    }
</script>

<div class="flex min-h-svh flex-col gap-6 p-4 md:p-6">
    <header class="flex flex-wrap items-start justify-between gap-3">
        <div class="flex flex-col gap-1">
            <h2 class="text-2xl font-semibold tracking-normal">
                Object Storage Downloads
            </h2>
            <p class="text-sm text-muted-foreground">
                {downloadListQuery.data?.count ?? 0} uploaded objects
            </p>
        </div>
        <Button
            disabled={isInteractionLocked}
            onclick={handleRefresh}
            variant="outline"
        >
            {#if downloadListQuery.isFetching}
                <Spinner data-icon="inline-start" />
            {:else}
                <RefreshCwIcon data-icon="inline-start" />
            {/if}
            Refresh
        </Button>
    </header>

    {#if downloadListQuery.isError}
        <Alert.Root variant="destructive">
            <AlertCircleIcon />
            <Alert.Title>Download list unavailable</Alert.Title>
            <Alert.Description>
                {getErrorMessage(
                    downloadListQuery.error,
                    'Download list failed.',
                )}
            </Alert.Description>
        </Alert.Root>
    {/if}

    <Card.Root>
        <Card.Header>
            <Card.Title>Uploaded objects</Card.Title>
            <Card.Description>
                Select an uploaded object to create a download link.
            </Card.Description>
        </Card.Header>
        <Card.Content>
            {#if downloadListQuery.isPending}
                <div
                    class="flex flex-col gap-3"
                    aria-label="Loading objects"
                >
                    {#each [1, 2, 3, 4, 5] as skeletonIndex (skeletonIndex)}
                        <Skeleton class="h-12 w-full" />
                    {/each}
                </div>
            {:else if files.length === 0}
                <Empty.Root>
                    <Empty.Header>
                        <Empty.Title>No uploaded objects</Empty.Title>
                        <Empty.Description>
                            Uploaded objects will appear here when they are
                            ready.
                        </Empty.Description>
                    </Empty.Header>
                </Empty.Root>
            {:else}
                <div class="overflow-hidden rounded-lg border">
                    <Table.Root>
                        <Table.Caption class="sr-only">
                            Uploaded objects available for download
                        </Table.Caption>
                        <Table.Header>
                            <Table.Row>
                                <Table.Head>Object</Table.Head>
                                <Table.Head class="w-32">Access</Table.Head>
                                <Table.Head class="w-28">Size</Table.Head>
                                <Table.Head class="w-44">Uploaded</Table.Head>
                                <Table.Head class="w-20 text-right">
                                    <span class="sr-only">Actions</span>
                                </Table.Head>
                            </Table.Row>
                        </Table.Header>
                        <Table.Body>
                            {#each files as file (file.uploadId + file.objectStorageId)}
                                <Table.Row>
                                    <Table.Cell>
                                        <div class="min-w-0">
                                            <p
                                                class="truncate font-medium"
                                                title={file.objectStorageId}
                                            >
                                                {file.objectStorageId}
                                            </p>
                                            <p
                                                class="truncate text-xs text-muted-foreground"
                                                title={file.hashSha256}
                                            >
                                                {file.mimeType ??
                                                    'application/octet-stream'}
                                                · {file.hashSha256}
                                            </p>
                                        </div>
                                    </Table.Cell>
                                    <Table.Cell>
                                        {#if file.isPublic}
                                            <Badge>Public</Badge>
                                        {:else}
                                            <Badge variant="secondary">
                                                Private
                                            </Badge>
                                        {/if}
                                    </Table.Cell>
                                    <Table.Cell class="text-muted-foreground">
                                        {formatBytes(file.size)}
                                    </Table.Cell>
                                    <Table.Cell class="text-muted-foreground">
                                        {formatDate(file.uploadCreatedAt)}
                                    </Table.Cell>
                                    <Table.Cell class="text-right">
                                        <Button
                                            aria-busy={selectedObjectStorageId ===
                                                file.objectStorageId}
                                            aria-label={selectedObjectStorageId ===
                                            file.objectStorageId
                                                ? `Preparing download for ${file.objectStorageId}`
                                                : `Download ${file.objectStorageId}`}
                                            data-object-storage-id={file.objectStorageId}
                                            disabled={selectedObjectStorageId !==
                                                ''}
                                            onclick={handleDownloadSelect}
                                            size="icon"
                                            variant="ghost"
                                        >
                                            {#if selectedObjectStorageId === file.objectStorageId}
                                                <Spinner
                                                    aria-hidden="true"
                                                    data-icon="inline-start"
                                                />
                                            {:else}
                                                <DownloadIcon
                                                    aria-hidden="true"
                                                    data-icon="inline-start"
                                                />
                                            {/if}
                                        </Button>
                                    </Table.Cell>
                                </Table.Row>
                            {/each}
                        </Table.Body>
                    </Table.Root>
                </div>
            {/if}
        </Card.Content>
        {#if (downloadListQuery.data?.count ?? 0) > DOWNLOAD_PAGE_SIZE}
            <Card.Footer>
                <Pagination.Root
                    bind:page={currentPage}
                    count={downloadListQuery.data?.count ?? 0}
                    perPage={DOWNLOAD_PAGE_SIZE}
                >
                    {#snippet children({ pages, currentPage: activePage })}
                        <Pagination.Content>
                            <Pagination.Item>
                                <Pagination.Previous
                                    disabled={isInteractionLocked}
                                />
                            </Pagination.Item>
                            {#each pages as paginationPage (paginationPage.key)}
                                {#if paginationPage.type === 'ellipsis'}
                                    <Pagination.Item>
                                        <Pagination.Ellipsis />
                                    </Pagination.Item>
                                {:else}
                                    <Pagination.Item>
                                        <Pagination.Link
                                            disabled={isInteractionLocked}
                                            isActive={activePage ===
                                                paginationPage.value}
                                            page={paginationPage}
                                        />
                                    </Pagination.Item>
                                {/if}
                            {/each}
                            <Pagination.Item>
                                <Pagination.Next
                                    disabled={isInteractionLocked}
                                />
                            </Pagination.Item>
                        </Pagination.Content>
                    {/snippet}
                </Pagination.Root>
            </Card.Footer>
        {/if}
    </Card.Root>
</div>
