import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-svelte'

import MultiFileUpload from './MultiFileUpload.svelte'
import type { UploadMetadata } from './utilities/singleFileUpload'

type CommitCallback = (data: {
    attachments: string[]
    uploadId: string
}) => void | Promise<void>

type MutationFactory = () => {
    mutationFn: (variables: unknown) => unknown
}

type PrepareUploadFilesInput = {
    selectedFiles: FileList
}

type UploadQueuedFilesInput = {
    idempotencyKey: string
    onFileChange?: (file: UploadMetadata) => void
    queuedFiles: UploadMetadata[]
}

const mocks = vi.hoisted(() => ({
    confirmAttachmentBatchSuccess: vi.fn(),
    confirmUploadSuccess: vi.fn(),
    commitUploadSession: vi.fn(),
    createUploadId: vi.fn(),
    idempotencyLifecycleCount: 0,
    prepareUploadFiles: vi.fn(),
    revokePreviewUrls: vi.fn(),
    toastSuccess: vi.fn(),
    toastWarning: vi.fn(),
    uploadQueuedFiles: vi.fn(),
}))

vi.mock('@tanstack/svelte-query', () => ({
    createMutation: (createOptions: MutationFactory) => {
        const options = createOptions()

        return {
            isPending: false,
            mutateAsync: (variables: unknown) =>
                Promise.resolve(options.mutationFn(variables)),
        }
    },
}))
vi.mock('svelte-sonner', () => ({
    toast: {
        success: mocks.toastSuccess,
        warning: mocks.toastWarning,
    },
}))

vi.mock('$lib/components/upload/utilities/singleFileUpload', () => ({
    commitUploadSession: mocks.commitUploadSession,
    createUploadId: mocks.createUploadId,
    prepareUploadFiles: mocks.prepareUploadFiles,
    removeUploadFile: vi.fn(),
    retryUploadFile: vi.fn(),
    revokePreviewUrls: mocks.revokePreviewUrls,
    uploadQueuedFiles: mocks.uploadQueuedFiles,
}))
vi.mock('$lib/utilities/idempotencyKey', () => ({
    createIdempotencyKeyLifecycle: () => {
        const lifecycleIndex = mocks.idempotencyLifecycleCount++
        return {
            current:
                lifecycleIndex === 0
                    ? 'attachment-idempotency-key'
                    : 'upload-idempotency-key',
            confirmSuccess:
                lifecycleIndex === 0
                    ? mocks.confirmAttachmentBatchSuccess
                    : mocks.confirmUploadSuccess,
        }
    },
}))
vi.mock('$lib/states/session', () => ({
    useSessionContext: () => ({
        data: { organizationSlug: 'current-organization' },
    }),
}))
vi.mock('$lib/states/session/tenant', () => ({
    createTenantKey: (organizationSlug: string, ...segments: unknown[]) => [
        organizationSlug,
        ...segments,
    ],
}))

