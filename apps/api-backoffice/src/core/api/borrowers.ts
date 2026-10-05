import { AppError, catalog, defineError } from '@loanms/errors'
import * as borrowerValidator from '@loanms/validator/backoffice/borrower'
import { and, asc, count as countFn, desc, eq, like, ne, or } from 'drizzle-orm'
import { Hono } from 'hono'
import type { ApplyGlobalResponse } from 'hono/client'
import { v7 as uuidv7 } from 'uuid'

import { readBorrowerPaymentTagDetails } from '../../services/borrowerPaymentTag.js'
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

type TBorrowerFields = {
    addressLine: string
    barangay: string
    birthDate?: null | string
    cityMunicipality: string
    contactNumber: string
    email?: null | string
    emergencyContactName?: null | string
    emergencyContactNumber?: null | string
    emergencyContactRelationship?: null | string
    firstName?: string
    fullName?: string
    gender: 'FEMALE' | 'MALE' | 'OTHER' | 'PREFER_NOT_TO_SAY'
    lastName?: string
    middleName?: null | string
    notes?: null | string
    postalCode?: null | string
    province: string
    secondaryContactNumber?: null | string
    suffix?: null | string
}

type TCanonicalBorrowerFields = Omit<
    TBorrowerFields,
    'firstName' | 'fullName' | 'lastName' | 'middleName' | 'suffix'
> & {
    firstName: string
    fullName: string
    lastName: string
    middleName: null | string
    suffix: null | string
}

const borrowerNotFound = defineError(
    'BORROWER_NOT_FOUND',
    'NOT_FOUND',
    'Borrower not found.',
)
const borrowerArchiveConflict = defineError(
    'BORROWER_ARCHIVE_CONFLICT',
    'CONFLICT',
    'Borrower changed before it could be archived.',
)
const paymentTagUpdateConflict = defineError(
    'BORROWER_PAYMENT_TAG_UPDATE_CONFLICT',
    'CONFLICT',
    'Borrower payment tag changed before it could be updated.',
)
const tenantGuard = isTenantAuthenticated()

const normalize = (value: string) =>
    value
        .normalize('NFKD')
        .replace(/[^a-zA-Z0-9]+/g, '')
        .toLowerCase()

const displayName = (input: {
    firstName: string
    lastName: string
    middleName?: null | string
    suffix?: null | string
}) =>
    [
        input.firstName,
        input.middleName,
        input.lastName,
        input.suffix,
    ]
        .filter(Boolean)
        .join(' ')

const normalizeName = (input: TCanonicalBorrowerFields) =>
    normalize(input.fullName)

const canonicalizeBorrowerFields = (
    input: TBorrowerFields,
): TCanonicalBorrowerFields => {
    if (input.fullName) {
        const [
            firstName,
            ...lastNameParts
        ] = input.fullName.trim().split(/\s+/)
        return {
            ...input,
            firstName,
            fullName: input.fullName.trim(),
            lastName: lastNameParts.join(' '),
            middleName: null,
            suffix: null,
        }
    }

    const firstName = input.firstName!
    const lastName = input.lastName!
    const middleName = input.middleName ?? null
    const suffix = input.suffix ?? null

    return {
        ...input,
        firstName,
        fullName: displayName({
            firstName,
            lastName,
            middleName,
            suffix,
        }),
        lastName,
        middleName,
        suffix,
    }
}

const normalizePhone = (value: string) => value.replace(/\D/g, '')

const borrowerNumberFor = (publicId: string) =>
    `BR-${publicId.replaceAll('-', '').slice(-10).toUpperCase()}`

const toIsoDateTime = (value: Date | number | string) =>
    value instanceof Date ? value.toISOString() : new Date(value).toISOString()

