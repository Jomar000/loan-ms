import type { dbSchema } from '@loanms/database/d1'
import { AppError, catalog, defineError } from '@loanms/errors'
import * as formulaValidator from '@loanms/validator/backoffice/loanCalculation'
import { and, asc, count as countFn, desc, eq, like } from 'drizzle-orm'
import { Hono } from 'hono'
import { createMiddleware } from 'hono/factory'
import { v7 as uuidv7 } from 'uuid'

import {
    allocatePaymentFifo,
    calculateLoan,
    calculateRenewalQuote,
    createInstallmentSchedule,
    type TLoanCalculationInput,
} from '../../services/loanCalculation/index.js'
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

const formulaProfileConflict = defineError(
    'FORMULA_PROFILE_CONFLICT',
    'CONFLICT',
    'The formula profile name and version already exist or the requested lifecycle change is no longer valid.',
)
const formulaProfileIdempotencyConflict = defineError(
    'FORMULA_PROFILE_IDEMPOTENCY_CONFLICT',
    'CONFLICT',
    'This idempotency key was already used with different formula profile details.',
)
const formulaProfileNotFound = defineError(
    'FORMULA_PROFILE_NOT_FOUND',
    'NOT_FOUND',
    'Formula profile not found.',
)
const formulaProfileVersionConflict = defineError(
    'FORMULA_PROFILE_VERSION_CONFLICT',
    'CONFLICT',
    'A formula update must keep the profile name and create the next version.',
)

const tenantGuard = isTenantAuthenticated()
const privilegedGuard = createMiddleware<THonoInstance>(async (ctx, next) => {
    if (!ctx.get('isPrivilegedRole')) {
        return apiResponseErrorWrapper(ctx, catalog.authenticationForbidden)
    }
    await next()
})

type TFormulaProfileInput =
    typeof formulaValidator.calculationFormulaProfileInputSchema._output

type TFormulaProfileRow = {
    allowRenewalPrincipalChange: boolean
    createdAt: Date
    effectiveAt: Date
    fixedInterestAmountMinor: number | null
    id: number
    installmentCount: number
    interestMethod: 'FIXED_AMOUNT' | 'FLAT_PERCENTAGE'
    interestRateBasisPoints: number
    isActive: boolean
    isDefault: boolean
    minCompletedInstallments: number
    name: string
    partialCreditPolicy:
        'APPLY_TO_SETTLEMENT' | 'CARRY_FORWARD' | 'MANUAL_REVIEW' | 'REFUND'
    paymentFrequency: 'DAILY' | 'MONTHLY' | 'WEEKLY'
    publicId: string
    renewalSettlementMethod:
        'COMPLETED_INSTALLMENT_BALANCE' | 'EXACT_OUTSTANDING_BALANCE'
    requestFingerprint: string | null
    retiredAt: Date | null
    roundingMode: 'DOWN' | 'HALF_UP' | 'UP'
    termDays: number
    version: number
}

const profileSelection = (table: typeof dbSchema.loanFormulaProfile) => ({
    allowRenewalPrincipalChange: table.allowRenewalPrincipalChange,
    createdAt: table.createdAt,
    effectiveAt: table.effectiveAt,
    fixedInterestAmountMinor: table.fixedInterestAmountMinor,
    id: table.id,
    installmentCount: table.installmentCount,
    interestMethod: table.interestMethod,
    interestRateBasisPoints: table.interestRateBasisPoints,
    isActive: table.isActive,
    isDefault: table.isDefault,
    minCompletedInstallments: table.minCompletedInstallments,
    name: table.name,
    partialCreditPolicy: table.partialCreditPolicy,
    paymentFrequency: table.paymentFrequency,
    publicId: table.publicId,
    renewalSettlementMethod: table.renewalSettlementMethod,
    requestFingerprint: table.requestFingerprint,
    retiredAt: table.retiredAt,
    roundingMode: table.roundingMode,
    termDays: table.termDays,
    version: table.version,
})

function formatManilaDate(value: Date) {
    const parts = new Intl.DateTimeFormat('en-CA', {
        day: '2-digit',
        month: '2-digit',
        timeZone: 'Asia/Manila',
        year: 'numeric',
    }).formatToParts(value)
    const part = (type: Intl.DateTimeFormatPartTypes) =>
        parts.find((item) => item.type === type)!.value
    return `${part('year')}-${part('month')}-${part('day')}`
}

