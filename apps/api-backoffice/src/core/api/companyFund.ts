import { AppError, catalog, defineError } from '@loanms/errors'
import * as companyFundValidator from '@loanms/validator/backoffice/companyFund'
import { and, desc, eq, gte, lte } from 'drizzle-orm'
import { Hono } from 'hono'
import type { ApplyGlobalResponse } from 'hono/client'
import { createMiddleware } from 'hono/factory'
import { v7 as uuidv7 } from 'uuid'

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

const primaryFundRequired = defineError(
    'PRIMARY_COMPANY_FUND_REQUIRED',
    'CONFLICT',
    'A primary company fund with opening capital must be configured before financial postings.',
)
const companyFundAlreadyConfigured = defineError(
    'COMPANY_FUND_ALREADY_CONFIGURED',
    'CONFLICT',
    'A primary company fund is already configured.',
)
const companyFundConflict = defineError(
    'COMPANY_FUND_CONFLICT',
    'CONFLICT',
    'Company fund transaction could not be recorded.',
)
const ownerRequired = defineError(
    'COMPANY_FUND_OWNER_REQUIRED',
    'FORBIDDEN',
    'Only an owner can withdraw company capital.',
)
const insufficientAvailableCash = defineError(
    'COMPANY_FUND_INSUFFICIENT_CASH',
    'CONFLICT',
    'Capital withdrawal exceeds available company cash.',
)

const tenantGuard = isTenantAuthenticated()
const privilegedGuard = createMiddleware<THonoInstance>(async (ctx, next) => {
    if (!ctx.get('isPrivilegedRole')) {
        return apiResponseErrorWrapper(ctx, catalog.authenticationForbidden)
    }
    await next()
})
const ownerGuard = createMiddleware<THonoInstance>(async (ctx, next) => {
    if (ctx.get('role') !== 'owner') {
        return apiResponseErrorWrapper(ctx, ownerRequired)
    }
    await next()
})

type TCapitalTransaction = {
    amountMinor: number
    direction: 'IN' | 'OUT'
    fundPublicId: string
    loanPublicId: string | null
    paymentPublicId: string | null
    publicId: string
    referenceNumber: string | null
    renewalPublicId: string | null
    transactionAt: Date
    transactionNumber: string
    transactionType: (typeof companyFundValidator.capitalTransactionTypeSchema)['_output']
}

const isoTime = (value: Date) => value.toISOString()

function transactionOutput(transaction: TCapitalTransaction) {
    return {
        ...transaction,
        transactionAt: isoTime(transaction.transactionAt),
    }
}

async function primaryFund(ctx: Parameters<typeof getActiveOrganizationId>[0]) {
    const { companyFund } = ctx.get('dbSchema')
    const [fund] = await ctx
        .get('dbClient')
        .select({
            currency: companyFund.currency,
            fundName: companyFund.fundName,
            id: companyFund.id,
            openingCapitalMinor: companyFund.openingCapitalMinor,
            publicId: companyFund.publicId,
        })
        .from(companyFund)
        .where(
            and(
                eq(companyFund.organizationId, getActiveOrganizationId(ctx)),
                eq(companyFund.isPrimary, true),
            ),
        )
        .limit(1)
    return fund ?? null
}