const borrowerSelection = (
    borrower: THonoInstance['Variables']['dbSchema']['borrower'],
) => ({
    addressLine: borrower.addressLine,
    barangay: borrower.barangay,
    birthDate: borrower.birthDate,
    borrowerNumber: borrower.borrowerNumber,
    cityMunicipality: borrower.cityMunicipality,
    contactNumber: borrower.contactNumber,
    email: borrower.email,
    emergencyContactName: borrower.emergencyContactName,
    emergencyContactNumber: borrower.emergencyContactNumber,
    emergencyContactRelationship: borrower.emergencyContactRelationship,
    firstName: borrower.firstName,
    gender: borrower.gender,
    lastName: borrower.lastName,
    middleName: borrower.middleName,
    notes: borrower.notes,
    paymentTag: borrower.paymentTag,
    paymentTagOverrideReason: borrower.paymentTagOverrideReason,
    paymentTagSource: borrower.paymentTagSource,
    paymentTagUpdatedAt: borrower.paymentTagUpdatedAt,
    postalCode: borrower.postalCode,
    province: borrower.province,
    publicId: borrower.publicId,
    secondaryContactNumber: borrower.secondaryContactNumber,
    status: borrower.status,
    suffix: borrower.suffix,
    systemPaymentTag: borrower.systemPaymentTag,
})

const serializeBorrower = <
    T extends {
        firstName: string
        lastName: string
        middleName?: null | string
        paymentTagUpdatedAt: Date | number | string
        suffix?: null | string
    },
>(
    data: T,
) => ({
    ...data,
    fullName: displayName(data),
    paymentTagUpdatedAt: toIsoDateTime(data.paymentTagUpdatedAt),
})

const borrowerValues = (input: TCanonicalBorrowerFields) => ({
    addressLine: input.addressLine,
    barangay: input.barangay,
    birthDate: input.birthDate ?? null,
    cityMunicipality: input.cityMunicipality,
    contactNumber: input.contactNumber,
    email: input.email ?? null,
    emergencyContactName: input.emergencyContactName ?? null,
    emergencyContactNumber: input.emergencyContactNumber ?? null,
    emergencyContactRelationship: input.emergencyContactRelationship ?? null,
    firstName: input.firstName,
    gender: input.gender,
    lastName: input.lastName,
    middleName: input.middleName ?? null,
    notes: input.notes ?? null,
    postalCode: input.postalCode ?? null,
    province: input.province,
    secondaryContactNumber: input.secondaryContactNumber ?? null,
    suffix: input.suffix ?? null,
})

const duplicateCandidates = async (
    ctx: Parameters<typeof getActiveOrganizationId>[0],
    input: TCanonicalBorrowerFields,
    excludingPublicId?: string,
) => {
    const { borrower } = ctx.get('dbSchema')
    const organizationId = getActiveOrganizationId(ctx)
    const normalizedFullName = normalizeName(input)
    const normalizedContactNumber = normalizePhone(input.contactNumber)
    const candidates = await ctx
        .get('dbClient')
        .select({
            borrowerNumber: borrower.borrowerNumber,
            contactNumber: borrower.contactNumber,
            firstName: borrower.firstName,
            lastName: borrower.lastName,
            middleName: borrower.middleName,
            publicId: borrower.publicId,
            suffix: borrower.suffix,
        })
        .from(borrower)
        .where(
            and(
                eq(borrower.organizationId, organizationId),
                or(
                    eq(
                        borrower.normalizedContactNumber,
                        normalizedContactNumber,
                    ),
                    eq(borrower.normalizedFullName, normalizedFullName),
                ),
                ...(excludingPublicId
                    ? [ne(borrower.publicId, excludingPublicId)]
                    : []),
            ),
        )
        .limit(10)

    return candidates
        .filter((candidate) => candidate.publicId !== excludingPublicId)
        .map((candidate) => ({
            borrowerNumber: candidate.borrowerNumber,
            contactNumber: candidate.contactNumber,
            fullName: displayName(candidate),
            publicId: candidate.publicId,
        }))
}

const readBorrower = async (
    ctx: Parameters<typeof getActiveOrganizationId>[0],
    publicId: string,
) => {
    const { borrower } = ctx.get('dbSchema')
    const [data] = await ctx
        .get('dbClient')
        .select(borrowerSelection(borrower))
        .from(borrower)
        .where(
            and(
                eq(borrower.organizationId, getActiveOrganizationId(ctx)),
                eq(borrower.publicId, publicId),
            ),
        )
        .limit(1)

    return data ? serializeBorrower(data) : null
}

