import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-svelte'

import BorrowerManagementPage from './BorrowerManagementPage.svelte'

const mocks = vi.hoisted(() => {
    let resolveCreate: ((value: unknown) => void) | undefined

    return {
        create: vi.fn(
            () =>
                new Promise((resolve) => {
                    resolveCreate = resolve
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

    it('locks duplicate creation and shows returned duplicate candidates', async () => {
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
            .element(screen.getByText('Possible duplicate records'))
            .toBeVisible()
        await screen.getByRole('button', { name: 'View Borrower' }).click()
        expect(mocks.goto).toHaveBeenCalledWith(
            '/app/owner/borrowers/019936e2-b837-7000-8000-000000000002',
        )
    })
})

async function fillRequiredBorrowerFields(
    screen: Awaited<ReturnType<typeof render>>,
) {
    await screen.getByLabelText('Full name').fill('Ana Dela Cruz')
    await screen.getByLabelText('Mobile number').fill('09171234567')
    await screen.getByLabelText('Street address').fill('1 Rizal Street')
    await screen.getByLabelText('Barangay').fill('San Jose')
    await screen.getByLabelText('City or municipality').fill('Manila')
    await screen.getByLabelText('Province').fill('Metro Manila')
}
