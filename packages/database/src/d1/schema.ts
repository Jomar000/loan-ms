import { sql, type SQLWrapper } from 'drizzle-orm'
import {
    check,
    foreignKey,
    index,
    integer,
    primaryKey,
    sqliteTable,
    text,
    unique,
    uniqueIndex,
} from 'drizzle-orm/sqlite-core'
import { v7 as uuidv7 } from 'uuid'

import type { TAuditRecord } from './types.js'

///////////
// Enums //
///////////

const genderValues = [
    'MALE',
    'FEMALE',
] as const
const userAddressTypeValues = [
    'RESIDENTIAL',
    'MAILING',
    'OTHER',
] as const
const websocketRevocationDeliveryKindValues = [
    'local',
    'remote',
] as const
const websocketSurfaceValues = [
    'public',
    'backoffice',
] as const
const loanFormulaInterestMethodValues = [
    'FLAT_PERCENTAGE',
    'FIXED_AMOUNT',
] as const
const loanFormulaPaymentFrequencyValues = [
    'DAILY',
    'WEEKLY',
    'MONTHLY',
] as const
const loanFormulaRoundingModeValues = [
    'HALF_UP',
    'DOWN',
    'UP',
] as const
const loanFormulaFinalInstallmentResiduePolicyValues = [
    'LAST_INSTALLMENT_ABSORBS_RESIDUE',
] as const
const loanFormulaRenewalSettlementMethodValues = [
    'COMPLETED_INSTALLMENT_BALANCE',
    'EXACT_OUTSTANDING_BALANCE',
] as const
const loanFormulaPartialCreditPolicyValues = [
    'CARRY_FORWARD',
    'APPLY_TO_SETTLEMENT',
    'REFUND',
    'MANUAL_REVIEW',
] as const
const borrowerGenderValues = [
    'MALE',
    'FEMALE',
    'OTHER',
    'PREFER_NOT_TO_SAY',
] as const
const borrowerStatusValues = [
    'ACTIVE',
    'INACTIVE',
    'BLOCKED',
    'ARCHIVED',
] as const
const borrowerPaymentTagValues = [
    'GOOD_PAYER',
    'BAD_PAYER',
    'SCAMMER',
] as const
const borrowerPaymentTagSourceValues = [
    'SYSTEM',
    'MANUAL_OVERRIDE',
] as const
const borrowerDocumentTypeValues = [
    'VALID_ID',
    'BORROWER_PHOTO',
    'PROOF_OF_ADDRESS',
    'SUPPORTING_DOCUMENT',
] as const
const loanStatusValues = [
    'DRAFT',
    'PENDING_APPROVAL',
    'APPROVED',
    'ACTIVE',
    'OVERDUE',
    'RENEWED',
    'FULLY_PAID',
    'CANCELLED',
    'WRITTEN_OFF',
] as const
const loanInstallmentStatusValues = [
    'UPCOMING',
    'PARTIAL',
    'PAID',
    'OVERDUE',
    'WAIVED',
] as const
const paymentStatusValues = [
    'POSTED',
    'REVERSED',
] as const
const cashTransactionTypeValues = [
    'LOAN_RELEASE',
    'PAYMENT_RECEIVED',
    'PAYMENT_REVERSAL',
    'RENEWAL_RELEASE',
    'PARTIAL_CREDIT_REFUND',
] as const
const cashTransactionDirectionValues = [
    'CASH_IN',
    'CASH_OUT',
] as const
const capitalTransactionTypeValues = [
    'OPENING_CAPITAL',
    'CAPITAL_INJECTION',
    'CAPITAL_WITHDRAWAL',
    'LOAN_PRINCIPAL_RELEASE',
    'PRINCIPAL_COLLECTION',
    'INTEREST_COLLECTION',
    'RENEWAL_RELEASE',
    'RENEWAL_SETTLEMENT_PRINCIPAL',
    'RENEWAL_SETTLEMENT_INTEREST',
    'RENEWAL_PARTIAL_CREDIT_TRANSFER',
    'REFUND',
    'EXPENSE',
    'WRITE_OFF',
    'ADJUSTMENT',
] as const
const capitalTransactionDirectionValues = [
    'IN',
    'OUT',
] as const
const loanRenewalStatusValues = [
    'PENDING_APPROVAL',
    'APPROVED',
    'RELEASED',
    'CANCELLED',
] as const

export type TBorrowerTagPolicy = {
    allowManualOverride: boolean
    automaticTaggingEnabled: boolean
    blockNewLoanForScammer: boolean
    daily: TBorrowerTagThreshold
    monthly: TBorrowerTagThreshold
    requireBadPayerRenewalApproval: boolean
    requireOverrideReason: boolean
    requireScammerRenewalApproval: boolean
    showHistoricalWorstTag: boolean
    weekly: TBorrowerTagThreshold
}

export type TBorrowerTagThreshold = {
    badPayerMaximumMissedInstallments: number
    goodPayerMaximumMissedInstallments: number
    scammerMinimumMissedInstallments: number
}

///////////////////
// Tables - Core //
///////////////////

const postalAddressColumns = () => ({
    addressLine1: text('address_line_1').notNull(),
    addressLine2: text('address_line_2'),
    dependentLocality: text('dependent_locality'),
    locality: text('locality'),
    administrativeArea: text('administrative_area'),
    postalCode: text('postal_code'),
    countryCode: text('country_code').notNull(),
    psgcCode: text('psgc_code'),
})

const postalAddressChecks = (
    countryCode: SQLWrapper,
    psgcCode: SQLWrapper,
    prefix: string,
) => [
    check(
        `${prefix}_check_country`,
        sql`length(${countryCode}) = 2 AND ${countryCode} = UPPER(${countryCode}) AND ${countryCode} NOT GLOB '*[^A-Z]*'`,
    ),
    check(
        `${prefix}_check_psgc`,
        sql`${psgcCode} IS NULL OR (${countryCode} = 'PH' AND length(${psgcCode}) = 10 AND ${psgcCode} NOT GLOB '*[^0-9]*')`,
    ),
]

export const auditTrail = sqliteTable(
    'audit_trail',
    {
        id: integer('id').primaryKey({ autoIncrement: true }),
        publicId: text('public_id')
            .notNull()
            .$defaultFn(() => uuidv7()),
        /**
         * Historical tenant attribution. Audit records intentionally outlive
         * membership; queries must still predicate organization and user.
         */
        organizationId: text('organization_id').notNull(),
        userId: text('user_id'),
        actorType: text('actor_type').notNull(),
        actorDisplayName: text('actor_display_name').notNull(),
        actorIdentifier: text('actor_identifier'),
        actorRole: text('actor_role'),
        servicePrincipalPublicId: text('service_principal_public_id'),
        credentialId: text('credential_id'),
        component: text('component').notNull(),
        action: text('action').notNull(),
        description: text('description').notNull(),
        records: text('records', { mode: 'json' }).$type<TAuditRecord[]>(),
        ipAddress: text('ip_address'),
        userAgent: text('user_agent'),
        loggedAt: integer('logged_at', { mode: 'timestamp_ms' })
            .notNull()
            .default(sql`(CAST(unixepoch('subsec') * 1000 AS INTEGER))`),
    },
    (t) => [
        uniqueIndex('audit_trail_unique_1').on(t.organizationId, t.publicId),
        index('audit_trail_idx_1').on(
            t.organizationId,
            sql`${t.loggedAt} DESC`,
            sql`${t.id} DESC`,
        ),
        index('audit_trail_idx_2').on(
            t.organizationId,
            t.servicePrincipalPublicId,
        ),
        index('audit_trail_idx_5').on(
            t.organizationId,
            t.component,
            sql`${t.loggedAt} DESC`,
        ),
        index('audit_trail_idx_6').on(
            t.organizationId,
            t.action,
            sql`${t.loggedAt} DESC`,
        ),
        index('audit_trail_idx_7').on(
            t.organizationId,
            t.actorType,
            sql`${t.loggedAt} DESC`,
        ),
        check(
            'audit_trail_actor_type_check',
            sql`(
                ${t.actorType} = 'user'
                AND ${t.userId} IS NOT NULL
                AND ${t.servicePrincipalPublicId} IS NULL
                AND ${t.credentialId} IS NULL
            ) OR (
                ${t.actorType} = 'servicePrincipal'
                AND ${t.userId} IS NULL
                AND ${t.servicePrincipalPublicId} IS NOT NULL
                AND ${t.credentialId} IS NOT NULL
            ) OR (
                ${t.actorType} IN ('anonymous', 'system')
                AND ${t.userId} IS NULL
                AND ${t.servicePrincipalPublicId} IS NULL
                AND ${t.credentialId} IS NULL
            )`,
        ),
        foreignKey({
            columns: [t.organizationId],
            foreignColumns: [organization.id],
        })
            .onDelete('no action')
            .onUpdate('no action'),
        index('audit_trail_idx_3').on(t.userId),
        foreignKey({
            columns: [t.userId],
            foreignColumns: [user.id],
        }),
        index('audit_trail_idx_4').on(t.loggedAt),
    ],
)

export const keyCounter = sqliteTable(
    'key_counter',
    {
        id: integer('id').primaryKey({ autoIncrement: true }),
        publicId: text('public_id')
            .notNull()
            .$defaultFn(() => uuidv7()),
        organizationId: text('organization_id').notNull(),
        key: text('key').notNull(),
        counter: integer('counter').notNull().default(0),
        createdAt: integer('created_at', { mode: 'timestamp_ms' })
            .notNull()
            .default(sql`(CAST(unixepoch('subsec') * 1000 AS INTEGER))`),
        updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
            .notNull()
            .default(sql`(CAST(unixepoch('subsec') * 1000 AS INTEGER))`),
    },
    (t) => [
        foreignKey({
            columns: [t.organizationId],
            foreignColumns: [organization.id],
        })
            .onDelete('no action')
            .onUpdate('no action'),
        unique('key_counter_organization_id_key_unique').on(
            t.organizationId,
            t.key,
        ),
        unique('key_counter_organization_id_public_id_unique').on(
            t.organizationId,
            t.publicId,
        ),
    ],
)

export const keyValue = sqliteTable(
    'key_value',
    {
        id: integer('id').primaryKey({ autoIncrement: true }),
        publicId: text('public_id')
            .notNull()
            .$defaultFn(() => uuidv7()),
        organizationId: text('organization_id').notNull(),
        key: text('key').notNull(),
        value: text('value'),
        createdAt: integer('created_at', { mode: 'timestamp_ms' })
            .notNull()
            .default(sql`(CAST(unixepoch('subsec') * 1000 AS INTEGER))`),
        updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
            .notNull()
            .default(sql`(CAST(unixepoch('subsec') * 1000 AS INTEGER))`),
    },
    (t) => [
        foreignKey({
            columns: [t.organizationId],
            foreignColumns: [organization.id],
        })
            .onDelete('no action')
            .onUpdate('no action'),
        unique('key_value_organization_id_key_unique').on(
            t.organizationId,
            t.key,
        ),
        unique('key_value_organization_id_public_id_unique').on(
            t.organizationId,
            t.publicId,
        ),
    ],
)

export const notificationEvent = sqliteTable(
    'notification_event',
    {
        id: integer('id').primaryKey({ autoIncrement: true }),
        publicId: text('public_id')
            .notNull()
            .$defaultFn(() => uuidv7()),
        organizationId: text('organization_id').notNull(),
        eventKey: text('event_key').notNull(),
        contentFingerprint: text('content_fingerprint').notNull(),
        category: text('category').notNull(),
        title: text('title').notNull(),
        message: text('message').notNull(),
        actionLabel: text('action_label'),
        actionHref: text('action_href'),
        metadata: text('metadata', { mode: 'json' }).$type<
            Record<string, unknown>
        >(),
        createdAt: integer('created_at', { mode: 'timestamp_ms' })
            .notNull()
            .default(sql`(CAST(unixepoch('subsec') * 1000 AS INTEGER))`),
    },
    (t) => [
        unique('notification_event_unique_orgid1').on(t.organizationId, t.id),
        unique('notification_event_organization_id_public_id_unique').on(
            t.organizationId,
            t.publicId,
        ),
        unique('notification_event_organization_id_event_key_unique').on(
            t.organizationId,
            t.eventKey,
        ),
        foreignKey({
            columns: [t.organizationId],
            foreignColumns: [organization.id],
        })
            .onDelete('no action')
            .onUpdate('no action'),
        check(
            'notification_event_check_action_d4p7kx',
            sql`(${t.actionLabel} IS NULL AND ${t.actionHref} IS NULL) OR (${t.actionLabel} IS NOT NULL AND ${t.actionHref} IS NOT NULL)`,
        ),
    ],
)

export const notificationDelivery = sqliteTable(
    'notification_delivery',
    {
        organizationId: text('organization_id').notNull(),
        notificationEventId: integer('notification_event_id').notNull(),
        userId: text('user_id').notNull(),
        isRead: integer('is_read', { mode: 'boolean' })
            .notNull()
            .default(false),
        readAt: integer('read_at', { mode: 'timestamp_ms' }),
        createdAt: integer('created_at', { mode: 'timestamp_ms' })
            .notNull()
            .default(sql`(CAST(unixepoch('subsec') * 1000 AS INTEGER))`),
    },
    (t) => [
        primaryKey({
            columns: [
                t.organizationId,
                t.notificationEventId,
                t.userId,
            ],
            name: 'notification_delivery_pk_e7r2mv',
        }),
        index('notification_delivery_idx_list_q4m8tz').on(
            t.organizationId,
            t.userId,
            t.createdAt,
            t.notificationEventId,
        ),
        index('notification_delivery_idx_unread_k6p3wx').on(
            t.organizationId,
            t.userId,
            t.isRead,
        ),
        foreignKey({
            columns: [
                t.organizationId,
                t.notificationEventId,
            ],
            foreignColumns: [
                notificationEvent.organizationId,
                notificationEvent.id,
            ],
            name: 'notification_delivery_fk_event_h5n9qs',
        })
            .onDelete('cascade')
            .onUpdate('no action'),
        foreignKey({
            columns: [
                t.organizationId,
                t.userId,
            ],
            foreignColumns: [
                member.organizationId,
                member.userId,
            ],
            name: 'notification_delivery_fk_member_b8v4cx',
        })
            .onDelete('cascade')
            .onUpdate('no action'),
        check(
            'notification_delivery_check_read_j3f7pd',
            sql`(${t.isRead} = FALSE AND ${t.readAt} IS NULL) OR (${t.isRead} = TRUE AND ${t.readAt} IS NOT NULL)`,
        ),
    ],
)

export const objectStorage = sqliteTable(
    'object_storage',
    {
        id: text('id').primaryKey(),
        organizationId: text('organization_id').notNull(),
        size: integer('size').notNull(),
        mimeType: text('mime_type'),
        hashSha256: text('hash_sha256').notNull(),
        isPublic: integer('is_public', { mode: 'boolean' })
            .notNull()
            .default(false),
        isUploaded: integer('is_uploaded', { mode: 'boolean' })
            .notNull()
            .default(false),
        createdAt: integer('created_at', { mode: 'timestamp_ms' })
            .notNull()
            .default(sql`(CAST(unixepoch('subsec') * 1000 AS INTEGER))`),
        updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
            .notNull()
            .default(sql`(CAST(unixepoch('subsec') * 1000 AS INTEGER))`),
    },
    (t) => [
        foreignKey({
            columns: [t.organizationId],
            foreignColumns: [organization.id],
        })
            .onDelete('no action')
            .onUpdate('no action'),
        unique('object_storage_unique_orgid1').on(t.organizationId, t.id),
        unique(
            'object_storage_organization_id_hash_sha256_is_public_unique',
        ).on(t.organizationId, t.hashSha256, t.isPublic),
    ],
)

export const objectStorageAcl = sqliteTable(
    'object_storage_acl',
    {
        organizationId: text('organization_id').notNull(),
        objectStorageId: text('object_storage_id').notNull(),
        userId: text('user_id').notNull(),
        /**
         * @description
         * Uses bit-masking for mode
         */
        mode: integer('mode').notNull().default(1),
    },
    (t) => [
        foreignKey({
            columns: [
                t.organizationId,
                t.objectStorageId,
            ],
            foreignColumns: [
                objectStorage.organizationId,
                objectStorage.id,
            ],
            name: 'object_storage_acl_fk_osorg1',
        })
            .onDelete('cascade')
            .onUpdate('no action'),
        index('object_storage_acl_idx_1').on(t.organizationId, t.userId),
        foreignKey({
            columns: [
                t.organizationId,
                t.userId,
            ],
            foreignColumns: [
                member.organizationId,
                member.userId,
            ],
            name: 'object_storage_acl_fk_member',
        })
            .onDelete('cascade')
            .onUpdate('no action'),
        unique(
            'object_storage_acl_organization_id_object_storage_id_user_id_unique',
        ).on(t.organizationId, t.objectStorageId, t.userId),
    ],
)

