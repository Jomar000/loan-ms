import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-svelte'

import ObjectStorageDownloadListPage from './ObjectStorageDownloadListPage.svelte'

type MutationFactory = () => {
    mutationFn: (variables: unknown) => unknown
}

const fixtures = vi.hoisted(() => ({
    file: {
        hashSha256: 'hash',
        isPublic: false,
        mimeType: 'text/plain',
        objectCreatedAt: '2026-01-01T00:00:00.000Z',
        objectStorageId: 'object-id',
        size: 128,
        uploadCreatedAt: '2026-01-01T00:00:00.000Z',
        uploadId: 'upload-id',
    },
    secondFile: {
        hashSha256: 'second-hash',
        isPublic: true,
        mimeType: 'application/pdf',
        objectCreatedAt: '2026-01-02T00:00:00.000Z',
        objectStorageId: 'second-object-id',
        size: 256,
        uploadCreatedAt: '2026-01-02T00:00:00.000Z',
        uploadId: 'second-upload-id',
    },
}))

const mocks = vi.hoisted(() => ({
    createDownloadLink: vi.fn(),
    open: vi.fn(),
    toastError: vi.fn(),
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
    createQuery: () => ({
        data: {
            count: 30,
            data: [
                fixtures.file,
                fixtures.secondFile,
            ],
            limit: 25,
            offset: 0,
        },
        isError: false,
        isFetching: false,
        isPending: false,
        refetch: vi.fn(),
    }),
}))
vi.mock('svelte-sonner', () => ({
    toast: { error: mocks.toastError },
}))

vi.mock('$lib/clients', () => ({
    objectStorageClient: {
        download: {
            link: {
                create: {
                    $get: mocks.createDownloadLink,
                },
            },
        },
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

describe('ObjectStorageDownloadListPage', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        vi.spyOn(window, 'open').mockImplementation(mocks.open)
        mocks.createDownloadLink.mockResolvedValue(
            createSuccessfulDownloadResponse(),
        )
    })

    it('opens and detaches a target before requesting the link', async () => {
        const target = createTargetWindow()
        mocks.createDownloadLink.mockImplementation(async () => {
            expect(target.window.opener).toBeNull()
            return createSuccessfulDownloadResponse()
        })
        const screen = await renderDownloadPage(target.window)

        await clickDownload(screen)

        expect(mocks.open).toHaveBeenCalledWith('about:blank', '_blank')
        await expect
            .poll(() => mocks.createDownloadLink.mock.calls.length)
            .toBe(1)
    })

    it('skips the API request when the browser blocks the target', async () => {
        const screen = await renderDownloadPage(null)

        await clickDownload(screen)

        await expect.poll(() => mocks.toastError.mock.calls.length).toBe(1)
        expect(mocks.createDownloadLink).not.toHaveBeenCalled()
        expect(mocks.toastError).toHaveBeenCalledWith('Download blocked', {
            description: 'Allow popups for this site, then try again.',
            duration: 8000,
            id: 'object-storage-download',
        })
    })

    it('navigates the pre-opened target after a successful response', async () => {
        const target = createTargetWindow()
        const screen = await renderDownloadPage(target.window)

        await clickDownload(screen)

        await expect.poll(() => target.replace.mock.calls.length).toBe(1)
        expect(mocks.createDownloadLink).toHaveBeenCalledWith({
            query: { uploadId: 'upload-id' },
        })
        expect(target.replace).toHaveBeenCalledWith(
            'https://download.example/file',
        )
        expect(target.close).not.toHaveBeenCalled()
        expect(mocks.toastError).not.toHaveBeenCalled()
    })

    it('closes the target and shows stable feedback when the request fails', async () => {
        const target = createTargetWindow()
        mocks.createDownloadLink.mockResolvedValue({
            json: async () => ({
                error: { message: 'Signing failed.' },
                success: false,
            }),
        })
        const screen = await renderDownloadPage(target.window)

        await clickDownload(screen)

        await expect.poll(() => target.close.mock.calls.length).toBe(1)
        expect(target.replace).not.toHaveBeenCalled()
        expect(mocks.toastError).toHaveBeenCalledWith('Download failed', {
            description: 'Signing failed.',
            duration: 8000,
            id: 'object-storage-download',
        })
    })

    it('prevents overlapping link requests and restores every control', async () => {
        const deferred =
            createDeferred<
                ReturnType<typeof createSuccessfulDownloadResponse>
            >()
        const target = createTargetWindow()
        mocks.createDownloadLink.mockReturnValueOnce(deferred.promise)
        const screen = await renderDownloadPage(target.window)
        const firstDownload = screen.getByRole('button', {
            name: 'Download object-id',
        })
        const secondDownload = screen.getByRole('button', {
            name: 'Download second-object-id',
        })
        const refreshButton = screen.getByRole('button', { name: 'Refresh' })
        const nextButton = screen.getByRole('button', { name: 'Next' })

        await firstDownload.click()
        secondDownload
            .element()
            .dispatchEvent(new MouseEvent('click', { bubbles: true }))

        await expect
            .poll(() => mocks.createDownloadLink.mock.calls.length)
            .toBe(1)
        expect(mocks.open).toHaveBeenCalledOnce()
        await expect.element(secondDownload).toBeDisabled()
        await expect
            .element(
                screen.getByRole('button', {
                    name: 'Preparing download for object-id',
                }),
            )
            .toBeDisabled()
        await expect.element(refreshButton).toBeDisabled()
        await expect.element(nextButton).toBeDisabled()

        deferred.resolve(createSuccessfulDownloadResponse())

        await expect.poll(() => target.replace.mock.calls.length).toBe(1)
        await expect
            .element(screen.getByRole('button', { name: 'Download object-id' }))
            .toBeEnabled()
        await expect.element(secondDownload).toBeEnabled()
        await expect.element(refreshButton).toBeEnabled()
        await expect.element(nextButton).toBeEnabled()
    })
})

async function clickDownload(
    screen: Awaited<ReturnType<typeof renderDownloadPage>>,
) {
    await screen.getByRole('button', { name: 'Download object-id' }).click()
}

function createSuccessfulDownloadResponse() {
    return {
        json: async () => ({
            data: {
                downloadUrls: [
                    {
                        downloadUrl: 'https://download.example/file',
                        objectStorageId: 'object-id',
                    },
                ],
            },
            success: true,
        }),
    }
}

function createTargetWindow() {
    const close = vi.fn()
    const replace = vi.fn()
    const target = {
        close,
        location: { replace },
        opener: window,
    }

    return {
        close,
        replace,
        window: target as unknown as Window,
    }
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

async function renderDownloadPage(target: Window | null) {
    mocks.open.mockReturnValue(target)
    return render(ObjectStorageDownloadListPage)
}

// =============================================================================
// END OF BASE TEMPLATE TESTS - FORK-SPECIFIC TESTS MUST BE ADDED BELOW
// =============================================================================
