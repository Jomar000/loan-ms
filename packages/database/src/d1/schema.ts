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