export const upload = sqliteTable(
    'upload',
    {
        id: text('id').primaryKey(),
        /**
         * Historical upload attribution. Upload records intentionally outlive
         * membership; queries must still predicate organization and user.
         */
        organizationId: text('organization_id').notNull(),
        userId: text('user_id').notNull(),
        idempotencyKey: text('idempotency_key'),
        isCommitted: integer('is_committed', { mode: 'boolean' })
            .notNull()
            .default(false),
        createdAt: integer('created_at', { mode: 'timestamp_ms' })
            .notNull()
            .default(sql`(CAST(unixepoch('subsec') * 1000 AS INTEGER))`),
        updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
            .notNull()
            .default(sql`(CAST(unixepoch('subsec') * 1000 AS INTEGER))`),
    },
    (t) => [
        foreignKey({
            columns: [t.organizationId],
            foreignColumns: [organization.id],
        })
            .onDelete('no action')
            .onUpdate('no action'),
        unique('upload_unique_orgid1').on(t.organizationId, t.id),
        unique('upload_organization_id_idempotency_key_unique').on(
            t.organizationId,
            t.idempotencyKey,
        ),
        index('upload_idx_1').on(t.userId),
        foreignKey({
            columns: [t.userId],
            foreignColumns: [user.id],
        })
            .onDelete('no action')
            .onUpdate('no action'),
    ],
)

export const uploadAttachment = sqliteTable(
    'upload_attachment',
    {
        organizationId: text('organization_id').notNull(),
        uploadId: text('upload_id').notNull(),
        objectStorageId: text('object_storage_id').notNull(),
    },
    (t) => [
        foreignKey({
            columns: [t.organizationId],
            foreignColumns: [organization.id],
        })
            .onDelete('no action')
            .onUpdate('no action'),
        foreignKey({
            columns: [
                t.organizationId,
                t.uploadId,
            ],
            foreignColumns: [
                upload.organizationId,
                upload.id,
            ],
            name: 'upload_attachment_fk_uporg1',
        })
            .onDelete('no action')
            .onUpdate('no action'),
        index('upload_attachment_idx_1').on(
            t.organizationId,
            t.objectStorageId,
        ),
        foreignKey({
            columns: [
                t.organizationId,
                t.objectStorageId,
            ],
            foreignColumns: [
                objectStorage.organizationId,
                objectStorage.id,
            ],
            name: 'upload_attachment_fk_osorg1',
        })
            .onDelete('cascade')
            .onUpdate('no action'),
        unique(
            'upload_attachment_organization_id_upload_id_object_storage_id_unique',
        ).on(t.organizationId, t.uploadId, t.objectStorageId),
    ],
)

export const uploadAttachmentBatchRequest = sqliteTable(
    'upload_attachment_batch_request',
    {
        id: integer('id').primaryKey({ autoIncrement: true }),
        organizationId: text('organization_id').notNull(),
        uploadId: text('upload_id').notNull(),
        /**
         * Historical upload attribution. Batch request ledgers intentionally
         * outlive membership; queries must still predicate organization and user.
         */
        userId: text('user_id').notNull(),
        idempotencyKey: text('idempotency_key').notNull(),
        requestFingerprint: text('request_fingerprint').notNull(),
        responseData: text('response_data', { mode: 'json' }).notNull(),
        createdAt: integer('created_at', { mode: 'timestamp_ms' })
            .notNull()
            .default(sql`(CAST(unixepoch('subsec') * 1000 AS INTEGER))`),
    },
    (t) => [
        unique('upload_attachment_batch_request_unique_k7m2qx').on(
            t.organizationId,
            t.idempotencyKey,
        ),
        index('upload_attachment_batch_request_idx_actor_p4c8vw').on(
            t.organizationId,
            t.userId,
        ),
        index('upload_attachment_batch_request_idx_1').on(
            t.organizationId,
            t.uploadId,
        ),
        foreignKey({
            name: 'upload_attachment_batch_request_fk_upload_u5n8ra',
            columns: [
                t.organizationId,
                t.uploadId,
            ],
            foreignColumns: [
                upload.organizationId,
                upload.id,
            ],
        })
            .onDelete('cascade')
            .onUpdate('no action'),
        foreignKey({
            name: 'upload_attachment_batch_request_fk_actor_m9q2dk',
            columns: [t.userId],
            foreignColumns: [user.id],
        })
            .onDelete('no action')
            .onUpdate('no action'),
    ],
)

export const userAttribute = sqliteTable(
    'user_attribute',
    {
        userId: text('user_id').primaryKey(),
        isLocked: integer('is_locked', { mode: 'boolean' })
            .default(false)
            .notNull(),
        createdAt: integer('created_at', { mode: 'timestamp_ms' })
            .notNull()
            .default(sql`(CAST(unixepoch('subsec') * 1000 AS INTEGER))`),
        updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
            .notNull()
            .default(sql`(CAST(unixepoch('subsec') * 1000 AS INTEGER))`),
    },
    (t) => [
        foreignKey({
            columns: [t.userId],
            foreignColumns: [user.id],
        })
            .onDelete('no action')
            .onUpdate('no action'),
    ],
)

export const userProfile = sqliteTable(
    'user_profile',
    {
        userId: text('user_id').primaryKey(),
        firstName: text('first_name').notNull(),
        middleName: text('middle_name'),
        lastName: text('last_name').notNull(),
        nameExtension: text('name_extension'),
        gender: text('gender', { enum: genderValues }).notNull(),
        backupPhoneNumber: text('backup_phone_number'),
        createdAt: integer('created_at', { mode: 'timestamp_ms' })
            .notNull()
            .default(sql`(CAST(unixepoch('subsec') * 1000 AS INTEGER))`),
        updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
            .notNull()
            .default(sql`(CAST(unixepoch('subsec') * 1000 AS INTEGER))`),
    },
    (t) => [
        check(
            'user_profile_gender_check',
            sql`${t.gender} IN ('MALE', 'FEMALE')`,
        ),
        foreignKey({
            columns: [t.userId],
            foreignColumns: [user.id],
        })
            .onDelete('no action')
            .onUpdate('no action'),
    ],
)

export const userAddress = sqliteTable(
    'user_address',
    {
        id: integer('id').primaryKey({ autoIncrement: true }),
        publicId: text('public_id')
            .notNull()
            .unique()
            .$defaultFn(() => uuidv7()),
        userId: text('user_id').notNull(),
        type: text('type', { enum: userAddressTypeValues }).notNull(),
        label: text('label'),
        isPrimary: integer('is_primary', { mode: 'boolean' })
            .notNull()
            .default(false),
        ...postalAddressColumns(),
        idempotencyKey: text('idempotency_key'),
        createdAt: integer('created_at', { mode: 'timestamp_ms' })
            .notNull()
            .default(sql`(CAST(unixepoch('subsec') * 1000 AS INTEGER))`),
        updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
            .notNull()
            .default(sql`(CAST(unixepoch('subsec') * 1000 AS INTEGER))`),
    },
    (t) => [
        check(
            'user_address_type_check',
            sql`${t.type} IN ('RESIDENTIAL', 'MAILING', 'OTHER')`,
        ),
        foreignKey({
            columns: [t.userId],
            foreignColumns: [user.id],
        })
            .onDelete('cascade')
            .onUpdate('no action'),
        unique('user_address_user_id_idempotency_key_unique').on(
            t.userId,
            t.idempotencyKey,
        ),
        uniqueIndex('user_address_unique_primary1')
            .on(t.userId)
            .where(sql`${t.isPrimary} = TRUE`),
        index('user_address_idx_1').on(t.userId, t.type),
        ...postalAddressChecks(t.countryCode, t.psgcCode, 'user_address'),
    ],
)

export const userRelationship = sqliteTable(
    'user_relationship',
    {
        userId: text('user_id').primaryKey(),
        name: text('name').notNull(),
        relationship: text('relationship').notNull(),
        phoneNumber: text('phone_number').notNull(),
        backupPhoneNumber: text('backup_phone_number'),
        email: text('email'),
        isEmergencyContact: integer('is_emergency_contact', { mode: 'boolean' })
            .notNull()
            .default(false),
        createdAt: integer('created_at', { mode: 'timestamp_ms' })
            .notNull()
            .default(sql`(CAST(unixepoch('subsec') * 1000 AS INTEGER))`),
        updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
            .notNull()
            .default(sql`(CAST(unixepoch('subsec') * 1000 AS INTEGER))`),
    },
    (t) => [
        foreignKey({
            columns: [t.userId],
            foreignColumns: [user.id],
        })
            .onDelete('no action')
            .onUpdate('no action'),
    ],
)

///////////////////
// Tables - Auth //
///////////////////

export const account = sqliteTable(
    'account',
    {
        id: text('id').primaryKey(),
        userId: text('user_id').notNull(),
        accountId: text('account_id').notNull(),
        providerId: text('provider_id').notNull(),
        accessToken: text('access_token'),
        refreshToken: text('refresh_token'),
        accessTokenExpiresAt: integer('access_token_expires_at', {
            mode: 'timestamp_ms',
        }),
        refreshTokenExpiresAt: integer('refresh_token_expires_at', {
            mode: 'timestamp_ms',
        }),
        scope: text('scope'),
        idToken: text('id_token'),
        password: text('password'),
        createdAt: integer('created_at', { mode: 'timestamp_ms' })
            .notNull()
            .default(sql`(CAST(unixepoch('subsec') * 1000 AS INTEGER))`),
        updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
            .notNull()
            .default(sql`(CAST(unixepoch('subsec') * 1000 AS INTEGER))`),
    },
    (t) => [
        index('account_idx_1').on(t.userId),
        foreignKey({
            columns: [t.userId],
            foreignColumns: [user.id],
        })
            .onDelete('cascade')
            .onUpdate('no action'),
        unique('account_provider_id_account_id_unique').on(
            t.providerId,
            t.accountId,
        ),
    ],
)

export const invitation = sqliteTable(
    'invitation',
    {
        id: text('id').primaryKey(),
        email: text('email').notNull(),
        /**
         * Historical invitation attribution. Invitations intentionally outlive
         * inviter membership; queries must still predicate organization and
         * inviter.
         */
        inviterId: text('inviter_id').notNull(),
        organizationId: text('organization_id').notNull(),
        role: text('role').notNull(),
        status: text('status').notNull(),
        expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
        createdAt: integer('created_at', { mode: 'timestamp_ms' })
            .notNull()
            .default(sql`(CAST(unixepoch('subsec') * 1000 AS INTEGER))`),
        updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
            .notNull()
            .default(sql`(CAST(unixepoch('subsec') * 1000 AS INTEGER))`),
    },
    (t) => [
        index('invitation_idx_1').on(t.email),
        index('invitation_idx_2').on(t.inviterId),
        foreignKey({
            columns: [t.inviterId],
            foreignColumns: [user.id],
        })
            .onDelete('no action')
            .onUpdate('no action'),
        index('invitation_idx_3').on(t.organizationId),
        foreignKey({
            columns: [t.organizationId],
            foreignColumns: [organization.id],
        })
            .onDelete('no action')
            .onUpdate('no action'),
    ],
)

export const member = sqliteTable(
    'member',
    {
        id: text('id').primaryKey(),
        userId: text('user_id').notNull(),
        organizationId: text('organization_id').notNull(),
        role: text('role').notNull(),
        websocketAuthorizationVersion: text('websocket_authorization_version')
            .notNull()
            .$defaultFn(() => uuidv7()),
        createdAt: integer('created_at', { mode: 'timestamp_ms' })
            .notNull()
            .default(sql`(CAST(unixepoch('subsec') * 1000 AS INTEGER))`),
        updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
            .notNull()
            .default(sql`(CAST(unixepoch('subsec') * 1000 AS INTEGER))`),
    },
    (t) => [
        unique('member_organization_id_user_id_unique').on(
            t.organizationId,
            t.userId,
        ),
        index('member_idx_1').on(t.userId),
        foreignKey({
            columns: [t.userId],
            foreignColumns: [user.id],
        })
            .onDelete('no action')
            .onUpdate('no action'),
        foreignKey({
            columns: [t.organizationId],
            foreignColumns: [organization.id],
        })
            .onDelete('no action')
            .onUpdate('no action'),
    ],
)

export const websocketRevocationOperation = sqliteTable(
    'websocket_revocation_operation',
    {
        id: text('id').primaryKey(),
        /**
         * Historical revocation attribution. Operations intentionally outlive
         * membership so disconnect delivery can complete after removal; queries
         * must still predicate organization and user.
         */
        organizationId: text('organization_id').notNull(),
        userId: text('user_id').notNull(),
        revokedAuthorizationVersion: text(
            'revoked_authorization_version',
        ).notNull(),
        replacementAuthorizationVersion: text(
            'replacement_authorization_version',
        ),
        reason: text('reason').notNull(),
        requestFingerprint: text('request_fingerprint'),
        retainUntil: integer('retain_until', {
            mode: 'timestamp_ms',
        }).notNull(),
        createdAt: integer('created_at', { mode: 'timestamp_ms' })
            .notNull()
            .default(sql`(CAST(unixepoch('subsec') * 1000 AS INTEGER))`),
    },
    (t) => [
        unique('websocket_revocation_operation_unique_org_id').on(
            t.organizationId,
            t.id,
        ),
        index('websocket_revocation_operation_idx_identity').on(
            t.organizationId,
            t.userId,
            t.createdAt,
        ),
        index('websocket_revocation_operation_idx_retention').on(
            t.retainUntil,
            t.id,
        ),
        foreignKey({
            columns: [t.organizationId],
            foreignColumns: [organization.id],
            name: 'websocket_revocation_operation_fk_organization',
        })
            .onDelete('no action')
            .onUpdate('no action'),
        foreignKey({
            columns: [t.userId],
            foreignColumns: [user.id],
            name: 'websocket_revocation_operation_fk_user',
        })
            .onDelete('no action')
            .onUpdate('no action'),
        check(
            'websocket_revocation_operation_check_versions',
            sql`${t.replacementAuthorizationVersion} IS NULL OR ${t.replacementAuthorizationVersion} <> ${t.revokedAuthorizationVersion}`,
        ),
        check(
            'websocket_revocation_operation_check_reason_length',
            sql`length(${t.reason}) <= 64`,
        ),
        check(
            'websocket_revocation_operation_check_fingerprint_length',
            sql`${t.requestFingerprint} IS NULL OR length(${t.requestFingerprint}) <= 64`,
        ),
    ],
)

export const websocketRevocationDelivery = sqliteTable(
    'websocket_revocation_delivery',
    {
        operationId: text('operation_id').notNull(),
        organizationId: text('organization_id').notNull(),
        surface: text('surface', { enum: websocketSurfaceValues }).notNull(),
        delivery: text('delivery', {
            enum: websocketRevocationDeliveryKindValues,
        }).notNull(),
        attemptCount: integer('attempt_count').notNull().default(0),
        nextAttemptAt: integer('next_attempt_at', { mode: 'timestamp_ms' })
            .notNull()
            .default(
                sql`(CAST(unixepoch('subsec') * 1000 AS INTEGER) + 300000)`,
            ),
        lastAttemptAt: integer('last_attempt_at', { mode: 'timestamp_ms' }),
        acceptedAt: integer('accepted_at', { mode: 'timestamp_ms' }),
        lastError: text('last_error'),
        createdAt: integer('created_at', { mode: 'timestamp_ms' })
            .notNull()
            .default(sql`(CAST(unixepoch('subsec') * 1000 AS INTEGER))`),
        updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
            .notNull()
            .default(sql`(CAST(unixepoch('subsec') * 1000 AS INTEGER))`),
    },
    (t) => [
        primaryKey({
            columns: [
                t.operationId,
                t.surface,
            ],
            name: 'websocket_revocation_delivery_pk',
        }),
        index('websocket_revocation_delivery_idx_recovery')
            .on(t.surface, t.nextAttemptAt, t.createdAt, t.operationId)
            .where(sql`${t.acceptedAt} IS NULL`),
        foreignKey({
            columns: [
                t.organizationId,
                t.operationId,
            ],
            foreignColumns: [
                websocketRevocationOperation.organizationId,
                websocketRevocationOperation.id,
            ],
            name: 'websocket_revocation_delivery_fk_operation',
        })
            .onDelete('cascade')
            .onUpdate('no action'),
        check(
            'websocket_revocation_delivery_check_attempt',
            sql`${t.attemptCount} >= 0`,
        ),
        check(
            'websocket_revocation_delivery_check_surface',
            sql`${t.surface} IN ('public', 'backoffice')`,
        ),
        check(
            'websocket_revocation_delivery_check_delivery',
            sql`${t.delivery} IN ('local', 'remote')`,
        ),
        check(
            'websocket_revocation_delivery_check_error_length',
            sql`${t.lastError} IS NULL OR length(${t.lastError}) <= 512`,
        ),
    ],
)

