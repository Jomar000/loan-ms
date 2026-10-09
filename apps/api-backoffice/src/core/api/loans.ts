import { AppError, catalog, defineError } from '@loanms/errors'
import * as loanValidator from '@loanms/validator/backoffice/loan'
import { and, asc, count as countFn, desc, eq, isNull, like } from 'drizzle-orm'
import { Hono } from 'hono'
import type { ApplyGlobalResponse } from 'hono/client'
import { createMiddleware } from 'hono/factory'
import { v7 as uuidv7 } from 'uuid'

import {
    calculateLoan,
    createInstallmentSchedule,
    getFirstPaymentDate,
    type TLoanCalculationInput,
} from '../../services/loanCalculation/index.js'
import { readRuntimeSystemSettings } from '../../services/systemSettings.js'
import type { THonoInstance } from '../../types.js'
import {
    apiResponseErrorWrapper,
    apiResponseOkWrapper,
    apiResponsePaginatedOkWrapper,
    auditTrailAfterChangeStatement,
    auditTrailLogger,
    getActiveOrganizationId,
    markAuditTrailRecorded,
} from '../../utilities/helpers.js'
import { isTenantAuthenticated } from '../middleware/isTenantAuthenticated.js'
import { validateRequest } from '../middleware/validateRequest.js'

const loanNotFound = defineError(
    'LOAN_NOT_FOUND',
    'NOT_FOUND',
    'Loan not found.',
)
const loanProductNotFound = defineError(
    'LOAN_PRODUCT_NOT_FOUND',
    'NOT_FOUND',
    'Loan product not found.',
)
const loanDeleteConflict = defineError(
    'LOAN_DELETE_CONFLICT',
    'CONFLICT',
    'Only pending approval loans without related records can be deleted.',
)
const loanProductUnavailable = defineError(
    'LOAN_PRODUCT_UNAVAILABLE',
    'CONFLICT',
    'Loan product is not available.',
)
const loanBorrowerUnavailable = defineError(
    'LOAN_BORROWER_UNAVAILABLE',
    'CONFLICT',
    'Borrower is not eligible for a new loan.',
)
const loanPaymentFrequencyDisabled = defineError(
    'LOAN_PAYMENT_FREQUENCY_DISABLED',
    'CONFLICT',
    'The selected payment frequency is disabled by system settings.',
)
const loanBorrowerRiskBlocked = defineError(
    'LOAN_BORROWER_RISK_BLOCKED',
    'CONFLICT',
    'New loans are disabled for borrowers with the current risk tag.',
)
const loanLifecycleConflict = defineError(
    'LOAN_LIFECYCLE_CONFLICT',
    'CONFLICT',
    'Loan cannot transition from its current status.',
)
const primaryFundRequired = defineError(
    'PRIMARY_COMPANY_FUND_REQUIRED',
    'CONFLICT',
    'A primary company fund with opening capital must be configured before financial postings.',
)

type TFormulaSnapshot = {
    allowRenewalPrincipalChange: boolean
    finalInstallmentResiduePolicy: 'LAST_INSTALLMENT_ABSORBS_RESIDUE'
    fixedInterestAmountMinor: null | number
    formulaProfileId: number
    formulaProfileName: string
    formulaProfilePublicId: string
    formulaProfileVersion: number
    installmentCount: number
    interestMethod: 'FIXED_AMOUNT' | 'FLAT_PERCENTAGE'
    interestRateBasisPoints: number
    minCompletedInstallments: number
    partialCreditPolicy:
        'APPLY_TO_SETTLEMENT' | 'CARRY_FORWARD' | 'MANUAL_REVIEW' | 'REFUND'
    paymentFrequency: 'DAILY' | 'MONTHLY' | 'WEEKLY'
    renewalSettlementMethod:
        'COMPLETED_INSTALLMENT_BALANCE' | 'EXACT_OUTSTANDING_BALANCE'
    roundingMode: 'DOWN' | 'HALF_UP' | 'UP'
    termDays: number
    timezone: 'Asia/Manila'
}

type TLoanProduct = TFormulaSnapshot & {
    collectionAmountMinor: number | null
    id: number
    isActive: boolean
    maximumPrincipalAmountMinor: number
    minimumPrincipalAmountMinor: number
    name: string
    publicId: string
}

type TLoan = TFormulaSnapshot & {
    actualOutstandingBalanceMinor: number
    approvedAt: Date | null
    borrowerPublicId: string
    completedInstallmentCount: number
    createdAt: Date
    dailyPaymentAmountMinor: number
    expectedCompletionDate: string
    firstPaymentDate: string
    id: number
    installmentAmountMinor: number
    interestAmountMinor: number
    loanNumber: string
    loanProductNameSnapshot: string
    loanProductPublicId: string
    maximumPrincipalAmountMinorSnapshot: number
    minimumPrincipalAmountMinorSnapshot: number
    partialPaymentCreditMinor: number
    principalAmountMinor: number
    publicId: string
    releaseDate: null | string
    releasedAt: Date | null
    status: zLoanStatus
    totalAmountPaidMinor: number
    totalPayableAmountMinor: number
}

type zLoanStatus =
    | 'ACTIVE'
    | 'APPROVED'
    | 'CANCELLED'
    | 'DRAFT'
    | 'FULLY_PAID'
    | 'OVERDUE'
    | 'PENDING_APPROVAL'
    | 'RENEWED'
    | 'WRITTEN_OFF'

const tenantGuard = isTenantAuthenticated()

const privilegedGuard = createMiddleware<THonoInstance>(async (ctx, next) => {
    if (!ctx.get('isPrivilegedRole')) {
        return apiResponseErrorWrapper(ctx, catalog.authenticationForbidden)
    }
    await next()
})