describe('MultiFileUpload', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mocks.idempotencyLifecycleCount = 0

        mocks.commitUploadSession.mockResolvedValue({
            attachments: ['object-id'],
            uploadId: 'upload-id',
        })
        mocks.createUploadId.mockResolvedValue('upload-id')
        mocks.prepareUploadFiles.mockImplementation(
            async ({ selectedFiles }: PrepareUploadFilesInput) => ({
                maxItemsReached: false,
                queuedFiles: [createQueuedFile(selectedFiles[0]!)],
            }),
        )
        mocks.uploadQueuedFiles.mockImplementation(
            async ({ onFileChange, queuedFiles }: UploadQueuedFilesInput) => {
                const file = queuedFiles[0]!
                file.objectId = 'object-id'
                file.status = 'UPLOADED'
                onFileChange?.(file)
            },
        )
    })

    it('creates no session before a valid file is prepared', async () => {
        mocks.prepareUploadFiles.mockResolvedValueOnce({
            maxItemsReached: false,
            queuedFiles: [],
        })
        const screen = await render(MultiFileUpload)

        expect(mocks.createUploadId).not.toHaveBeenCalled()
        selectFile(screen.container)

        await expect
            .poll(() => mocks.prepareUploadFiles.mock.calls.length)
            .toBe(1)
        expect(mocks.createUploadId).not.toHaveBeenCalled()
    })

    it('reuses the upload-session key after a failed create', async () => {
        mocks.createUploadId
            .mockRejectedValueOnce(new Error('Create failed.'))
            .mockResolvedValueOnce('upload-id')
        const screen = await render(MultiFileUpload)

        selectFile(screen.container)
        await expect.element(screen.getByText('Create failed.')).toBeVisible()
        expect(mocks.revokePreviewUrls).toHaveBeenCalledOnce()

        selectFile(screen.container)
        await expect.poll(() => mocks.createUploadId.mock.calls.length).toBe(2)

        expect(mocks.createUploadId).toHaveBeenNthCalledWith(
            1,
            'upload-idempotency-key',
        )
        expect(mocks.createUploadId).toHaveBeenNthCalledWith(
            2,
            'upload-idempotency-key',
        )
        expect(mocks.confirmUploadSuccess).toHaveBeenCalledOnce()
    })

    it('rotates the key after upload-session creation succeeds', async () => {
        const screen = await render(MultiFileUpload)

        expect(mocks.createUploadId).not.toHaveBeenCalled()
        selectFile(screen.container)

        await expect
            .poll(() => mocks.confirmUploadSuccess.mock.calls.length)
            .toBe(1)
        expect(mocks.createUploadId).toHaveBeenCalledWith(
            'upload-idempotency-key',
        )
    })

    it('locks clearing while an upload action is pending', async () => {
        const deferred = createDeferred<void>()
        mocks.uploadQueuedFiles.mockReturnValueOnce(deferred.promise)
        const screen = await render(MultiFileUpload, {
            uploadId: 'upload-id',
        })

        selectFile(screen.container)
        const clearButton = screen.getByRole('button', {
            name: 'Clear selected files',
        })

        await expect.element(clearButton).toBeDisabled()
        deferred.resolve()
        await expect.element(clearButton).toBeEnabled()
    })

    it('names progress and per-file actions', async () => {
        const screen = await render(MultiFileUpload, {
            uploadId: 'upload-id',
        })
        selectFile(screen.container)

        await expect
            .element(
                screen.getByRole('progressbar', {
                    name: 'Overall upload progress',
                }),
            )
            .toBeInTheDocument()
        await expect
            .element(
                screen.getByRole('button', {
                    name: 'Actions for document.txt',
                }),
            )
            .toBeVisible()
    })

    it('uses and rotates the attachment-batch key after creation succeeds', async () => {
        const screen = await render(MultiFileUpload, {
            uploadId: 'upload-id',
        })

        selectFile(screen.container)

        await expect
            .poll(() => mocks.uploadQueuedFiles.mock.calls.length)
            .toBe(1)
        expect(mocks.uploadQueuedFiles).toHaveBeenCalledWith(
            expect.objectContaining({
                idempotencyKey: 'attachment-idempotency-key',
            }),
        )
        expect(mocks.confirmAttachmentBatchSuccess).toHaveBeenCalledOnce()
    })

    it('shows one success toast after persistence and callback complete', async () => {
        const onCommit = vi.fn()
        const { commitButton } = await renderReadyUpload(onCommit)

        await commitButton.click()

        await expect.poll(() => mocks.toastSuccess.mock.calls.length).toBe(1)
        expect(onCommit).toHaveBeenCalledOnce()
        expect(mocks.toastSuccess).toHaveBeenCalledWith('Upload complete', {
            id: 'upload-commit',
        })
        expect(mocks.toastWarning).not.toHaveBeenCalled()
    })

    it('keeps persistence failures retryable without showing success', async () => {
        mocks.commitUploadSession.mockRejectedValue(
            new Error('Persistence failed.'),
        )
        const { commitButton, screen } = await renderReadyUpload()

        await commitButton.click()

        await expect
            .element(screen.getByText('Persistence failed.'))
            .toBeVisible()
        await expect.element(commitButton).toBeEnabled()
        expect(mocks.toastSuccess).not.toHaveBeenCalled()
        expect(mocks.toastWarning).not.toHaveBeenCalled()
    })

    it('keeps the upload committed when the post-success callback rejects', async () => {
        const onCommit = vi.fn().mockRejectedValue(new Error('Refresh failed.'))
        const { commitButton } = await renderReadyUpload(onCommit)

        await commitButton.click()

        await expect.poll(() => mocks.toastWarning.mock.calls.length).toBe(1)
        await expect.element(commitButton).toBeDisabled()
        expect(mocks.toastSuccess).not.toHaveBeenCalled()
        expect(mocks.toastWarning).toHaveBeenCalledWith('Upload saved', {
            description:
                'The upload completed, but the page could not finish updating.',
            duration: 8000,
            id: 'upload-commit',
        })
    })
})

function createQueuedFile(file: File): UploadMetadata {
    return {
        file,
        hashSha256: 'hash',
        isPublic: false,
        mimeType: file.type,
        objectId: '',
        previewUrl: null,
        status: 'QUEUED',
    }
}

async function renderReadyUpload(onCommit?: CommitCallback) {
    const screen = await render(MultiFileUpload, {
        onCommit,
        uploadId: 'upload-id',
    })
    selectFile(screen.container)

    const commitButton = screen.getByRole('button', { name: 'Commit' })
    await expect.element(commitButton).toBeEnabled()

    return { commitButton, screen }
}

function selectFile(container: HTMLElement) {
    const input =
        container.querySelector<HTMLInputElement>('input[type="file"]')
    if (!input) throw new Error('File input not found.')

    const transfer = new DataTransfer()
    transfer.items.add(
        new File(['test file'], 'document.txt', { type: 'text/plain' }),
    )

    Object.defineProperty(input, 'files', {
        configurable: true,
        value: transfer.files,
    })
    input.dispatchEvent(new Event('change', { bubbles: true }))
}

function createDeferred<T>() {
    let resolve!: (value: T | PromiseLike<T>) => void
    let reject!: (reason?: unknown) => void
    const promise = new Promise<T>((resolvePromise, rejectPromise) => {
        resolve = resolvePromise
        reject = rejectPromise
    })

    return { promise, reject, resolve }
}

// =============================================================================
// END OF BASE TEMPLATE TESTS - FORK-SPECIFIC TESTS MUST BE ADDED BELOW
// =============================================================================