export const organization = sqliteTable(
    'organization',
    {
        id: text('id').primaryKey(),
        name: text('name').notNull(),
        slug: text('slug').unique().notNull(),
        logo: text('logo'),
        metadata: text('metadata'),
        createdAt: integer('created_at', { mode: 'timestamp_ms' })
            .notNull()
            .default(sql`(CAST(unixepoch('subsec') * 1000 AS INTEGER))`),
        updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
            .notNull()
            .default(sql`(CAST(unixepoch('subsec') * 1000 AS INTEGER))`),
    },
    () => [
        check('organization_slug_check', sql`slug = LOWER(slug)`),
    ],
)

/**
 * Immutable receipt details and post-allocation snapshots. A reversal retains
 * the original receipt and allocations while recording the trusted actor and
 * reason that removed its effect from loan totals.
 */
const createPayment = () =>
    sqliteTable(
        'payment',
        {
            id: integer('id').primaryKey({ autoIncrement: true }),
            publicId: text('public_id')
                .notNull()
                .$defaultFn(() => uuidv7()),
            organizationId: text('organization_id').notNull(),
            paymentNumber: text('payment_number').notNull(),
            borrowerId: integer('borrower_id').notNull(),
            loanId: integer('loan_id').notNull(),
            amountReceivedMinor: integer('amount_received_minor').notNull(),
            amountAllocatedMinor: integer('amount_allocated_minor').notNull(),
            unallocatedMinor: integer('unallocated_minor').notNull(),
            paymentTypeSnapshot: text('payment_type_snapshot', {
                enum: loanFormulaPaymentFrequencyValues,
            }).notNull(),
            paymentDate: text('payment_date').notNull(),
            paymentMethod: text('payment_method').notNull(),
            referenceNumber: text('reference_number'),
            notes: text('notes'),
            partialPaymentCreditAfterPaymentMinor: integer(
                'partial_payment_credit_after_payment_minor',
            ).notNull(),
            completedInstallmentsAfterPayment: integer(
                'completed_installments_after_payment',
            ).notNull(),
            remainingInstallmentsAfterPayment: integer(
                'remaining_installments_after_payment',
            ).notNull(),
            actualOutstandingBalanceAfterPaymentMinor: integer(
                'actual_outstanding_balance_after_payment_minor',
            ).notNull(),
            status: text('status', { enum: paymentStatusValues })
                .notNull()
                .default('POSTED'),
            idempotencyKey: text('idempotency_key'),
            createdByUserId: text('created_by_user_id').notNull(),
            createdAt: integer('created_at', { mode: 'timestamp_ms' })
                .notNull()
                .default(sql`(CAST(unixepoch('subsec') * 1000 AS INTEGER))`),
            reversedByUserId: text('reversed_by_user_id'),
            reversedAt: integer('reversed_at', { mode: 'timestamp_ms' }),
            reversalReason: text('reversal_reason'),
        },
        (t) => [
            unique('payment_organization_id_id_unique').on(
                t.organizationId,
                t.id,
            ),
            unique('payment_organization_id_public_id_unique').on(
                t.organizationId,
                t.publicId,
            ),
            unique('payment_organization_id_payment_number_unique').on(
                t.organizationId,
                t.paymentNumber,
            ),
            unique('payment_organization_id_idempotency_key_unique').on(
                t.organizationId,
                t.idempotencyKey,
            ),
            index('payment_idx_borrower_history').on(
                t.organizationId,
                t.borrowerId,
                t.paymentTypeSnapshot,
                sql`${t.paymentDate} DESC`,
                t.id,
            ),
            index('payment_idx_collections').on(
                t.organizationId,
                t.status,
                t.paymentDate,
                t.id,
            ),
            foreignKey({
                columns: [t.organizationId],
                foreignColumns: [organization.id],
                name: 'payment_fk_organization',
            })
                .onDelete('no action')
                .onUpdate('no action'),
            foreignKey({
                columns: [
                    t.organizationId,
                    t.borrowerId,
                ],
                foreignColumns: [
                    borrower.organizationId,
                    borrower.id,
                ],
                name: 'payment_fk_borrower',
            })
                .onDelete('no action')
                .onUpdate('no action'),
            foreignKey({
                columns: [
                    t.organizationId,
                    t.loanId,
                ],
                foreignColumns: [
                    loan.organizationId,
                    loan.id,
                ],
                name: 'payment_fk_loan',
            })
                .onDelete('no action')
                .onUpdate('no action'),
            foreignKey({
                columns: [
                    t.organizationId,
                    t.createdByUserId,
                ],
                foreignColumns: [
                    member.organizationId,
                    member.userId,
                ],
                name: 'payment_fk_created_by_member',
            })
                .onDelete('no action')
                .onUpdate('no action'),
            foreignKey({
                columns: [
                    t.organizationId,
                    t.reversedByUserId,
                ],
                foreignColumns: [
                    member.organizationId,
                    member.userId,
                ],
                name: 'payment_fk_reversed_by_member',
            })
                .onDelete('no action')
                .onUpdate('no action'),
            check(
                'payment_check_number',
                sql`length(trim(${t.paymentNumber})) > 0`,
            ),
            check(
                'payment_check_amounts',
                sql`${t.amountReceivedMinor} > 0 AND ${t.amountAllocatedMinor} >= 0 AND ${t.unallocatedMinor} >= 0 AND ${t.amountReceivedMinor} = ${t.amountAllocatedMinor} + ${t.unallocatedMinor}`,
            ),
            check(
                'payment_check_type',
                sql`${t.paymentTypeSnapshot} IN ('DAILY', 'WEEKLY', 'MONTHLY')`,
            ),
            check(
                'payment_check_date',
                sql`length(${t.paymentDate}) = 10 AND ${t.paymentDate} GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'`,
            ),
            check(
                'payment_check_method',
                sql`length(trim(${t.paymentMethod})) > 0`,
            ),
            check(
                'payment_check_post_payment_state',
                sql`${t.partialPaymentCreditAfterPaymentMinor} >= 0 AND ${t.completedInstallmentsAfterPayment} >= 0 AND ${t.remainingInstallmentsAfterPayment} >= 0 AND ${t.actualOutstandingBalanceAfterPaymentMinor} >= 0`,
            ),
            check(
                'payment_check_status',
                sql`${t.status} IN ('POSTED', 'REVERSED')`,
            ),
            check(
                'payment_check_reversal',
                sql`(${t.status} = 'POSTED' AND ${t.reversedByUserId} IS NULL AND ${t.reversedAt} IS NULL AND ${t.reversalReason} IS NULL) OR (${t.status} = 'REVERSED' AND ${t.reversedByUserId} IS NOT NULL AND ${t.reversedAt} IS NOT NULL AND length(trim(${t.reversalReason})) > 0)`,
            ),
        ],
    )

/**
 * Original installment distribution for one receipt. Reversals retain these
 * rows and mark their actor/timestamp rather than deleting financial evidence.
 */
const createPaymentAllocation = () =>
    sqliteTable(
        'payment_allocation',
        {
            id: integer('id').primaryKey({ autoIncrement: true }),
            organizationId: text('organization_id').notNull(),
            paymentId: integer('payment_id').notNull(),
            loanInstallmentId: integer('loan_installment_id').notNull(),
            allocatedAmountMinor: integer('allocated_amount_minor').notNull(),
            amountPaidBeforeMinor: integer(
                'amount_paid_before_minor',
            ).notNull(),
            statusBefore: text('status_before', {
                enum: loanInstallmentStatusValues,
            }).notNull(),
            paidAtBefore: integer('paid_at_before', { mode: 'timestamp_ms' }),
            createdAt: integer('created_at', { mode: 'timestamp_ms' })
                .notNull()
                .default(sql`(CAST(unixepoch('subsec') * 1000 AS INTEGER))`),
            reversedByUserId: text('reversed_by_user_id'),
            reversedAt: integer('reversed_at', { mode: 'timestamp_ms' }),
        },
        (t) => [
            unique(
                'payment_allocation_organization_id_payment_id_installment_id_unique',
            ).on(t.organizationId, t.paymentId, t.loanInstallmentId),
            foreignKey({
                columns: [t.organizationId],
                foreignColumns: [organization.id],
                name: 'payment_allocation_fk_organization',
            })
                .onDelete('no action')
                .onUpdate('no action'),
            foreignKey({
                columns: [
                    t.organizationId,
                    t.paymentId,
                ],
                foreignColumns: [
                    payment.organizationId,
                    payment.id,
                ],
                name: 'payment_allocation_fk_payment',
            })
                .onDelete('no action')
                .onUpdate('no action'),
            foreignKey({
                columns: [
                    t.organizationId,
                    t.loanInstallmentId,
                ],
                foreignColumns: [
                    loanInstallment.organizationId,
                    loanInstallment.id,
                ],
                name: 'payment_allocation_fk_loan_installment',
            })
                .onDelete('no action')
                .onUpdate('no action'),
            foreignKey({
                columns: [
                    t.organizationId,
                    t.reversedByUserId,
                ],
                foreignColumns: [
                    member.organizationId,
                    member.userId,
                ],
                name: 'payment_allocation_fk_reversed_by_member',
            })
                .onDelete('no action')
                .onUpdate('no action'),
            check(
                'payment_allocation_check_amount',
                sql`${t.allocatedAmountMinor} > 0 AND ${t.amountPaidBeforeMinor} >= 0`,
            ),
            check(
                'payment_allocation_check_before_payment_state',
                sql`(${t.statusBefore} IN ('UPCOMING', 'OVERDUE', 'WAIVED') AND ${t.paidAtBefore} IS NULL) OR (${t.statusBefore} IN ('PARTIAL', 'PAID') AND ${t.paidAtBefore} IS NOT NULL)`,
            ),
            check(
                'payment_allocation_check_reversal',
                sql`(${t.reversedByUserId} IS NULL AND ${t.reversedAt} IS NULL) OR (${t.reversedByUserId} IS NOT NULL AND ${t.reversedAt} IS NOT NULL)`,
            ),
        ],
    )

/**
 * A versioned calculation snapshot. Configuration values are immutable after
 * creation; superseding a formula requires a new version for the same name.
 */
export const loanFormulaProfile = sqliteTable(
    'loan_formula_profile',
    {
        id: integer('id').primaryKey({ autoIncrement: true }),
        publicId: text('public_id')
            .notNull()
            .$defaultFn(() => uuidv7()),
        organizationId: text('organization_id').notNull(),
        idempotencyKey: text('idempotency_key'),
        requestFingerprint: text('request_fingerprint'),
        name: text('name').notNull(),
        version: integer('version').notNull(),
        isActive: integer('is_active', { mode: 'boolean' })
            .notNull()
            .default(true),
        isDefault: integer('is_default', { mode: 'boolean' })
            .notNull()
            .default(false),
        interestMethod: text('interest_method', {
            enum: loanFormulaInterestMethodValues,
        }).notNull(),
        interestRateBasisPoints: integer('interest_rate_basis_points')
            .notNull()
            .default(0),
        fixedInterestAmountMinor: integer('fixed_interest_amount_minor'),
        // Null retains a fixed term; otherwise each loan derives its term
        // from its own principal and this collection amount.
        collectionAmountMinor: integer('collection_amount_minor'),
        termDays: integer('term_days').notNull(),
        paymentFrequency: text('payment_frequency', {
            enum: loanFormulaPaymentFrequencyValues,
        }).notNull(),
        installmentCount: integer('installment_count').notNull(),
        timezone: text('timezone').notNull().default('Asia/Manila'),
        roundingMode: text('rounding_mode', {
            enum: loanFormulaRoundingModeValues,
        }).notNull(),
        finalInstallmentResiduePolicy: text(
            'final_installment_residue_policy',
            {
                enum: loanFormulaFinalInstallmentResiduePolicyValues,
            },
        ).notNull(),
        renewalSettlementMethod: text('renewal_settlement_method', {
            enum: loanFormulaRenewalSettlementMethodValues,
        }).notNull(),
        partialCreditPolicy: text('partial_credit_policy', {
            enum: loanFormulaPartialCreditPolicyValues,
        }).notNull(),
        minCompletedInstallments: integer('min_completed_installments')
            .notNull()
            .default(0),
        allowRenewalPrincipalChange: integer('allow_renewal_principal_change', {
            mode: 'boolean',
        })
            .notNull()
            .default(false),
        effectiveAt: integer('effective_at', {
            mode: 'timestamp_ms',
        }).notNull(),
        retiredAt: integer('retired_at', { mode: 'timestamp_ms' }),
        deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
        createdAt: integer('created_at', { mode: 'timestamp_ms' })
            .notNull()
            .default(sql`(CAST(unixepoch('subsec') * 1000 AS INTEGER))`),
    },
    (t) => [
        unique('loan_formula_profile_organization_id_name_version_unique').on(
            t.organizationId,
            t.name,
            t.version,
        ),
        unique('loan_formula_profile_organization_id_public_id_unique').on(
            t.organizationId,
            t.publicId,
        ),
        unique('loan_formula_profile_organization_id_id_unique').on(
            t.organizationId,
            t.id,
        ),
        /**
         * SQLite partial unique indexes enforce at most one selected default
         * per organization and directly serve the active-default lookup.
         */
        uniqueIndex('loan_formula_profile_unique_active_default')
            .on(t.organizationId)
            .where(sql`${t.isActive} = TRUE AND ${t.isDefault} = TRUE`),
        uniqueIndex(
            'loan_formula_profile_organization_id_idempotency_key_unique',
        )
            .on(t.organizationId, t.idempotencyKey)
            .where(sql`${t.idempotencyKey} IS NOT NULL`),
        foreignKey({
            columns: [t.organizationId],
            foreignColumns: [organization.id],
            name: 'loan_formula_profile_fk_organization',
        })
            .onDelete('no action')
            .onUpdate('no action'),
        check(
            'loan_formula_profile_check_name',
            sql`length(trim(${t.name})) > 0`,
        ),
        check('loan_formula_profile_check_version', sql`${t.version} > 0`),
        check(
            'loan_formula_profile_check_interest_method',
            sql`${t.interestMethod} IN ('FLAT_PERCENTAGE', 'FIXED_AMOUNT')`,
        ),
        check(
            'loan_formula_profile_check_interest',
            sql`(
                ${t.interestMethod} = 'FLAT_PERCENTAGE'
                AND ${t.interestRateBasisPoints} >= 0
                AND ${t.fixedInterestAmountMinor} IS NULL
            ) OR (
                ${t.interestMethod} = 'FIXED_AMOUNT'
                AND ${t.interestRateBasisPoints} = 0
                AND ${t.fixedInterestAmountMinor} IS NOT NULL
                AND ${t.fixedInterestAmountMinor} >= 0
            )`,
        ),
        check('loan_formula_profile_check_term_days', sql`${t.termDays} > 0`),
        check(
            'loan_formula_profile_check_payment_frequency',
            sql`${t.paymentFrequency} IN ('DAILY', 'WEEKLY', 'MONTHLY')`,
        ),
        check(
            'loan_formula_profile_check_installment_count',
            sql`${t.installmentCount} > 0`,
        ),
        check(
            'loan_formula_profile_check_timezone',
            sql`${t.timezone} = 'Asia/Manila'`,
        ),
        check(
            'loan_formula_profile_check_rounding_mode',
            sql`${t.roundingMode} IN ('HALF_UP', 'DOWN', 'UP')`,
        ),
        check(
            'loan_formula_profile_check_final_installment_residue_policy',
            sql`${t.finalInstallmentResiduePolicy} = 'LAST_INSTALLMENT_ABSORBS_RESIDUE'`,
        ),
        check(
            'loan_formula_profile_check_renewal_settlement_method',
            sql`${t.renewalSettlementMethod} IN ('COMPLETED_INSTALLMENT_BALANCE', 'EXACT_OUTSTANDING_BALANCE')`,
        ),
        check(
            'loan_formula_profile_check_partial_credit_policy',
            sql`${t.partialCreditPolicy} IN ('CARRY_FORWARD', 'APPLY_TO_SETTLEMENT', 'REFUND', 'MANUAL_REVIEW')`,
        ),
        check(
            'loan_formula_profile_check_min_completed_installments',
            sql`${t.minCompletedInstallments} >= 0 AND ${t.minCompletedInstallments} <= ${t.installmentCount}`,
        ),
        check(
            'loan_formula_profile_check_default_active',
            sql`${t.isDefault} = FALSE OR (${t.isActive} = TRUE AND ${t.retiredAt} IS NULL)`,
        ),
        check(
            'loan_formula_profile_check_retired_at',
            sql`${t.retiredAt} IS NULL OR ${t.retiredAt} >= ${t.effectiveAt}`,
        ),
    ],
)

/**
 * A permanent, organization-owned borrower profile. Normalized fields are
 * non-authoritative duplicate-detection and search keys; they deliberately do
 * not enforce uniqueness so staff can review a possible match before creating
 * a legitimate distinct borrower.
 */
