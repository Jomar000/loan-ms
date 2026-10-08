import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-svelte'
import { page } from 'vitest/browser'

import '../../../../app.css'
import BorrowerManagementPage from './BorrowerManagementPage.svelte'

const mocks = vi.hoisted(() => {
    let resolveCreate: ((value: unknown) => void) | undefined
    let rejectCreate: ((reason: unknown) => void) | undefined

    return {
        create: vi.fn(
            () =>
                new Promise((resolve, reject) => {
                    resolveCreate = resolve
                    rejectCreate = reject
                }),
        ),
        goto: vi.fn(async () => undefined),
        list: {
            count: 1,
            data: [
                {
                    borrowerNumber: 'BR-000001',
                    contactNumber: '09171234567',
                    fullName: 'Maria Santos',
                    paymentTag: 'GOOD_PAYER' as const,
                    paymentTagSource: 'SYSTEM' as const,
                    publicId: '019936e2-b837-7000-8000-000000000001',
                    status: 'ACTIVE' as const,
                },
            ],
            limit: 25,
            offset: 0,
        },
        refetch: vi.fn(async () => undefined),
        rejectCreate(reason: unknown) {
            rejectCreate?.(reason)
        },
        resolveCreate(value: unknown) {
            resolveCreate?.(value)
        },
        toastError: vi.fn(),
        toastSuccess: vi.fn(),
    }
})

vi.mock('$app/navigation', () => ({ goto: mocks.goto }))
vi.mock('$lib/states/session', () => ({
    useSessionContext: () => ({ data: { organizationSlug: 'alpha' } }),
}))
vi.mock('svelte-sonner', () => ({
    toast: { error: mocks.toastError, success: mocks.toastSuccess },
}))
vi.mock('../queries', () => ({
    createBorrowerCreateMutation: () => ({ mutateAsync: mocks.create }),
    createBorrowerListQuery: () => ({
        data: mocks.list,
        isError: false,
        isFetching: false,
        isPending: false,
        refetch: mocks.refetch,
    }),
}))

describe('Borrower management page', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('shows an existing borrower and opens the create workflow', async () => {
        const screen = await render(BorrowerManagementPage, {
            props: { role: 'owner' },
        })

        await expect.element(screen.getByText('Maria Santos')).toBeVisible()
        await screen
            .getByRole('button', { name: /create new borrower/i })
            .click()
        await expect
            .element(
                screen.getByRole('dialog', { name: /create new borrower/i }),
            )
            .toBeVisible()
        await expect.element(screen.getByLabelText('Full name')).toBeVisible()
        await expect
            .element(screen.getByLabelText('Birthdate'))
            .not.toBeInTheDocument()
        await expect
            .element(screen.getByText('Emergency contact'))
            .not.toBeInTheDocument()
    })

    it('creates with only a full name and primary contact while keeping address defaults editable', async () => {
        const screen = await render(BorrowerManagementPage, {
            props: { role: 'owner' },
        })

        await screen
            .getByRole('button', { name: /create new borrower/i })
            .click()
        await expect
            .element(screen.getByLabelText('Province'))
            .toHaveValue('Nueva Ecija')
        await expect
            .element(screen.getByLabelText('Postal code'))
            .toHaveValue('3105')
        await screen.getByLabelText('Full name').fill('Ñora#7')
        await screen
            .getByLabelText('Primary contact number')
            .fill('09171234567')
        await screen.getByRole('button', { name: /create borrower/i }).click()

        expect(mocks.create).toHaveBeenCalledWith(
            expect.objectContaining({
                addressLine: '',
                barangay: '',
                cityMunicipality: '',
                contactNumber: '09171234567',
                fullName: 'Ñora#7',
                postalCode: '3105',
                province: 'Nueva Ecija',
            }),
        )
        mocks.resolveCreate({
            borrower: { publicId: '019936e2-b837-7000-8000-000000000003' },
            duplicateCandidates: [],
        })
        await expect
            .element(
                screen.getByRole('dialog', { name: /create new borrower/i }),
            )
            .not.toBeInTheDocument()
        expect(mocks.toastSuccess).toHaveBeenCalledWith(
            'Borrower created successfully.',
            expect.objectContaining({
                action: expect.objectContaining({ label: 'View borrower' }),
            }),
        )
    })

    it('locks duplicate creation and warns about returned duplicate candidates', async () => {
        const screen = await render(BorrowerManagementPage, {
            props: { role: 'owner' },
        })

        await screen
            .getByRole('button', { name: /create new borrower/i })
            .click()
        await fillRequiredBorrowerFields(screen)
        const submit = screen.getByRole('button', { name: /create borrower/i })
        await submit.click()

        await expect.element(submit).toBeDisabled()
        expect(mocks.create).toHaveBeenCalledTimes(1)

        mocks.resolveCreate({
            borrower: {
                publicId: '019936e2-b837-7000-8000-000000000002',
            },
            duplicateCandidates: [
                {
                    borrowerNumber: 'BR-000001',
                    contactNumber: '09171234567',
                    fullName: 'Maria Santos',
                    publicId: '019936e2-b837-7000-8000-000000000001',
                },
            ],
        })

        await expect
            .element(
                screen.getByRole('dialog', { name: /create new borrower/i }),
            )
            .not.toBeInTheDocument()
        expect(mocks.toastSuccess).toHaveBeenCalledWith(
            'Borrower created successfully.',
            expect.objectContaining({
                description: expect.stringContaining(
                    'Similar borrower records',
                ),
            }),
        )
        mocks.toastSuccess.mock.calls.at(-1)?.[1]?.action.onClick()
        expect(mocks.goto).toHaveBeenCalledWith(
            '/app/owner/borrowers/019936e2-b837-7000-8000-000000000002',
        )
    })

    it('shows a plain-language error dialog and keeps the entered details', async () => {
        const screen = await render(BorrowerManagementPage, {
            props: { role: 'owner' },
        })

        await screen
            .getByRole('button', { name: /create new borrower/i })
            .click()
        await screen.getByLabelText('Full name').fill('Ana Dela Cruz')
        await screen
            .getByLabelText('Primary contact number')
            .fill('09171234567')
        await screen.getByRole('button', { name: /create borrower/i }).click()
        mocks.rejectCreate(new Error('[{"code":"custom","path":["fullName"]}]'))

        await expect
            .element(
                screen.getByRole('dialog', {
                    name: 'Borrower could not be created',
                }),
            )
            .toBeVisible()
        await expect
            .element(
                screen.getByText(
                    'Please review the borrower details and try again.',
                ),
            )
            .toBeVisible()
        await screen.getByRole('button', { name: 'Back to form' }).click()
        await expect
            .element(screen.getByLabelText('Full name'))
            .toHaveValue('Ana Dela Cruz')
    })
})