const isoTime = (value: Date | null) =>
    value === null ? null : value.toISOString()

const manilaDate = (timestamp: number) => {
    const parts = new Intl.DateTimeFormat('en-CA', {
        day: '2-digit',
        month: '2-digit',
        timeZone: 'Asia/Manila',
        year: 'numeric',
    }).formatToParts(new Date(timestamp))
    const valueFor = (type: Intl.DateTimeFormatPartTypes) =>
        parts.find((part) => part.type === type)!.value
    return `${valueFor('year')}-${valueFor('month')}-${valueFor('day')}`
}

const formulaSnapshot = (row: TFormulaSnapshot) => ({
    fixedInterestAmountMinor: row.fixedInterestAmountMinor,
    formulaProfilePublicId: row.formulaProfilePublicId,
    formulaProfileVersion: row.formulaProfileVersion,
    installmentCount: row.installmentCount,
    interestMethod: row.interestMethod,
    interestRateBasisPoints:
        row.interestMethod === 'FLAT_PERCENTAGE'
            ? row.interestRateBasisPoints
            : null,
    paymentFrequency: row.paymentFrequency,
    roundingMode: row.roundingMode,
    termDays: row.termDays,
})

const productOutput = (product: TLoanProduct) => ({
    formulaProfilePublicId: product.formulaProfilePublicId,
    isActive: product.isActive,
    maximumPrincipalMinor: product.maximumPrincipalAmountMinor,
    minimumPrincipalMinor: product.minimumPrincipalAmountMinor,
    name: product.name,
    paymentFrequency: product.paymentFrequency,
    publicId: product.publicId,
})

const loanOutput = (loan: TLoan) => ({
    actualOutstandingBalanceMinor: loan.actualOutstandingBalanceMinor,
    approvedAt: isoTime(loan.approvedAt),
    approvedByUserPublicId: null,
    borrowerPublicId: loan.borrowerPublicId,
    completedInstallmentCount: loan.completedInstallmentCount,
    createdAt: loan.createdAt.toISOString(),
    dailyPaymentAmountMinor: loan.dailyPaymentAmountMinor,
    expectedCompletionDate: loan.expectedCompletionDate,
    firstPaymentDate: loan.firstPaymentDate,
    formulaSnapshot: formulaSnapshot(loan),
    installmentAmountMinor: loan.installmentAmountMinor,
    installmentResidueMinor: Math.abs(
        loan.totalPayableAmountMinor -
            loan.installmentAmountMinor * loan.installmentCount,
    ),
    interestAmountMinor: loan.interestAmountMinor,
    loanNumber: loan.loanNumber,
    loanProductPublicId: loan.loanProductPublicId,
    partialPaymentCreditMinor: loan.partialPaymentCreditMinor,
    principalMinor: loan.principalAmountMinor,
    publicId: loan.publicId,
    releaseDate: loan.releaseDate,
    releasedAt: isoTime(loan.releasedAt),
    status: loan.status,
    totalAmountPaidMinor: loan.totalAmountPaidMinor,
    totalPayableMinor: loan.totalPayableAmountMinor,
})

const riskWarningFor = (tag: string) =>
    tag === 'GOOD_PAYER'
        ? null
        : `Borrower is currently tagged ${tag.replaceAll('_', ' ')}.`

async function readProduct(
    ctx: Parameters<typeof getActiveOrganizationId>[0],
    publicId: string,
): Promise<TLoanProduct | null> {
    const { loanFormulaProfile, loanProduct } = ctx.get('dbSchema')
    const organizationId = getActiveOrganizationId(ctx)
    const [product] = await ctx
        .get('dbClient')
        .select({
            allowRenewalPrincipalChange:
                loanProduct.allowRenewalPrincipalChange,
            collectionAmountMinor: loanFormulaProfile.collectionAmountMinor,
            finalInstallmentResiduePolicy:
                loanProduct.finalInstallmentResiduePolicy,
            fixedInterestAmountMinor: loanProduct.fixedInterestAmountMinor,
            formulaProfileId: loanProduct.formulaProfileId,
            formulaProfileName: loanFormulaProfile.name,
            formulaProfilePublicId: loanFormulaProfile.publicId,
            formulaProfileVersion: loanFormulaProfile.version,
            id: loanProduct.id,
            installmentCount: loanProduct.installmentCount,
            interestMethod: loanProduct.interestMethod,
            interestRateBasisPoints: loanProduct.interestRateBasisPoints,
            isActive: loanProduct.isActive,
            maximumPrincipalAmountMinor:
                loanProduct.maximumPrincipalAmountMinor,
            minCompletedInstallments: loanProduct.minCompletedInstallments,
            minimumPrincipalAmountMinor:
                loanProduct.minimumPrincipalAmountMinor,
            name: loanProduct.name,
            partialCreditPolicy: loanProduct.partialCreditPolicy,
            paymentFrequency: loanProduct.paymentFrequency,
            publicId: loanProduct.publicId,
            renewalSettlementMethod: loanProduct.renewalSettlementMethod,
            roundingMode: loanProduct.roundingMode,
            termDays: loanProduct.termDays,
            timezone: loanProduct.timezone,
        })
        .from(loanProduct)
        .innerJoin(
            loanFormulaProfile,
            and(
                eq(
                    loanFormulaProfile.organizationId,
                    loanProduct.organizationId,
                ),
                eq(loanFormulaProfile.id, loanProduct.formulaProfileId),
            ),
        )
        .where(
            and(
                eq(loanProduct.organizationId, organizationId),
                eq(loanProduct.publicId, publicId),
            ),
        )
        .limit(1)
    return (product as TLoanProduct | undefined) ?? null
}