export const borrower = sqliteTable(
    'borrower',
    {
        id: integer('id').primaryKey({ autoIncrement: true }),
        publicId: text('public_id')
            .notNull()
            .$defaultFn(() => uuidv7()),
        organizationId: text('organization_id').notNull(),
        borrowerNumber: text('borrower_number').notNull(),
        firstName: text('first_name').notNull(),
        middleName: text('middle_name'),
        lastName: text('last_name').notNull(),
        suffix: text('suffix'),
        birthDate: text('birth_date'),
        gender: text('gender', { enum: borrowerGenderValues }).notNull(),
        contactNumber: text('contact_number').notNull(),
        secondaryContactNumber: text('secondary_contact_number'),
        email: text('email'),
        normalizedContactNumber: text('normalized_contact_number').notNull(),
        normalizedSecondaryContactNumber: text(
            'normalized_secondary_contact_number',
        ),
        normalizedEmail: text('normalized_email'),
        normalizedFullName: text('normalized_full_name').notNull(),
        addressLine: text('address_line').notNull(),
        barangay: text('barangay').notNull(),
        cityMunicipality: text('city_municipality').notNull(),
        province: text('province').notNull(),
        postalCode: text('postal_code'),
        emergencyContactName: text('emergency_contact_name'),
        emergencyContactNumber: text('emergency_contact_number'),
        emergencyContactRelationship: text('emergency_contact_relationship'),
        status: text('status', { enum: borrowerStatusValues })
            .notNull()
            .default('ACTIVE'),
        systemPaymentTag: text('system_payment_tag', {
            enum: borrowerPaymentTagValues,
        })
            .notNull()
            .default('GOOD_PAYER'),
        paymentTag: text('payment_tag', {
            enum: borrowerPaymentTagValues,
        })
            .notNull()
            .default('GOOD_PAYER'),
        paymentTagSource: text('payment_tag_source', {
            enum: borrowerPaymentTagSourceValues,
        })
            .notNull()
            .default('SYSTEM'),
        paymentTagUpdatedAt: integer('payment_tag_updated_at', {
            mode: 'timestamp_ms',
        })
            .notNull()
            .default(sql`(CAST(unixepoch('subsec') * 1000 AS INTEGER))`),
        paymentTagOverrideReason: text('payment_tag_override_reason'),
        paymentTagOverrideByUserId: text('payment_tag_override_by_user_id'),
        paymentTagOverrideAt: integer('payment_tag_override_at', {
            mode: 'timestamp_ms',
        }),
        notes: text('notes'),
        archivedAt: integer('archived_at', { mode: 'timestamp_ms' }),
        archivedByUserId: text('archived_by_user_id'),
        idempotencyKey: text('idempotency_key'),
        createdByUserId: text('created_by_user_id').notNull(),
        updatedByUserId: text('updated_by_user_id').notNull(),
        createdAt: integer('created_at', { mode: 'timestamp_ms' })
            .notNull()
            .default(sql`(CAST(unixepoch('subsec') * 1000 AS INTEGER))`),
        updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
            .notNull()
            .default(sql`(CAST(unixepoch('subsec') * 1000 AS INTEGER))`),
    },
    (t) => [
        unique('borrower_organization_id_id_unique').on(t.organizationId, t.id),
        unique('borrower_organization_id_public_id_unique').on(
            t.organizationId,
            t.publicId,
        ),
        unique('borrower_organization_id_borrower_number_unique').on(
            t.organizationId,
            t.borrowerNumber,
        ),
        unique('borrower_organization_id_idempotency_key_unique').on(
            t.organizationId,
            t.idempotencyKey,
        ),
        index('borrower_idx_list').on(
            t.organizationId,
            t.status,
            sql`${t.createdAt} DESC`,
            t.id,
        ),
        index('borrower_idx_payment_tag').on(
            t.organizationId,
            t.paymentTag,
            t.id,
        ),
        index('borrower_idx_duplicate_contact').on(
            t.organizationId,
            t.normalizedContactNumber,
            t.id,
        ),
        index('borrower_idx_duplicate_secondary_contact').on(
            t.organizationId,
            t.normalizedSecondaryContactNumber,
            t.id,
        ),
        index('borrower_idx_duplicate_email').on(
            t.organizationId,
            t.normalizedEmail,
            t.id,
        ),
        index('borrower_idx_duplicate_name_birth_date').on(
            t.organizationId,
            t.normalizedFullName,
            t.birthDate,
            t.id,
        ),
        foreignKey({
            columns: [t.organizationId],
            foreignColumns: [organization.id],
            name: 'borrower_fk_organization',
        })
            .onDelete('no action')
            .onUpdate('no action'),
        foreignKey({
            columns: [
                t.organizationId,
                t.createdByUserId,
            ],
            foreignColumns: [
                member.organizationId,
                member.userId,
            ],
            name: 'borrower_fk_created_by_member',
        })
            .onDelete('no action')
            .onUpdate('no action'),
        foreignKey({
            columns: [
                t.organizationId,
                t.updatedByUserId,
            ],
            foreignColumns: [
                member.organizationId,
                member.userId,
            ],
            name: 'borrower_fk_updated_by_member',
        })
            .onDelete('no action')
            .onUpdate('no action'),
        foreignKey({
            columns: [
                t.organizationId,
                t.paymentTagOverrideByUserId,
            ],
            foreignColumns: [
                member.organizationId,
                member.userId,
            ],
            name: 'borrower_fk_payment_tag_override_by_member',
        })
            .onDelete('no action')
            .onUpdate('no action'),
        foreignKey({
            columns: [
                t.organizationId,
                t.archivedByUserId,
            ],
            foreignColumns: [
                member.organizationId,
                member.userId,
            ],
            name: 'borrower_fk_archived_by_member',
        })
            .onDelete('no action')
            .onUpdate('no action'),
        check(
            'borrower_check_borrower_number',
            sql`length(trim(${t.borrowerNumber})) > 0`,
        ),
        check('borrower_check_names', sql`length(trim(${t.firstName})) > 0`),
        check(
            'borrower_check_birth_date',
            sql`${t.birthDate} IS NULL OR (length(${t.birthDate}) = 10 AND ${t.birthDate} GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]')`,
        ),
        check(
            'borrower_check_gender',
            sql`${t.gender} IN ('MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY')`,
        ),
        check(
            'borrower_check_normalized_contact',
            sql`length(trim(${t.normalizedContactNumber})) > 0`,
        ),
        check(
            'borrower_check_normalized_secondary_contact',
            sql`${t.normalizedSecondaryContactNumber} IS NULL OR length(trim(${t.normalizedSecondaryContactNumber})) > 0`,
        ),
        check(
            'borrower_check_normalized_email',
            sql`${t.normalizedEmail} IS NULL OR ${t.normalizedEmail} = LOWER(${t.normalizedEmail})`,
        ),
        check(
            'borrower_check_normalized_full_name',
            sql`length(trim(${t.normalizedFullName})) > 0`,
        ),
        check(
            'borrower_check_status',
            sql`${t.status} IN ('ACTIVE', 'INACTIVE', 'BLOCKED', 'ARCHIVED')`,
        ),
        check(
            'borrower_check_payment_tag',
            sql`${t.systemPaymentTag} IN ('GOOD_PAYER', 'BAD_PAYER', 'SCAMMER') AND ${t.paymentTag} IN ('GOOD_PAYER', 'BAD_PAYER', 'SCAMMER')`,
        ),
        check(
            'borrower_check_payment_tag_source',
            sql`(${t.paymentTagSource} = 'SYSTEM' AND ${t.paymentTag} = ${t.systemPaymentTag} AND ${t.paymentTagOverrideReason} IS NULL AND ${t.paymentTagOverrideByUserId} IS NULL AND ${t.paymentTagOverrideAt} IS NULL) OR (${t.paymentTagSource} = 'MANUAL_OVERRIDE' AND length(trim(${t.paymentTagOverrideReason})) > 0 AND ${t.paymentTagOverrideByUserId} IS NOT NULL AND ${t.paymentTagOverrideAt} IS NOT NULL)`,
        ),
        check(
            'borrower_check_archived',
            sql`(${t.status} = 'ARCHIVED' AND ${t.archivedAt} IS NOT NULL AND ${t.archivedByUserId} IS NOT NULL) OR (${t.status} <> 'ARCHIVED' AND ${t.archivedAt} IS NULL AND ${t.archivedByUserId} IS NULL)`,
        ),
    ],
)

/**
 * An immutable file reference for a borrower document. The object itself is
 * owned by the existing organization-scoped object storage subsystem.
 */
export const borrowerDocument = sqliteTable(
    'borrower_document',
    {
        id: integer('id').primaryKey({ autoIncrement: true }),
        publicId: text('public_id')
            .notNull()
            .$defaultFn(() => uuidv7()),
        organizationId: text('organization_id').notNull(),
        borrowerId: integer('borrower_id').notNull(),
        documentType: text('document_type', {
            enum: borrowerDocumentTypeValues,
        }).notNull(),
        documentNumber: text('document_number'),
        normalizedDocumentNumber: text('normalized_document_number'),
        objectStorageId: text('object_storage_id').notNull(),
        issuedDate: text('issued_date'),
        expirationDate: text('expiration_date'),
        notes: text('notes'),
        idempotencyKey: text('idempotency_key'),
        createdByUserId: text('created_by_user_id').notNull(),
        createdAt: integer('created_at', { mode: 'timestamp_ms' })
            .notNull()
            .default(sql`(CAST(unixepoch('subsec') * 1000 AS INTEGER))`),
    },
    (t) => [
        unique('borrower_document_organization_id_public_id_unique').on(
            t.organizationId,
            t.publicId,
        ),
        uniqueIndex(
            'borrower_document_organization_id_idempotency_key_unique',
        ).on(t.organizationId, t.idempotencyKey),
        index('borrower_document_idx_borrower').on(
            t.organizationId,
            t.borrowerId,
            sql`${t.createdAt} DESC`,
            t.id,
        ),
        index('borrower_document_idx_duplicate_number').on(
            t.organizationId,
            t.documentType,
            t.normalizedDocumentNumber,
            t.id,
        ),
        foreignKey({
            columns: [
                t.organizationId,
                t.borrowerId,
            ],
            foreignColumns: [
                borrower.organizationId,
                borrower.id,
            ],
            name: 'borrower_document_fk_borrower',
        })
            .onDelete('no action')
            .onUpdate('no action'),
        foreignKey({
            columns: [
                t.organizationId,
                t.objectStorageId,
            ],
            foreignColumns: [
                objectStorage.organizationId,
                objectStorage.id,
            ],
            name: 'borrower_document_fk_object_storage',
        })
            .onDelete('no action')
            .onUpdate('no action'),
        foreignKey({
            columns: [
                t.organizationId,
                t.createdByUserId,
            ],
            foreignColumns: [
                member.organizationId,
                member.userId,
            ],
            name: 'borrower_document_fk_created_by_member',
        })
            .onDelete('no action')
            .onUpdate('no action'),
        check(
            'borrower_document_check_type',
            sql`${t.documentType} IN ('VALID_ID', 'BORROWER_PHOTO', 'PROOF_OF_ADDRESS', 'SUPPORTING_DOCUMENT')`,
        ),
        check(
            'borrower_document_check_normalized_number',
            sql`(${t.documentNumber} IS NULL AND ${t.normalizedDocumentNumber} IS NULL) OR (${t.documentNumber} IS NOT NULL AND ${t.normalizedDocumentNumber} IS NOT NULL AND length(trim(${t.normalizedDocumentNumber})) > 0)`,
        ),
        check(
            'borrower_document_check_issued_date',
            sql`${t.issuedDate} IS NULL OR (length(${t.issuedDate}) = 10 AND ${t.issuedDate} GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]')`,
        ),
        check(
            'borrower_document_check_expiration_date',
            sql`${t.expirationDate} IS NULL OR (length(${t.expirationDate}) = 10 AND ${t.expirationDate} GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]')`,
        ),
        check(
            'borrower_document_check_date_order',
            sql`${t.issuedDate} IS NULL OR ${t.expirationDate} IS NULL OR ${t.issuedDate} <= ${t.expirationDate}`,
        ),
    ],
)

/**
 * Append-only payment-tag state history. Loan and installment services will
 * later supply the system classification; this table preserves every state
 * transition and manual override without coupling Phase 2 to those models.
 */
export const borrowerPaymentTagHistory = sqliteTable(
    'borrower_payment_tag_history',
    {
        id: integer('id').primaryKey({ autoIncrement: true }),
        publicId: text('public_id')
            .notNull()
            .$defaultFn(() => uuidv7()),
        organizationId: text('organization_id').notNull(),
        borrowerId: integer('borrower_id').notNull(),
        paymentTag: text('payment_tag', {
            enum: borrowerPaymentTagValues,
        }).notNull(),
        systemPaymentTag: text('system_payment_tag', {
            enum: borrowerPaymentTagValues,
        }).notNull(),
        paymentTagSource: text('payment_tag_source', {
            enum: borrowerPaymentTagSourceValues,
        }).notNull(),
        overrideReason: text('override_reason'),
        changedByUserId: text('changed_by_user_id'),
        changedAt: integer('changed_at', { mode: 'timestamp_ms' })
            .notNull()
            .default(sql`(CAST(unixepoch('subsec') * 1000 AS INTEGER))`),
    },
    (t) => [
        unique(
            'borrower_payment_tag_history_organization_id_public_id_unique',
        ).on(t.organizationId, t.publicId),
        index('borrower_payment_tag_history_idx_borrower').on(
            t.organizationId,
            t.borrowerId,
            sql`${t.changedAt} DESC`,
            t.id,
        ),
        foreignKey({
            columns: [
                t.organizationId,
                t.borrowerId,
            ],
            foreignColumns: [
                borrower.organizationId,
                borrower.id,
            ],
            name: 'borrower_payment_tag_history_fk_borrower',
        })
            .onDelete('no action')
            .onUpdate('no action'),
        foreignKey({
            columns: [
                t.organizationId,
                t.changedByUserId,
            ],
            foreignColumns: [
                member.organizationId,
                member.userId,
            ],
            name: 'borrower_payment_tag_history_fk_changed_by_member',
        })
            .onDelete('no action')
            .onUpdate('no action'),
        check(
            'borrower_payment_tag_history_check_tag',
            sql`${t.paymentTag} IN ('GOOD_PAYER', 'BAD_PAYER', 'SCAMMER') AND ${t.systemPaymentTag} IN ('GOOD_PAYER', 'BAD_PAYER', 'SCAMMER')`,
        ),
        check(
            'borrower_payment_tag_history_check_source',
            sql`(${t.paymentTagSource} = 'SYSTEM' AND ${t.overrideReason} IS NULL) OR (${t.paymentTagSource} = 'MANUAL_OVERRIDE' AND length(trim(${t.overrideReason})) > 0 AND ${t.changedByUserId} IS NOT NULL)`,
        ),
    ],
)

/**
 * A reusable, organization-scoped origination configuration. Formula inputs
 * are copied here from the selected immutable profile and copied again to the
 * loan, so later product changes cannot alter historical calculations.
 */