async function readTransaction(
    ctx: Parameters<typeof getActiveOrganizationId>[0],
    publicId: string,
): Promise<TCapitalTransaction | null> {
    const {
        capitalTransaction,
        cashTransaction,
        companyFund,
        loan,
        loanRenewal,
        payment,
    } = ctx.get('dbSchema')
    const [record] = await ctx
        .get('dbClient')
        .select({
            amountMinor: capitalTransaction.amountMinor,
            direction: capitalTransaction.direction,
            fundPublicId: companyFund.publicId,
            loanPublicId: loan.publicId,
            paymentPublicId: payment.publicId,
            publicId: capitalTransaction.publicId,
            referenceNumber: capitalTransaction.referenceNumber,
            renewalPublicId: loanRenewal.publicId,
            transactionAt: capitalTransaction.transactionAt,
            transactionNumber: capitalTransaction.transactionNumber,
            transactionType: capitalTransaction.transactionType,
        })
        .from(capitalTransaction)
        .innerJoin(
            companyFund,
            and(
                eq(
                    companyFund.organizationId,
                    capitalTransaction.organizationId,
                ),
                eq(companyFund.id, capitalTransaction.companyFundId),
            ),
        )
        .leftJoin(
            loan,
            and(
                eq(loan.organizationId, capitalTransaction.organizationId),
                eq(loan.id, capitalTransaction.loanId),
            ),
        )
        .leftJoin(
            payment,
            and(
                eq(payment.organizationId, capitalTransaction.organizationId),
                eq(payment.id, capitalTransaction.paymentId),
            ),
        )
        .leftJoin(
            loanRenewal,
            and(
                eq(
                    loanRenewal.organizationId,
                    capitalTransaction.organizationId,
                ),
                eq(loanRenewal.id, capitalTransaction.loanRenewalId),
            ),
        )
        .leftJoin(
            cashTransaction,
            and(
                eq(
                    cashTransaction.organizationId,
                    capitalTransaction.organizationId,
                ),
                eq(cashTransaction.id, capitalTransaction.cashTransactionId),
            ),
        )
        .where(
            and(
                eq(
                    capitalTransaction.organizationId,
                    getActiveOrganizationId(ctx),
                ),
                eq(capitalTransaction.publicId, publicId),
            ),
        )
        .limit(1)
    return (record as TCapitalTransaction | undefined) ?? null
}

async function readTransactionByIdempotency(
    ctx: Parameters<typeof getActiveOrganizationId>[0],
    idempotencyKey: string,
) {
    const { capitalTransaction } = ctx.get('dbSchema')
    const [record] = await ctx
        .get('dbClient')
        .select({ publicId: capitalTransaction.publicId })
        .from(capitalTransaction)
        .where(
            and(
                eq(
                    capitalTransaction.organizationId,
                    getActiveOrganizationId(ctx),
                ),
                eq(capitalTransaction.idempotencyKey, idempotencyKey),
            ),
        )
        .limit(1)
    return record ? readTransaction(ctx, record.publicId) : null
}

async function summary(ctx: Parameters<typeof getActiveOrganizationId>[0]) {
    const fund = await primaryFund(ctx)
    if (!fund) {
        return {
            additionalCapitalMinor: 0,
            availableCashMinor: 0,
            capitalWithdrawnMinor: 0,
            currency: null,
            expensesMinor: 0,
            fundPublicId: null,
            interestCollectedMinor: 0,
            netEarningsMinor: 0,
            openingCapitalMinor: 0,
            outstandingPrincipalMinor: 0,
            principalCollectedMinor: 0,
            principalReleasedMinor: 0,
            refundedMinor: 0,
            renewalReleasedMinor: 0,
            writeOffsMinor: 0,
        }
    }
    const organizationId = getActiveOrganizationId(ctx)
    const rows = (await ctx
        .get('dbClient')
        .$client.prepare(
            `SELECT transaction_type AS type,
                    COALESCE(SUM(CASE direction WHEN 'IN' THEN amount_minor ELSE -amount_minor END), 0) AS amount
             FROM capital_transaction
             WHERE organization_id = ? AND company_fund_id = ?
             GROUP BY transaction_type`,
        )
        .bind(organizationId, fund.id)
        .all()) as { results: { amount: number; type: string }[] }
    const totals = new Map(
        rows.results.map((row) => [
            row.type,
            row.amount,
        ]),
    )
    const openingCapitalMinor = totals.get('OPENING_CAPITAL') ?? 0
    const additionalCapitalMinor = totals.get('CAPITAL_INJECTION') ?? 0
    const capitalWithdrawnMinor = Math.abs(
        totals.get('CAPITAL_WITHDRAWAL') ?? 0,
    )
    const principalReleasedMinor =
        Math.abs(totals.get('LOAN_PRINCIPAL_RELEASE') ?? 0) +
        Math.abs(totals.get('RENEWAL_RELEASE') ?? 0)
    const principalCollectedMinor =
        (totals.get('PRINCIPAL_COLLECTION') ?? 0) +
        (totals.get('RENEWAL_SETTLEMENT_PRINCIPAL') ?? 0)
    const interestCollectedMinor =
        (totals.get('INTEREST_COLLECTION') ?? 0) +
        (totals.get('RENEWAL_SETTLEMENT_INTEREST') ?? 0)
    const renewalReleasedMinor = Math.abs(totals.get('RENEWAL_RELEASE') ?? 0)
    const refundedMinor = Math.abs(totals.get('REFUND') ?? 0)
    const expensesMinor = Math.abs(totals.get('EXPENSE') ?? 0)
    const writeOffsMinor = Math.abs(totals.get('WRITE_OFF') ?? 0)
    const availableCashMinor = Array.from(totals.values()).reduce(
        (total, amount) => total + amount,
        0,
    )
    return {
        additionalCapitalMinor,
        availableCashMinor,
        capitalWithdrawnMinor,
        currency: fund.currency,
        expensesMinor,
        fundPublicId: fund.publicId,
        interestCollectedMinor,
        netEarningsMinor:
            interestCollectedMinor - expensesMinor - writeOffsMinor,
        openingCapitalMinor,
        outstandingPrincipalMinor: Math.max(
            0,
            principalReleasedMinor - principalCollectedMinor,
        ),
        principalCollectedMinor,
        principalReleasedMinor,
        refundedMinor,
        renewalReleasedMinor,
        writeOffsMinor,
    }
}

