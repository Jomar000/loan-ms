import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-svelte'

import BorrowerProfilePageTestHarness from './BorrowerProfilePageTestHarness.svelte'

const mocks = vi.hoisted(() => ({
    goto: vi.fn(async () => undefined),
    toastError: vi.fn(),
    toastSuccess: vi.fn(),
}))

vi.mock('$app/navigation', () => ({ goto: mocks.goto }))
vi.mock('$lib/states/session', () => ({
    useSessionContext: () => ({ data: { organizationSlug: 'alpha' } }),
}))
vi.mock('svelte-sonner', () => ({
    toast: { error: mocks.toastError, success: mocks.toastSuccess },
}))
vi.mock('$lib/modules/loan/queries', () => ({
    createLoanListQuery: () => ({
        data: { data: [] },
        isPending: false,
        refetch: vi.fn(),
    }),
}))
vi.mock('../queries', () => ({
    createBorrowerArchiveMutation: () => ({ mutateAsync: vi.fn() }),
    createBorrowerDetailQuery: () => ({
        data: {
            addressLine: '1 Rizal Street',
            barangay: 'San Jose',
            borrowerNumber: 'BR-000001',
            cityMunicipality: 'Manila',
            contactNumber: '09171234567',
            email: null,
            fullName: 'Ana Dela Cruz',
            gender: 'FEMALE',
            notes: null,
            paymentTag: 'GOOD_PAYER',
            paymentTagOverrideReason: null,
            paymentTagSource: 'SYSTEM',
            paymentTagUpdatedAt: '2026-10-03T00:00:00.000Z',
            province: 'Metro Manila',
            publicId: '019936e2-b837-7000-8000-000000000001',
            secondaryContactNumber: null,
            status: 'ACTIVE',
            systemPaymentTag: 'GOOD_PAYER',
        },
        isError: false,
        isPending: false,
        refetch: vi.fn(),
    }),
    createBorrowerDocumentsQuery: () => ({ data: [], isPending: false }),
    createBorrowerPaymentTagOverrideMutation: () => ({ mutateAsync: vi.fn() }),
    createBorrowerPaymentTagQuery: () => ({
        data: {
            currentCalculatedTag: 'GOOD_PAYER',
            currentTag: 'GOOD_PAYER',
            lastCalculatedAt: '2026-10-03T00:00:00.000Z',
            missedInstallmentCount: 0,
            paymentType: null,
            source: 'SYSTEM',
            thresholds: {
                badPayerMinimumMissedInstallments: 3,
                scammerMinimumMissedInstallments: 7,
            },
        },
    }),
    createBorrowerPaymentTagResetMutation: () => ({ mutateAsync: vi.fn() }),
    createBorrowerUpdateMutation: () => ({ mutateAsync: vi.fn() }),
}))

describe('Borrower profile page', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('keeps a borrower with no loan explicitly available and explains the empty loan state', async () => {
        const screen = await render(BorrowerProfilePageTestHarness)

        await expect
            .element(screen.getByRole('heading', { name: 'Ana Dela Cruz' }))
            .toBeVisible()
        await expect
            .element(screen.getByText('Emergency contact:'))
            .not.toBeInTheDocument()
        await expect.element(screen.getByText('No loan yet')).toBeVisible()
        await screen.getByRole('tab', { name: 'Loans' }).click()
        await expect
            .element(
                screen.getByText(
                    'This borrower can remain independent of loans, or a new loan can be prepared when needed.',
                ),
            )
            .toBeVisible()
    })
})