export const loanProduct = sqliteTable(
    'loan_product',
    {
        id: integer('id').primaryKey({ autoIncrement: true }),
        publicId: text('public_id')
            .notNull()
            .$defaultFn(() => uuidv7()),
        organizationId: text('organization_id').notNull(),
        formulaProfileId: integer('formula_profile_id').notNull(),
        name: text('name').notNull(),
        isActive: integer('is_active', { mode: 'boolean' })
            .notNull()
            .default(true),
        interestMethod: text('interest_method', {
            enum: loanFormulaInterestMethodValues,
        }).notNull(),
        interestRateBasisPoints: integer('interest_rate_basis_points')
            .notNull()
            .default(0),
        fixedInterestAmountMinor: integer('fixed_interest_amount_minor'),
        termDays: integer('term_days').notNull(),
        paymentFrequency: text('payment_frequency', {
            enum: loanFormulaPaymentFrequencyValues,
        }).notNull(),
        installmentCount: integer('installment_count').notNull(),
        timezone: text('timezone').notNull().default('Asia/Manila'),
        roundingMode: text('rounding_mode', {
            enum: loanFormulaRoundingModeValues,
        }).notNull(),
        finalInstallmentResiduePolicy: text(
            'final_installment_residue_policy',
            { enum: loanFormulaFinalInstallmentResiduePolicyValues },
        ).notNull(),
        renewalSettlementMethod: text('renewal_settlement_method', {
            enum: loanFormulaRenewalSettlementMethodValues,
        }).notNull(),
        partialCreditPolicy: text('partial_credit_policy', {
            enum: loanFormulaPartialCreditPolicyValues,
        }).notNull(),
        minCompletedInstallments: integer('min_completed_installments')
            .notNull()
            .default(0),
        allowRenewalPrincipalChange: integer('allow_renewal_principal_change', {
            mode: 'boolean',
        })
            .notNull()
            .default(false),
        minimumPrincipalAmountMinor: integer(
            'minimum_principal_amount_minor',
        ).notNull(),
        maximumPrincipalAmountMinor: integer(
            'maximum_principal_amount_minor',
        ).notNull(),
        idempotencyKey: text('idempotency_key'),
        createdByUserId: text('created_by_user_id').notNull(),
        updatedByUserId: text('updated_by_user_id').notNull(),
        createdAt: integer('created_at', { mode: 'timestamp_ms' })
            .notNull()
            .default(sql`(CAST(unixepoch('subsec') * 1000 AS INTEGER))`),
        updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
            .notNull()
            .default(sql`(CAST(unixepoch('subsec') * 1000 AS INTEGER))`),
    },
    (t) => [
        unique('loan_product_organization_id_id_unique').on(
            t.organizationId,
            t.id,
        ),
        unique('loan_product_organization_id_public_id_unique').on(
            t.organizationId,
            t.publicId,
        ),
        unique('loan_product_organization_id_idempotency_key_unique').on(
            t.organizationId,
            t.idempotencyKey,
        ),
        index('loan_product_idx_list').on(
            t.organizationId,
            t.isActive,
            sql`${t.updatedAt} DESC`,
            t.id,
        ),
        foreignKey({
            columns: [t.organizationId],
            foreignColumns: [organization.id],
            name: 'loan_product_fk_organization',
        })
            .onDelete('no action')
            .onUpdate('no action'),
        foreignKey({
            columns: [
                t.organizationId,
                t.formulaProfileId,
            ],
            foreignColumns: [
                loanFormulaProfile.organizationId,
                loanFormulaProfile.id,
            ],
            name: 'loan_product_fk_formula_profile',
        })
            .onDelete('no action')
            .onUpdate('no action'),
        foreignKey({
            columns: [
                t.organizationId,
                t.createdByUserId,
            ],
            foreignColumns: [
                member.organizationId,
                member.userId,
            ],
            name: 'loan_product_fk_created_by_member',
        })
            .onDelete('no action')
            .onUpdate('no action'),
        foreignKey({
            columns: [
                t.organizationId,
                t.updatedByUserId,
            ],
            foreignColumns: [
                member.organizationId,
                member.userId,
            ],
            name: 'loan_product_fk_updated_by_member',
        })
            .onDelete('no action')
            .onUpdate('no action'),
        check('loan_product_check_name', sql`length(trim(${t.name})) > 0`),
        check(
            'loan_product_check_interest',
            sql`(
                ${t.interestMethod} = 'FLAT_PERCENTAGE'
                AND ${t.interestRateBasisPoints} >= 0
                AND ${t.fixedInterestAmountMinor} IS NULL
            ) OR (
                ${t.interestMethod} = 'FIXED_AMOUNT'
                AND ${t.interestRateBasisPoints} = 0
                AND ${t.fixedInterestAmountMinor} IS NOT NULL
                AND ${t.fixedInterestAmountMinor} >= 0
            )`,
        ),
        check('loan_product_check_term_days', sql`${t.termDays} > 0`),
        check(
            'loan_product_check_payment_frequency',
            sql`${t.paymentFrequency} IN ('DAILY', 'WEEKLY', 'MONTHLY')`,
        ),
        check(
            'loan_product_check_installment_count',
            sql`${t.installmentCount} > 0`,
        ),
        check(
            'loan_product_check_timezone',
            sql`${t.timezone} = 'Asia/Manila'`,
        ),
        check(
            'loan_product_check_rounding_mode',
            sql`${t.roundingMode} IN ('HALF_UP', 'DOWN', 'UP')`,
        ),
        check(
            'loan_product_check_final_installment_residue_policy',
            sql`${t.finalInstallmentResiduePolicy} = 'LAST_INSTALLMENT_ABSORBS_RESIDUE'`,
        ),
        check(
            'loan_product_check_renewal_settlement_method',
            sql`${t.renewalSettlementMethod} IN ('COMPLETED_INSTALLMENT_BALANCE', 'EXACT_OUTSTANDING_BALANCE')`,
        ),
        check(
            'loan_product_check_partial_credit_policy',
            sql`${t.partialCreditPolicy} IN ('CARRY_FORWARD', 'APPLY_TO_SETTLEMENT', 'REFUND', 'MANUAL_REVIEW')`,
        ),
        check(
            'loan_product_check_min_completed_installments',
            sql`${t.minCompletedInstallments} >= 0 AND ${t.minCompletedInstallments} <= ${t.installmentCount}`,
        ),
        check(
            'loan_product_check_principal_range',
            sql`${t.minimumPrincipalAmountMinor} > 0 AND ${t.maximumPrincipalAmountMinor} >= ${t.minimumPrincipalAmountMinor}`,
        ),
    ],
)

/**
 * Versioned organization settings. Only the current row influences future
 * operations; loans and renewals retain their own contractual snapshots.
 */
export const systemSettings = sqliteTable(
    'system_settings',
    {
        id: integer('id').primaryKey({ autoIncrement: true }),
        publicId: text('public_id')
            .notNull()
            .$defaultFn(() => uuidv7()),
        organizationId: text('organization_id').notNull(),
        version: integer('version').notNull(),
        isCurrent: integer('is_current', { mode: 'boolean' })
            .notNull()
            .default(true),
        defaultLoanProductId: integer('default_loan_product_id'),
        defaultPaymentFrequency: text('default_payment_frequency', {
            enum: loanFormulaPaymentFrequencyValues,
        }).notNull(),
        enabledPaymentFrequencies: text('enabled_payment_frequencies', {
            mode: 'json',
        })
            .$type<(typeof loanFormulaPaymentFrequencyValues)[number][]>()
            .notNull(),
        allowPartialPayments: integer('allow_partial_payments', {
            mode: 'boolean',
        })
            .notNull()
            .default(true),
        allowAdvancePayments: integer('allow_advance_payments', {
            mode: 'boolean',
        })
            .notNull()
            .default(true),
        requireRenewalApproval: integer('require_renewal_approval', {
            mode: 'boolean',
        })
            .notNull()
            .default(true),
        borrowerTagPolicy: text('borrower_tag_policy', { mode: 'json' })
            .$type<TBorrowerTagPolicy>()
            .notNull(),
        idempotencyKey: text('idempotency_key'),
        requestFingerprint: text('request_fingerprint'),
        createdByUserId: text('created_by_user_id').notNull(),
        createdAt: integer('created_at', { mode: 'timestamp_ms' })
            .notNull()
            .default(sql`(CAST(unixepoch('subsec') * 1000 AS INTEGER))`),
    },
    (t) => [
        unique('system_settings_organization_id_id_unique').on(
            t.organizationId,
            t.id,
        ),
        unique('system_settings_organization_id_public_id_unique').on(
            t.organizationId,
            t.publicId,
        ),
        unique('system_settings_organization_id_version_unique').on(
            t.organizationId,
            t.version,
        ),
        unique('system_settings_organization_id_idempotency_key_unique').on(
            t.organizationId,
            t.idempotencyKey,
        ),
        uniqueIndex('system_settings_unique_current')
            .on(t.organizationId)
            .where(sql`${t.isCurrent} = TRUE`),
        foreignKey({
            columns: [t.organizationId],
            foreignColumns: [organization.id],
            name: 'system_settings_fk_organization',
        })
            .onDelete('no action')
            .onUpdate('no action'),
        foreignKey({
            columns: [
                t.organizationId,
                t.defaultLoanProductId,
            ],
            foreignColumns: [
                loanProduct.organizationId,
                loanProduct.id,
            ],
            name: 'system_settings_fk_default_loan_product',
        })
            .onDelete('no action')
            .onUpdate('no action'),
        foreignKey({
            columns: [
                t.organizationId,
                t.createdByUserId,
            ],
            foreignColumns: [
                member.organizationId,
                member.userId,
            ],
            name: 'system_settings_fk_created_by_member',
        })
            .onDelete('no action')
            .onUpdate('no action'),
        check('system_settings_check_version', sql`${t.version} > 0`),
        check(
            'system_settings_check_default_frequency',
            sql`${t.defaultPaymentFrequency} IN ('DAILY', 'WEEKLY', 'MONTHLY')`,
        ),
        check(
            'system_settings_check_enabled_payment_frequencies',
            sql`json_valid(${t.enabledPaymentFrequencies}) AND json_type(${t.enabledPaymentFrequencies}) = 'array' AND json_array_length(${t.enabledPaymentFrequencies}) > 0`,
        ),
        check(
            'system_settings_check_borrower_tag_policy',
            sql`json_valid(${t.borrowerTagPolicy}) AND json_type(${t.borrowerTagPolicy}) = 'object'`,
        ),
        check(
            'system_settings_check_idempotency_fingerprint',
            sql`(${t.idempotencyKey} IS NULL AND ${t.requestFingerprint} IS NULL) OR (${t.idempotencyKey} IS NOT NULL AND length(${t.requestFingerprint}) = 64 AND ${t.requestFingerprint} NOT GLOB '*[^0-9a-f]*')`,
        ),
    ],
)

/**
 * An immutable origination calculation snapshot. The operational service owns
 * legal transitions; the database guards the persisted state vocabulary and
 * release/approval actor-date invariants.
 */
export const loan = sqliteTable(
    'loan',
    {
        id: integer('id').primaryKey({ autoIncrement: true }),
        publicId: text('public_id')
            .notNull()
            .$defaultFn(() => uuidv7()),
        organizationId: text('organization_id').notNull(),
        loanNumber: text('loan_number').notNull(),
        borrowerId: integer('borrower_id').notNull(),
        loanProductId: integer('loan_product_id').notNull(),
        formulaProfileId: integer('formula_profile_id').notNull(),
        loanProductNameSnapshot: text('loan_product_name_snapshot').notNull(),
        formulaProfileNameSnapshot: text(
            'formula_profile_name_snapshot',
        ).notNull(),
        formulaProfileVersionSnapshot: integer(
            'formula_profile_version_snapshot',
        ).notNull(),
        interestMethod: text('interest_method', {
            enum: loanFormulaInterestMethodValues,
        }).notNull(),
        interestRateBasisPoints: integer('interest_rate_basis_points')
            .notNull()
            .default(0),
        fixedInterestAmountMinor: integer('fixed_interest_amount_minor'),
        principalAmountMinor: integer('principal_amount_minor').notNull(),
        minimumPrincipalAmountMinorSnapshot: integer(
            'minimum_principal_amount_minor_snapshot',
        ).notNull(),
        maximumPrincipalAmountMinorSnapshot: integer(
            'maximum_principal_amount_minor_snapshot',
        ).notNull(),
        interestAmountMinor: integer('interest_amount_minor').notNull(),
        totalPayableAmountMinor: integer(
            'total_payable_amount_minor',
        ).notNull(),
        termDays: integer('term_days').notNull(),
        paymentFrequency: text('payment_frequency', {
            enum: loanFormulaPaymentFrequencyValues,
        }).notNull(),
        installmentCount: integer('installment_count').notNull(),
        installmentAmountMinor: integer('installment_amount_minor').notNull(),
        dailyPaymentAmountMinor: integer(
            'daily_payment_amount_minor',
        ).notNull(),
        timezone: text('timezone').notNull().default('Asia/Manila'),
        roundingMode: text('rounding_mode', {
            enum: loanFormulaRoundingModeValues,
        }).notNull(),
        finalInstallmentResiduePolicy: text(
            'final_installment_residue_policy',
            { enum: loanFormulaFinalInstallmentResiduePolicyValues },
        ).notNull(),
        renewalSettlementMethod: text('renewal_settlement_method', {
            enum: loanFormulaRenewalSettlementMethodValues,
        }).notNull(),
        partialCreditPolicy: text('partial_credit_policy', {
            enum: loanFormulaPartialCreditPolicyValues,
        }).notNull(),
        minCompletedInstallments: integer('min_completed_installments')
            .notNull()
            .default(0),
        allowRenewalPrincipalChange: integer('allow_renewal_principal_change', {
            mode: 'boolean',
        })
            .notNull()
            .default(false),
        releaseDate: text('release_date'),
        firstPaymentDate: text('first_payment_date').notNull(),
        expectedCompletionDate: text('expected_completion_date').notNull(),
        totalAmountPaidMinor: integer('total_amount_paid_minor')
            .notNull()
            .default(0),
        completedInstallmentCount: integer('completed_installment_count')
            .notNull()
            .default(0),
        partialPaymentCreditMinor: integer('partial_payment_credit_minor')
            .notNull()
            .default(0),
        actualOutstandingBalanceMinor: integer(
            'actual_outstanding_balance_minor',
        ).notNull(),
        status: text('status', { enum: loanStatusValues })
            .notNull()
            .default('DRAFT'),
        createIdempotencyKey: text('create_idempotency_key'),
        releaseIdempotencyKey: text('release_idempotency_key'),
        createdByUserId: text('created_by_user_id').notNull(),
        updatedByUserId: text('updated_by_user_id').notNull(),
        approvedByUserId: text('approved_by_user_id'),
        approvedAt: integer('approved_at', { mode: 'timestamp_ms' }),
        releasedByUserId: text('released_by_user_id'),
        releasedAt: integer('released_at', { mode: 'timestamp_ms' }),
        createdAt: integer('created_at', { mode: 'timestamp_ms' })
            .notNull()
            .default(sql`(CAST(unixepoch('subsec') * 1000 AS INTEGER))`),
        updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
            .notNull()
            .default(sql`(CAST(unixepoch('subsec') * 1000 AS INTEGER))`),
    },
    (t) => [
        unique('loan_organization_id_id_unique').on(t.organizationId, t.id),
        unique('loan_organization_id_public_id_unique').on(
            t.organizationId,
            t.publicId,
        ),
        unique('loan_organization_id_loan_number_unique').on(
            t.organizationId,
            t.loanNumber,
        ),
        unique('loan_organization_id_create_idempotency_key_unique').on(
            t.organizationId,
            t.createIdempotencyKey,
        ),
        unique('loan_organization_id_release_idempotency_key_unique').on(
            t.organizationId,
            t.releaseIdempotencyKey,
        ),
        index('loan_idx_list').on(
            t.organizationId,
            t.status,
            sql`${t.createdAt} DESC`,
            t.id,
        ),
        index('loan_idx_borrower_history').on(
            t.organizationId,
            t.borrowerId,
            sql`${t.createdAt} DESC`,
            t.id,
        ),
        foreignKey({
            columns: [t.organizationId],
            foreignColumns: [organization.id],
            name: 'loan_fk_organization',
        })
            .onDelete('no action')
            .onUpdate('no action'),
        foreignKey({
            columns: [
                t.organizationId,
                t.borrowerId,
            ],
            foreignColumns: [
                borrower.organizationId,
                borrower.id,
            ],
            name: 'loan_fk_borrower',
        })
            .onDelete('no action')
            .onUpdate('no action'),
        foreignKey({
            columns: [
                t.organizationId,
                t.loanProductId,
            ],
            foreignColumns: [
                loanProduct.organizationId,
                loanProduct.id,
            ],
            name: 'loan_fk_product',
        })
            .onDelete('no action')
            .onUpdate('no action'),
        foreignKey({
            columns: [
                t.organizationId,
                t.formulaProfileId,
            ],
            foreignColumns: [
                loanFormulaProfile.organizationId,
                loanFormulaProfile.id,
            ],
            name: 'loan_fk_formula_profile',
        })
            .onDelete('no action')
            .onUpdate('no action'),
        foreignKey({
            columns: [
                t.organizationId,
                t.createdByUserId,
            ],
            foreignColumns: [
                member.organizationId,
                member.userId,
            ],
            name: 'loan_fk_created_by_member',
        })
            .onDelete('no action')
            .onUpdate('no action'),
        foreignKey({
            columns: [
                t.organizationId,
                t.updatedByUserId,
            ],
            foreignColumns: [
                member.organizationId,
                member.userId,
            ],
            name: 'loan_fk_updated_by_member',
        })
            .onDelete('no action')
            .onUpdate('no action'),
        foreignKey({
            columns: [
                t.organizationId,
                t.approvedByUserId,
            ],
            foreignColumns: [
                member.organizationId,
                member.userId,
            ],
            name: 'loan_fk_approved_by_member',
        })
            .onDelete('no action')
            .onUpdate('no action'),
        foreignKey({
            columns: [
                t.organizationId,
                t.releasedByUserId,
            ],
            foreignColumns: [
                member.organizationId,
                member.userId,
            ],
            name: 'loan_fk_released_by_member',
        })
            .onDelete('no action')
            .onUpdate('no action'),
        check('loan_check_loan_number', sql`length(trim(${t.loanNumber})) > 0`),
        check(
            'loan_check_snapshot_names',
            sql`length(trim(${t.loanProductNameSnapshot})) > 0 AND length(trim(${t.formulaProfileNameSnapshot})) > 0 AND ${t.formulaProfileVersionSnapshot} > 0`,
        ),
        check(
            'loan_check_interest',
            sql`(
                ${t.interestMethod} = 'FLAT_PERCENTAGE'
                AND ${t.interestRateBasisPoints} >= 0
                AND ${t.fixedInterestAmountMinor} IS NULL
            ) OR (
                ${t.interestMethod} = 'FIXED_AMOUNT'
                AND ${t.interestRateBasisPoints} = 0
                AND ${t.fixedInterestAmountMinor} IS NOT NULL
                AND ${t.fixedInterestAmountMinor} >= 0
            )`,
        ),
        check(
            'loan_check_principal_range',
            sql`${t.minimumPrincipalAmountMinorSnapshot} > 0 AND ${t.maximumPrincipalAmountMinorSnapshot} >= ${t.minimumPrincipalAmountMinorSnapshot} AND ${t.principalAmountMinor} >= ${t.minimumPrincipalAmountMinorSnapshot} AND ${t.principalAmountMinor} <= ${t.maximumPrincipalAmountMinorSnapshot}`,
        ),
        check(
            'loan_check_amounts',
            sql`${t.interestAmountMinor} >= 0 AND ${t.totalPayableAmountMinor} = ${t.principalAmountMinor} + ${t.interestAmountMinor} AND ${t.installmentAmountMinor} > 0 AND ${t.dailyPaymentAmountMinor} > 0 AND ${t.totalAmountPaidMinor} >= 0 AND ${t.partialPaymentCreditMinor} >= 0 AND ${t.actualOutstandingBalanceMinor} >= 0 AND ${t.actualOutstandingBalanceMinor} = ${t.totalPayableAmountMinor} - ${t.totalAmountPaidMinor}`,
        ),
        check('loan_check_term_days', sql`${t.termDays} > 0`),
        check(
            'loan_check_payment_frequency',
            sql`${t.paymentFrequency} IN ('DAILY', 'WEEKLY', 'MONTHLY')`,
        ),
        check('loan_check_installment_count', sql`${t.installmentCount} > 0`),
        check(
            'loan_check_completed_installment_count',
            sql`${t.completedInstallmentCount} >= 0 AND ${t.completedInstallmentCount} <= ${t.installmentCount}`,
        ),
        check('loan_check_timezone', sql`${t.timezone} = 'Asia/Manila'`),
        check(
            'loan_check_rounding_mode',
            sql`${t.roundingMode} IN ('HALF_UP', 'DOWN', 'UP')`,
        ),
        check(
            'loan_check_final_installment_residue_policy',
            sql`${t.finalInstallmentResiduePolicy} = 'LAST_INSTALLMENT_ABSORBS_RESIDUE'`,
        ),
        check(
            'loan_check_renewal_settlement_method',
            sql`${t.renewalSettlementMethod} IN ('COMPLETED_INSTALLMENT_BALANCE', 'EXACT_OUTSTANDING_BALANCE')`,
        ),
        check(
            'loan_check_partial_credit_policy',
            sql`${t.partialCreditPolicy} IN ('CARRY_FORWARD', 'APPLY_TO_SETTLEMENT', 'REFUND', 'MANUAL_REVIEW')`,
        ),
        check(
            'loan_check_min_completed_installments',
            sql`${t.minCompletedInstallments} >= 0 AND ${t.minCompletedInstallments} <= ${t.installmentCount}`,
        ),
        check(
            'loan_check_dates',
            sql`length(${t.firstPaymentDate}) = 10 AND ${t.firstPaymentDate} GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND length(${t.expectedCompletionDate}) = 10 AND ${t.expectedCompletionDate} GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND (${t.releaseDate} IS NULL OR (length(${t.releaseDate}) = 10 AND ${t.releaseDate} GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'))`,
        ),
        check(
            'loan_check_approval_actor',
            sql`(${t.approvedByUserId} IS NULL AND ${t.approvedAt} IS NULL) OR (${t.approvedByUserId} IS NOT NULL AND ${t.approvedAt} IS NOT NULL)`,
        ),
        check(
            'loan_check_release_actor',
            sql`(${t.releasedByUserId} IS NULL AND ${t.releasedAt} IS NULL AND ${t.releaseDate} IS NULL) OR (${t.releasedByUserId} IS NOT NULL AND ${t.releasedAt} IS NOT NULL AND ${t.releaseDate} IS NOT NULL)`,
        ),
        check(
            'loan_check_status',
            sql`${t.status} IN ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'ACTIVE', 'OVERDUE', 'RENEWED', 'FULLY_PAID', 'CANCELLED', 'WRITTEN_OFF')`,
        ),
        check(
            'loan_check_lifecycle',
            sql`(
                ${t.status} IN ('DRAFT', 'PENDING_APPROVAL', 'CANCELLED')
                AND ${t.approvedByUserId} IS NULL
                AND ${t.approvedAt} IS NULL
                AND ${t.releasedByUserId} IS NULL
                AND ${t.releasedAt} IS NULL
                AND ${t.releaseDate} IS NULL
            ) OR (
                ${t.status} = 'APPROVED'
                AND ${t.approvedByUserId} IS NOT NULL
                AND ${t.approvedAt} IS NOT NULL
                AND ${t.releasedByUserId} IS NULL
                AND ${t.releasedAt} IS NULL
                AND ${t.releaseDate} IS NULL
            ) OR (
                ${t.status} IN ('ACTIVE', 'OVERDUE', 'RENEWED', 'FULLY_PAID', 'WRITTEN_OFF')
                AND ${t.approvedByUserId} IS NOT NULL
                AND ${t.approvedAt} IS NOT NULL
                AND ${t.releasedByUserId} IS NOT NULL
                AND ${t.releasedAt} IS NOT NULL
                AND ${t.releaseDate} IS NOT NULL
            )`,
        ),
    ],
)