async function readLoan(
    ctx: Parameters<typeof getActiveOrganizationId>[0],
    publicId: string,
): Promise<TLoan | null> {
    const { borrower, loan, loanFormulaProfile, loanProduct } =
        ctx.get('dbSchema')
    const [record] = await ctx
        .get('dbClient')
        .select({
            actualOutstandingBalanceMinor: loan.actualOutstandingBalanceMinor,
            allowRenewalPrincipalChange: loan.allowRenewalPrincipalChange,
            approvedAt: loan.approvedAt,
            borrowerPublicId: borrower.publicId,
            completedInstallmentCount: loan.completedInstallmentCount,
            createdAt: loan.createdAt,
            dailyPaymentAmountMinor: loan.dailyPaymentAmountMinor,
            expectedCompletionDate: loan.expectedCompletionDate,
            finalInstallmentResiduePolicy: loan.finalInstallmentResiduePolicy,
            firstPaymentDate: loan.firstPaymentDate,
            fixedInterestAmountMinor: loan.fixedInterestAmountMinor,
            formulaProfileId: loan.formulaProfileId,
            formulaProfileName: loan.formulaProfileNameSnapshot,
            formulaProfilePublicId: loanFormulaProfile.publicId,
            formulaProfileVersion: loan.formulaProfileVersionSnapshot,
            id: loan.id,
            installmentAmountMinor: loan.installmentAmountMinor,
            installmentCount: loan.installmentCount,
            interestAmountMinor: loan.interestAmountMinor,
            interestMethod: loan.interestMethod,
            interestRateBasisPoints: loan.interestRateBasisPoints,
            loanNumber: loan.loanNumber,
            loanProductNameSnapshot: loan.loanProductNameSnapshot,
            loanProductPublicId: loanProduct.publicId,
            maximumPrincipalAmountMinorSnapshot:
                loan.maximumPrincipalAmountMinorSnapshot,
            minCompletedInstallments: loan.minCompletedInstallments,
            minimumPrincipalAmountMinorSnapshot:
                loan.minimumPrincipalAmountMinorSnapshot,
            partialCreditPolicy: loan.partialCreditPolicy,
            partialPaymentCreditMinor: loan.partialPaymentCreditMinor,
            paymentFrequency: loan.paymentFrequency,
            principalAmountMinor: loan.principalAmountMinor,
            publicId: loan.publicId,
            releaseDate: loan.releaseDate,
            releasedAt: loan.releasedAt,
            renewalSettlementMethod: loan.renewalSettlementMethod,
            roundingMode: loan.roundingMode,
            status: loan.status,
            termDays: loan.termDays,
            timezone: loan.timezone,
            totalAmountPaidMinor: loan.totalAmountPaidMinor,
            totalPayableAmountMinor: loan.totalPayableAmountMinor,
        })
        .from(loan)
        .innerJoin(
            borrower,
            and(
                eq(borrower.organizationId, loan.organizationId),
                eq(borrower.id, loan.borrowerId),
            ),
        )
        .innerJoin(
            loanProduct,
            and(
                eq(loanProduct.organizationId, loan.organizationId),
                eq(loanProduct.id, loan.loanProductId),
            ),
        )
        .innerJoin(
            loanFormulaProfile,
            and(
                eq(loanFormulaProfile.organizationId, loan.organizationId),
                eq(loanFormulaProfile.id, loan.formulaProfileId),
            ),
        )
        .where(
            and(
                eq(loan.organizationId, getActiveOrganizationId(ctx)),
                eq(loan.publicId, publicId),
            ),
        )
        .limit(1)
    return (record as TLoan | undefined) ?? null
}

async function resolveBorrower(
    ctx: Parameters<typeof getActiveOrganizationId>[0],
    borrowerPublicId: string,
) {
    const { borrower } = ctx.get('dbSchema')
    const [record] = await ctx
        .get('dbClient')
        .select({
            id: borrower.id,
            paymentTag: borrower.paymentTag,
            status: borrower.status,
        })
        .from(borrower)
        .where(
            and(
                eq(borrower.organizationId, getActiveOrganizationId(ctx)),
                eq(borrower.publicId, borrowerPublicId),
            ),
        )
        .limit(1)
    if (!record || record.status !== 'ACTIVE') {
        throw new AppError(loanBorrowerUnavailable)
    }
    const settings = await readRuntimeSystemSettings(ctx)
    if (
        record.paymentTag === 'SCAMMER' &&
        settings.borrowerTagPolicy.blockNewLoanForScammer
    ) {
        throw new AppError(loanBorrowerRiskBlocked)
    }
    return record
}

const calculationInputFor = (
    product: TLoanProduct,
    principalMinor: number,
): TLoanCalculationInput =>
    product.interestMethod === 'FLAT_PERCENTAGE'
        ? {
              collectionAmountMinor: product.collectionAmountMinor,
              installmentCount: product.installmentCount,
              interestMethod: product.interestMethod,
              interestRateBasisPoints: product.interestRateBasisPoints,
              paymentFrequency: product.paymentFrequency,
              principalAmountCents: principalMinor,
              roundingMode: product.roundingMode,
              termDays: product.termDays,
          }
        : {
              collectionAmountMinor: product.collectionAmountMinor,
              fixedInterestAmountMinor: product.fixedInterestAmountMinor!,
              installmentCount: product.installmentCount,
              interestMethod: product.interestMethod,
              paymentFrequency: product.paymentFrequency,
              principalAmountCents: principalMinor,
              roundingMode: product.roundingMode,
              termDays: product.termDays,
          }