async function recordManualFundTransaction(
    ctx: Parameters<typeof getActiveOrganizationId>[0],
    input: companyFundValidator.TManualFundTransactionInput,
) {
    const replay = await readTransactionByIdempotency(ctx, input.idempotencyKey)
    if (replay) return transactionOutput(replay)

    const fund = await primaryFund(ctx)
    if (!fund) throw new AppError(primaryFundRequired)

    const publicId = uuidv7()
    const now = Date.now()
    const organizationId = getActiveOrganizationId(ctx)
    const auditData = auditTrailLogger.prepare({
        action: 'create',
        component: 'companyFund',
        description: `Company fund ${input.transactionType.toLowerCase()} recorded`,
        records: {
            table: 'capital_transaction',
            id: publicId,
            newData: {
                amountMinor: input.amountMinor,
                direction: input.direction,
                reason: input.reason,
                transactionType: input.transactionType,
            },
        },
    })
    const database = ctx.get('dbClient').$client
    const results = await database.batch([
        database
            .prepare(
                `INSERT OR IGNORE INTO capital_transaction (
                    public_id, organization_id, company_fund_id, transaction_number,
                    transaction_type, direction, amount_minor, reference_number, notes,
                    transaction_at, idempotency_key, created_by_user_id, created_at
                 ) SELECT ?, ?, fund.id, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
                     FROM company_fund AS fund
                    WHERE fund.organization_id = ? AND fund.id = ? AND fund.is_primary = TRUE
                      AND (? = 'IN' OR ? <= COALESCE((
                          SELECT SUM(CASE direction WHEN 'IN' THEN amount_minor ELSE -amount_minor END)
                            FROM capital_transaction
                           WHERE organization_id = fund.organization_id
                             AND company_fund_id = fund.id
                      ), 0))`,
            )
            .bind(
                publicId,
                organizationId,
                `CAP-${input.transactionType}-${publicId.toUpperCase()}`,
                input.transactionType,
                input.direction,
                input.amountMinor,
                input.referenceNumber ?? null,
                input.reason,
                new Date(`${input.transactionDate}T00:00:00+08:00`).getTime(),
                input.idempotencyKey,
                ctx.get('user')!.id,
                now,
                organizationId,
                fund.id,
                input.direction,
                input.amountMinor,
            ),
        auditTrailAfterChangeStatement(ctx, auditData, database),
    ])
    if (results[0].meta.changes !== 1) {
        const retry = await readTransactionByIdempotency(
            ctx,
            input.idempotencyKey,
        )
        if (retry) return transactionOutput(retry)
        if (input.direction === 'OUT')
            throw new AppError(insufficientAvailableCash)
        throw new AppError(companyFundConflict)
    }
    markAuditTrailRecorded(ctx)
    const transaction = await readTransaction(ctx, publicId)
    if (!transaction) throw new AppError(companyFundConflict)
    return transactionOutput(transaction)
}