/** A generated contractual schedule; payments and allocations arrive in Phase 4. */
export const loanInstallment = sqliteTable(
    'loan_installment',
    {
        id: integer('id').primaryKey({ autoIncrement: true }),
        publicId: text('public_id')
            .notNull()
            .$defaultFn(() => uuidv7()),
        organizationId: text('organization_id').notNull(),
        loanId: integer('loan_id').notNull(),
        installmentNumber: integer('installment_number').notNull(),
        paymentFrequency: text('payment_frequency', {
            enum: loanFormulaPaymentFrequencyValues,
        }).notNull(),
        periodStart: text('period_start').notNull(),
        periodEnd: text('period_end').notNull(),
        dueDate: text('due_date').notNull(),
        amountDueMinor: integer('amount_due_minor').notNull(),
        amountPaidMinor: integer('amount_paid_minor').notNull().default(0),
        paidAt: integer('paid_at', { mode: 'timestamp_ms' }),
        status: text('status', { enum: loanInstallmentStatusValues })
            .notNull()
            .default('UPCOMING'),
    },
    (t) => [
        unique('loan_installment_organization_id_id_unique').on(
            t.organizationId,
            t.id,
        ),
        unique('loan_installment_organization_id_public_id_unique').on(
            t.organizationId,
            t.publicId,
        ),
        unique('loan_installment_organization_id_loan_id_number_unique').on(
            t.organizationId,
            t.loanId,
            t.installmentNumber,
        ),
        index('loan_installment_idx_schedule').on(
            t.organizationId,
            t.loanId,
            t.installmentNumber,
        ),
        index('loan_installment_idx_collections').on(
            t.organizationId,
            t.dueDate,
            t.status,
            t.id,
        ),
        foreignKey({
            columns: [
                t.organizationId,
                t.loanId,
            ],
            foreignColumns: [
                loan.organizationId,
                loan.id,
            ],
            name: 'loan_installment_fk_loan',
        })
            .onDelete('no action')
            .onUpdate('no action'),
        check('loan_installment_check_number', sql`${t.installmentNumber} > 0`),
        check(
            'loan_installment_check_payment_frequency',
            sql`${t.paymentFrequency} IN ('DAILY', 'WEEKLY', 'MONTHLY')`,
        ),
        check(
            'loan_installment_check_dates',
            sql`length(${t.periodStart}) = 10 AND ${t.periodStart} GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND length(${t.periodEnd}) = 10 AND ${t.periodEnd} GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND length(${t.dueDate}) = 10 AND ${t.dueDate} GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND ${t.periodStart} <= ${t.periodEnd} AND ${t.periodEnd} <= ${t.dueDate}`,
        ),
        check(
            'loan_installment_check_amounts',
            sql`${t.amountDueMinor} > 0 AND ${t.amountPaidMinor} >= 0 AND ${t.amountPaidMinor} <= ${t.amountDueMinor}`,
        ),
        check(
            'loan_installment_check_status',
            sql`${t.status} IN ('UPCOMING', 'PARTIAL', 'PAID', 'OVERDUE', 'WAIVED')`,
        ),
        check(
            'loan_installment_check_payment_state',
            sql`(${t.status} IN ('UPCOMING', 'OVERDUE', 'WAIVED') AND ${t.paidAt} IS NULL) OR (${t.status} = 'PARTIAL' AND ${t.amountPaidMinor} > 0 AND ${t.amountPaidMinor} < ${t.amountDueMinor} AND ${t.paidAt} IS NOT NULL) OR (${t.status} = 'PAID' AND ${t.amountPaidMinor} = ${t.amountDueMinor} AND ${t.paidAt} IS NOT NULL)`,
        ),
    ],
)

export const payment = createPayment()
export const paymentAllocation = createPaymentAllocation()

/** Tenant-scoped collector worklist; an unassigned row is historical only. */
export const loanCollectionAssignment = sqliteTable(
    'loan_collection_assignment',
    {
        id: integer('id').primaryKey({ autoIncrement: true }),
        publicId: text('public_id')
            .notNull()
            .$defaultFn(() => uuidv7()),
        organizationId: text('organization_id').notNull(),
        loanId: integer('loan_id').notNull(),
        collectorUserId: text('collector_user_id').notNull(),
        assignedByUserId: text('assigned_by_user_id').notNull(),
        assignedAt: integer('assigned_at', { mode: 'timestamp_ms' })
            .notNull()
            .default(sql`(CAST(unixepoch('subsec') * 1000 AS INTEGER))`),
        unassignedAt: integer('unassigned_at', { mode: 'timestamp_ms' }),
    },
    (t) => [
        unique('loan_collection_assignment_organization_id_id_unique').on(
            t.organizationId,
            t.id,
        ),
        unique(
            'loan_collection_assignment_organization_id_public_id_unique',
        ).on(t.organizationId, t.publicId),
        unique(
            'loan_collection_assignment_organization_loan_collector_unique',
        ).on(t.organizationId, t.loanId, t.collectorUserId),
        index('loan_collection_assignment_idx_collector_active').on(
            t.organizationId,
            t.collectorUserId,
            t.unassignedAt,
            t.loanId,
        ),
        foreignKey({
            columns: [
                t.organizationId,
                t.loanId,
            ],
            foreignColumns: [
                loan.organizationId,
                loan.id,
            ],
            name: 'loan_collection_assignment_fk_loan',
        })
            .onDelete('no action')
            .onUpdate('no action'),
        foreignKey({
            columns: [
                t.organizationId,
                t.collectorUserId,
            ],
            foreignColumns: [
                member.organizationId,
                member.userId,
            ],
            name: 'loan_collection_assignment_fk_collector',
        })
            .onDelete('no action')
            .onUpdate('no action'),
        foreignKey({
            columns: [
                t.organizationId,
                t.assignedByUserId,
            ],
            foreignColumns: [
                member.organizationId,
                member.userId,
            ],
            name: 'loan_collection_assignment_fk_assigner',
        })
            .onDelete('no action')
            .onUpdate('no action'),
        check(
            'loan_collection_assignment_check_dates',
            sql`${t.unassignedAt} IS NULL OR ${t.unassignedAt} >= ${t.assignedAt}`,
        ),
    ],
)