function profileOutput(row: TFormulaProfileRow) {
    return {
        allowRenewalPrincipalChange: row.allowRenewalPrincipalChange,
        createdAt: row.createdAt.toISOString(),
        effectiveDate: formatManilaDate(row.effectiveAt),
        fixedInterestAmountMinor: row.fixedInterestAmountMinor,
        installmentCount: row.installmentCount,
        interestMethod: row.interestMethod,
        interestRateBasisPoints: row.interestRateBasisPoints,
        isActive: row.isActive,
        isDefault: row.isDefault,
        minimumRenewalCompletedInstallments: row.minCompletedInstallments,
        name: row.name,
        partialCreditPolicy: row.partialCreditPolicy,
        paymentFrequency: row.paymentFrequency,
        publicId: row.publicId,
        renewalSettlementMethod: row.renewalSettlementMethod,
        retiredAt: row.retiredAt?.toISOString() ?? null,
        roundingMode: row.roundingMode,
        termDays: row.termDays,
        version: row.version,
    }
}

async function readProfile(
    ctx: Parameters<typeof getActiveOrganizationId>[0],
    publicId: string,
) {
    const { loanFormulaProfile } = ctx.get('dbSchema')
    const [row] = await ctx
        .get('dbClient')
        .select(profileSelection(loanFormulaProfile))
        .from(loanFormulaProfile)
        .where(
            and(
                eq(
                    loanFormulaProfile.organizationId,
                    getActiveOrganizationId(ctx),
                ),
                eq(loanFormulaProfile.publicId, publicId),
            ),
        )
        .limit(1)
    return (row as TFormulaProfileRow | undefined) ?? null
}

async function fingerprint(
    operation: 'create' | 'version',
    sourcePublicId: string | null,
    input: TFormulaProfileInput,
) {
    const bytes = new TextEncoder().encode(
        JSON.stringify({ input, operation, sourcePublicId }),
    )
    const digest = await crypto.subtle.digest('SHA-256', bytes)
    return Array.from(new Uint8Array(digest), (byte) =>
        byte.toString(16).padStart(2, '0'),
    ).join('')
}

function calculationInputFor(
    profile: TFormulaProfileInput,
    principalMinor: number,
): TLoanCalculationInput {
    return profile.interestMethod === 'FLAT_PERCENTAGE'
        ? {
              installmentCount: profile.installmentCount,
              interestMethod: profile.interestMethod,
              interestRateBasisPoints: profile.interestRateBasisPoints,
              paymentFrequency: profile.paymentFrequency,
              principalAmountCents: principalMinor,
              roundingMode: profile.roundingMode,
              termDays: profile.termDays,
          }
        : {
              fixedInterestAmountMinor: profile.fixedInterestAmountMinor,
              installmentCount: profile.installmentCount,
              interestMethod: profile.interestMethod,
              paymentFrequency: profile.paymentFrequency,
              principalAmountCents: principalMinor,
              roundingMode: profile.roundingMode,
              termDays: profile.termDays,
          }
}

function previewCalculation(
    input: typeof formulaValidator.loanCalculationPreviewInputSchema._output,
) {
    const calculation = calculateLoan(
        calculationInputFor(input.formulaProfile, input.principalMinor),
    )
    const schedule = createInstallmentSchedule({
        firstDueDate: input.firstPaymentDate,
        installmentCount: input.formulaProfile.installmentCount,
        paymentFrequency: input.formulaProfile.paymentFrequency,
        totalPayableAmountCents: calculation.totalPayableAmountCents,
    })
    const unpaid = schedule.map((installment) => ({
        ...installment,
        amountPaidCents: 0,
    }))
    const allocation =
        input.totalPaidMinor === 0
            ? {
                  actualOutstandingBalanceCents:
                      calculation.totalPayableAmountCents,
                  completedInstallmentCount: 0,
                  installments: unpaid,
                  partialPaymentCreditCents: 0,
              }
            : allocatePaymentFifo(unpaid, input.totalPaidMinor)
    const renewal = calculateRenewalQuote({
        installments: allocation.installments,
        minimumRenewalCompletedInstallments:
            input.formulaProfile.minimumRenewalCompletedInstallments,
        partialCreditPolicy: input.formulaProfile.partialCreditPolicy,
        renewalPrincipalAmountCents: input.principalMinor,
        renewalSettlementMethod: input.formulaProfile.renewalSettlementMethod,
    })
    return {
        actualOutstandingBalanceMinor: allocation.actualOutstandingBalanceCents,
        completedInstallmentCount: allocation.completedInstallmentCount,
        dailyPaymentAmountMinor: calculation.dailyPaymentAmountCents,
        installmentAmountMinor: calculation.baseInstallmentAmountCents,
        installmentResidueMinor: calculation.installmentResidueCents,
        interestAmountMinor: calculation.interestAmountCents,
        partialPaymentCreditMinor: allocation.partialPaymentCreditCents,
        remainingInstallmentCount: renewal.remainingInstallmentCount,
        renewalCashReleaseMinor: renewal.cashReleaseAmountCents,
        renewalSettlementBalanceMinor: renewal.renewalSettlementBalanceCents,
        totalPayableMinor: calculation.totalPayableAmountCents,
    }
}