async function fillRequiredBorrowerFields(
    screen: Awaited<ReturnType<typeof render>>,
) {
    await screen.getByLabelText('Full name').fill('Ana Dela Cruz')
    await screen.getByLabelText('Primary contact number').fill('09171234567')
    await screen.getByLabelText('Street address').fill('1 Rizal Street')
    await screen.getByLabelText('Barangay').fill('San Jose')
    await screen.getByLabelText('City or municipality').fill('Manila')
    await screen.getByLabelText('Province').fill('Metro Manila')
}

describe('Borrower workspace scrolling', () => {
    const originalList = { ...mocks.list, data: [...mocks.list.data] }
    afterEach(() => Object.assign(mocks.list, originalList))

    for (const viewport of [
        { name: 'mobile', width: 375, height: 560 },
        { name: 'tablet', width: 768, height: 650 },
        { name: 'desktop', width: 1440, height: 800 },
    ]) {
        it(`${
            viewport.name
        } keeps borrowers and pagination reachable with a long table`, async () => {
            mocks.list.count = 80
            mocks.list.data = Array.from({ length: 80 }, (_, index) => ({
                ...originalList.data[0],
                borrowerNumber: `BR-${String(index + 1).padStart(6, '0')}`,
                publicId: `019936e2-b837-7000-8000-${String(index + 1).padStart(
                    12,
                    '0',
                )}`,
            }))
            await page.viewport(viewport.width, viewport.height)
            const screen = await render(BorrowerManagementPage, {
                props: { role: 'owner' },
            })
            screen.container.style.cssText =
                'display: flex; flex-direction: column; height: calc(100dvh - 80px); width: 100%;'
            const table = screen
                .getByRole('table')
                .element() as HTMLTableElement
            const scroller = table.parentElement!.parentElement!
            const pageRoot = screen.container.querySelector('section')!
            const nextPage = screen
                .getByRole('button', { name: 'Next page' })
                .element()
            await expect.poll(() => scroller.clientHeight).toBeGreaterThan(150)
            expect(screen.container.scrollWidth).toBeLessThanOrEqual(
                screen.container.clientWidth,
            )
            expect(scroller.scrollHeight).toBeGreaterThan(scroller.clientHeight)
            expect(table.getBoundingClientRect().bottom).toBeGreaterThan(
                scroller.getBoundingClientRect().bottom,
            )
            scroller.scrollTop = 250
            await expect
                .poll(() =>
                    Math.abs(
                        table.tHead!.getBoundingClientRect().top -
                            scroller.getBoundingClientRect().top,
                    ),
                )
                .toBeLessThan(2)
            if (viewport.width < 760) {
                scroller.scrollLeft = scroller.scrollWidth
                await expect.poll(() => scroller.scrollLeft).toBeGreaterThan(0)
            }
            pageRoot.scrollTop = pageRoot.scrollHeight
            await expect
                .poll(() => nextPage.getBoundingClientRect().bottom)
                .toBeLessThanOrEqual(pageRoot.getBoundingClientRect().bottom)
            expect(nextPage.getBoundingClientRect().top).toBeGreaterThanOrEqual(
                pageRoot.getBoundingClientRect().top,
            )
            await screen.unmount()
        })
    }
})