/** Immutable, tenant-scoped evidence of a loan settlement and replacement. */
export const loanRenewal = sqliteTable(
    'loan_renewal',
    {
        id: integer('id').primaryKey({ autoIncrement: true }),
        publicId: text('public_id')
            .notNull()
            .$defaultFn(() => uuidv7()),
        organizationId: text('organization_id').notNull(),
        borrowerId: integer('borrower_id').notNull(),
        oldLoanId: integer('old_loan_id').notNull(),
        newLoanId: integer('new_loan_id'),
        previousLoanNumber: text('previous_loan_number').notNull(),
        renewalSettlementMethod: text('renewal_settlement_method', {
            enum: loanFormulaRenewalSettlementMethodValues,
        }).notNull(),
        partialCreditHandling: text('partial_credit_handling', {
            enum: loanFormulaPartialCreditPolicyValues,
        }).notNull(),
        previousPrincipalAmountMinor: integer(
            'previous_principal_amount_minor',
        ).notNull(),
        previousCompletedInstallmentCount: integer(
            'previous_completed_installment_count',
        ).notNull(),
        previousRemainingInstallmentCount: integer(
            'previous_remaining_installment_count',
        ).notNull(),
        previousPartialCreditMinor: integer(
            'previous_partial_credit_minor',
        ).notNull(),
        renewalPrincipalAmountMinor: integer(
            'renewal_principal_amount_minor',
        ).notNull(),
        renewalSettlementBalanceMinor: integer(
            'renewal_settlement_balance_minor',
        ).notNull(),
        cashReleaseAmountMinor: integer('cash_release_amount_minor').notNull(),
        partialCreditAppliedToSettlementMinor: integer(
            'partial_credit_applied_to_settlement_minor',
        )
            .notNull()
            .default(0),
        partialCreditCarriedForwardMinor: integer(
            'partial_credit_carried_forward_minor',
        )
            .notNull()
            .default(0),
        partialCreditRefundedMinor: integer('partial_credit_refunded_minor')
            .notNull()
            .default(0),
        manualReviewRequired: integer('manual_review_required', {
            mode: 'boolean',
        })
            .notNull()
            .default(false),
        manualReviewReason: text('manual_review_reason'),
        status: text('status', { enum: loanRenewalStatusValues })
            .notNull()
            .default('PENDING_APPROVAL'),
        idempotencyKey: text('idempotency_key'),
        processedByUserId: text('processed_by_user_id').notNull(),
        processedAt: integer('processed_at', { mode: 'timestamp_ms' })
            .notNull()
            .default(sql`(CAST(unixepoch('subsec') * 1000 AS INTEGER))`),
        approvedByUserId: text('approved_by_user_id'),
        approvedAt: integer('approved_at', { mode: 'timestamp_ms' }),
        releasedByUserId: text('released_by_user_id'),
        releasedAt: integer('released_at', { mode: 'timestamp_ms' }),
        cancelledByUserId: text('cancelled_by_user_id'),
        cancelledAt: integer('cancelled_at', { mode: 'timestamp_ms' }),
        cancellationReason: text('cancellation_reason'),
        createdAt: integer('created_at', { mode: 'timestamp_ms' })
            .notNull()
            .default(sql`(CAST(unixepoch('subsec') * 1000 AS INTEGER))`),
        updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
            .notNull()
            .default(sql`(CAST(unixepoch('subsec') * 1000 AS INTEGER))`),
    },
    (t) => [
        unique('loan_renewal_organization_id_id_unique').on(
            t.organizationId,
            t.id,
        ),
        unique('loan_renewal_organization_id_public_id_unique').on(
            t.organizationId,
            t.publicId,
        ),
        unique('loan_renewal_organization_id_old_loan_id_unique').on(
            t.organizationId,
            t.oldLoanId,
        ),
        unique('loan_renewal_organization_id_new_loan_id_unique').on(
            t.organizationId,
            t.newLoanId,
        ),
        unique('loan_renewal_organization_id_idempotency_key_unique').on(
            t.organizationId,
            t.idempotencyKey,
        ),
        index('loan_renewal_idx_list').on(
            t.organizationId,
            t.status,
            sql`${t.processedAt} DESC`,
            t.id,
        ),
        index('loan_renewal_idx_borrower').on(
            t.organizationId,
            t.borrowerId,
            sql`${t.processedAt} DESC`,
            t.id,
        ),
        foreignKey({
            columns: [t.organizationId],
            foreignColumns: [organization.id],
            name: 'loan_renewal_fk_organization',
        })
            .onDelete('no action')
            .onUpdate('no action'),
        foreignKey({
            columns: [
                t.organizationId,
                t.borrowerId,
            ],
            foreignColumns: [
                borrower.organizationId,
                borrower.id,
            ],
            name: 'loan_renewal_fk_borrower',
        })
            .onDelete('no action')
            .onUpdate('no action'),
        foreignKey({
            columns: [
                t.organizationId,
                t.oldLoanId,
            ],
            foreignColumns: [
                loan.organizationId,
                loan.id,
            ],
            name: 'loan_renewal_fk_old_loan',
        })
            .onDelete('no action')
            .onUpdate('no action'),
        foreignKey({
            columns: [
                t.organizationId,
                t.newLoanId,
            ],
            foreignColumns: [
                loan.organizationId,
                loan.id,
            ],
            name: 'loan_renewal_fk_new_loan',
        })
            .onDelete('no action')
            .onUpdate('no action'),
        foreignKey({
            columns: [
                t.organizationId,
                t.processedByUserId,
            ],
            foreignColumns: [
                member.organizationId,
                member.userId,
            ],
            name: 'loan_renewal_fk_processed_by_member',
        })
            .onDelete('no action')
            .onUpdate('no action'),
        foreignKey({
            columns: [
                t.organizationId,
                t.approvedByUserId,
            ],
            foreignColumns: [
                member.organizationId,
                member.userId,
            ],
            name: 'loan_renewal_fk_approved_by_member',
        })
            .onDelete('no action')
            .onUpdate('no action'),
        foreignKey({
            columns: [
                t.organizationId,
                t.releasedByUserId,
            ],
            foreignColumns: [
                member.organizationId,
                member.userId,
            ],
            name: 'loan_renewal_fk_released_by_member',
        })
            .onDelete('no action')
            .onUpdate('no action'),
        foreignKey({
            columns: [
                t.organizationId,
                t.cancelledByUserId,
            ],
            foreignColumns: [
                member.organizationId,
                member.userId,
            ],
            name: 'loan_renewal_fk_cancelled_by_member',
        })
            .onDelete('no action')
            .onUpdate('no action'),
        check(
            'loan_renewal_check_previous_loan_number',
            sql`length(trim(${t.previousLoanNumber})) > 0`,
        ),
        check(
            'loan_renewal_check_settlement_method',
            sql`${t.renewalSettlementMethod} IN ('COMPLETED_INSTALLMENT_BALANCE', 'EXACT_OUTSTANDING_BALANCE')`,
        ),
        check(
            'loan_renewal_check_partial_credit_handling',
            sql`${t.partialCreditHandling} IN ('CARRY_FORWARD', 'APPLY_TO_SETTLEMENT', 'REFUND', 'MANUAL_REVIEW')`,
        ),
        check(
            'loan_renewal_check_amounts',
            sql`${t.previousPrincipalAmountMinor} > 0 AND ${t.previousCompletedInstallmentCount} >= 0 AND ${t.previousRemainingInstallmentCount} >= 0 AND ${t.previousPartialCreditMinor} >= 0 AND ${t.renewalPrincipalAmountMinor} > 0 AND ${t.renewalSettlementBalanceMinor} >= 0 AND ${t.cashReleaseAmountMinor} >= 0 AND ${t.partialCreditAppliedToSettlementMinor} >= 0 AND ${t.partialCreditCarriedForwardMinor} >= 0 AND ${t.partialCreditRefundedMinor} >= 0`,
        ),
        check(
            'loan_renewal_check_credit_handling_evidence',
            sql`(${t.partialCreditHandling} = 'CARRY_FORWARD' AND ${t.partialCreditAppliedToSettlementMinor} = 0 AND ${t.partialCreditCarriedForwardMinor} = ${t.previousPartialCreditMinor} AND ${t.partialCreditRefundedMinor} = 0 AND ${t.manualReviewRequired} = FALSE) OR (${t.partialCreditHandling} = 'APPLY_TO_SETTLEMENT' AND ${t.partialCreditAppliedToSettlementMinor} = ${t.previousPartialCreditMinor} AND ${t.partialCreditCarriedForwardMinor} = 0 AND ${t.partialCreditRefundedMinor} = 0 AND ${t.manualReviewRequired} = FALSE) OR (${t.partialCreditHandling} = 'REFUND' AND ${t.partialCreditAppliedToSettlementMinor} = 0 AND ${t.partialCreditCarriedForwardMinor} = 0 AND ${t.partialCreditRefundedMinor} = ${t.previousPartialCreditMinor} AND ${t.manualReviewRequired} = FALSE) OR (${t.partialCreditHandling} = 'MANUAL_REVIEW' AND ${t.partialCreditAppliedToSettlementMinor} = 0 AND ${t.partialCreditCarriedForwardMinor} = 0 AND ${t.partialCreditRefundedMinor} = 0 AND ${t.manualReviewRequired} = TRUE)`,
        ),
        check(
            'loan_renewal_check_approval_actor_pair',
            sql`(${t.approvedByUserId} IS NULL AND ${t.approvedAt} IS NULL) OR (${t.approvedByUserId} IS NOT NULL AND ${t.approvedAt} IS NOT NULL)`,
        ),
        check(
            'loan_renewal_check_release_actor_pair',
            sql`(${t.releasedByUserId} IS NULL AND ${t.releasedAt} IS NULL) OR (${t.releasedByUserId} IS NOT NULL AND ${t.releasedAt} IS NOT NULL)`,
        ),
        check(
            'loan_renewal_check_cancellation',
            sql`(${t.cancelledByUserId} IS NULL AND ${t.cancelledAt} IS NULL AND ${t.cancellationReason} IS NULL) OR (${t.cancelledByUserId} IS NOT NULL AND ${t.cancelledAt} IS NOT NULL AND length(trim(${t.cancellationReason})) > 0)`,
        ),
        check(
            'loan_renewal_check_lifecycle',
            sql`(${t.status} = 'PENDING_APPROVAL' AND ${t.newLoanId} IS NULL AND ${t.approvedByUserId} IS NULL AND ${t.releasedByUserId} IS NULL AND ${t.cancelledByUserId} IS NULL) OR (${t.status} = 'APPROVED' AND ${t.newLoanId} IS NULL AND ${t.approvedByUserId} IS NOT NULL AND ${t.releasedByUserId} IS NULL AND ${t.cancelledByUserId} IS NULL) OR (${t.status} = 'RELEASED' AND ${t.newLoanId} IS NOT NULL AND ${t.approvedByUserId} IS NOT NULL AND ${t.releasedByUserId} IS NOT NULL AND ${t.cancelledByUserId} IS NULL AND ${t.manualReviewRequired} = FALSE) OR (${t.status} = 'CANCELLED' AND ${t.newLoanId} IS NULL AND ${t.releasedByUserId} IS NULL AND ${t.cancelledByUserId} IS NOT NULL)`,
        ),
    ],
)

/**
 * Immutable cash ledger entries. Payment receipt and reversal rows retain a
 * same-tenant link to their payment while original loan-release rows remain
 * one-time entries per loan.
 */
export const cashTransaction = sqliteTable(
    'cash_transaction',
    {
        id: integer('id').primaryKey({ autoIncrement: true }),
        publicId: text('public_id')
            .notNull()
            .$defaultFn(() => uuidv7()),
        organizationId: text('organization_id').notNull(),
        transactionNumber: text('transaction_number').notNull(),
        transactionType: text('transaction_type', {
            enum: cashTransactionTypeValues,
        }).notNull(),
        direction: text('direction', {
            enum: cashTransactionDirectionValues,
        }).notNull(),
        borrowerId: integer('borrower_id').notNull(),
        loanId: integer('loan_id').notNull(),
        paymentId: integer('payment_id'),
        loanRenewalId: integer('loan_renewal_id'),
        amountMinor: integer('amount_minor').notNull(),
        transactionAt: integer('transaction_at', { mode: 'timestamp_ms' })
            .notNull()
            .default(sql`(CAST(unixepoch('subsec') * 1000 AS INTEGER))`),
        idempotencyKey: text('idempotency_key'),
        notes: text('notes'),
        createdByUserId: text('created_by_user_id').notNull(),
        createdAt: integer('created_at', { mode: 'timestamp_ms' })
            .notNull()
            .default(sql`(CAST(unixepoch('subsec') * 1000 AS INTEGER))`),
    },
    (t) => [
        unique('cash_transaction_organization_id_public_id_unique').on(
            t.organizationId,
            t.publicId,
        ),
        unique('cash_transaction_organization_id_id_unique').on(
            t.organizationId,
            t.id,
        ),
        unique('cash_transaction_organization_id_transaction_number_unique').on(
            t.organizationId,
            t.transactionNumber,
        ),
        unique('cash_transaction_organization_id_idempotency_key_unique').on(
            t.organizationId,
            t.idempotencyKey,
        ),
        unique('cash_transaction_organization_id_payment_id_type_unique').on(
            t.organizationId,
            t.paymentId,
            t.transactionType,
        ),
        uniqueIndex('cash_transaction_unique_loan_release')
            .on(t.organizationId, t.loanId)
            .where(sql`${t.transactionType} = 'LOAN_RELEASE'`),
        uniqueIndex('cash_transaction_unique_renewal_release')
            .on(t.organizationId, t.loanRenewalId)
            .where(sql`${t.transactionType} = 'RENEWAL_RELEASE'`),
        uniqueIndex('cash_transaction_unique_partial_credit_refund')
            .on(t.organizationId, t.loanRenewalId)
            .where(sql`${t.transactionType} = 'PARTIAL_CREDIT_REFUND'`),
        index('cash_transaction_idx_loan').on(
            t.organizationId,
            t.loanId,
            sql`${t.transactionAt} DESC`,
            t.id,
        ),
        index('cash_transaction_idx_renewal').on(
            t.organizationId,
            t.loanRenewalId,
            sql`${t.transactionAt} DESC`,
            t.id,
        ),
        foreignKey({
            columns: [t.organizationId],
            foreignColumns: [organization.id],
            name: 'cash_transaction_fk_organization',
        })
            .onDelete('no action')
            .onUpdate('no action'),
        foreignKey({
            columns: [
                t.organizationId,
                t.borrowerId,
            ],
            foreignColumns: [
                borrower.organizationId,
                borrower.id,
            ],
            name: 'cash_transaction_fk_borrower',
        })
            .onDelete('no action')
            .onUpdate('no action'),
        foreignKey({
            columns: [
                t.organizationId,
                t.loanId,
            ],
            foreignColumns: [
                loan.organizationId,
                loan.id,
            ],
            name: 'cash_transaction_fk_loan',
        })
            .onDelete('no action')
            .onUpdate('no action'),
        foreignKey({
            columns: [
                t.organizationId,
                t.paymentId,
            ],
            foreignColumns: [
                payment.organizationId,
                payment.id,
            ],
            name: 'cash_transaction_fk_payment',
        })
            .onDelete('no action')
            .onUpdate('no action'),
        foreignKey({
            columns: [
                t.organizationId,
                t.loanRenewalId,
            ],
            foreignColumns: [
                loanRenewal.organizationId,
                loanRenewal.id,
            ],
            name: 'cash_transaction_fk_loan_renewal',
        })
            .onDelete('no action')
            .onUpdate('no action'),
        foreignKey({
            columns: [
                t.organizationId,
                t.createdByUserId,
            ],
            foreignColumns: [
                member.organizationId,
                member.userId,
            ],
            name: 'cash_transaction_fk_created_by_member',
        })
            .onDelete('no action')
            .onUpdate('no action'),
        check(
            'cash_transaction_check_number',
            sql`length(trim(${t.transactionNumber})) > 0`,
        ),
        check(
            'cash_transaction_check_type_direction',
            sql`(${t.transactionType} = 'LOAN_RELEASE' AND ${t.direction} = 'CASH_OUT' AND ${t.paymentId} IS NULL AND ${t.loanRenewalId} IS NULL) OR (${t.transactionType} = 'PAYMENT_RECEIVED' AND ${t.direction} = 'CASH_IN' AND ${t.paymentId} IS NOT NULL AND ${t.loanRenewalId} IS NULL) OR (${t.transactionType} = 'PAYMENT_REVERSAL' AND ${t.direction} = 'CASH_OUT' AND ${t.paymentId} IS NOT NULL AND ${t.loanRenewalId} IS NULL) OR (${t.transactionType} = 'RENEWAL_RELEASE' AND ${t.direction} = 'CASH_OUT' AND ${t.paymentId} IS NULL AND ${t.loanRenewalId} IS NOT NULL) OR (${t.transactionType} = 'PARTIAL_CREDIT_REFUND' AND ${t.direction} = 'CASH_OUT' AND ${t.paymentId} IS NULL AND ${t.loanRenewalId} IS NOT NULL)`,
        ),
        check('cash_transaction_check_amount', sql`${t.amountMinor} > 0`),
    ],
)

/**
 * Organization-owned source of the company-fund configuration. Monetary
 * position is reconstructed from the immutable capital_transaction ledger;
 * currentCapitalMinor is a non-authoritative presentation projection.
 */
export const companyFund = sqliteTable(
    'company_fund',
    {
        id: integer('id').primaryKey({ autoIncrement: true }),
        publicId: text('public_id')
            .notNull()
            .$defaultFn(() => uuidv7()),
        organizationId: text('organization_id').notNull(),
        fundName: text('fund_name').notNull(),
        openingCapitalMinor: integer('opening_capital_minor').notNull(),
        currentCapitalMinor: integer('current_capital_minor')
            .notNull()
            .default(0),
        currency: text('currency').notNull().default('PHP'),
        isPrimary: integer('is_primary', { mode: 'boolean' })
            .notNull()
            .default(false),
        createdAt: integer('created_at', { mode: 'timestamp_ms' })
            .notNull()
            .default(sql`(CAST(unixepoch('subsec') * 1000 AS INTEGER))`),
        updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
            .notNull()
            .default(sql`(CAST(unixepoch('subsec') * 1000 AS INTEGER))`),
    },
    (t) => [
        unique('company_fund_organization_id_id_unique').on(
            t.organizationId,
            t.id,
        ),
        unique('company_fund_organization_id_public_id_unique').on(
            t.organizationId,
            t.publicId,
        ),
        unique('company_fund_organization_id_fund_name_unique').on(
            t.organizationId,
            t.fundName,
        ),
        uniqueIndex('company_fund_unique_primary')
            .on(t.organizationId)
            .where(sql`${t.isPrimary} = TRUE`),
        foreignKey({
            columns: [t.organizationId],
            foreignColumns: [organization.id],
            name: 'company_fund_fk_organization',
        })
            .onDelete('no action')
            .onUpdate('no action'),
        check('company_fund_check_name', sql`length(trim(${t.fundName})) > 0`),
        check(
            'company_fund_check_opening_capital',
            sql`${t.openingCapitalMinor} >= 0`,
        ),
        check(
            'company_fund_check_currency',
            sql`length(${t.currency}) = 3 AND ${t.currency} = UPPER(${t.currency}) AND ${t.currency} NOT GLOB '*[^A-Z]*'`,
        ),
    ],
)

/**
 * Append-only organization-scoped company-fund ledger. Principal recovery is
 * distinct from interest collection so cash restoration never becomes profit.
 */