async function persistProfile(
    ctx: Parameters<typeof getActiveOrganizationId>[0],
    input: TFormulaProfileInput,
    idempotencyKey: string,
    operation: 'create' | 'version',
    sourcePublicId: string | null,
) {
    const organizationId = getActiveOrganizationId(ctx)
    const { loanFormulaProfile } = ctx.get('dbSchema')
    const db = ctx.get('dbClient')
    const requestFingerprint = await fingerprint(
        operation,
        sourcePublicId,
        input,
    )
    const [replay] = await db
        .select({
            publicId: loanFormulaProfile.publicId,
            requestFingerprint: loanFormulaProfile.requestFingerprint,
        })
        .from(loanFormulaProfile)
        .where(
            and(
                eq(loanFormulaProfile.organizationId, organizationId),
                eq(loanFormulaProfile.idempotencyKey, idempotencyKey),
            ),
        )
        .limit(1)
    if (replay) {
        if (replay.requestFingerprint !== requestFingerprint) {
            throw new AppError(formulaProfileIdempotencyConflict)
        }
        const profile = await readProfile(ctx, replay.publicId)
        if (!profile) throw new AppError(formulaProfileNotFound)
        return { profile, replayed: true }
    }

    const publicId = uuidv7()
    const auditData = auditTrailLogger.prepare({
        action: 'create',
        component: 'loan.formulaProfile',
        description:
            operation === 'create'
                ? 'Formula profile created'
                : 'Formula profile version created',
        records: {
            id: publicId,
            newData: {
                installmentCount: input.installmentCount,
                interestMethod: input.interestMethod,
                name: input.name,
                paymentFrequency: input.paymentFrequency,
                termDays: input.termDays,
                version: input.version,
            },
            table: 'loan_formula_profile',
        },
    })
    const database = db.$client
    const [insertResult] = await database.batch([
        database
            .prepare(
                `INSERT OR IGNORE INTO loan_formula_profile (
                    public_id, organization_id, idempotency_key, request_fingerprint,
                    name, version, is_active, is_default, interest_method,
                    interest_rate_basis_points, fixed_interest_amount_minor,
                    term_days, payment_frequency, installment_count, timezone,
                    rounding_mode, final_installment_residue_policy,
                    renewal_settlement_method, partial_credit_policy,
                    min_completed_installments, allow_renewal_principal_change,
                    effective_at
                ) VALUES (?, ?, ?, ?, ?, ?, FALSE, FALSE, ?, ?, ?, ?, ?, ?,
                          'Asia/Manila', ?, 'LAST_INSTALLMENT_ABSORBS_RESIDUE',
                          ?, ?, ?, ?, ?)`,
            )
            .bind(
                publicId,
                organizationId,
                idempotencyKey,
                requestFingerprint,
                input.name,
                input.version,
                input.interestMethod,
                input.interestMethod === 'FLAT_PERCENTAGE'
                    ? input.interestRateBasisPoints
                    : 0,
                input.interestMethod === 'FIXED_AMOUNT'
                    ? input.fixedInterestAmountMinor
                    : null,
                input.termDays,
                input.paymentFrequency,
                input.installmentCount,
                input.roundingMode,
                input.renewalSettlementMethod,
                input.partialCreditPolicy,
                input.minimumRenewalCompletedInstallments,
                input.allowRenewalPrincipalChange,
                Date.parse(`${input.effectiveDate}T00:00:00+08:00`),
            ),
        auditTrailAfterChangeStatement(ctx, auditData, database),
    ])
    if (insertResult.meta.changes !== 1) {
        throw new AppError(formulaProfileConflict)
    }
    if (auditData) markAuditTrailRecorded(ctx)
    const profile = await readProfile(ctx, publicId)
    if (!profile) throw new AppError(formulaProfileNotFound)
    return { profile, replayed: false }
}