async function quoteLoan(
    ctx: Parameters<typeof getActiveOrganizationId>[0],
    input: {
        firstPaymentDate: string
        loanProductPublicId: string
        principalMinor: number
        releaseDate: string
    },
) {
    const product = await readProduct(ctx, input.loanProductPublicId)
    if (!product) throw new AppError(loanProductNotFound)
    if (!product.isActive) throw new AppError(loanProductUnavailable)
    const settings = await readRuntimeSystemSettings(ctx)
    if (
        !settings.enabledPaymentFrequencies.includes(product.paymentFrequency)
    ) {
        throw new AppError(loanPaymentFrequencyDisabled)
    }
    if (
        input.principalMinor < product.minimumPrincipalAmountMinor ||
        input.principalMinor > product.maximumPrincipalAmountMinor
    ) {
        throw new AppError(loanProductUnavailable)
    }
    const calculation = calculateLoan(
        calculationInputFor(product, input.principalMinor),
    )
    const installments = createInstallmentSchedule({
        firstDueDate: getFirstPaymentDate(
            input.releaseDate,
            product.paymentFrequency,
        ),
        installmentAmountCents: calculation.baseInstallmentAmountCents,
        installmentCount: calculation.installmentCount,
        paymentFrequency: product.paymentFrequency,
        totalPayableAmountCents: calculation.totalPayableAmountCents,
    })
    const expectedCompletionDate = installments.at(-1)!.dueDate
    return {
        calculation,
        expectedCompletionDate,
        installments,
        product: {
            ...product,
            installmentCount: calculation.installmentCount,
            termDays: calculation.termDays,
            minCompletedInstallments: Math.min(
                product.minCompletedInstallments,
                calculation.installmentCount,
            ),
        },
    }
}