export const capitalTransaction = sqliteTable(
    'capital_transaction',
    {
        id: integer('id').primaryKey({ autoIncrement: true }),
        publicId: text('public_id')
            .notNull()
            .$defaultFn(() => uuidv7()),
        organizationId: text('organization_id').notNull(),
        companyFundId: integer('company_fund_id').notNull(),
        transactionNumber: text('transaction_number').notNull(),
        transactionType: text('transaction_type', {
            enum: capitalTransactionTypeValues,
        }).notNull(),
        direction: text('direction', {
            enum: capitalTransactionDirectionValues,
        }).notNull(),
        amountMinor: integer('amount_minor').notNull(),
        loanId: integer('loan_id'),
        paymentId: integer('payment_id'),
        loanRenewalId: integer('loan_renewal_id'),
        cashTransactionId: integer('cash_transaction_id'),
        referenceNumber: text('reference_number'),
        notes: text('notes'),
        transactionAt: integer('transaction_at', { mode: 'timestamp_ms' })
            .notNull()
            .default(sql`(CAST(unixepoch('subsec') * 1000 AS INTEGER))`),
        idempotencyKey: text('idempotency_key'),
        createdByUserId: text('created_by_user_id').notNull(),
        createdAt: integer('created_at', { mode: 'timestamp_ms' })
            .notNull()
            .default(sql`(CAST(unixepoch('subsec') * 1000 AS INTEGER))`),
    },
    (t) => [
        unique('capital_transaction_organization_id_id_unique').on(
            t.organizationId,
            t.id,
        ),
        unique('capital_transaction_organization_id_public_id_unique').on(
            t.organizationId,
            t.publicId,
        ),
        unique(
            'capital_transaction_organization_id_transaction_number_unique',
        ).on(t.organizationId, t.transactionNumber),
        unique('capital_transaction_organization_id_idempotency_key_unique').on(
            t.organizationId,
            t.idempotencyKey,
        ),
        unique(
            'capital_transaction_organization_id_cash_transaction_id_type_unique',
        ).on(t.organizationId, t.cashTransactionId, t.transactionType),
        index('capital_transaction_idx_list').on(
            t.organizationId,
            t.transactionType,
            sql`${t.transactionAt} DESC`,
            t.id,
        ),
        index('capital_transaction_idx_fund').on(
            t.organizationId,
            t.companyFundId,
            sql`${t.transactionAt} DESC`,
            t.id,
        ),
        foreignKey({
            columns: [t.organizationId],
            foreignColumns: [organization.id],
            name: 'capital_transaction_fk_organization',
        })
            .onDelete('no action')
            .onUpdate('no action'),
        foreignKey({
            columns: [
                t.organizationId,
                t.companyFundId,
            ],
            foreignColumns: [
                companyFund.organizationId,
                companyFund.id,
            ],
            name: 'capital_transaction_fk_company_fund',
        })
            .onDelete('no action')
            .onUpdate('no action'),
        foreignKey({
            columns: [
                t.organizationId,
                t.loanId,
            ],
            foreignColumns: [
                loan.organizationId,
                loan.id,
            ],
            name: 'capital_transaction_fk_loan',
        })
            .onDelete('no action')
            .onUpdate('no action'),
        foreignKey({
            columns: [
                t.organizationId,
                t.paymentId,
            ],
            foreignColumns: [
                payment.organizationId,
                payment.id,
            ],
            name: 'capital_transaction_fk_payment',
        })
            .onDelete('no action')
            .onUpdate('no action'),
        foreignKey({
            columns: [
                t.organizationId,
                t.loanRenewalId,
            ],
            foreignColumns: [
                loanRenewal.organizationId,
                loanRenewal.id,
            ],
            name: 'capital_transaction_fk_loan_renewal',
        })
            .onDelete('no action')
            .onUpdate('no action'),
        foreignKey({
            columns: [
                t.organizationId,
                t.cashTransactionId,
            ],
            foreignColumns: [
                cashTransaction.organizationId,
                cashTransaction.id,
            ],
            name: 'capital_transaction_fk_cash_transaction',
        })
            .onDelete('no action')
            .onUpdate('no action'),
        foreignKey({
            columns: [
                t.organizationId,
                t.createdByUserId,
            ],
            foreignColumns: [
                member.organizationId,
                member.userId,
            ],
            name: 'capital_transaction_fk_created_by_member',
        })
            .onDelete('no action')
            .onUpdate('no action'),
        check(
            'capital_transaction_check_number',
            sql`length(trim(${t.transactionNumber})) > 0`,
        ),
        check('capital_transaction_check_amount', sql`${t.amountMinor} > 0`),
        check(
            'capital_transaction_check_type_direction_links',
            sql`(${t.transactionType} = 'OPENING_CAPITAL' AND ${t.direction} = 'IN' AND ${t.loanId} IS NULL AND ${t.paymentId} IS NULL AND ${t.loanRenewalId} IS NULL AND ${t.cashTransactionId} IS NULL) OR (${t.transactionType} = 'CAPITAL_INJECTION' AND ${t.direction} = 'IN' AND ${t.loanId} IS NULL AND ${t.paymentId} IS NULL AND ${t.loanRenewalId} IS NULL AND ${t.cashTransactionId} IS NULL) OR (${t.transactionType} = 'CAPITAL_WITHDRAWAL' AND ${t.direction} = 'OUT' AND ${t.loanId} IS NULL AND ${t.paymentId} IS NULL AND ${t.loanRenewalId} IS NULL AND ${t.cashTransactionId} IS NULL) OR (${t.transactionType} = 'LOAN_PRINCIPAL_RELEASE' AND ${t.direction} = 'OUT' AND ${t.loanId} IS NOT NULL AND ${t.paymentId} IS NULL AND ${t.loanRenewalId} IS NULL AND ${t.cashTransactionId} IS NOT NULL) OR (${t.transactionType} IN ('PRINCIPAL_COLLECTION', 'INTEREST_COLLECTION') AND ${t.loanId} IS NOT NULL AND ${t.paymentId} IS NOT NULL AND ${t.loanRenewalId} IS NULL AND ${t.cashTransactionId} IS NOT NULL) OR (${t.transactionType} = 'RENEWAL_RELEASE' AND ${t.direction} = 'OUT' AND ${t.loanId} IS NOT NULL AND ${t.paymentId} IS NULL AND ${t.loanRenewalId} IS NOT NULL) OR (${t.transactionType} IN ('RENEWAL_SETTLEMENT_PRINCIPAL', 'RENEWAL_SETTLEMENT_INTEREST', 'RENEWAL_PARTIAL_CREDIT_TRANSFER') AND ${t.direction} = 'IN' AND ${t.loanId} IS NOT NULL AND ${t.paymentId} IS NULL AND ${t.loanRenewalId} IS NOT NULL AND ${t.cashTransactionId} IS NULL) OR (${t.transactionType} = 'REFUND' AND ${t.direction} = 'OUT' AND ${t.loanId} IS NOT NULL AND ${t.paymentId} IS NULL AND ${t.loanRenewalId} IS NOT NULL AND ${t.cashTransactionId} IS NOT NULL) OR (${t.transactionType} IN ('EXPENSE', 'WRITE_OFF') AND ${t.direction} = 'OUT' AND ${t.loanId} IS NULL AND ${t.paymentId} IS NULL AND ${t.loanRenewalId} IS NULL AND ${t.cashTransactionId} IS NULL) OR (${t.transactionType} = 'ADJUSTMENT' AND ${t.loanId} IS NULL AND ${t.paymentId} IS NULL AND ${t.loanRenewalId} IS NULL AND ${t.cashTransactionId} IS NULL)`,
        ),
    ],
)

export const servicePrincipal = sqliteTable(
    'service_principal',
    {
        id: integer('id').primaryKey({ autoIncrement: true }),
        publicId: text('public_id')
            .notNull()
            .$defaultFn(() => uuidv7()),
        organizationId: text('organization_id').notNull(),
        name: text('name').notNull(),
        description: text('description'),
        audience: text('audience').notNull(),
        enabled: integer('enabled', { mode: 'boolean' })
            .notNull()
            .default(true),
        permissions: text('permissions', { mode: 'json' })
            .$type<Record<string, string[]>>()
            .notNull(),
        idempotencyKey: text('idempotency_key'),
        createdAt: integer('created_at', { mode: 'timestamp_ms' })
            .notNull()
            .default(sql`(CAST(unixepoch('subsec') * 1000 AS INTEGER))`),
        updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
            .notNull()
            .default(sql`(CAST(unixepoch('subsec') * 1000 AS INTEGER))`),
    },
    (t) => [
        check(
            'service_principal_audience_check',
            sql`${t.audience} IN ('public-v1', 'backoffice-v1')`,
        ),
        check('service_principal_name_check', sql`length(trim(${t.name})) > 0`),
        unique('service_principal_organization_id_public_id_unique').on(
            t.organizationId,
            t.publicId,
        ),
        unique('service_principal_organization_id_id_unique').on(
            t.organizationId,
            t.id,
        ),
        unique('service_principal_organization_id_idempotency_key_unique').on(
            t.organizationId,
            t.idempotencyKey,
        ),
        index('service_principal_idx_1').on(
            t.organizationId,
            t.audience,
            t.createdAt,
            t.id,
        ),
        foreignKey({
            columns: [t.organizationId],
            foreignColumns: [organization.id],
        })
            .onDelete('cascade')
            .onUpdate('no action'),
    ],
)

export const servicePrincipalCredentialIssuance = sqliteTable(
    'service_principal_credential_issuance',
    {
        id: integer('id').primaryKey({ autoIncrement: true }),
        organizationId: text('organization_id').notNull(),
        servicePrincipalId: integer('service_principal_id').notNull(),
        idempotencyKey: text('idempotency_key').notNull(),
        requestFingerprint: text('request_fingerprint').notNull(),
        state: text('state').notNull(),
        credentialId: text('credential_id'),
        credentialName: text('credential_name'),
        credentialStart: text('credential_start'),
        credentialExpiresAt: integer('credential_expires_at', {
            mode: 'timestamp_ms',
        }),
        credentialCreatedAt: integer('credential_created_at', {
            mode: 'timestamp_ms',
        }),
        createdAt: integer('created_at', { mode: 'timestamp_ms' })
            .notNull()
            .default(sql`(CAST(unixepoch('subsec') * 1000 AS INTEGER))`),
        updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
            .notNull()
            .default(sql`(CAST(unixepoch('subsec') * 1000 AS INTEGER))`),
    },
    (t) => [
        unique('service_principal_credential_issuance_unique_request').on(
            t.organizationId,
            t.servicePrincipalId,
            t.idempotencyKey,
        ),
        check(
            'service_principal_credential_issuance_check_state',
            sql`${t.state} IN ('pending', 'completed', 'failed')`,
        ),
        check(
            'service_principal_credential_issuance_check_metadata',
            sql`(
                ${t.state} = 'completed'
                AND ${t.credentialId} IS NOT NULL
                AND ${t.credentialName} IS NOT NULL
                AND ${t.credentialCreatedAt} IS NOT NULL
            ) OR (
                ${t.state} IN ('pending', 'failed')
                AND ${t.credentialId} IS NULL
                AND ${t.credentialName} IS NULL
                AND ${t.credentialStart} IS NULL
                AND ${t.credentialExpiresAt} IS NULL
                AND ${t.credentialCreatedAt} IS NULL
            )`,
        ),
        foreignKey({
            columns: [
                t.organizationId,
                t.servicePrincipalId,
            ],
            foreignColumns: [
                servicePrincipal.organizationId,
                servicePrincipal.id,
            ],
            name: 'service_principal_credential_issuance_fk_principal',
        })
            .onDelete('cascade')
            .onUpdate('no action'),
    ],
)

export const apikey = sqliteTable(
    'apikey',
    {
        id: text('id').primaryKey(),
        configId: text('config_id').notNull(),
        name: text('name'),
        start: text('start'),
        prefix: text('prefix'),
        key: text('key').notNull(),
        referenceId: text('reference_id').notNull(),
        servicePrincipalId: integer('service_principal_id'),
        refillInterval: integer('refill_interval'),
        refillAmount: integer('refill_amount'),
        lastRefillAt: integer('last_refill_at', { mode: 'timestamp_ms' }),
        enabled: integer('enabled', { mode: 'boolean' })
            .notNull()
            .default(true),
        rateLimitEnabled: integer('rate_limit_enabled', { mode: 'boolean' }),
        rateLimitTimeWindow: integer('rate_limit_time_window'),
        rateLimitMax: integer('rate_limit_max'),
        requestCount: integer('request_count'),
        remaining: integer('remaining'),
        lastRequest: integer('last_request', { mode: 'timestamp_ms' }),
        expiresAt: integer('expires_at', { mode: 'timestamp_ms' }),
        permissions: text('permissions'),
        metadata: text('metadata'),
        createdAt: integer('created_at', { mode: 'timestamp_ms' })
            .notNull()
            .default(sql`(CAST(unixepoch('subsec') * 1000 AS INTEGER))`),
        updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
            .notNull()
            .default(sql`(CAST(unixepoch('subsec') * 1000 AS INTEGER))`),
    },
    (t) => [
        check(
            'apikey_config_id_check',
            sql`${t.configId} IN ('public-v1', 'backoffice-v1')`,
        ),
        unique().on(t.key),
        index('apikey_idx_1').on(t.referenceId, t.configId, t.createdAt, t.id),
        index('apikey_idx_2').on(
            t.servicePrincipalId,
            t.enabled,
            t.expiresAt,
            t.id,
        ),
        index('apikey_idx_3')
            .on(t.createdAt, t.id)
            .where(sql`${t.servicePrincipalId} IS NULL`),
        index('apikey_idx_4').on(t.expiresAt, t.id),
        foreignKey({
            columns: [t.referenceId],
            foreignColumns: [organization.id],
            name: 'fk_apikey_reference_id_organization_id_fk',
        })
            .onDelete('cascade')
            .onUpdate('no action'),
        foreignKey({
            columns: [
                t.referenceId,
                t.servicePrincipalId,
            ],
            foreignColumns: [
                servicePrincipal.organizationId,
                servicePrincipal.id,
            ],
            name: 'fk_apikey_reference_id_service_principal_id_service_principal_organization_id_id_fk',
        })
            .onDelete('cascade')
            .onUpdate('no action'),
    ],
)

export const permission = sqliteTable(
    'permission',
    {
        id: integer('id').primaryKey({ autoIncrement: true }),
        component: text('component').notNull(),
        action: text('action').notNull(),
        apiKeyAssignable: integer('api_key_assignable', { mode: 'boolean' })
            .notNull()
            .default(false),
        roleId: integer('role_id').notNull(),
        createdAt: integer('created_at', { mode: 'timestamp_ms' })
            .notNull()
            .default(sql`(CAST(unixepoch('subsec') * 1000 AS INTEGER))`),
        updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
            .notNull()
            .default(sql`(CAST(unixepoch('subsec') * 1000 AS INTEGER))`),
    },
    (t) => [
        unique('permission_component_action_role_id_unique').on(
            t.component,
            t.action,
            t.roleId,
        ),
        index('permission_idx_1').on(t.roleId),
        foreignKey({
            columns: [t.roleId],
            foreignColumns: [role.id],
        })
            .onDelete('no action')
            .onUpdate('no action'),
    ],
)

export const role = sqliteTable(
    'role',
    {
        id: integer('id').primaryKey({ autoIncrement: true }),
        name: text('name').unique().notNull(),
        description: text('description'),
        createdAt: integer('created_at', { mode: 'timestamp_ms' })
            .notNull()
            .default(sql`(CAST(unixepoch('subsec') * 1000 AS INTEGER))`),
        updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
            .notNull()
            .default(sql`(CAST(unixepoch('subsec') * 1000 AS INTEGER))`),
    },
    () => [
        check('role_name_check', sql`name = LOWER(name)`),
    ],
)

export const session = sqliteTable(
    'session',
    {
        id: text('id').primaryKey(),
        userId: text('user_id').notNull(),
        token: text('token').unique().notNull(),
        expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
        ipAddress: text('ip_address'),
        userAgent: text('user_agent'),
        activeOrganizationId: text('active_organization_id'),
        createdAt: integer('created_at', { mode: 'timestamp_ms' })
            .notNull()
            .default(sql`(CAST(unixepoch('subsec') * 1000 AS INTEGER))`),
        updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
            .notNull()
            .default(sql`(CAST(unixepoch('subsec') * 1000 AS INTEGER))`),
    },
    (t) => [
        index('session_idx_1').on(t.expiresAt, t.id),
        index('session_idx_2').on(t.userId),
        foreignKey({
            columns: [t.userId],
            foreignColumns: [user.id],
        })
            .onDelete('cascade')
            .onUpdate('no action'),
        index('session_idx_3').on(t.activeOrganizationId),
        foreignKey({
            columns: [t.activeOrganizationId],
            foreignColumns: [organization.id],
        })
            .onDelete('no action')
            .onUpdate('no action'),
    ],
)

export const twoFactor = sqliteTable(
    'two_factor',
    {
        /**
         * Reserved Better Auth 1.7.1 two-factor schema. Its presence does not
         * enable the plugin or expose two-factor authentication routes.
         */
        id: text('id').primaryKey(),
        userId: text('user_id').notNull(),
        secret: text('secret').notNull(),
        backupCodes: text('backup_codes').notNull(),
        verified: integer('verified', { mode: 'boolean' }).default(true),
        failedVerificationCount: integer('failed_verification_count').default(
            0,
        ),
        lockedUntil: integer('locked_until', { mode: 'timestamp_ms' }),
    },
    (t) => [
        index('two_factor_idx_1').on(t.secret),
        index('two_factor_idx_2').on(t.userId),
        foreignKey({
            columns: [t.userId],
            foreignColumns: [user.id],
        })
            .onDelete('no action')
            .onUpdate('no action'),
    ],
)

export const user = sqliteTable(
    'user',
    {
        id: text('id').primaryKey(),
        publicId: text('public_id')
            .notNull()
            .unique()
            .$defaultFn(() => uuidv7()),
        name: text('name').notNull(),
        email: text('email').unique().notNull(),
        emailVerified: integer('email_verified', { mode: 'boolean' })
            .notNull()
            .default(false),
        /**
         * Reserved Better Auth 1.7.1 phone-number schema. Its presence does not
         * enable the plugin or expose phone-number authentication routes.
         */
        phoneNumber: text('phone_number').unique(),
        phoneNumberVerified: integer('phone_number_verified', {
            mode: 'boolean',
        }),
        image: text('image'),
        username: text('username').unique().notNull(),
        displayUsername: text('display_username'),
        twoFactorEnabled: integer('two_factor_enabled', {
            mode: 'boolean',
        }).default(false),
        createdAt: integer('created_at', { mode: 'timestamp_ms' })
            .notNull()
            .default(sql`(CAST(unixepoch('subsec') * 1000 AS INTEGER))`),
        updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
            .notNull()
            .default(sql`(CAST(unixepoch('subsec') * 1000 AS INTEGER))`),
    },
    () => [
        check('user_email_check', sql`email = LOWER(email)`),
        check('user_username_check', sql`username = LOWER(username)`),
    ],
)

export const verification = sqliteTable(
    'verification',
    {
        id: text('id').primaryKey(),
        identifier: text('identifier').notNull(),
        value: text('value').notNull(),
        expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
        createdAt: integer('created_at', { mode: 'timestamp_ms' })
            .notNull()
            .default(sql`(CAST(unixepoch('subsec') * 1000 AS INTEGER))`),
        updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
            .notNull()
            .default(sql`(CAST(unixepoch('subsec') * 1000 AS INTEGER))`),
    },
    (t) => [
        index('verification_idx_1').on(t.expiresAt, t.id),
        index('verification_idx_2').on(t.identifier),
    ],
)