export const formulaProfilesRoute = new Hono<THonoInstance>()
    .on(
        'QUERY',
        '/readMany',
        tenantGuard,
        privilegedGuard,
        validateRequest(
            'json',
            formulaValidator.formulaProfileReadManyInputSchema,
        ),
        async (ctx) => {
            const input = ctx.req.valid('json')
            const { loanFormulaProfile } = ctx.get('dbSchema')
            const { isActive, search } = input.filters
            const where = and(
                eq(
                    loanFormulaProfile.organizationId,
                    getActiveOrganizationId(ctx),
                ),
                ...(isActive === undefined
                    ? []
                    : [eq(loanFormulaProfile.isActive, isActive)]),
                ...(search
                    ? [like(loanFormulaProfile.name, `%${search}%`)]
                    : []),
            )
            const [countRow] = await ctx
                .get('dbClient')
                .select({ count: countFn(loanFormulaProfile.id) })
                .from(loanFormulaProfile)
                .where(where)
            const rows = await ctx
                .get('dbClient')
                .select(profileSelection(loanFormulaProfile))
                .from(loanFormulaProfile)
                .where(where)
                .orderBy(
                    input.sortOrder === 'asc'
                        ? asc(loanFormulaProfile.createdAt)
                        : desc(loanFormulaProfile.createdAt),
                    desc(loanFormulaProfile.id),
                )
                .limit(input.limit)
                .offset(input.offset)
            return apiResponsePaginatedOkWrapper(ctx, {
                count: countRow.count,
                data: (rows as TFormulaProfileRow[]).map(profileOutput),
                limit: input.limit,
                offset: input.offset,
            })
        },
    )
    .get(
        '/read/:publicId',
        tenantGuard,
        privilegedGuard,
        validateRequest(
            'param',
            formulaValidator.formulaProfileReadInputSchema,
        ),
        async (ctx) => {
            const input = ctx.req.valid('param')
            const profile = await readProfile(ctx, input.publicId)
            if (!profile) throw new AppError(formulaProfileNotFound)
            return apiResponseOkWrapper(ctx, { data: profileOutput(profile) })
        },
    )
    .post(
        '/preview',
        tenantGuard,
        privilegedGuard,
        validateRequest(
            'json',
            formulaValidator.loanCalculationPreviewInputSchema,
        ),
        async (ctx) =>
            apiResponseOkWrapper(ctx, {
                data: previewCalculation(ctx.req.valid('json')),
            }),
    )
    .post(
        '/create',
        tenantGuard,
        privilegedGuard,
        validateRequest(
            'json',
            formulaValidator.formulaProfileCreateInputSchema,
        ),
        async (ctx) => {
            const input = ctx.req.valid('json')
            if (input.formulaProfile.version !== 1) {
                throw new AppError(formulaProfileVersionConflict)
            }
            const result = await persistProfile(
                ctx,
                input.formulaProfile,
                input.idempotencyKey,
                'create',
                null,
            )
            return apiResponseOkWrapper(ctx, {
                data: profileOutput(result.profile),
                status: result.replayed ? 200 : 201,
            })
        },
    )
    .post(
        '/:publicId/version',
        tenantGuard,
        privilegedGuard,
        validateRequest(
            'param',
            formulaValidator.formulaProfileReadInputSchema,
        ),
        validateRequest(
            'json',
            formulaValidator.formulaProfileVersionInputSchema,
        ),
        async (ctx) => {
            const param = ctx.req.valid('param')
            const input = ctx.req.valid('json')
            const source = await readProfile(ctx, param.publicId)
            if (!source) throw new AppError(formulaProfileNotFound)
            if (
                input.formulaProfile.name !== source.name ||
                input.formulaProfile.version !== source.version + 1
            ) {
                throw new AppError(formulaProfileVersionConflict)
            }
            const result = await persistProfile(
                ctx,
                input.formulaProfile,
                input.idempotencyKey,
                'version',
                source.publicId,
            )
            return apiResponseOkWrapper(ctx, {
                data: profileOutput(result.profile),
                status: result.replayed ? 200 : 201,
            })
        },
    )
    .post(
        '/:publicId/activate',
        tenantGuard,
        privilegedGuard,
        validateRequest(
            'param',
            formulaValidator.formulaProfileReadInputSchema,
        ),
        validateRequest(
            'json',
            formulaValidator.formulaProfileActivateInputSchema,
        ),
        async (ctx) => {
            const param = ctx.req.valid('param')
            const input = ctx.req.valid('json')
            const existing = await readProfile(ctx, param.publicId)
            if (!existing) throw new AppError(formulaProfileNotFound)
            if (
                existing.isActive &&
                existing.isDefault === input.isDefault &&
                existing.retiredAt === null
            ) {
                throw new AppError(formulaProfileConflict)
            }
            const auditData = auditTrailLogger.prepare({
                action: 'update',
                component: 'loan.formulaProfile',
                description: 'Formula profile activated',
                records: {
                    id: existing.publicId,
                    newData: {
                        isActive: true,
                        isDefault: input.isDefault,
                    },
                    oldData: {
                        isActive: existing.isActive,
                        isDefault: existing.isDefault,
                    },
                    table: 'loan_formula_profile',
                },
            })
            const database = ctx.get('dbClient').$client
            const organizationId = getActiveOrganizationId(ctx)
            const results = await database.batch([
                database
                    .prepare(
                        `UPDATE loan_formula_profile
                         SET is_default = FALSE
                         WHERE organization_id = ? AND public_id <> ?
                           AND is_default = TRUE AND ? = TRUE`,
                    )
                    .bind(organizationId, existing.publicId, input.isDefault),
                database
                    .prepare(
                        `UPDATE loan_formula_profile
                         SET is_active = TRUE, is_default = ?, retired_at = NULL
                         WHERE organization_id = ? AND public_id = ?`,
                    )
                    .bind(input.isDefault, organizationId, existing.publicId),
                auditTrailAfterChangeStatement(ctx, auditData, database),
            ])
            if (results[1].meta.changes !== 1) {
                throw new AppError(formulaProfileConflict)
            }
            if (auditData) markAuditTrailRecorded(ctx)
            const profile = await readProfile(ctx, existing.publicId)
            if (!profile) throw new AppError(formulaProfileNotFound)
            return apiResponseOkWrapper(ctx, { data: profileOutput(profile) })
        },
    )
    .post(
        '/:publicId/retire',
        tenantGuard,
        privilegedGuard,
        validateRequest(
            'param',
            formulaValidator.formulaProfileReadInputSchema,
        ),
        async (ctx) => {
            const input = ctx.req.valid('param')
            const existing = await readProfile(ctx, input.publicId)
            if (!existing) throw new AppError(formulaProfileNotFound)
            if (!existing.isActive || existing.retiredAt !== null) {
                throw new AppError(formulaProfileConflict)
            }
            const retiredAt = Date.now()
            const auditData = auditTrailLogger.prepare({
                action: 'update',
                component: 'loan.formulaProfile',
                description: 'Formula profile retired',
                records: {
                    id: existing.publicId,
                    newData: { isActive: false, isDefault: false },
                    oldData: {
                        isActive: existing.isActive,
                        isDefault: existing.isDefault,
                    },
                    table: 'loan_formula_profile',
                },
            })
            const database = ctx.get('dbClient').$client
            const [result] = await database.batch([
                database
                    .prepare(
                        `UPDATE loan_formula_profile
                         SET is_active = FALSE, is_default = FALSE, retired_at = ?
                         WHERE organization_id = ? AND public_id = ?
                           AND is_active = TRUE AND retired_at IS NULL`,
                    )
                    .bind(
                        retiredAt,
                        getActiveOrganizationId(ctx),
                        existing.publicId,
                    ),
                auditTrailAfterChangeStatement(ctx, auditData, database),
            ])
            if (result.meta.changes !== 1) {
                throw new AppError(formulaProfileConflict)
            }
            if (auditData) markAuditTrailRecorded(ctx)
            const profile = await readProfile(ctx, existing.publicId)
            if (!profile) throw new AppError(formulaProfileNotFound)
            return apiResponseOkWrapper(ctx, { data: profileOutput(profile) })
        },
    )

export default formulaProfilesRoute