export const loansRoute = new Hono<THonoInstance>()
    .on(
        'QUERY',
        '/product/readMany',
        tenantGuard,
        validateRequest('json', loanValidator.loanProductReadManyInputSchema),
        async (ctx) => {
            const input = ctx.req.valid('json')
            const { loanProduct } = ctx.get('dbSchema')
            const { isActive, search } = input.filters
            const where = and(
                eq(loanProduct.organizationId, getActiveOrganizationId(ctx)),
                ...(isActive === undefined
                    ? []
                    : [eq(loanProduct.isActive, isActive)]),
                ...(search ? [like(loanProduct.name, `%${search}%`)] : []),
            )
            const [countRow] = await ctx
                .get('dbClient')
                .select({ count: countFn(loanProduct.id) })
                .from(loanProduct)
                .where(where)
            const products = await ctx
                .get('dbClient')
                .select({ publicId: loanProduct.publicId })
                .from(loanProduct)
                .where(where)
                .orderBy(
                    input.sortOrder === 'asc'
                        ? asc(loanProduct.updatedAt)
                        : desc(loanProduct.updatedAt),
                )
                .limit(input.limit)
                .offset(input.offset)
            const data = (
                await Promise.all(
                    products.map(({ publicId }) => readProduct(ctx, publicId)),
                )
            ).filter((product): product is TLoanProduct => product !== null)
            return apiResponsePaginatedOkWrapper(ctx, {
                count: countRow.count,
                data: data.map(productOutput),
                limit: input.limit,
                offset: input.offset,
            })
        },
    )
    .post(
        '/product/create',
        tenantGuard,
        privilegedGuard,
        validateRequest('json', loanValidator.loanProductCreateInputSchema),
        async (ctx) => {
            const input = ctx.req.valid('json')
            const organizationId = getActiveOrganizationId(ctx)
            const { loanFormulaProfile, loanProduct } = ctx.get('dbSchema')
            const db = ctx.get('dbClient')
            const [existing] = await db
                .select({ publicId: loanProduct.publicId })
                .from(loanProduct)
                .where(
                    and(
                        eq(loanProduct.organizationId, organizationId),
                        eq(loanProduct.idempotencyKey, input.idempotencyKey),
                    ),
                )
                .limit(1)
            const publicId = existing?.publicId ?? uuidv7()
            if (!existing) {
                const [profile] = await db
                    .select()
                    .from(loanFormulaProfile)
                    .where(
                        and(
                            eq(
                                loanFormulaProfile.organizationId,
                                organizationId,
                            ),
                            eq(
                                loanFormulaProfile.publicId,
                                input.formulaProfilePublicId,
                            ),
                            eq(loanFormulaProfile.isActive, true),
                            isNull(loanFormulaProfile.deletedAt),
                        ),
                    )
                    .limit(1)
                if (!profile) throw new AppError(loanProductNotFound)
                const database = db.$client
                const auditData = auditTrailLogger.prepare({
                    action: 'create',
                    component: 'loan.product',
                    description: 'Loan product created',
                    records: {
                        table: 'loan_product',
                        id: publicId,
                        newData: {
                            isActive: input.isActive,
                            maximumPrincipalAmountMinor:
                                input.maximumPrincipalMinor,
                            minimumPrincipalAmountMinor:
                                input.minimumPrincipalMinor,
                            name: input.name,
                        },
                    },
                })
                const [insertResult] = await database.batch([
                    database
                        .prepare(
                            `INSERT INTO loan_product (
                                public_id, organization_id, formula_profile_id, name, is_active,
                                interest_method, interest_rate_basis_points, fixed_interest_amount_minor,
                                term_days, payment_frequency, installment_count, timezone, rounding_mode,
                                final_installment_residue_policy, renewal_settlement_method,
                                partial_credit_policy, min_completed_installments,
                                allow_renewal_principal_change, minimum_principal_amount_minor,
                                maximum_principal_amount_minor, idempotency_key, created_by_user_id,
                                updated_by_user_id
                            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                            ON CONFLICT(organization_id, idempotency_key) DO NOTHING`,
                        )
                        .bind(
                            publicId,
                            organizationId,
                            profile.id,
                            input.name,
                            input.isActive ? 1 : 0,
                            profile.interestMethod,
                            profile.interestRateBasisPoints,
                            profile.fixedInterestAmountMinor,
                            profile.termDays,
                            profile.paymentFrequency,
                            profile.installmentCount,
                            profile.timezone,
                            profile.roundingMode,
                            profile.finalInstallmentResiduePolicy,
                            profile.renewalSettlementMethod,
                            profile.partialCreditPolicy,
                            profile.minCompletedInstallments,
                            profile.allowRenewalPrincipalChange ? 1 : 0,
                            input.minimumPrincipalMinor,
                            input.maximumPrincipalMinor,
                            input.idempotencyKey,
                            ctx.get('user')!.id,
                            ctx.get('user')!.id,
                        ),
                    auditTrailAfterChangeStatement(ctx, auditData, database),
                ])
                if (insertResult.meta.changes === 1 && auditData) {
                    markAuditTrailRecorded(ctx)
                }
            }
            const product = await readProduct(ctx, publicId)
            if (!product) throw new AppError(loanProductNotFound)
            return apiResponseOkWrapper(ctx, {
                data: productOutput(product),
                status: 201,
            })
        },
    )
    .post(
        '/quote',
        tenantGuard,
        validateRequest('json', loanValidator.loanQuoteInputSchema),
        async (ctx) => {
            const input = ctx.req.valid('json')
            const borrower = await resolveBorrower(ctx, input.borrowerPublicId)
            const quote = await quoteLoan(ctx, input)
            return apiResponseOkWrapper(ctx, {
                data: {
                    dailyPaymentAmountMinor:
                        quote.calculation.dailyPaymentAmountCents,
                    expectedCompletionDate: quote.expectedCompletionDate,
                    firstPaymentDate: quote.installments[0]!.dueDate,
                    formulaSnapshot: formulaSnapshot(quote.product),
                    installmentAmountMinor:
                        quote.calculation.baseInstallmentAmountCents,
                    installmentResidueMinor:
                        quote.calculation.installmentResidueCents,
                    installments: quote.installments.map((installment) => ({
                        amountDueMinor: installment.amountDueCents,
                        dueDate: installment.dueDate,
                        installmentNumber: installment.installmentNumber,
                    })),
                    interestAmountMinor: quote.calculation.interestAmountCents,
                    principalMinor: input.principalMinor,
                    releaseDate: input.releaseDate,
                    riskWarning: riskWarningFor(borrower.paymentTag),
                    totalPayableMinor:
                        quote.calculation.totalPayableAmountCents,
                },
            })
        },
    )
    .post(
        '/create',
        tenantGuard,
        validateRequest('json', loanValidator.loanCreateInputSchema),
        async (ctx) => {
            const input = ctx.req.valid('json')
            const organizationId = getActiveOrganizationId(ctx)
            const { loan } = ctx.get('dbSchema')
            const db = ctx.get('dbClient')
            const [existing] = await db
                .select({ publicId: loan.publicId })
                .from(loan)
                .where(
                    and(
                        eq(loan.organizationId, organizationId),
                        eq(loan.createIdempotencyKey, input.idempotencyKey),
                    ),
                )
                .limit(1)
            const publicId = existing?.publicId ?? uuidv7()
            if (!existing) {
                const borrower = await resolveBorrower(
                    ctx,
                    input.borrowerPublicId,
                )
                const quote = await quoteLoan(ctx, input)
                const database = db.$client
                const auditData = auditTrailLogger.prepare({
                    action: 'create',
                    component: 'loan',
                    description: 'Loan submitted for approval',
                    records: {
                        table: 'loan',
                        id: publicId,
                        newData: {
                            interestAmountMinor:
                                quote.calculation.interestAmountCents,
                            loanNumber: `LN-${publicId.toUpperCase()}`,
                            principalAmountMinor: input.principalMinor,
                            status: 'PENDING_APPROVAL',
                            totalPayableAmountMinor:
                                quote.calculation.totalPayableAmountCents,
                        },
                    },
                })
                const [insertResult] = await database.batch([
                    database
                        .prepare(
                            `INSERT INTO loan (
                                public_id, organization_id, loan_number, borrower_id, loan_product_id,
                                formula_profile_id, loan_product_name_snapshot, formula_profile_name_snapshot,
                                formula_profile_version_snapshot, interest_method, interest_rate_basis_points,
                                fixed_interest_amount_minor, principal_amount_minor,
                                minimum_principal_amount_minor_snapshot,
                                maximum_principal_amount_minor_snapshot, interest_amount_minor,
                                total_payable_amount_minor, term_days, payment_frequency, installment_count,
                                installment_amount_minor, daily_payment_amount_minor, timezone, rounding_mode,
                                final_installment_residue_policy, renewal_settlement_method,
                                partial_credit_policy, min_completed_installments,
                                allow_renewal_principal_change, first_payment_date,
                                expected_completion_date, actual_outstanding_balance_minor, status,
                                create_idempotency_key, created_by_user_id, updated_by_user_id
                            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING_APPROVAL', ?, ?, ?)
                            ON CONFLICT(organization_id, create_idempotency_key) DO NOTHING`,
                        )
                        .bind(
                            publicId,
                            organizationId,
                            `LN-${publicId.toUpperCase()}`,
                            borrower.id,
                            quote.product.id,
                            quote.product.formulaProfileId,
                            quote.product.name,
                            quote.product.formulaProfileName,
                            quote.product.formulaProfileVersion,
                            quote.product.interestMethod,
                            quote.product.interestRateBasisPoints,
                            quote.product.fixedInterestAmountMinor,
                            input.principalMinor,
                            quote.product.minimumPrincipalAmountMinor,
                            quote.product.maximumPrincipalAmountMinor,
                            quote.calculation.interestAmountCents,
                            quote.calculation.totalPayableAmountCents,
                            quote.product.termDays,
                            quote.product.paymentFrequency,
                            quote.product.installmentCount,
                            quote.calculation.baseInstallmentAmountCents,
                            quote.calculation.dailyPaymentAmountCents,
                            quote.product.timezone,
                            quote.product.roundingMode,
                            quote.product.finalInstallmentResiduePolicy,
                            quote.product.renewalSettlementMethod,
                            quote.product.partialCreditPolicy,
                            quote.product.minCompletedInstallments,
                            quote.product.allowRenewalPrincipalChange,
                            quote.installments[0]!.dueDate,
                            quote.expectedCompletionDate,
                            quote.calculation.totalPayableAmountCents,
                            input.idempotencyKey,
                            ctx.get('user')!.id,
                            ctx.get('user')!.id,
                        ),
                    auditTrailAfterChangeStatement(ctx, auditData, database),
                ])
                if (insertResult.meta.changes === 1 && auditData) {
                    markAuditTrailRecorded(ctx)
                }
            }
            const record = await readLoan(ctx, publicId)
            if (!record) throw new AppError(loanNotFound)
            return apiResponseOkWrapper(ctx, {
                data: loanOutput(record),
                status: 201,
            })
        },
    )
    .on(
        'QUERY',
        '/readMany',
        tenantGuard,
        validateRequest('json', loanValidator.loanReadManyInputSchema),
        async (ctx) => {
            const input = ctx.req.valid('json')
            const { borrower, loan } = ctx.get('dbSchema')
            const { borrowerPublicId, status } = input.filters
            const where = and(
                eq(loan.organizationId, getActiveOrganizationId(ctx)),
                ...(status ? [eq(loan.status, status)] : []),
                ...(borrowerPublicId
                    ? [eq(borrower.publicId, borrowerPublicId)]
                    : []),
            )
            const [countRow] = await ctx
                .get('dbClient')
                .select({ count: countFn(loan.id) })
                .from(loan)
                .innerJoin(
                    borrower,
                    and(
                        eq(borrower.organizationId, loan.organizationId),
                        eq(borrower.id, loan.borrowerId),
                    ),
                )
                .where(where)
            const rows = await ctx
                .get('dbClient')
                .select({
                    borrowerFirstName: borrower.firstName,
                    borrowerLastName: borrower.lastName,
                    borrowerMiddleName: borrower.middleName,
                    borrowerSuffix: borrower.suffix,
                    publicId: loan.publicId,
                })
                .from(loan)
                .innerJoin(
                    borrower,
                    and(
                        eq(borrower.organizationId, loan.organizationId),
                        eq(borrower.id, loan.borrowerId),
                    ),
                )
                .where(where)
                .orderBy(
                    input.sortOrder === 'asc'
                        ? asc(loan.createdAt)
                        : desc(loan.createdAt),
                )
                .limit(input.limit)
                .offset(input.offset)
            const data = (
                await Promise.all(
                    rows.map(async (row) => {
                        const record = await readLoan(ctx, row.publicId)
                        if (!record) return null
                        return {
                            ...loanOutput(record),
                            borrowerName: [
                                row.borrowerFirstName,
                                row.borrowerMiddleName,
                                row.borrowerLastName,
                                row.borrowerSuffix,
                            ]
                                .filter(Boolean)
                                .join(' '),
                        }
                    }),
                )
            ).filter((record) => record !== null)
            return apiResponsePaginatedOkWrapper(ctx, {
                count: countRow.count,
                data,
                limit: input.limit,
                offset: input.offset,
            })
        },
    )
    .get(
        '/read/:publicId',
        tenantGuard,
        validateRequest('param', loanValidator.loanReadInputSchema),
        async (ctx) => {
            const { publicId } = ctx.req.valid('param')
            const record = await readLoan(ctx, publicId)
            if (!record) throw new AppError(loanNotFound)
            const { loanInstallment } = ctx.get('dbSchema')
            const installments = await ctx
                .get('dbClient')
                .select({
                    amountDueMinor: loanInstallment.amountDueMinor,
                    amountPaidMinor: loanInstallment.amountPaidMinor,
                    dueDate: loanInstallment.dueDate,
                    installmentNumber: loanInstallment.installmentNumber,
                    publicId: loanInstallment.publicId,
                    status: loanInstallment.status,
                })
                .from(loanInstallment)
                .where(
                    and(
                        eq(
                            loanInstallment.organizationId,
                            getActiveOrganizationId(ctx),
                        ),
                        eq(loanInstallment.loanId, record.id),
                    ),
                )
                .orderBy(asc(loanInstallment.installmentNumber))
            return apiResponseOkWrapper(ctx, {
                data: { ...loanOutput(record), installments },
            })
        },
    )
    .post(
        '/:publicId/delete',
        tenantGuard,
        privilegedGuard,
        validateRequest('param', loanValidator.loanDeleteInputSchema),
        async (ctx) => {
            const { publicId } = ctx.req.valid('param')
            const existing = await readLoan(ctx, publicId)
            if (!existing) throw new AppError(loanNotFound)
            if (existing.status !== 'PENDING_APPROVAL') {
                throw new AppError(loanDeleteConflict)
            }

            const auditData = auditTrailLogger.prepare({
                action: 'delete',
                component: 'loan',
                description: 'Pending loan deleted',
                records: {
                    table: 'loan',
                    id: publicId,
                    oldData: {
                        borrowerPublicId: existing.borrowerPublicId,
                        loanNumber: existing.loanNumber,
                        loanProductPublicId: existing.loanProductPublicId,
                        principalAmountMinor: existing.principalAmountMinor,
                        status: existing.status,
                    },
                },
            })
            const database = ctx.get('dbClient').$client
            const [result] = await database.batch([
                database
                    .prepare(
                        `DELETE FROM loan
                         WHERE organization_id = ? AND public_id = ?
                           AND status = 'PENDING_APPROVAL'
                           AND NOT EXISTS (SELECT 1 FROM loan_installment WHERE organization_id = loan.organization_id AND loan_id = loan.id)
                           AND NOT EXISTS (SELECT 1 FROM payment WHERE organization_id = loan.organization_id AND loan_id = loan.id)
                           AND NOT EXISTS (SELECT 1 FROM cash_transaction WHERE organization_id = loan.organization_id AND loan_id = loan.id)
                           AND NOT EXISTS (SELECT 1 FROM capital_transaction WHERE organization_id = loan.organization_id AND loan_id = loan.id)
                           AND NOT EXISTS (SELECT 1 FROM loan_collection_assignment WHERE organization_id = loan.organization_id AND loan_id = loan.id)
                           AND NOT EXISTS (SELECT 1 FROM loan_renewal WHERE organization_id = loan.organization_id AND (old_loan_id = loan.id OR new_loan_id = loan.id))`,
                    )
                    .bind(getActiveOrganizationId(ctx), publicId),
                auditTrailAfterChangeStatement(ctx, auditData, database),
            ])
            if (result.meta.changes !== 1)
                throw new AppError(loanDeleteConflict)
            if (auditData) markAuditTrailRecorded(ctx)
            return apiResponseOkWrapper(ctx, { data: { publicId } })
        },
    )
    .post(
        '/:publicId/approve',
        tenantGuard,
        privilegedGuard,
        validateRequest('param', loanValidator.loanApproveInputSchema),
        async (ctx) => {
            const { publicId } = ctx.req.valid('param')
            const existing = await readLoan(ctx, publicId)
            if (!existing) throw new AppError(loanNotFound)
            const database = ctx.get('dbClient').$client
            const auditData = auditTrailLogger.prepare({
                action: 'update',
                component: 'loan',
                description: 'Loan approved',
                records: {
                    table: 'loan',
                    id: publicId,
                    oldData: { status: existing.status },
                    newData: { status: 'APPROVED' },
                },
            })
            const [result] = await database.batch([
                database
                    .prepare(
                        `UPDATE loan
                         SET status = 'APPROVED', approved_by_user_id = ?, approved_at = ?,
                             updated_by_user_id = ?, updated_at = ?
                         WHERE organization_id = ? AND public_id = ?
                           AND status = 'PENDING_APPROVAL'`,
                    )
                    .bind(
                        ctx.get('user')!.id,
                        Date.now(),
                        ctx.get('user')!.id,
                        Date.now(),
                        getActiveOrganizationId(ctx),
                        publicId,
                    ),
                auditTrailAfterChangeStatement(ctx, auditData, database),
            ])
            if (result.meta.changes !== 1)
                throw new AppError(loanLifecycleConflict)
            if (auditData) markAuditTrailRecorded(ctx)
            const record = await readLoan(ctx, publicId)
            if (!record) throw new AppError(loanNotFound)
            return apiResponseOkWrapper(ctx, { data: loanOutput(record) })
        },
    )
    .post(
        '/:publicId/release',
        tenantGuard,
        privilegedGuard,
        validateRequest('param', loanValidator.loanReleaseInputSchema),
        async (ctx) => {
            const { publicId } = ctx.req.valid('param')
            const existing = await readLoan(ctx, publicId)
            if (!existing) throw new AppError(loanNotFound)
            const { companyFund } = ctx.get('dbSchema')
            const [fund] = await ctx
                .get('dbClient')
                .select({ id: companyFund.id })
                .from(companyFund)
                .where(
                    and(
                        eq(
                            companyFund.organizationId,
                            getActiveOrganizationId(ctx),
                        ),
                        eq(companyFund.isPrimary, true),
                    ),
                )
                .limit(1)
            if (!fund) throw new AppError(primaryFundRequired)
            const releasedAt = Date.now()
            const releaseDate = manilaDate(releasedAt)
            const firstPaymentDate = getFirstPaymentDate(
                releaseDate,
                existing.paymentFrequency,
            )
            const schedule = createInstallmentSchedule({
                firstDueDate: firstPaymentDate,
                installmentAmountCents: existing.installmentAmountMinor,
                installmentCount: existing.installmentCount,
                paymentFrequency: existing.paymentFrequency,
                totalPayableAmountCents: existing.totalPayableAmountMinor,
            })
            const database = ctx.get('dbClient').$client
            const organizationId = getActiveOrganizationId(ctx)
            const actorId = ctx.get('user')!.id
            const expectedCompletionDate = schedule.at(-1)!.dueDate
            const auditData = auditTrailLogger.prepare({
                action: 'update',
                component: 'loan',
                description: 'Loan released',
                records: [
                    {
                        table: 'loan',
                        id: publicId,
                        oldData: {
                            expectedCompletionDate:
                                existing.expectedCompletionDate,
                            firstPaymentDate: existing.firstPaymentDate,
                            releaseDate: existing.releaseDate,
                            status: existing.status,
                        },
                        newData: {
                            expectedCompletionDate,
                            firstPaymentDate,
                            releaseDate,
                            status: 'ACTIVE',
                        },
                    },
                    {
                        table: 'cash_transaction',
                        id: `CT-${publicId.toUpperCase()}`,
                        newData: {
                            amountMinor: existing.principalAmountMinor,
                            transactionType: 'LOAN_RELEASE',
                        },
                    },
                ],
            })
            const statements = [
                database
                    .prepare(
                        `UPDATE loan
                         SET status = 'ACTIVE', release_date = ?, first_payment_date = ?,
                             expected_completion_date = ?, released_by_user_id = ?,
                             released_at = ?, updated_by_user_id = ?, updated_at = ?
                         WHERE organization_id = ? AND public_id = ? AND status = 'APPROVED'`,
                    )
                    .bind(
                        releaseDate,
                        firstPaymentDate,
                        expectedCompletionDate,
                        actorId,
                        releasedAt,
                        actorId,
                        releasedAt,
                        organizationId,
                        publicId,
                    ),
                ...schedule.map((installment) =>
                    database
                        .prepare(
                            `INSERT INTO loan_installment (
                                 public_id, organization_id, loan_id, installment_number,
                                 payment_frequency, period_start, period_end, due_date,
                                 amount_due_minor, amount_paid_minor, status
                             ) SELECT ?, ?, id, ?, ?, ?, ?, ?, ?, 0, 'UPCOMING'
                               FROM loan
                              WHERE organization_id = ? AND public_id = ?
                                AND status = 'ACTIVE' AND released_at = ?`,
                        )
                        .bind(
                            uuidv7(),
                            organizationId,
                            installment.installmentNumber,
                            existing.paymentFrequency,
                            installment.dueDate,
                            installment.dueDate,
                            installment.dueDate,
                            installment.amountDueCents,
                            organizationId,
                            publicId,
                            releasedAt,
                        ),
                ),
                database
                    .prepare(
                        `INSERT OR IGNORE INTO cash_transaction (
                             public_id, organization_id, transaction_number, transaction_type,
                             direction, borrower_id, loan_id, amount_minor, transaction_at,
                             idempotency_key, created_by_user_id
                         ) SELECT ?, ?, ?, 'LOAN_RELEASE', 'CASH_OUT', borrower_id, id, ?, ?, ?, ?
                           FROM loan
                          WHERE organization_id = ? AND public_id = ?
                            AND status = 'ACTIVE' AND released_at = ?`,
                    )
                    .bind(
                        uuidv7(),
                        organizationId,
                        `CT-${publicId.toUpperCase()}`,
                        existing.principalAmountMinor,
                        releasedAt,
                        `release:${publicId}`,
                        actorId,
                        organizationId,
                        publicId,
                        releasedAt,
                    ),
                database
                    .prepare(
                        `INSERT INTO capital_transaction (
                             public_id, organization_id, company_fund_id, transaction_number,
                             transaction_type, direction, amount_minor, loan_id,
                             cash_transaction_id, transaction_at, created_by_user_id
                         ) SELECT ?, ?, fund.id, ?, 'LOAN_PRINCIPAL_RELEASE', 'OUT', ?, loan.id,
                                  cash.id, ?, ?
                             FROM company_fund AS fund
                             INNER JOIN loan ON loan.organization_id = fund.organization_id
                             INNER JOIN cash_transaction AS cash
                               ON cash.organization_id = loan.organization_id
                              AND cash.loan_id = loan.id
                              AND cash.transaction_type = 'LOAN_RELEASE'
                            WHERE fund.organization_id = ? AND fund.is_primary = TRUE
                              AND loan.public_id = ? AND loan.status = 'ACTIVE'
                              AND cash.idempotency_key = ? AND cash.transaction_at = ?`,
                    )
                    .bind(
                        uuidv7(),
                        organizationId,
                        `CAP-REL-${publicId.toUpperCase()}`,
                        existing.principalAmountMinor,
                        releasedAt,
                        actorId,
                        organizationId,
                        publicId,
                        `release:${publicId}`,
                        releasedAt,
                    ),
                auditTrailAfterChangeStatement(ctx, auditData, database),
            ]
            const results = await database.batch(statements)
            if (results[0].meta.changes !== 1) {
                throw new AppError(loanLifecycleConflict)
            }
            if (auditData) markAuditTrailRecorded(ctx)
            const record = await readLoan(ctx, publicId)
            if (!record) throw new AppError(loanNotFound)
            const { loanInstallment } = ctx.get('dbSchema')
            const installments = await ctx
                .get('dbClient')
                .select({
                    amountDueMinor: loanInstallment.amountDueMinor,
                    amountPaidMinor: loanInstallment.amountPaidMinor,
                    dueDate: loanInstallment.dueDate,
                    installmentNumber: loanInstallment.installmentNumber,
                    publicId: loanInstallment.publicId,
                    status: loanInstallment.status,
                })
                .from(loanInstallment)
                .where(
                    and(
                        eq(loanInstallment.organizationId, organizationId),
                        eq(loanInstallment.loanId, record.id),
                    ),
                )
                .orderBy(asc(loanInstallment.installmentNumber))
            return apiResponseOkWrapper(ctx, {
                data: { ...loanOutput(record), installments },
            })
        },
    )

export default loansRoute
export type LoanRouteType = ApplyGlobalResponse<
    typeof loansRoute,
    import('../../types.js').TGlobalApiResponses
>