export const companyFundRoute = new Hono<THonoInstance>()
    .post(
        '/setup',
        tenantGuard,
        privilegedGuard,
        validateRequest(
            'json',
            companyFundValidator.companyFundSetupInputSchema,
        ),
        async (ctx) => {
            const input = ctx.req.valid('json')
            const replay = await readTransactionByIdempotency(
                ctx,
                input.idempotencyKey,
            )
            if (replay) {
                const fund = await primaryFund(ctx)
                if (!fund) throw new AppError(companyFundConflict)
                return apiResponseOkWrapper(ctx, {
                    data: {
                        ...fund,
                        isPrimary: true as const,
                        openingTransaction: transactionOutput(replay),
                    },
                })
            }
            if (await primaryFund(ctx))
                throw new AppError(companyFundAlreadyConfigured)

            const organizationId = getActiveOrganizationId(ctx)
            const actorId = ctx.get('user')!.id
            const publicId = uuidv7()
            const transactionPublicId = uuidv7()
            const now = Date.now()
            const database = ctx.get('dbClient').$client
            const auditData = auditTrailLogger.prepare({
                action: 'create',
                component: 'companyFund',
                description: 'Company fund opening capital configured',
                records: [
                    {
                        table: 'company_fund',
                        id: publicId,
                        newData: {
                            currency: input.currency,
                            fundName: input.fundName,
                            openingCapitalMinor: input.openingCapitalMinor,
                        },
                    },
                    {
                        table: 'capital_transaction',
                        id: transactionPublicId,
                        newData: {
                            amountMinor: input.openingCapitalMinor,
                            transactionType: 'OPENING_CAPITAL',
                        },
                    },
                ],
            })
            const results = await database.batch([
                database
                    .prepare(
                        `INSERT INTO company_fund (
                            public_id, organization_id, fund_name, opening_capital_minor,
                            currency, is_primary, created_at, updated_at
                         ) VALUES (?, ?, ?, ?, ?, TRUE, ?, ?)`,
                    )
                    .bind(
                        publicId,
                        organizationId,
                        input.fundName,
                        input.openingCapitalMinor,
                        input.currency,
                        now,
                        now,
                    ),
                database
                    .prepare(
                        `INSERT INTO capital_transaction (
                            public_id, organization_id, company_fund_id, transaction_number,
                            transaction_type, direction, amount_minor, transaction_at,
                            idempotency_key, created_by_user_id, created_at
                         ) SELECT ?, ?, id, ?, 'OPENING_CAPITAL', 'IN', ?, ?, ?, ?, ?
                           FROM company_fund
                           WHERE organization_id = ? AND public_id = ? AND is_primary = TRUE`,
                    )
                    .bind(
                        transactionPublicId,
                        organizationId,
                        `CAP-OPEN-${publicId.toUpperCase()}`,
                        input.openingCapitalMinor,
                        new Date(
                            `${input.transactionDate}T00:00:00+08:00`,
                        ).getTime(),
                        input.idempotencyKey,
                        actorId,
                        now,
                        organizationId,
                        publicId,
                    ),
                auditTrailAfterChangeStatement(ctx, auditData, database),
            ])
            if (results[1].meta.changes !== 1)
                throw new AppError(companyFundConflict)
            markAuditTrailRecorded(ctx)
            const fund = await primaryFund(ctx)
            const transaction = await readTransaction(ctx, transactionPublicId)
            if (!fund || !transaction) throw new AppError(companyFundConflict)
            return apiResponseOkWrapper(ctx, {
                data: {
                    ...fund,
                    isPrimary: true as const,
                    openingTransaction: transactionOutput(transaction),
                },
                status: 201,
            })
        },
    )
    .post(
        '/capitalInjection',
        tenantGuard,
        privilegedGuard,
        validateRequest(
            'json',
            companyFundValidator.capitalInjectionInputSchema,
        ),
        async (ctx) => {
            const input = ctx.req.valid('json')
            const replay = await readTransactionByIdempotency(
                ctx,
                input.idempotencyKey,
            )
            if (replay)
                return apiResponseOkWrapper(ctx, {
                    data: transactionOutput(replay),
                })
            const fund = await primaryFund(ctx)
            if (!fund) throw new AppError(primaryFundRequired)
            const publicId = uuidv7()
            const now = Date.now()
            const auditData = auditTrailLogger.prepare({
                action: 'create',
                component: 'companyFund',
                description: 'Capital injected',
                records: {
                    table: 'capital_transaction',
                    id: publicId,
                    newData: {
                        amountMinor: input.amountMinor,
                        transactionType: 'CAPITAL_INJECTION',
                    },
                },
            })
            const result = await ctx.get('dbClient').$client.batch([
                ctx
                    .get('dbClient')
                    .$client.prepare(
                        `INSERT INTO capital_transaction (public_id, organization_id, company_fund_id, transaction_number, transaction_type, direction, amount_minor, reference_number, notes, transaction_at, idempotency_key, created_by_user_id, created_at) VALUES (?, ?, ?, ?, 'CAPITAL_INJECTION', 'IN', ?, ?, ?, ?, ?, ?, ?)`,
                    )
                    .bind(
                        publicId,
                        getActiveOrganizationId(ctx),
                        fund.id,
                        `CAP-IN-${publicId.toUpperCase()}`,
                        input.amountMinor,
                        input.referenceNumber ?? null,
                        input.reason,
                        new Date(
                            `${input.transactionDate}T00:00:00+08:00`,
                        ).getTime(),
                        input.idempotencyKey,
                        ctx.get('user')!.id,
                        now,
                    ),
                auditTrailAfterChangeStatement(
                    ctx,
                    auditData,
                    ctx.get('dbClient').$client,
                ),
            ])
            if (result[0].meta.changes !== 1)
                throw new AppError(companyFundConflict)
            markAuditTrailRecorded(ctx)
            const transaction = await readTransaction(ctx, publicId)
            if (!transaction) throw new AppError(companyFundConflict)
            return apiResponseOkWrapper(ctx, {
                data: transactionOutput(transaction),
                status: 201,
            })
        },
    )
    .post(
        '/capitalWithdrawal',
        tenantGuard,
        ownerGuard,
        validateRequest(
            'json',
            companyFundValidator.capitalWithdrawalInputSchema,
        ),
        async (ctx) => {
            const input = ctx.req.valid('json')
            const replay = await readTransactionByIdempotency(
                ctx,
                input.idempotencyKey,
            )
            if (replay)
                return apiResponseOkWrapper(ctx, {
                    data: transactionOutput(replay),
                })
            const fund = await primaryFund(ctx)
            if (!fund) throw new AppError(primaryFundRequired)
            const publicId = uuidv7()
            const now = Date.now()
            const auditData = auditTrailLogger.prepare({
                action: 'create',
                component: 'companyFund',
                description: 'Capital withdrawn',
                records: {
                    table: 'capital_transaction',
                    id: publicId,
                    newData: {
                        amountMinor: input.amountMinor,
                        transactionType: 'CAPITAL_WITHDRAWAL',
                    },
                },
            })
            const result = await ctx.get('dbClient').$client.batch([
                ctx
                    .get('dbClient')
                    .$client.prepare(
                        `INSERT OR IGNORE INTO capital_transaction (
                             public_id, organization_id, company_fund_id, transaction_number,
                             transaction_type, direction, amount_minor, reference_number, notes,
                             transaction_at, idempotency_key, created_by_user_id, created_at
                         ) SELECT ?, ?, fund.id, ?, 'CAPITAL_WITHDRAWAL', 'OUT', ?, ?, ?, ?, ?, ?, ?
                           FROM company_fund AS fund
                          WHERE fund.organization_id = ? AND fund.id = ? AND fund.is_primary = TRUE
                            AND ? <= COALESCE((
                                SELECT SUM(CASE direction WHEN 'IN' THEN amount_minor ELSE -amount_minor END)
                                  FROM capital_transaction
                                 WHERE organization_id = fund.organization_id
                                   AND company_fund_id = fund.id
                            ), 0)`,
                    )
                    .bind(
                        publicId,
                        getActiveOrganizationId(ctx),
                        `CAP-OUT-${publicId.toUpperCase()}`,
                        input.amountMinor,
                        input.referenceNumber ?? null,
                        input.reason,
                        new Date(
                            `${input.transactionDate}T00:00:00+08:00`,
                        ).getTime(),
                        input.idempotencyKey,
                        ctx.get('user')!.id,
                        now,
                        getActiveOrganizationId(ctx),
                        fund.id,
                        input.amountMinor,
                    ),
                auditTrailAfterChangeStatement(
                    ctx,
                    auditData,
                    ctx.get('dbClient').$client,
                ),
            ])
            if (result[0].meta.changes !== 1) {
                const retry = await readTransactionByIdempotency(
                    ctx,
                    input.idempotencyKey,
                )
                if (retry)
                    return apiResponseOkWrapper(ctx, {
                        data: transactionOutput(retry),
                    })
                throw new AppError(insufficientAvailableCash)
            }
            markAuditTrailRecorded(ctx)
            const transaction = await readTransaction(ctx, publicId)
            if (!transaction) throw new AppError(companyFundConflict)
            return apiResponseOkWrapper(ctx, {
                data: transactionOutput(transaction),
                status: 201,
            })
        },
    )
    .post(
        '/manualTransaction',
        tenantGuard,
        privilegedGuard,
        validateRequest(
            'json',
            companyFundValidator.manualFundTransactionInputSchema,
        ),
        async (ctx) =>
            apiResponseOkWrapper(ctx, {
                data: await recordManualFundTransaction(
                    ctx,
                    ctx.req.valid('json'),
                ),
                status: 201,
            }),
    )
    .get('/summary', tenantGuard, async (ctx) =>
        apiResponseOkWrapper(ctx, { data: await summary(ctx) }),
    )
    .on(
        'QUERY',
        '/transactions',
        tenantGuard,
        validateRequest(
            'json',
            companyFundValidator.capitalTransactionReadManyInputSchema,
        ),
        async (ctx) => {
            const input = ctx.req.valid('json')
            const {
                capitalTransaction,
                companyFund,
                loan,
                loanRenewal,
                payment,
            } = ctx.get('dbSchema')
            const filters = [
                eq(
                    capitalTransaction.organizationId,
                    getActiveOrganizationId(ctx),
                ),
            ]
            if (input.filters.transactionType)
                filters.push(
                    eq(
                        capitalTransaction.transactionType,
                        input.filters.transactionType,
                    ),
                )
            if (input.filters.dateFrom)
                filters.push(
                    gte(
                        capitalTransaction.transactionAt,
                        new Date(`${input.filters.dateFrom}T00:00:00+08:00`),
                    ),
                )
            if (input.filters.dateTo)
                filters.push(
                    lte(
                        capitalTransaction.transactionAt,
                        new Date(`${input.filters.dateTo}T23:59:59.999+08:00`),
                    ),
                )
            const records = await ctx
                .get('dbClient')
                .select({
                    amountMinor: capitalTransaction.amountMinor,
                    direction: capitalTransaction.direction,
                    fundPublicId: companyFund.publicId,
                    loanPublicId: loan.publicId,
                    paymentPublicId: payment.publicId,
                    publicId: capitalTransaction.publicId,
                    referenceNumber: capitalTransaction.referenceNumber,
                    renewalPublicId: loanRenewal.publicId,
                    transactionAt: capitalTransaction.transactionAt,
                    transactionNumber: capitalTransaction.transactionNumber,
                    transactionType: capitalTransaction.transactionType,
                })
                .from(capitalTransaction)
                .innerJoin(
                    companyFund,
                    and(
                        eq(
                            companyFund.organizationId,
                            capitalTransaction.organizationId,
                        ),
                        eq(companyFund.id, capitalTransaction.companyFundId),
                    ),
                )
                .leftJoin(
                    loan,
                    and(
                        eq(
                            loan.organizationId,
                            capitalTransaction.organizationId,
                        ),
                        eq(loan.id, capitalTransaction.loanId),
                    ),
                )
                .leftJoin(
                    payment,
                    and(
                        eq(
                            payment.organizationId,
                            capitalTransaction.organizationId,
                        ),
                        eq(payment.id, capitalTransaction.paymentId),
                    ),
                )
                .leftJoin(
                    loanRenewal,
                    and(
                        eq(
                            loanRenewal.organizationId,
                            capitalTransaction.organizationId,
                        ),
                        eq(loanRenewal.id, capitalTransaction.loanRenewalId),
                    ),
                )
                .where(and(...filters))
                .orderBy(
                    desc(capitalTransaction.transactionAt),
                    desc(capitalTransaction.id),
                )
                .limit(input.limit)
                .offset(input.offset)
            const allRecords = await ctx
                .get('dbClient')
                .select({ id: capitalTransaction.id })
                .from(capitalTransaction)
                .where(and(...filters))
            return apiResponsePaginatedOkWrapper(ctx, {
                data: records.map((record) =>
                    transactionOutput(record as TCapitalTransaction),
                ),
                count: allRecords.length,
                limit: input.limit,
                offset: input.offset,
            })
        },
    )
    .get('/reconciliation', tenantGuard, privilegedGuard, async (ctx) =>
        apiResponseOkWrapper(ctx, { data: await summary(ctx) }),
    )

export default companyFundRoute
export type CompanyFundRouteType = ApplyGlobalResponse<
    typeof companyFundRoute,
    import('../../types.js').TGlobalApiResponses
>
