import { AppError, catalog, defineError } from '@loanms/errors'
import * as settingsValidator from '@loanms/validator/backoffice/settings'
import { and, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import type { ApplyGlobalResponse } from 'hono/client'
import { createMiddleware } from 'hono/factory'
import { v7 as uuidv7 } from 'uuid'

import {
    readRuntimeSystemSettings,
    type TRuntimeSystemSettings,
} from '../../services/systemSettings.js'
import type { THonoInstance } from '../../types.js'
import {
    apiResponseErrorWrapper,
    apiResponseOkWrapper,
    auditTrailAfterChangeStatement,
    auditTrailLogger,
    getActiveOrganizationId,
    markAuditTrailRecorded,
} from '../../utilities/helpers.js'
import { isTenantAuthenticated } from '../middleware/isTenantAuthenticated.js'
import { validateRequest } from '../middleware/validateRequest.js'
import { formulaProfilesRoute } from './formulaProfiles.js'

const systemSettingsConflict = defineError(
    'SYSTEM_SETTINGS_CONFLICT',
    'CONFLICT',
    'System settings changed before this update could be saved.',
)
const systemSettingsIdempotencyConflict = defineError(
    'SYSTEM_SETTINGS_IDEMPOTENCY_CONFLICT',
    'CONFLICT',
    'This idempotency key was already used with different settings.',
)
const systemSettingsDefaultProductNotFound = defineError(
    'SYSTEM_SETTINGS_DEFAULT_LOAN_PRODUCT_NOT_FOUND',
    'NOT_FOUND',
    'The selected default loan product is not available in this organization.',
)

const tenantGuard = isTenantAuthenticated()
const privilegedGuard = createMiddleware<THonoInstance>(async (ctx, next) => {
    if (!ctx.get('isPrivilegedRole')) {
        return apiResponseErrorWrapper(ctx, catalog.authenticationForbidden)
    }
    await next()
})

const settingFingerprint = async (
    input: typeof settingsValidator.systemSettingsUpdateInputSchema._output,
) => {
    const canonical = JSON.stringify({
        allowAdvancePayments: input.allowAdvancePayments,
        allowPartialPayments: input.allowPartialPayments,
        borrowerTagPolicy: input.borrowerTagPolicy,
        defaultLoanProductPublicId: input.defaultLoanProductPublicId,
        defaultPaymentFrequency: input.defaultPaymentFrequency,
        enabledPaymentFrequencies: [...input.enabledPaymentFrequencies].sort(),
        expectedVersion: input.expectedVersion,
        requireRenewalApproval: input.requireRenewalApproval,
    })
    const encoded = new TextEncoder().encode(canonical)
    const digest = await crypto.subtle.digest('SHA-256', encoded)
    return Array.from(new Uint8Array(digest), (byte) =>
        byte.toString(16).padStart(2, '0'),
    ).join('')
}

async function readSettingsByIdempotency(
    ctx: Parameters<typeof getActiveOrganizationId>[0],
    idempotencyKey: string,
) {
    const { systemSettings } = ctx.get('dbSchema')
    const [row] = await ctx
        .get('dbClient')
        .select({
            requestFingerprint: systemSettings.requestFingerprint,
            version: systemSettings.version,
        })
        .from(systemSettings)
        .where(
            and(
                eq(systemSettings.organizationId, getActiveOrganizationId(ctx)),
                eq(systemSettings.idempotencyKey, idempotencyKey),
            ),
        )
        .limit(1)
    return row ?? null
}

export const settingsRoute = new Hono<THonoInstance>()
    .route('/formulaProfile', formulaProfilesRoute)
    .get('/current', tenantGuard, privilegedGuard, async (ctx) =>
        apiResponseOkWrapper(ctx, {
            data: await readRuntimeSystemSettings(ctx),
        }),
    )
    .post(
        '/update',
        tenantGuard,
        privilegedGuard,
        validateRequest(
            'json',
            settingsValidator.systemSettingsUpdateInputSchema,
        ),
        async (ctx) => {
            const input = ctx.req.valid('json')
            const fingerprint = await settingFingerprint(input)
            const replay = await readSettingsByIdempotency(
                ctx,
                input.idempotencyKey,
            )
            if (replay) {
                if (replay.requestFingerprint !== fingerprint) {
                    throw new AppError(systemSettingsIdempotencyConflict)
                }
                const current = await readRuntimeSystemSettings(ctx)
                return apiResponseOkWrapper(ctx, {
                    data:
                        current.version === replay.version
                            ? current
                            : await readVersion(ctx, replay.version),
                })
            }

            const organizationId = getActiveOrganizationId(ctx)
            const { loanProduct } = ctx.get('dbSchema')
            let defaultLoanProductId: number | null = null
            if (input.defaultLoanProductPublicId) {
                const [product] = await ctx
                    .get('dbClient')
                    .select({ id: loanProduct.id })
                    .from(loanProduct)
                    .where(
                        and(
                            eq(loanProduct.organizationId, organizationId),
                            eq(
                                loanProduct.publicId,
                                input.defaultLoanProductPublicId,
                            ),
                            eq(loanProduct.isActive, true),
                        ),
                    )
                    .limit(1)
                if (!product) {
                    throw new AppError(systemSettingsDefaultProductNotFound)
                }
                defaultLoanProductId = product.id
            }

            const publicId = uuidv7()
            const newVersion = input.expectedVersion + 1
            const auditData = auditTrailLogger.prepare({
                action: 'update',
                component: 'settings',
                description: 'System settings version saved',
                records: {
                    entityType: 'system_settings',
                    id: publicId,
                    newData: {
                        allowAdvancePayments: input.allowAdvancePayments,
                        allowPartialPayments: input.allowPartialPayments,
                        borrowerTagPolicy: input.borrowerTagPolicy,
                        defaultLoanProductPublicId:
                            input.defaultLoanProductPublicId,
                        defaultPaymentFrequency: input.defaultPaymentFrequency,
                        enabledPaymentFrequencies:
                            input.enabledPaymentFrequencies,
                        requireRenewalApproval: input.requireRenewalApproval,
                        version: newVersion,
                    },
                    table: 'system_settings',
                },
            })
            const database = ctx.get('dbClient').$client
            const now = Date.now()
            const results = await database.batch([
                database
                    .prepare(
                        `UPDATE system_settings
                         SET is_current = FALSE
                         WHERE organization_id = ? AND is_current = TRUE AND version = ?`,
                    )
                    .bind(organizationId, input.expectedVersion),
                database
                    .prepare(
                        `INSERT INTO system_settings (
                            public_id, organization_id, version, is_current,
                            default_loan_product_id, default_payment_frequency,
                            enabled_payment_frequencies, allow_partial_payments,
                            allow_advance_payments, require_renewal_approval,
                            borrower_tag_policy, idempotency_key, request_fingerprint,
                            created_by_user_id, created_at
                         ) SELECT ?, ?, ?, TRUE, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
                           WHERE (? = 0 AND NOT EXISTS (
                                SELECT 1 FROM system_settings
                                WHERE organization_id = ? AND is_current = TRUE
                           )) OR changes() = 1`,
                    )
                    .bind(
                        publicId,
                        organizationId,
                        newVersion,
                        defaultLoanProductId,
                        input.defaultPaymentFrequency,
                        JSON.stringify(input.enabledPaymentFrequencies),
                        input.allowPartialPayments,
                        input.allowAdvancePayments,
                        input.requireRenewalApproval,
                        JSON.stringify(input.borrowerTagPolicy),
                        input.idempotencyKey,
                        fingerprint,
                        ctx.get('user')!.id,
                        now,
                        input.expectedVersion,
                        organizationId,
                    ),
                auditTrailAfterChangeStatement(ctx, auditData, database),
            ])
            if (results[1].meta.changes !== 1) {
                throw new AppError(systemSettingsConflict)
            }
            if (auditData) markAuditTrailRecorded(ctx)
            return apiResponseOkWrapper(ctx, {
                data: await readVersion(ctx, newVersion),
            })
        },
    )

async function readVersion(
    ctx: Parameters<typeof getActiveOrganizationId>[0],
    version: number,
) {
    const { loanProduct, systemSettings } = ctx.get('dbSchema')
    const [row] = await ctx
        .get('dbClient')
        .select({
            allowAdvancePayments: systemSettings.allowAdvancePayments,
            allowPartialPayments: systemSettings.allowPartialPayments,
            borrowerTagPolicy: systemSettings.borrowerTagPolicy,
            defaultLoanProductPublicId: loanProduct.publicId,
            defaultPaymentFrequency: systemSettings.defaultPaymentFrequency,
            enabledPaymentFrequencies: systemSettings.enabledPaymentFrequencies,
            requireRenewalApproval: systemSettings.requireRenewalApproval,
            version: systemSettings.version,
        })
        .from(systemSettings)
        .leftJoin(
            loanProduct,
            and(
                eq(loanProduct.organizationId, systemSettings.organizationId),
                eq(loanProduct.id, systemSettings.defaultLoanProductId),
            ),
        )
        .where(
            and(
                eq(systemSettings.organizationId, getActiveOrganizationId(ctx)),
                eq(systemSettings.version, version),
            ),
        )
        .limit(1)
    if (!row) throw new AppError(systemSettingsConflict)
    return row as TRuntimeSystemSettings
}

export default settingsRoute
export type SettingsRouteType = ApplyGlobalResponse<
    typeof settingsRoute,
    import('../../types.js').TGlobalApiResponses
>