export const borrowersRoute = new Hono<THonoInstance>()
    .on(
        'QUERY',
        '/readMany',
        tenantGuard,
        validateRequest('json', borrowerValidator.readManyInputSchema),
        async (ctx) => {
            const input = ctx.req.valid('json')
            const { borrower } = ctx.get('dbSchema')
            const organizationId = getActiveOrganizationId(ctx)
            const { paymentTag, search, status } = input.filters
            const searchValue = search ? `%${normalize(search)}%` : undefined
            const conditions = [
                eq(borrower.organizationId, organizationId),
                ...(paymentTag ? [eq(borrower.paymentTag, paymentTag)] : []),
                ...(status ? [eq(borrower.status, status)] : []),
                ...(searchValue
                    ? [
                          or(
                              like(borrower.borrowerNumber, searchValue),
                              like(
                                  borrower.normalizedContactNumber,
                                  searchValue,
                              ),
                              like(borrower.normalizedFullName, searchValue),
                          ),
                      ]
                    : []),
            ]
            const where = and(...conditions)
            const [countRow] = await ctx
                .get('dbClient')
                .select({ count: countFn(borrower.id) })
                .from(borrower)
                .where(where)
            const rows = await ctx
                .get('dbClient')
                .select({
                    borrowerNumber: borrower.borrowerNumber,
                    contactNumber: borrower.contactNumber,
                    firstName: borrower.firstName,
                    lastName: borrower.lastName,
                    middleName: borrower.middleName,
                    paymentTag: borrower.paymentTag,
                    paymentTagSource: borrower.paymentTagSource,
                    publicId: borrower.publicId,
                    status: borrower.status,
                    suffix: borrower.suffix,
                })
                .from(borrower)
                .where(where)
                .orderBy(
                    input.sortOrder === 'asc'
                        ? asc(borrower.createdAt)
                        : desc(borrower.createdAt),
                )
                .limit(input.limit)
                .offset(input.offset)

            const data = rows.map(({ middleName, suffix, ...row }) => ({
                ...row,
                fullName: displayName({
                    ...row,
                    middleName,
                    suffix,
                }),
            }))

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
        validateRequest('param', borrowerValidator.readInputSchema),
        async (ctx) => {
            const { publicId } = ctx.req.valid('param')
            const data = await readBorrower(ctx, publicId)
            if (!data) throw new AppError(borrowerNotFound)

            return apiResponseOkWrapper(ctx, { data })
        },
    )
    .post(
        '/create',
        tenantGuard,
        validateRequest('json', borrowerValidator.createInputSchema),
        async (ctx) => {
            const input = ctx.req.valid('json')
            const organizationId = getActiveOrganizationId(ctx)
            const actorId = ctx.get('user')!.id
            const { borrower } = ctx.get('dbSchema')
            const db = ctx.get('dbClient')

            const [existing] = await db
                .select({ publicId: borrower.publicId })
                .from(borrower)
                .where(
                    and(
                        eq(borrower.organizationId, organizationId),
                        eq(borrower.idempotencyKey, input.idempotencyKey),
                    ),
                )
                .limit(1)

            const publicId = existing?.publicId ?? uuidv7()
            if (!existing) {
                const canonicalInput = canonicalizeBorrowerFields(input)
                const values = borrowerValues(canonicalInput)
                const database = db.$client
                const auditData = auditTrailLogger.prepare({
                    action: 'create',
                    component: 'borrower',
                    description: 'Borrower created',
                    records: {
                        table: 'borrower',
                        id: publicId,
                        newData: {
                            borrowerNumber: borrowerNumberFor(publicId),
                            fullName: canonicalInput.fullName,
                            paymentTag: 'GOOD_PAYER',
                            paymentTagSource: 'SYSTEM',
                            status: 'ACTIVE',
                            systemPaymentTag: 'GOOD_PAYER',
                        },
                    },
                })
                const [insertResult] = await database.batch([
                    database
                        .prepare(
                            `INSERT INTO borrower (
                                public_id, organization_id, borrower_number,
                                first_name, middle_name, last_name, suffix,
                                birth_date, gender, contact_number,
                                secondary_contact_number, email, address_line,
                                barangay, city_municipality, province, postal_code,
                                emergency_contact_name, emergency_contact_number,
                                emergency_contact_relationship, normalized_contact_number,
                                normalized_secondary_contact_number, normalized_email,
                                normalized_full_name, status, system_payment_tag,
                                payment_tag, payment_tag_source, payment_tag_updated_at,
                                notes, created_by_user_id, updated_by_user_id, idempotency_key
                            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', 'GOOD_PAYER', 'GOOD_PAYER', 'SYSTEM', ?, ?, ?, ?, ?)
                            ON CONFLICT(organization_id, idempotency_key) DO NOTHING`,
                        )
                        .bind(
                            publicId,
                            organizationId,
                            borrowerNumberFor(publicId),
                            values.firstName,
                            values.middleName,
                            values.lastName,
                            values.suffix,
                            values.birthDate,
                            values.gender,
                            values.contactNumber,
                            values.secondaryContactNumber,
                            values.email,
                            values.addressLine,
                            values.barangay,
                            values.cityMunicipality,
                            values.province,
                            values.postalCode,
                            values.emergencyContactName,
                            values.emergencyContactNumber,
                            values.emergencyContactRelationship,
                            normalizePhone(values.contactNumber),
                            values.secondaryContactNumber
                                ? normalizePhone(values.secondaryContactNumber)
                                : null,
                            values.email?.toLowerCase() ?? null,
                            normalizeName(canonicalInput),
                            Date.now(),
                            values.notes,
                            actorId,
                            actorId,
                            input.idempotencyKey,
                        ),
                    auditTrailAfterChangeStatement(ctx, auditData, database),
                ])
                if (insertResult.meta.changes === 1 && auditData) {
                    markAuditTrailRecorded(ctx)
                }
            }

            const data = await readBorrower(ctx, publicId)
            if (!data) throw new AppError(borrowerNotFound)
            const duplicates = await duplicateCandidates(
                ctx,
                canonicalizeBorrowerFields(input),
                publicId,
            )

            return apiResponseOkWrapper(ctx, {
                data: { borrower: data, duplicateCandidates: duplicates },
                status: 201,
            })
        },
    )
    .post(
        '/update',
        tenantGuard,
        validateRequest('json', borrowerValidator.updateInputSchema),
        async (ctx) => {
            const input = ctx.req.valid('json')
            const existing = await readBorrower(ctx, input.publicId)
            if (!existing) throw new AppError(borrowerNotFound)
            const merged = {
                ...existing,
                ...input,
                paymentTagUpdatedAt: existing.paymentTagUpdatedAt,
            }
            const updated = canonicalizeBorrowerFields(
                'fullName' in input
                    ? merged
                    : {
                          ...merged,
                          fullName: undefined,
                      },
            )
            const values = borrowerValues(updated)
            const organizationId = getActiveOrganizationId(ctx)
            const actorId = ctx.get('user')!.id
            const database = ctx.get('dbClient').$client
            const auditData = auditTrailLogger.prepare({
                action: 'update',
                component: 'borrower',
                description: 'Borrower information updated',
                records: {
                    table: 'borrower',
                    id: input.publicId,
                    oldData: existing,
                    newData: {
                        ...values,
                        fullName: updated.fullName,
                        paymentTag: existing.paymentTag,
                        paymentTagOverrideReason:
                            existing.paymentTagOverrideReason,
                        paymentTagSource: existing.paymentTagSource,
                        status: existing.status,
                        systemPaymentTag: existing.systemPaymentTag,
                    },
                },
            })
            const [updateResult] = await database.batch([
                database
                    .prepare(
                        `UPDATE borrower
                         SET first_name = ?, middle_name = ?, last_name = ?, suffix = ?,
                             birth_date = ?, gender = ?, contact_number = ?,
                             secondary_contact_number = ?, email = ?, address_line = ?,
                             barangay = ?, city_municipality = ?, province = ?, postal_code = ?,
                             emergency_contact_name = ?, emergency_contact_number = ?,
                             emergency_contact_relationship = ?, normalized_contact_number = ?,
                             normalized_secondary_contact_number = ?, normalized_email = ?,
                             normalized_full_name = ?, notes = ?, updated_by_user_id = ?, updated_at = ?
                         WHERE organization_id = ? AND public_id = ?`,
                    )
                    .bind(
                        values.firstName,
                        values.middleName,
                        values.lastName,
                        values.suffix,
                        values.birthDate,
                        values.gender,
                        values.contactNumber,
                        values.secondaryContactNumber,
                        values.email,
                        values.addressLine,
                        values.barangay,
                        values.cityMunicipality,
                        values.province,
                        values.postalCode,
                        values.emergencyContactName,
                        values.emergencyContactNumber,
                        values.emergencyContactRelationship,
                        normalizePhone(values.contactNumber),
                        values.secondaryContactNumber
                            ? normalizePhone(values.secondaryContactNumber)
                            : null,
                        values.email?.toLowerCase() ?? null,
                        normalizeName(updated),
                        values.notes,
                        actorId,
                        Date.now(),
                        organizationId,
                        input.publicId,
                    ),
                auditTrailAfterChangeStatement(ctx, auditData, database),
            ])
            if (updateResult.meta.changes === 1 && auditData) {
                markAuditTrailRecorded(ctx)
            }
            const data = await readBorrower(ctx, input.publicId)
            if (!data) throw new AppError(borrowerNotFound)

            return apiResponseOkWrapper(ctx, { data })
        },
    )
    .post(
        '/archive',
        tenantGuard,
        validateRequest('json', borrowerValidator.archiveInputSchema),
        async (ctx) => {
            const { publicId } = ctx.req.valid('json')
            const existing = await readBorrower(ctx, publicId)
            if (!existing) throw new AppError(borrowerNotFound)
            if (existing.status === 'ARCHIVED') {
                return apiResponseOkWrapper(ctx, { data: existing })
            }
            const database = ctx.get('dbClient').$client
            const auditData = auditTrailLogger.prepare({
                action: 'update',
                component: 'borrower',
                description: 'Borrower archived',
                records: {
                    table: 'borrower',
                    id: publicId,
                    oldData: existing,
                    newData: { ...existing, status: 'ARCHIVED' },
                },
            })
            const [archiveResult] = await database.batch([
                database
                    .prepare(
                        `UPDATE borrower
                         SET status = 'ARCHIVED', archived_at = ?, archived_by_user_id = ?,
                             updated_at = ?, updated_by_user_id = ?
                         WHERE organization_id = ? AND public_id = ?
                           AND status <> 'ARCHIVED'`,
                    )
                    .bind(
                        Date.now(),
                        ctx.get('user')!.id,
                        Date.now(),
                        ctx.get('user')!.id,
                        getActiveOrganizationId(ctx),
                        publicId,
                    ),
                auditTrailAfterChangeStatement(ctx, auditData, database),
            ])
            if (archiveResult.meta.changes !== 1) {
                throw new AppError(borrowerArchiveConflict)
            }
            if (auditData) markAuditTrailRecorded(ctx)
            const data = await readBorrower(ctx, publicId)
            if (!data) throw new AppError(borrowerNotFound)

            return apiResponseOkWrapper(ctx, { data })
        },
    )
    .post(
        '/document/create',
        tenantGuard,
        validateRequest('json', borrowerValidator.documentCreateInputSchema),
        async (ctx) => {
            const input = ctx.req.valid('json')
            const organizationId = getActiveOrganizationId(ctx)
            const { borrower, borrowerDocument, objectStorage } =
                ctx.get('dbSchema')
            const db = ctx.get('dbClient')
            const [borrowerRow] = await db
                .select({ id: borrower.id })
                .from(borrower)
                .where(
                    and(
                        eq(borrower.organizationId, organizationId),
                        eq(borrower.publicId, input.borrowerPublicId),
                    ),
                )
                .limit(1)
            if (!borrowerRow) throw new AppError(borrowerNotFound)

            const [storedObject] = await db
                .select({ id: objectStorage.id })
                .from(objectStorage)
                .where(
                    and(
                        eq(objectStorage.organizationId, organizationId),
                        eq(objectStorage.id, input.objectStorageId),
                        eq(objectStorage.isUploaded, true),
                    ),
                )
                .limit(1)
            if (!storedObject) throw new AppError(catalog.uploadNotFound)

            const [replayed] = await db
                .select({
                    documentNumber: borrowerDocument.documentNumber,
                    documentType: borrowerDocument.documentType,
                    expirationDate: borrowerDocument.expirationDate,
                    issuedDate: borrowerDocument.issuedDate,
                    notes: borrowerDocument.notes,
                    objectStorageId: borrowerDocument.objectStorageId,
                    publicId: borrowerDocument.publicId,
                })
                .from(borrowerDocument)
                .where(
                    and(
                        eq(borrowerDocument.organizationId, organizationId),
                        eq(
                            borrowerDocument.idempotencyKey,
                            input.idempotencyKey,
                        ),
                    ),
                )
                .limit(1)
            if (replayed) return apiResponseOkWrapper(ctx, { data: replayed })

            const publicId = uuidv7()
            const normalizedDocumentNumber = input.documentNumber
                ? normalize(input.documentNumber)
                : null
            const database = db.$client
            const auditData = auditTrailLogger.prepare({
                action: 'create',
                component: 'borrower.document',
                description: 'Borrower document registered',
                records: {
                    table: 'borrower_document',
                    id: publicId,
                    newData: {
                        documentType: input.documentType,
                        expirationDate: input.expirationDate,
                        issuedDate: input.issuedDate,
                    },
                },
            })
            const [insertResult] = await database.batch([
                database
                    .prepare(
                        `INSERT INTO borrower_document (
                            public_id, organization_id, borrower_id, document_type,
                            document_number, normalized_document_number, object_storage_id,
                            issued_date, expiration_date, notes, created_by_user_id,
                            idempotency_key
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        ON CONFLICT(organization_id, idempotency_key) DO NOTHING`,
                    )
                    .bind(
                        publicId,
                        organizationId,
                        borrowerRow.id,
                        input.documentType,
                        input.documentNumber ?? null,
                        normalizedDocumentNumber,
                        input.objectStorageId,
                        input.issuedDate ?? null,
                        input.expirationDate ?? null,
                        input.notes ?? null,
                        ctx.get('user')!.id,
                        input.idempotencyKey,
                    ),
                auditTrailAfterChangeStatement(ctx, auditData, database),
            ])
            if (insertResult.meta.changes === 1 && auditData) {
                markAuditTrailRecorded(ctx)
            }
            const [data] = await db
                .select({
                    documentNumber: borrowerDocument.documentNumber,
                    documentType: borrowerDocument.documentType,
                    expirationDate: borrowerDocument.expirationDate,
                    issuedDate: borrowerDocument.issuedDate,
                    notes: borrowerDocument.notes,
                    objectStorageId: borrowerDocument.objectStorageId,
                    publicId: borrowerDocument.publicId,
                })
                .from(borrowerDocument)
                .where(
                    and(
                        eq(borrowerDocument.organizationId, organizationId),
                        eq(
                            borrowerDocument.idempotencyKey,
                            input.idempotencyKey,
                        ),
                    ),
                )
                .limit(1)
            if (!data) throw new AppError(catalog.uploadNotFound)

            return apiResponseOkWrapper(ctx, { data })
        },
    )
    .get(
        '/document/readMany/:borrowerPublicId',
        tenantGuard,
        validateRequest('param', borrowerValidator.documentReadManyInputSchema),
        async (ctx) => {
            const { borrowerPublicId } = ctx.req.valid('param')
            const organizationId = getActiveOrganizationId(ctx)
            const { borrower, borrowerDocument } = ctx.get('dbSchema')
            const data = await ctx
                .get('dbClient')
                .select({
                    documentNumber: borrowerDocument.documentNumber,
                    documentType: borrowerDocument.documentType,
                    expirationDate: borrowerDocument.expirationDate,
                    issuedDate: borrowerDocument.issuedDate,
                    notes: borrowerDocument.notes,
                    objectStorageId: borrowerDocument.objectStorageId,
                    publicId: borrowerDocument.publicId,
                })
                .from(borrowerDocument)
                .innerJoin(
                    borrower,
                    eq(borrower.id, borrowerDocument.borrowerId),
                )
                .where(
                    and(
                        eq(borrowerDocument.organizationId, organizationId),
                        eq(borrower.organizationId, organizationId),
                        eq(borrower.publicId, borrowerPublicId),
                    ),
                )
                .orderBy(
                    desc(borrowerDocument.createdAt),
                    desc(borrowerDocument.id),
                )

            return apiResponseOkWrapper(ctx, { data })
        },
    )
    .get(
        '/paymentTag/read/:publicId',
        tenantGuard,
        validateRequest('param', borrowerValidator.paymentTagReadInputSchema),
        async (ctx) => {
            const { publicId } = ctx.req.valid('param')
            const data = await readBorrowerPaymentTagDetails(ctx, publicId)
            if (!data) throw new AppError(borrowerNotFound)

            return apiResponseOkWrapper(ctx, {
                data: {
                    ...data,
                    lastCalculatedAt: toIsoDateTime(data.lastCalculatedAt),
                },
            })
        },
    )
    .post(
        '/paymentTag/override',
        tenantGuard,
        validateRequest(
            'json',
            borrowerValidator.paymentTagOverrideInputSchema,
        ),
        async (ctx) => {
            if (!ctx.get('isPrivilegedRole')) {
                return apiResponseErrorWrapper(
                    ctx,
                    catalog.authenticationForbidden,
                )
            }
            const input = ctx.req.valid('json')
            const settings = await readRuntimeSystemSettings(ctx)
            if (!settings.borrowerTagPolicy.allowManualOverride) {
                return apiResponseErrorWrapper(
                    ctx,
                    catalog.authenticationForbidden,
                )
            }
            const existing = await readBorrower(ctx, input.publicId)
            if (!existing) throw new AppError(borrowerNotFound)
            const organizationId = getActiveOrganizationId(ctx)
            const actorId = ctx.get('user')!.id
            const now = Date.now()
            const { borrower } = ctx.get('dbSchema')
            const [row] = await ctx
                .get('dbClient')
                .select({ id: borrower.id })
                .from(borrower)
                .where(
                    and(
                        eq(borrower.organizationId, organizationId),
                        eq(borrower.publicId, input.publicId),
                    ),
                )
                .limit(1)
            if (!row) throw new AppError(borrowerNotFound)
            const database = ctx.get('dbClient').$client
            const historyPublicId = uuidv7()
            const auditData = auditTrailLogger.prepare({
                action: 'update',
                component: 'borrower.paymentTag',
                description: 'Borrower payment tag manually overridden',
                records: [
                    {
                        table: 'borrower',
                        id: input.publicId,
                        oldData: existing,
                        newData: {
                            ...existing,
                            paymentTag: input.paymentTag,
                            paymentTagOverrideReason: input.reason,
                            paymentTagSource: 'MANUAL_OVERRIDE',
                        },
                    },
                    {
                        table: 'borrower_payment_tag_history',
                        id: historyPublicId,
                        newData: {
                            paymentTag: input.paymentTag,
                            paymentTagOverrideReason: input.reason,
                            paymentTagSource: 'MANUAL_OVERRIDE',
                            systemPaymentTag: existing.systemPaymentTag,
                        },
                    },
                ],
            })
            const [updateResult] = await database.batch([
                database
                    .prepare(
                        `UPDATE borrower
                         SET payment_tag = ?, payment_tag_source = 'MANUAL_OVERRIDE',
                             payment_tag_override_reason = ?, payment_tag_override_by_user_id = ?,
                             payment_tag_override_at = ?, payment_tag_updated_at = ?,
                             updated_by_user_id = ?, updated_at = ?
                         WHERE organization_id = ? AND public_id = ?`,
                    )
                    .bind(
                        input.paymentTag,
                        input.reason,
                        actorId,
                        now,
                        now,
                        actorId,
                        now,
                        organizationId,
                        input.publicId,
                    ),
                database
                    .prepare(
                        `INSERT INTO borrower_payment_tag_history (
                            public_id, organization_id, borrower_id, payment_tag, system_payment_tag,
                            payment_tag_source, override_reason, changed_by_user_id, changed_at
                        ) SELECT ?, ?, ?, ?, ?, 'MANUAL_OVERRIDE', ?, ?, ?
                          WHERE changes() = 1`,
                    )
                    .bind(
                        historyPublicId,
                        organizationId,
                        row.id,
                        input.paymentTag,
                        existing.systemPaymentTag,
                        input.reason,
                        actorId,
                        now,
                    ),
                auditTrailAfterChangeStatement(ctx, auditData, database, 1),
            ])
            if (updateResult.meta.changes !== 1) {
                throw new AppError(paymentTagUpdateConflict)
            }
            if (auditData) markAuditTrailRecorded(ctx)
            const data = await readBorrower(ctx, input.publicId)
            if (!data) throw new AppError(borrowerNotFound)

            return apiResponseOkWrapper(ctx, {
                data: {
                    paymentTag: data.paymentTag,
                    paymentTagOverrideReason: data.paymentTagOverrideReason,
                    paymentTagSource: data.paymentTagSource,
                    paymentTagUpdatedAt: data.paymentTagUpdatedAt,
                    publicId: data.publicId,
                    systemPaymentTag: data.systemPaymentTag,
                },
            })
        },
    )
    .post(
        '/paymentTag/reset',
        tenantGuard,
        validateRequest('json', borrowerValidator.paymentTagResetInputSchema),
        async (ctx) => {
            if (!ctx.get('isPrivilegedRole')) {
                return apiResponseErrorWrapper(
                    ctx,
                    catalog.authenticationForbidden,
                )
            }
            const { publicId } = ctx.req.valid('json')
            const existing = await readBorrower(ctx, publicId)
            if (!existing) throw new AppError(borrowerNotFound)
            if (existing.paymentTagSource === 'SYSTEM') {
                return apiResponseOkWrapper(ctx, {
                    data: {
                        paymentTag: existing.paymentTag,
                        paymentTagOverrideReason:
                            existing.paymentTagOverrideReason,
                        paymentTagSource: existing.paymentTagSource,
                        paymentTagUpdatedAt: existing.paymentTagUpdatedAt,
                        publicId: existing.publicId,
                        systemPaymentTag: existing.systemPaymentTag,
                    },
                })
            }
            const organizationId = getActiveOrganizationId(ctx)
            const actorId = ctx.get('user')!.id
            const now = Date.now()
            const { borrower } = ctx.get('dbSchema')
            const [row] = await ctx
                .get('dbClient')
                .select({ id: borrower.id })
                .from(borrower)
                .where(
                    and(
                        eq(borrower.organizationId, organizationId),
                        eq(borrower.publicId, publicId),
                    ),
                )
                .limit(1)
            if (!row) throw new AppError(borrowerNotFound)
            const database = ctx.get('dbClient').$client
            const historyPublicId = uuidv7()
            const auditData = auditTrailLogger.prepare({
                action: 'reset',
                component: 'borrower.paymentTag',
                description: 'Borrower payment tag override removed',
                records: [
                    {
                        table: 'borrower',
                        id: publicId,
                        oldData: existing,
                        newData: {
                            ...existing,
                            paymentTag: existing.systemPaymentTag,
                            paymentTagOverrideReason: null,
                            paymentTagSource: 'SYSTEM',
                        },
                    },
                    {
                        table: 'borrower_payment_tag_history',
                        id: historyPublicId,
                        newData: {
                            paymentTag: existing.systemPaymentTag,
                            paymentTagOverrideReason: null,
                            paymentTagSource: 'SYSTEM',
                            systemPaymentTag: existing.systemPaymentTag,
                        },
                    },
                ],
            })
            const [resetResult] = await database.batch([
                database
                    .prepare(
                        `UPDATE borrower
                         SET payment_tag = system_payment_tag, payment_tag_source = 'SYSTEM',
                             payment_tag_override_reason = NULL,
                             payment_tag_override_by_user_id = NULL,
                             payment_tag_override_at = NULL, payment_tag_updated_at = ?,
                             updated_by_user_id = ?, updated_at = ?
                         WHERE organization_id = ? AND public_id = ?
                           AND payment_tag_source = 'MANUAL_OVERRIDE'`,
                    )
                    .bind(now, actorId, now, organizationId, publicId),
                database
                    .prepare(
                        `INSERT INTO borrower_payment_tag_history (
                            public_id, organization_id, borrower_id, payment_tag, system_payment_tag,
                            payment_tag_source, override_reason, changed_by_user_id, changed_at
                        ) SELECT ?, ?, ?, ?, ?, 'SYSTEM', NULL, ?, ?
                          WHERE changes() = 1`,
                    )
                    .bind(
                        historyPublicId,
                        organizationId,
                        row.id,
                        existing.systemPaymentTag,
                        existing.systemPaymentTag,
                        actorId,
                        now,
                    ),
                auditTrailAfterChangeStatement(ctx, auditData, database, 1),
            ])
            if (resetResult.meta.changes !== 1) {
                throw new AppError(paymentTagUpdateConflict)
            }
            if (auditData) markAuditTrailRecorded(ctx)
            const data = await readBorrower(ctx, publicId)
            if (!data) throw new AppError(borrowerNotFound)

            return apiResponseOkWrapper(ctx, {
                data: {
                    paymentTag: data.paymentTag,
                    paymentTagOverrideReason: data.paymentTagOverrideReason,
                    paymentTagSource: data.paymentTagSource,
                    paymentTagUpdatedAt: data.paymentTagUpdatedAt,
                    publicId: data.publicId,
                    systemPaymentTag: data.systemPaymentTag,
                },
            })
        },
    )

export default borrowersRoute
export type BorrowerRouteType = ApplyGlobalResponse<
    typeof borrowersRoute,
    import('../../types.js').TGlobalApiResponses
>
