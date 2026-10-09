CREATE TABLE `account` (
	`id` text PRIMARY KEY,
	`user_id` text NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`id_token` text,
	`password` text,
	`created_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
	`updated_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
	CONSTRAINT `fk_account_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE,
	CONSTRAINT `account_provider_id_account_id_unique` UNIQUE(`provider_id`,`account_id`)
);
CREATE TABLE `apikey` (
	`id` text PRIMARY KEY,
	`config_id` text NOT NULL,
	`name` text,
	`start` text,
	`prefix` text,
	`key` text NOT NULL UNIQUE,
	`reference_id` text NOT NULL,
	`service_principal_id` integer,
	`refill_interval` integer,
	`refill_amount` integer,
	`last_refill_at` integer,
	`enabled` integer DEFAULT true NOT NULL,
	`rate_limit_enabled` integer,
	`rate_limit_time_window` integer,
	`rate_limit_max` integer,
	`request_count` integer,
	`remaining` integer,
	`last_request` integer,
	`expires_at` integer,
	`permissions` text,
	`metadata` text,
	`created_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
	`updated_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
	CONSTRAINT `fk_apikey_reference_id_organization_id_fk` FOREIGN KEY (`reference_id`) REFERENCES `organization`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_apikey_reference_id_service_principal_id_service_principal_organization_id_id_fk` FOREIGN KEY (`reference_id`,`service_principal_id`) REFERENCES `service_principal`(`organization_id`,`id`) ON DELETE CASCADE,
	CONSTRAINT "apikey_config_id_check" CHECK("config_id" IN ('public-v1', 'backoffice-v1'))
);
CREATE TABLE `audit_trail` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`public_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`user_id` text,
	`actor_type` text NOT NULL,
	`actor_display_name` text NOT NULL,
	`actor_identifier` text,
	`actor_role` text,
	`service_principal_public_id` text,
	`credential_id` text,
	`component` text NOT NULL,
	`action` text NOT NULL,
	`description` text NOT NULL,
	`records` text,
	`ip_address` text,
	`user_agent` text,
	`logged_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
	CONSTRAINT `fk_audit_trail_organization_id_organization_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`),
	CONSTRAINT `fk_audit_trail_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`),
	CONSTRAINT "audit_trail_actor_type_check" CHECK((
                "actor_type" = 'user'
                AND "user_id" IS NOT NULL
                AND "service_principal_public_id" IS NULL
                AND "credential_id" IS NULL
            ) OR (
                "actor_type" = 'servicePrincipal'
                AND "user_id" IS NULL
                AND "service_principal_public_id" IS NOT NULL
                AND "credential_id" IS NOT NULL
            ) OR (
                "actor_type" IN ('anonymous', 'system')
                AND "user_id" IS NULL
                AND "service_principal_public_id" IS NULL
                AND "credential_id" IS NULL
            ))
);
CREATE TABLE `invitation` (
	`id` text PRIMARY KEY,
	`email` text NOT NULL,
	`inviter_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`role` text NOT NULL,
	`status` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
	`updated_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
	CONSTRAINT `fk_invitation_inviter_id_user_id_fk` FOREIGN KEY (`inviter_id`) REFERENCES `user`(`id`),
	CONSTRAINT `fk_invitation_organization_id_organization_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`)
);
CREATE TABLE `key_counter` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`public_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`key` text NOT NULL,
	`counter` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
	`updated_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
	CONSTRAINT `fk_key_counter_organization_id_organization_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`),
	CONSTRAINT `key_counter_organization_id_key_unique` UNIQUE(`organization_id`,`key`),
	CONSTRAINT `key_counter_organization_id_public_id_unique` UNIQUE(`organization_id`,`public_id`)
);
CREATE TABLE `key_value` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`public_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`key` text NOT NULL,
	`value` text,
	`created_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
	`updated_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
	CONSTRAINT `fk_key_value_organization_id_organization_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`),
	CONSTRAINT `key_value_organization_id_key_unique` UNIQUE(`organization_id`,`key`),
	CONSTRAINT `key_value_organization_id_public_id_unique` UNIQUE(`organization_id`,`public_id`)
);
CREATE TABLE `member` (
	`id` text PRIMARY KEY,
	`user_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`role` text NOT NULL,
	`websocket_authorization_version` text NOT NULL,
	`created_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
	`updated_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
	CONSTRAINT `fk_member_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`),
	CONSTRAINT `fk_member_organization_id_organization_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`),
	CONSTRAINT `member_organization_id_user_id_unique` UNIQUE(`organization_id`,`user_id`)
);
CREATE TABLE `notification_delivery` (
	`organization_id` text NOT NULL,
	`notification_event_id` integer NOT NULL,
	`user_id` text NOT NULL,
	`is_read` integer DEFAULT false NOT NULL,
	`read_at` integer,
	`created_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
	CONSTRAINT `notification_delivery_pk_e7r2mv` PRIMARY KEY(`organization_id`, `notification_event_id`, `user_id`),
	CONSTRAINT `notification_delivery_fk_event_h5n9qs` FOREIGN KEY (`organization_id`,`notification_event_id`) REFERENCES `notification_event`(`organization_id`,`id`) ON DELETE CASCADE,
	CONSTRAINT `notification_delivery_fk_member_b8v4cx` FOREIGN KEY (`organization_id`,`user_id`) REFERENCES `member`(`organization_id`,`user_id`) ON DELETE CASCADE,
	CONSTRAINT "notification_delivery_check_read_j3f7pd" CHECK(("is_read" = FALSE AND "read_at" IS NULL) OR ("is_read" = TRUE AND "read_at" IS NOT NULL))
);
CREATE TABLE `notification_event` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`public_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`event_key` text NOT NULL,
	`content_fingerprint` text NOT NULL,
	`category` text NOT NULL,
	`title` text NOT NULL,
	`message` text NOT NULL,
	`action_label` text,
	`action_href` text,
	`metadata` text,
	`created_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
	CONSTRAINT `fk_notification_event_organization_id_organization_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`),
	CONSTRAINT `notification_event_unique_orgid1` UNIQUE(`organization_id`,`id`),
	CONSTRAINT `notification_event_organization_id_public_id_unique` UNIQUE(`organization_id`,`public_id`),
	CONSTRAINT `notification_event_organization_id_event_key_unique` UNIQUE(`organization_id`,`event_key`),
	CONSTRAINT "notification_event_check_action_d4p7kx" CHECK(("action_label" IS NULL AND "action_href" IS NULL) OR ("action_label" IS NOT NULL AND "action_href" IS NOT NULL))
);
CREATE TABLE `object_storage` (
	`id` text PRIMARY KEY,
	`organization_id` text NOT NULL,
	`size` integer NOT NULL,
	`mime_type` text,
	`hash_sha256` text NOT NULL,
	`is_public` integer DEFAULT false NOT NULL,
	`is_uploaded` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
	`updated_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
	CONSTRAINT `fk_object_storage_organization_id_organization_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`),
	CONSTRAINT `object_storage_unique_orgid1` UNIQUE(`organization_id`,`id`),
	CONSTRAINT `object_storage_organization_id_hash_sha256_is_public_unique` UNIQUE(`organization_id`,`hash_sha256`,`is_public`)
);
CREATE TABLE `object_storage_acl` (
	`organization_id` text NOT NULL,
	`object_storage_id` text NOT NULL,
	`user_id` text NOT NULL,
	`mode` integer DEFAULT 1 NOT NULL,
	CONSTRAINT `object_storage_acl_fk_osorg1` FOREIGN KEY (`organization_id`,`object_storage_id`) REFERENCES `object_storage`(`organization_id`,`id`) ON DELETE CASCADE,
	CONSTRAINT `object_storage_acl_fk_member` FOREIGN KEY (`organization_id`,`user_id`) REFERENCES `member`(`organization_id`,`user_id`) ON DELETE CASCADE,
	CONSTRAINT `object_storage_acl_organization_id_object_storage_id_user_id_unique` UNIQUE(`organization_id`,`object_storage_id`,`user_id`)
);
CREATE TABLE `organization` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`slug` text NOT NULL UNIQUE,
	`logo` text,
	`metadata` text,
	`created_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
	`updated_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
	CONSTRAINT "organization_slug_check" CHECK(slug = LOWER(slug))
);
CREATE TABLE `permission` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`component` text NOT NULL,
	`action` text NOT NULL,
	`api_key_assignable` integer DEFAULT false NOT NULL,
	`role_id` integer NOT NULL,
	`created_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
	`updated_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
	CONSTRAINT `fk_permission_role_id_role_id_fk` FOREIGN KEY (`role_id`) REFERENCES `role`(`id`),
	CONSTRAINT `permission_component_action_role_id_unique` UNIQUE(`component`,`action`,`role_id`)
);
CREATE TABLE `role` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`name` text NOT NULL UNIQUE,
	`description` text,
	`created_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
	`updated_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
	CONSTRAINT "role_name_check" CHECK(name = LOWER(name))
);
CREATE TABLE `service_principal` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`public_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`audience` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`permissions` text NOT NULL,
	`idempotency_key` text,
	`created_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
	`updated_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
	CONSTRAINT `fk_service_principal_organization_id_organization_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON DELETE CASCADE,
	CONSTRAINT `service_principal_organization_id_public_id_unique` UNIQUE(`organization_id`,`public_id`),
	CONSTRAINT `service_principal_organization_id_id_unique` UNIQUE(`organization_id`,`id`),
	CONSTRAINT `service_principal_organization_id_idempotency_key_unique` UNIQUE(`organization_id`,`idempotency_key`),
	CONSTRAINT "service_principal_audience_check" CHECK("audience" IN ('public-v1', 'backoffice-v1')),
	CONSTRAINT "service_principal_name_check" CHECK(length(trim("name")) > 0)
);
CREATE TABLE `service_principal_credential_issuance` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`organization_id` text NOT NULL,
	`service_principal_id` integer NOT NULL,
	`idempotency_key` text NOT NULL,
	`request_fingerprint` text NOT NULL,
	`state` text NOT NULL,
	`credential_id` text,
	`credential_name` text,
	`credential_start` text,
	`credential_expires_at` integer,
	`credential_created_at` integer,
	`created_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
	`updated_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
	CONSTRAINT `service_principal_credential_issuance_fk_principal` FOREIGN KEY (`organization_id`,`service_principal_id`) REFERENCES `service_principal`(`organization_id`,`id`) ON DELETE CASCADE,
	CONSTRAINT `service_principal_credential_issuance_unique_request` UNIQUE(`organization_id`,`service_principal_id`,`idempotency_key`),
	CONSTRAINT "service_principal_credential_issuance_check_state" CHECK(`state` IN ('pending', 'completed', 'failed')),
	CONSTRAINT "service_principal_credential_issuance_check_metadata" CHECK((
                `state` = 'completed'
                AND `credential_id` IS NOT NULL
                AND `credential_name` IS NOT NULL
                AND `credential_created_at` IS NOT NULL
            ) OR (
                `state` IN ('pending', 'failed')
                AND `credential_id` IS NULL
                AND `credential_name` IS NULL
                AND `credential_start` IS NULL
                AND `credential_expires_at` IS NULL
                AND `credential_created_at` IS NULL
            ))
);
CREATE TABLE `session` (
	`id` text PRIMARY KEY,
	`user_id` text NOT NULL,
	`token` text NOT NULL UNIQUE,
	`expires_at` integer NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`active_organization_id` text,
	`created_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
	`updated_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
	CONSTRAINT `fk_session_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_session_active_organization_id_organization_id_fk` FOREIGN KEY (`active_organization_id`) REFERENCES `organization`(`id`)
);
CREATE TABLE `two_factor` (
	`id` text PRIMARY KEY,
	`user_id` text NOT NULL,
	`secret` text NOT NULL,
	`backup_codes` text NOT NULL,
	`verified` integer DEFAULT true,
	`failed_verification_count` integer DEFAULT 0,
	`locked_until` integer,
	CONSTRAINT `fk_two_factor_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`)
);
CREATE TABLE `upload` (
	`id` text PRIMARY KEY,
	`organization_id` text NOT NULL,
	`user_id` text NOT NULL,
	`idempotency_key` text,
	`is_committed` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
	`updated_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
	CONSTRAINT `fk_upload_organization_id_organization_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`),
	CONSTRAINT `fk_upload_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`),
	CONSTRAINT `upload_unique_orgid1` UNIQUE(`organization_id`,`id`),
	CONSTRAINT `upload_organization_id_idempotency_key_unique` UNIQUE(`organization_id`,`idempotency_key`)
);
CREATE TABLE `upload_attachment` (
	`organization_id` text NOT NULL,
	`upload_id` text NOT NULL,
	`object_storage_id` text NOT NULL,
	CONSTRAINT `fk_upload_attachment_organization_id_organization_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`),
	CONSTRAINT `upload_attachment_fk_uporg1` FOREIGN KEY (`organization_id`,`upload_id`) REFERENCES `upload`(`organization_id`,`id`),
	CONSTRAINT `upload_attachment_fk_osorg1` FOREIGN KEY (`organization_id`,`object_storage_id`) REFERENCES `object_storage`(`organization_id`,`id`) ON DELETE CASCADE,
	CONSTRAINT `upload_attachment_organization_id_upload_id_object_storage_id_unique` UNIQUE(`organization_id`,`upload_id`,`object_storage_id`)
);
CREATE TABLE `upload_attachment_batch_request` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`organization_id` text NOT NULL,
	`upload_id` text NOT NULL,
	`user_id` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`request_fingerprint` text NOT NULL,
	`response_data` text NOT NULL,
	`created_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
	CONSTRAINT `upload_attachment_batch_request_fk_upload_u5n8ra` FOREIGN KEY (`organization_id`,`upload_id`) REFERENCES `upload`(`organization_id`,`id`) ON DELETE CASCADE,
	CONSTRAINT `upload_attachment_batch_request_fk_actor_m9q2dk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`),
	CONSTRAINT `upload_attachment_batch_request_unique_k7m2qx` UNIQUE(`organization_id`,`idempotency_key`)
);
CREATE TABLE `user` (
	`id` text PRIMARY KEY,
	`public_id` text NOT NULL UNIQUE,
	`name` text NOT NULL,
	`email` text NOT NULL UNIQUE,
	`email_verified` integer DEFAULT false NOT NULL,
	`phone_number` text UNIQUE,
	`phone_number_verified` integer,
	`image` text,
	`username` text NOT NULL UNIQUE,
	`display_username` text,
	`two_factor_enabled` integer DEFAULT false,
	`created_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
	`updated_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
	CONSTRAINT "user_email_check" CHECK(email = LOWER(email)),
	CONSTRAINT "user_username_check" CHECK(username = LOWER(username))
);
CREATE TABLE `user_address` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`public_id` text NOT NULL UNIQUE,
	`user_id` text NOT NULL,
	`type` text NOT NULL,
	`label` text,
	`is_primary` integer DEFAULT false NOT NULL,
	`address_line_1` text NOT NULL,
	`address_line_2` text,
	`dependent_locality` text,
	`locality` text,
	`administrative_area` text,
	`postal_code` text,
	`country_code` text NOT NULL,
	`psgc_code` text,
	`idempotency_key` text,
	`created_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
	`updated_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
	CONSTRAINT `fk_user_address_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE,
	CONSTRAINT `user_address_user_id_idempotency_key_unique` UNIQUE(`user_id`,`idempotency_key`),
	CONSTRAINT "user_address_type_check" CHECK("type" IN ('RESIDENTIAL', 'MAILING', 'OTHER')),
	CONSTRAINT "user_address_check_country" CHECK(length("country_code") = 2 AND "country_code" = UPPER("country_code") AND "country_code" NOT GLOB '*[^A-Z]*'),
	CONSTRAINT "user_address_check_psgc" CHECK("psgc_code" IS NULL OR ("country_code" = 'PH' AND length("psgc_code") = 10 AND "psgc_code" NOT GLOB '*[^0-9]*'))
);
CREATE TABLE `user_attribute` (
	`user_id` text PRIMARY KEY,
	`is_locked` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
	`updated_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
	CONSTRAINT `fk_user_attribute_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`)
);
CREATE TABLE `user_profile` (
	`user_id` text PRIMARY KEY,
	`first_name` text NOT NULL,
	`middle_name` text,
	`last_name` text NOT NULL,
	`name_extension` text,
	`gender` text NOT NULL,
	`backup_phone_number` text,
	`created_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
	`updated_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
	CONSTRAINT `fk_user_profile_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`),
	CONSTRAINT "user_profile_gender_check" CHECK("gender" IN ('MALE', 'FEMALE'))
);
CREATE TABLE `user_relationship` (
	`user_id` text PRIMARY KEY,
	`name` text NOT NULL,
	`relationship` text NOT NULL,
	`phone_number` text NOT NULL,
	`backup_phone_number` text,
	`email` text,
	`is_emergency_contact` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
	`updated_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
	CONSTRAINT `fk_user_relationship_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`)
);
CREATE TABLE `verification` (
	`id` text PRIMARY KEY,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
	`updated_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL
);
CREATE TABLE `websocket_revocation_delivery` (
	`operation_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`surface` text NOT NULL,
	`delivery` text NOT NULL,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`next_attempt_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER) + 300000) NOT NULL,
	`last_attempt_at` integer,
	`accepted_at` integer,
	`last_error` text,
	`created_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
	`updated_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
	CONSTRAINT `websocket_revocation_delivery_pk` PRIMARY KEY(`operation_id`, `surface`),
	CONSTRAINT `websocket_revocation_delivery_fk_operation` FOREIGN KEY (`organization_id`,`operation_id`) REFERENCES `websocket_revocation_operation`(`organization_id`,`id`) ON DELETE CASCADE,
	CONSTRAINT "websocket_revocation_delivery_check_attempt" CHECK("attempt_count" >= 0),
	CONSTRAINT "websocket_revocation_delivery_check_surface" CHECK("surface" IN ('public', 'backoffice')),
	CONSTRAINT "websocket_revocation_delivery_check_delivery" CHECK("delivery" IN ('local', 'remote')),
	CONSTRAINT "websocket_revocation_delivery_check_error_length" CHECK("last_error" IS NULL OR length("last_error") <= 512)
);
CREATE TABLE `websocket_revocation_operation` (
	`id` text PRIMARY KEY,
	`organization_id` text NOT NULL,
	`user_id` text NOT NULL,
	`revoked_authorization_version` text NOT NULL,
	`replacement_authorization_version` text,
	`reason` text NOT NULL,
	`request_fingerprint` text,
	`retain_until` integer NOT NULL,
	`created_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
	CONSTRAINT `websocket_revocation_operation_fk_organization` FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`),
	CONSTRAINT `websocket_revocation_operation_fk_user` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`),
	CONSTRAINT `websocket_revocation_operation_unique_org_id` UNIQUE(`organization_id`,`id`),
	CONSTRAINT "websocket_revocation_operation_check_versions" CHECK("replacement_authorization_version" IS NULL OR "replacement_authorization_version" <> "revoked_authorization_version"),
	CONSTRAINT "websocket_revocation_operation_check_reason_length" CHECK(length("reason") <= 64),
	CONSTRAINT "websocket_revocation_operation_check_fingerprint_length" CHECK("request_fingerprint" IS NULL OR length("request_fingerprint") <= 64)
);
CREATE INDEX `account_idx_1` ON `account` (`user_id`);--> statement-breakpoint
CREATE INDEX `apikey_idx_1` ON `apikey` (`reference_id`,`config_id`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `apikey_idx_2` ON `apikey` (`service_principal_id`,`enabled`,`expires_at`,`id`);--> statement-breakpoint
CREATE INDEX `apikey_idx_3` ON `apikey` (`created_at`,`id`) WHERE "apikey"."service_principal_id" IS NULL;--> statement-breakpoint
CREATE INDEX `apikey_idx_4` ON `apikey` (`expires_at`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `audit_trail_unique_1` ON `audit_trail` (`organization_id`,`public_id`);--> statement-breakpoint
CREATE INDEX `audit_trail_idx_1` ON `audit_trail` (`organization_id`,`logged_at` DESC,`id` DESC);--> statement-breakpoint
CREATE INDEX `audit_trail_idx_2` ON `audit_trail` (`organization_id`,`service_principal_public_id`);--> statement-breakpoint
CREATE INDEX `audit_trail_idx_3` ON `audit_trail` (`user_id`);--> statement-breakpoint
CREATE INDEX `audit_trail_idx_4` ON `audit_trail` (`logged_at`);--> statement-breakpoint
CREATE INDEX `audit_trail_idx_5` ON `audit_trail` (`organization_id`,`component`,`logged_at` DESC);--> statement-breakpoint
CREATE INDEX `audit_trail_idx_6` ON `audit_trail` (`organization_id`,`action`,`logged_at` DESC);--> statement-breakpoint
CREATE INDEX `audit_trail_idx_7` ON `audit_trail` (`organization_id`,`actor_type`,`logged_at` DESC);--> statement-breakpoint
CREATE INDEX `invitation_idx_1` ON `invitation` (`email`);--> statement-breakpoint
CREATE INDEX `invitation_idx_2` ON `invitation` (`inviter_id`);--> statement-breakpoint
CREATE INDEX `invitation_idx_3` ON `invitation` (`organization_id`);--> statement-breakpoint
CREATE INDEX `member_idx_1` ON `member` (`user_id`);--> statement-breakpoint
CREATE INDEX `notification_delivery_idx_list_q4m8tz` ON `notification_delivery` (`organization_id`,`user_id`,`created_at`,`notification_event_id`);--> statement-breakpoint
CREATE INDEX `notification_delivery_idx_unread_k6p3wx` ON `notification_delivery` (`organization_id`,`user_id`,`is_read`);--> statement-breakpoint
CREATE INDEX `object_storage_acl_idx_1` ON `object_storage_acl` (`organization_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `permission_idx_1` ON `permission` (`role_id`);--> statement-breakpoint
CREATE INDEX `service_principal_idx_1` ON `service_principal` (`organization_id`,`audience`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `session_idx_1` ON `session` (`expires_at`,`id`);--> statement-breakpoint
CREATE INDEX `session_idx_2` ON `session` (`user_id`);--> statement-breakpoint
CREATE INDEX `session_idx_3` ON `session` (`active_organization_id`);--> statement-breakpoint
CREATE INDEX `two_factor_idx_1` ON `two_factor` (`secret`);--> statement-breakpoint
CREATE INDEX `two_factor_idx_2` ON `two_factor` (`user_id`);--> statement-breakpoint
CREATE INDEX `upload_idx_1` ON `upload` (`user_id`);--> statement-breakpoint
CREATE INDEX `upload_attachment_idx_1` ON `upload_attachment` (`organization_id`,`object_storage_id`);--> statement-breakpoint
CREATE INDEX `upload_attachment_batch_request_idx_actor_p4c8vw` ON `upload_attachment_batch_request` (`organization_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `upload_attachment_batch_request_idx_1` ON `upload_attachment_batch_request` (`organization_id`,`upload_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `user_address_unique_primary1` ON `user_address` (`user_id`) WHERE "user_address"."is_primary" = TRUE;--> statement-breakpoint
CREATE INDEX `user_address_idx_1` ON `user_address` (`user_id`,`type`);--> statement-breakpoint
CREATE INDEX `verification_idx_1` ON `verification` (`expires_at`,`id`);--> statement-breakpoint
CREATE INDEX `verification_idx_2` ON `verification` (`identifier`);--> statement-breakpoint
CREATE INDEX `websocket_revocation_delivery_idx_recovery` ON `websocket_revocation_delivery` (`surface`,`next_attempt_at`,`created_at`,`operation_id`) WHERE "websocket_revocation_delivery"."accepted_at" IS NULL;--> statement-breakpoint
CREATE INDEX `websocket_revocation_operation_idx_identity` ON `websocket_revocation_operation` (`organization_id`,`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `websocket_revocation_operation_idx_retention` ON `websocket_revocation_operation` (`retain_until`,`id`);
--> statement-breakpoint
-- Default seed data
-- Organization
INSERT INTO "organization"
    (id, name, slug)
VALUES
    ('ORGANIZATION_001', 'SUPER ORGANIZATION', 'superorganization')
ON CONFLICT DO NOTHING;
-- User
INSERT INTO "user"
    (id, public_id, name, email, username)
VALUES
    ('USER_001', '019936e2-b837-7000-8000-000000000001', 'SUPER ADMINISTRATOR', 'superadministrator@loanms.app', 'superadministrator'),
    ('USER_002', '019936e2-b837-7000-8000-000000000002', 'ADMINISTRATOR', 'administrator@loanms.app', 'administrator'),
    ('USER_003', '019936e2-b837-7000-8000-000000000003', 'MEMBER', 'member@loanms.app', 'member')
ON CONFLICT DO NOTHING;

-- Account
-- Default password is P@ssw0rd1234
INSERT INTO "account"
    (id, user_id, account_id, provider_id, password)
VALUES
    ('ACCOUNT_001', 'USER_001', 'USER_001', 'credential', 'ZLdlpfqhiPOY5tot3wc5Iq3xt-N8eHrB:691f4315a32bb67e45572fdfa8d0556076062d63e3402844bfb8eed3f7a09a5460ee6553fe751d79e076bcf00fece142d5b4315df8475f15c9acf46c4897412e'),
    ('ACCOUNT_002', 'USER_002', 'USER_002', 'credential', 'ZLdlpfqhiPOY5tot3wc5Iq3xt-N8eHrB:691f4315a32bb67e45572fdfa8d0556076062d63e3402844bfb8eed3f7a09a5460ee6553fe751d79e076bcf00fece142d5b4315df8475f15c9acf46c4897412e'),
    ('ACCOUNT_003', 'USER_003', 'USER_003', 'credential', 'ZLdlpfqhiPOY5tot3wc5Iq3xt-N8eHrB:691f4315a32bb67e45572fdfa8d0556076062d63e3402844bfb8eed3f7a09a5460ee6553fe751d79e076bcf00fece142d5b4315df8475f15c9acf46c4897412e')
ON CONFLICT DO NOTHING;

-- Member
INSERT INTO "member"
    (id, user_id, organization_id, role, websocket_authorization_version)
VALUES
    ('MEMBER_001', 'USER_001', 'ORGANIZATION_001', 'owner', '019c9b48-0000-7000-8000-000000000001'),
    ('MEMBER_002', 'USER_002', 'ORGANIZATION_001', 'admin', '019c9b48-0000-7000-8000-000000000002'),
    ('MEMBER_003', 'USER_003', 'ORGANIZATION_001', 'member', '019c9b48-0000-7000-8000-000000000003')
ON CONFLICT DO NOTHING;

-- Role
INSERT INTO "role"
    (id, name, description)
VALUES
    (1, 'owner', 'Organization Owner'),
    (2, 'admin', 'Organization Administrator'),
    (3, 'member', 'Organization Member');

-- Permission
INSERT INTO "permission"
    (component, action, api_key_assignable, role_id)
VALUES
    /**
     * OWNER (role_id: 1) - Full access to all components
     */
    ('SYSOWNER', 'ANY', false, 1),
    ('SYSADMIN', 'ANY', false, 1),
    ('auditTrail', 'read', false, 1),
    ('apiKey', 'create', false, 1),
    ('apiKey', 'read', false, 1),
    ('apiKey', 'update', false, 1),
    ('apiKey', 'delete', false, 1),
    ('servicePrincipal', 'create', false, 1),
    ('servicePrincipal', 'read', false, 1),
    ('servicePrincipal', 'update', false, 1),
    ('servicePrincipal', 'delete', false, 1),
    ('api.public', 'access', true, 1),
    ('api.backoffice', 'access', true, 1),
    ('ws', 'listen', false, 1),
    /**
     * ADMIN (role_id: 2) - Full access to all components
     */
    ('SYSADMIN', 'ANY', false, 2),
    ('auditTrail', 'read', false, 2),
    ('apiKey', 'create', false, 2),
    ('apiKey', 'read', false, 2),
    ('apiKey', 'update', false, 2),
    ('apiKey', 'delete', false, 2),
    ('servicePrincipal', 'create', false, 2),
    ('servicePrincipal', 'read', false, 2),
    ('servicePrincipal', 'update', false, 2),
    ('servicePrincipal', 'delete', false, 2),
    ('api.public', 'access', true, 2),
    ('api.backoffice', 'access', true, 2),
    ('ws', 'listen', false, 2),
    /**
     * MEMBER (role_id: 3) - Limited access
     */
    ('ws', 'listen', false, 3);

-- User Attribute
INSERT INTO "user_attribute"
    (user_id, is_locked)
VALUES
    ('USER_001', false),
    ('USER_002', false),
    ('USER_003', false)
ON CONFLICT DO NOTHING;
--> statement-breakpoint
-- Loan formula profiles
CREATE TABLE `loan_formula_profile` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`public_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`name` text NOT NULL,
	`version` integer NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`interest_method` text NOT NULL,
	`interest_rate_basis_points` integer DEFAULT 0 NOT NULL,
	`fixed_interest_amount_minor` integer,
	`collection_amount_minor` integer,
	`term_days` integer NOT NULL,
	`payment_frequency` text NOT NULL,
	`installment_count` integer NOT NULL,
	`timezone` text DEFAULT 'Asia/Manila' NOT NULL,
	`rounding_mode` text NOT NULL,
	`final_installment_residue_policy` text NOT NULL,
	`renewal_settlement_method` text NOT NULL,
	`partial_credit_policy` text NOT NULL,
	`min_completed_installments` integer DEFAULT 0 NOT NULL,
	`allow_renewal_principal_change` integer DEFAULT false NOT NULL,
	`effective_at` integer NOT NULL,
	`retired_at` integer,
	`deleted_at` integer,
	`created_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
	CONSTRAINT `loan_formula_profile_fk_organization` FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
	CONSTRAINT `loan_formula_profile_organization_id_name_version_unique` UNIQUE(`organization_id`,`name`,`version`),
	CONSTRAINT `loan_formula_profile_organization_id_public_id_unique` UNIQUE(`organization_id`,`public_id`),
	CONSTRAINT `loan_formula_profile_check_name` CHECK(length(trim(`name`)) > 0),
	CONSTRAINT `loan_formula_profile_check_version` CHECK(`version` > 0),
	CONSTRAINT `loan_formula_profile_check_interest_method` CHECK(`interest_method` IN ('FLAT_PERCENTAGE', 'FIXED_AMOUNT')),
	CONSTRAINT `loan_formula_profile_check_interest` CHECK((
		`interest_method` = 'FLAT_PERCENTAGE'
		AND `interest_rate_basis_points` >= 0
		AND `fixed_interest_amount_minor` IS NULL
	) OR (
		`interest_method` = 'FIXED_AMOUNT'
		AND `interest_rate_basis_points` = 0
		AND `fixed_interest_amount_minor` IS NOT NULL
		AND `fixed_interest_amount_minor` >= 0
	)),
	CONSTRAINT `loan_formula_profile_check_term_days` CHECK(`term_days` > 0),
	CONSTRAINT `loan_formula_profile_check_payment_frequency` CHECK(`payment_frequency` IN ('DAILY', 'WEEKLY', 'MONTHLY')),
	CONSTRAINT `loan_formula_profile_check_installment_count` CHECK(`installment_count` > 0),
	CONSTRAINT `loan_formula_profile_check_timezone` CHECK(`timezone` = 'Asia/Manila'),
	CONSTRAINT `loan_formula_profile_check_rounding_mode` CHECK(`rounding_mode` IN ('HALF_UP', 'DOWN', 'UP')),
	CONSTRAINT `loan_formula_profile_check_final_installment_residue_policy` CHECK(`final_installment_residue_policy` = 'LAST_INSTALLMENT_ABSORBS_RESIDUE'),
	CONSTRAINT `loan_formula_profile_check_renewal_settlement_method` CHECK(`renewal_settlement_method` IN ('COMPLETED_INSTALLMENT_BALANCE', 'EXACT_OUTSTANDING_BALANCE')),
	CONSTRAINT `loan_formula_profile_check_partial_credit_policy` CHECK(`partial_credit_policy` IN ('CARRY_FORWARD', 'APPLY_TO_SETTLEMENT', 'REFUND', 'MANUAL_REVIEW')),
	CONSTRAINT `loan_formula_profile_check_min_completed_installments` CHECK(`min_completed_installments` >= 0 AND `min_completed_installments` <= `installment_count`),
	CONSTRAINT `loan_formula_profile_check_default_active` CHECK(`is_default` = FALSE OR (`is_active` = TRUE AND `retired_at` IS NULL)),
	CONSTRAINT `loan_formula_profile_check_retired_at` CHECK(`retired_at` IS NULL OR `retired_at` >= `effective_at`)
);
CREATE UNIQUE INDEX `loan_formula_profile_unique_active_default` ON `loan_formula_profile` (`organization_id`) WHERE `loan_formula_profile`.`is_active` = TRUE AND `loan_formula_profile`.`is_default` = TRUE;
--> statement-breakpoint
-- Borrowers and documents
CREATE TABLE `borrower` (
    `id` integer PRIMARY KEY AUTOINCREMENT,
    `public_id` text NOT NULL,
    `organization_id` text NOT NULL,
    `borrower_number` text NOT NULL,
    `first_name` text NOT NULL,
    `middle_name` text,
    `last_name` text NOT NULL,
    `suffix` text,
    `birth_date` text,
    `gender` text NOT NULL,
    `contact_number` text NOT NULL,
    `secondary_contact_number` text,
    `email` text,
    `normalized_contact_number` text NOT NULL,
    `normalized_secondary_contact_number` text,
    `normalized_email` text,
    `normalized_full_name` text NOT NULL,
    `address_line` text NOT NULL,
    `barangay` text NOT NULL,
    `city_municipality` text NOT NULL,
    `province` text NOT NULL,
    `postal_code` text,
    `emergency_contact_name` text,
    `emergency_contact_number` text,
    `emergency_contact_relationship` text,
    `status` text DEFAULT 'ACTIVE' NOT NULL,
    `system_payment_tag` text DEFAULT 'GOOD_PAYER' NOT NULL,
    `payment_tag` text DEFAULT 'GOOD_PAYER' NOT NULL,
    `payment_tag_source` text DEFAULT 'SYSTEM' NOT NULL,
    `payment_tag_updated_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
    `payment_tag_override_reason` text,
    `payment_tag_override_by_user_id` text,
    `payment_tag_override_at` integer,
    `notes` text,
    `archived_at` integer,
    `archived_by_user_id` text,
    `idempotency_key` text,
    `created_by_user_id` text NOT NULL,
    `updated_by_user_id` text NOT NULL,
    `created_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
    `updated_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
    CONSTRAINT `borrower_organization_id_id_unique` UNIQUE(`organization_id`, `id`),
    CONSTRAINT `borrower_organization_id_public_id_unique` UNIQUE(`organization_id`, `public_id`),
    CONSTRAINT `borrower_organization_id_borrower_number_unique` UNIQUE(`organization_id`, `borrower_number`),
    CONSTRAINT `borrower_organization_id_idempotency_key_unique` UNIQUE(`organization_id`, `idempotency_key`),
    CONSTRAINT `borrower_fk_organization` FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT `borrower_fk_created_by_member` FOREIGN KEY (`organization_id`, `created_by_user_id`) REFERENCES `member`(`organization_id`, `user_id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT `borrower_fk_updated_by_member` FOREIGN KEY (`organization_id`, `updated_by_user_id`) REFERENCES `member`(`organization_id`, `user_id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT `borrower_fk_payment_tag_override_by_member` FOREIGN KEY (`organization_id`, `payment_tag_override_by_user_id`) REFERENCES `member`(`organization_id`, `user_id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT `borrower_fk_archived_by_member` FOREIGN KEY (`organization_id`, `archived_by_user_id`) REFERENCES `member`(`organization_id`, `user_id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT `borrower_check_borrower_number` CHECK(length(trim(`borrower_number`)) > 0),
    CONSTRAINT `borrower_check_names` CHECK(length(trim(`first_name`)) > 0),
    CONSTRAINT `borrower_check_birth_date` CHECK(`birth_date` IS NULL OR (length(`birth_date`) = 10 AND `birth_date` GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]')),
    CONSTRAINT `borrower_check_normalized_contact` CHECK(length(trim(`normalized_contact_number`)) > 0),
    CONSTRAINT `borrower_check_normalized_secondary_contact` CHECK(`normalized_secondary_contact_number` IS NULL OR length(trim(`normalized_secondary_contact_number`)) > 0),
    CONSTRAINT `borrower_check_normalized_email` CHECK(`normalized_email` IS NULL OR `normalized_email` = LOWER(`normalized_email`)),
    CONSTRAINT `borrower_check_normalized_full_name` CHECK(length(trim(`normalized_full_name`)) > 0),
    CONSTRAINT `borrower_check_status` CHECK(`status` IN ('ACTIVE', 'INACTIVE', 'BLOCKED', 'ARCHIVED')),
    CONSTRAINT `borrower_check_payment_tag` CHECK(`system_payment_tag` IN ('GOOD_PAYER', 'BAD_PAYER', 'SCAMMER') AND `payment_tag` IN ('GOOD_PAYER', 'BAD_PAYER', 'SCAMMER')),
    CONSTRAINT `borrower_check_payment_tag_source` CHECK((`payment_tag_source` = 'SYSTEM' AND `payment_tag` = `system_payment_tag` AND `payment_tag_override_reason` IS NULL AND `payment_tag_override_by_user_id` IS NULL AND `payment_tag_override_at` IS NULL) OR (`payment_tag_source` = 'MANUAL_OVERRIDE' AND length(trim(`payment_tag_override_reason`)) > 0 AND `payment_tag_override_by_user_id` IS NOT NULL AND `payment_tag_override_at` IS NOT NULL)),
    CONSTRAINT `borrower_check_archived` CHECK((`status` = 'ARCHIVED' AND `archived_at` IS NOT NULL AND `archived_by_user_id` IS NOT NULL) OR (`status` <> 'ARCHIVED' AND `archived_at` IS NULL AND `archived_by_user_id` IS NULL))
);
CREATE TABLE `borrower_document` (
    `id` integer PRIMARY KEY AUTOINCREMENT,
    `public_id` text NOT NULL,
    `organization_id` text NOT NULL,
    `borrower_id` integer NOT NULL,
    `document_type` text NOT NULL,
    `document_number` text,
    `normalized_document_number` text,
    `object_storage_id` text NOT NULL,
    `issued_date` text,
    `expiration_date` text,
    `notes` text,
    `created_by_user_id` text NOT NULL,
    `created_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
    CONSTRAINT `borrower_document_organization_id_public_id_unique` UNIQUE(`organization_id`, `public_id`),
    CONSTRAINT `borrower_document_fk_borrower` FOREIGN KEY (`organization_id`, `borrower_id`) REFERENCES `borrower`(`organization_id`, `id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT `borrower_document_fk_object_storage` FOREIGN KEY (`organization_id`, `object_storage_id`) REFERENCES `object_storage`(`organization_id`, `id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT `borrower_document_fk_created_by_member` FOREIGN KEY (`organization_id`, `created_by_user_id`) REFERENCES `member`(`organization_id`, `user_id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT `borrower_document_check_type` CHECK(`document_type` IN ('VALID_ID', 'BORROWER_PHOTO', 'PROOF_OF_ADDRESS', 'SUPPORTING_DOCUMENT')),
    CONSTRAINT `borrower_document_check_normalized_number` CHECK((`document_number` IS NULL AND `normalized_document_number` IS NULL) OR (`document_number` IS NOT NULL AND `normalized_document_number` IS NOT NULL AND length(trim(`normalized_document_number`)) > 0)),
    CONSTRAINT `borrower_document_check_issued_date` CHECK(`issued_date` IS NULL OR (length(`issued_date`) = 10 AND `issued_date` GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]')),
    CONSTRAINT `borrower_document_check_expiration_date` CHECK(`expiration_date` IS NULL OR (length(`expiration_date`) = 10 AND `expiration_date` GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]')),
    CONSTRAINT `borrower_document_check_date_order` CHECK(`issued_date` IS NULL OR `expiration_date` IS NULL OR `issued_date` <= `expiration_date`)
);
CREATE TABLE `borrower_payment_tag_history` (
    `id` integer PRIMARY KEY AUTOINCREMENT,
    `public_id` text NOT NULL,
    `organization_id` text NOT NULL,
    `borrower_id` integer NOT NULL,
    `payment_tag` text NOT NULL,
    `payment_tag_source` text NOT NULL,
    `override_reason` text,
    `changed_by_user_id` text,
    `changed_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
    CONSTRAINT `borrower_payment_tag_history_organization_id_public_id_unique` UNIQUE(`organization_id`, `public_id`),
    CONSTRAINT `borrower_payment_tag_history_fk_borrower` FOREIGN KEY (`organization_id`, `borrower_id`) REFERENCES `borrower`(`organization_id`, `id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT `borrower_payment_tag_history_fk_changed_by_member` FOREIGN KEY (`organization_id`, `changed_by_user_id`) REFERENCES `member`(`organization_id`, `user_id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT `borrower_payment_tag_history_check_tag` CHECK(`payment_tag` IN ('GOOD_PAYER', 'BAD_PAYER', 'SCAMMER')),
    CONSTRAINT `borrower_payment_tag_history_check_source` CHECK((`payment_tag_source` = 'SYSTEM' AND `override_reason` IS NULL) OR (`payment_tag_source` = 'MANUAL_OVERRIDE' AND length(trim(`override_reason`)) > 0 AND `changed_by_user_id` IS NOT NULL))
);
CREATE INDEX `borrower_idx_list` ON `borrower` (`organization_id`, `status`, `created_at` DESC, `id`);
CREATE INDEX `borrower_idx_payment_tag` ON `borrower` (`organization_id`, `payment_tag`, `id`);
CREATE INDEX `borrower_idx_duplicate_contact` ON `borrower` (`organization_id`, `normalized_contact_number`, `id`);
CREATE INDEX `borrower_idx_duplicate_secondary_contact` ON `borrower` (`organization_id`, `normalized_secondary_contact_number`, `id`);
CREATE INDEX `borrower_idx_duplicate_email` ON `borrower` (`organization_id`, `normalized_email`, `id`);
CREATE INDEX `borrower_idx_duplicate_name_birth_date` ON `borrower` (`organization_id`, `normalized_full_name`, `birth_date`, `id`);
CREATE INDEX `borrower_document_idx_borrower` ON `borrower_document` (`organization_id`, `borrower_id`, `created_at` DESC, `id`);
CREATE INDEX `borrower_document_idx_duplicate_number` ON `borrower_document` (`organization_id`, `document_type`, `normalized_document_number`, `id`);
CREATE INDEX `borrower_payment_tag_history_idx_borrower` ON `borrower_payment_tag_history` (`organization_id`, `borrower_id`, `changed_at` DESC, `id`);
--> statement-breakpoint
-- Borrower constraints
PRAGMA defer_foreign_keys = ON;
CREATE TABLE `borrower_upgrade` (
    `id` integer PRIMARY KEY AUTOINCREMENT,
    `public_id` text NOT NULL,
    `organization_id` text NOT NULL,
    `borrower_number` text NOT NULL,
    `first_name` text NOT NULL,
    `middle_name` text,
    `last_name` text NOT NULL,
    `suffix` text,
    `birth_date` text,
    `gender` text NOT NULL,
    `contact_number` text NOT NULL,
    `secondary_contact_number` text,
    `email` text,
    `normalized_contact_number` text NOT NULL,
    `normalized_secondary_contact_number` text,
    `normalized_email` text,
    `normalized_full_name` text NOT NULL,
    `address_line` text NOT NULL,
    `barangay` text NOT NULL,
    `city_municipality` text NOT NULL,
    `province` text NOT NULL,
    `postal_code` text,
    `emergency_contact_name` text,
    `emergency_contact_number` text,
    `emergency_contact_relationship` text,
    `status` text DEFAULT 'ACTIVE' NOT NULL,
    `system_payment_tag` text DEFAULT 'GOOD_PAYER' NOT NULL,
    `payment_tag` text DEFAULT 'GOOD_PAYER' NOT NULL,
    `payment_tag_source` text DEFAULT 'SYSTEM' NOT NULL,
    `payment_tag_updated_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
    `payment_tag_override_reason` text,
    `payment_tag_override_by_user_id` text,
    `payment_tag_override_at` integer,
    `notes` text,
    `archived_at` integer,
    `archived_by_user_id` text,
    `idempotency_key` text,
    `created_by_user_id` text NOT NULL,
    `updated_by_user_id` text NOT NULL,
    `created_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
    `updated_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
    CONSTRAINT `borrower_organization_id_id_unique` UNIQUE(`organization_id`, `id`),
    CONSTRAINT `borrower_organization_id_public_id_unique` UNIQUE(`organization_id`, `public_id`),
    CONSTRAINT `borrower_organization_id_borrower_number_unique` UNIQUE(`organization_id`, `borrower_number`),
    CONSTRAINT `borrower_organization_id_idempotency_key_unique` UNIQUE(`organization_id`, `idempotency_key`),
    CONSTRAINT `borrower_fk_organization` FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT `borrower_fk_created_by_member` FOREIGN KEY (`organization_id`, `created_by_user_id`) REFERENCES `member`(`organization_id`, `user_id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT `borrower_fk_updated_by_member` FOREIGN KEY (`organization_id`, `updated_by_user_id`) REFERENCES `member`(`organization_id`, `user_id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT `borrower_fk_payment_tag_override_by_member` FOREIGN KEY (`organization_id`, `payment_tag_override_by_user_id`) REFERENCES `member`(`organization_id`, `user_id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT `borrower_fk_archived_by_member` FOREIGN KEY (`organization_id`, `archived_by_user_id`) REFERENCES `member`(`organization_id`, `user_id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT `borrower_check_borrower_number` CHECK(length(trim(`borrower_number`)) > 0),
    CONSTRAINT `borrower_check_names` CHECK(length(trim(`first_name`)) > 0),
    CONSTRAINT `borrower_check_birth_date` CHECK(`birth_date` IS NULL OR (length(`birth_date`) = 10 AND `birth_date` GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]')),
    CONSTRAINT `borrower_check_gender` CHECK(`gender` IN ('MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY')),
    CONSTRAINT `borrower_check_normalized_contact` CHECK(length(trim(`normalized_contact_number`)) > 0),
    CONSTRAINT `borrower_check_normalized_secondary_contact` CHECK(`normalized_secondary_contact_number` IS NULL OR length(trim(`normalized_secondary_contact_number`)) > 0),
    CONSTRAINT `borrower_check_normalized_email` CHECK(`normalized_email` IS NULL OR `normalized_email` = LOWER(`normalized_email`)),
    CONSTRAINT `borrower_check_normalized_full_name` CHECK(length(trim(`normalized_full_name`)) > 0),
    CONSTRAINT `borrower_check_status` CHECK(`status` IN ('ACTIVE', 'INACTIVE', 'BLOCKED', 'ARCHIVED')),
    CONSTRAINT `borrower_check_payment_tag` CHECK(`system_payment_tag` IN ('GOOD_PAYER', 'BAD_PAYER', 'SCAMMER') AND `payment_tag` IN ('GOOD_PAYER', 'BAD_PAYER', 'SCAMMER')),
    CONSTRAINT `borrower_check_payment_tag_source` CHECK((`payment_tag_source` = 'SYSTEM' AND `payment_tag` = `system_payment_tag` AND `payment_tag_override_reason` IS NULL AND `payment_tag_override_by_user_id` IS NULL AND `payment_tag_override_at` IS NULL) OR (`payment_tag_source` = 'MANUAL_OVERRIDE' AND length(trim(`payment_tag_override_reason`)) > 0 AND `payment_tag_override_by_user_id` IS NOT NULL AND `payment_tag_override_at` IS NOT NULL)),
    CONSTRAINT `borrower_check_archived` CHECK((`status` = 'ARCHIVED' AND `archived_at` IS NOT NULL AND `archived_by_user_id` IS NOT NULL) OR (`status` <> 'ARCHIVED' AND `archived_at` IS NULL AND `archived_by_user_id` IS NULL))
);
INSERT INTO `borrower_upgrade` (
    `id`, `public_id`, `organization_id`, `borrower_number`, `first_name`,
    `middle_name`, `last_name`, `suffix`, `birth_date`, `gender`,
    `contact_number`, `secondary_contact_number`, `email`,
    `normalized_contact_number`, `normalized_secondary_contact_number`,
    `normalized_email`, `normalized_full_name`, `address_line`, `barangay`,
    `city_municipality`, `province`, `postal_code`, `emergency_contact_name`,
    `emergency_contact_number`, `emergency_contact_relationship`, `status`,
    `system_payment_tag`, `payment_tag`, `payment_tag_source`,
    `payment_tag_updated_at`, `payment_tag_override_reason`,
    `payment_tag_override_by_user_id`, `payment_tag_override_at`, `notes`,
    `archived_at`, `archived_by_user_id`, `idempotency_key`,
    `created_by_user_id`, `updated_by_user_id`, `created_at`, `updated_at`
)
SELECT
    `id`, `public_id`, `organization_id`, `borrower_number`, `first_name`,
    `middle_name`, `last_name`, `suffix`, `birth_date`, `gender`,
    `contact_number`, `secondary_contact_number`, `email`,
    `normalized_contact_number`, `normalized_secondary_contact_number`,
    `normalized_email`, `normalized_full_name`, `address_line`, `barangay`,
    `city_municipality`, `province`, `postal_code`, `emergency_contact_name`,
    `emergency_contact_number`, `emergency_contact_relationship`, `status`,
    `system_payment_tag`, `payment_tag`, `payment_tag_source`,
    `payment_tag_updated_at`, `payment_tag_override_reason`,
    `payment_tag_override_by_user_id`, `payment_tag_override_at`, `notes`,
    `archived_at`, `archived_by_user_id`, `idempotency_key`,
    `created_by_user_id`, `updated_by_user_id`, `created_at`, `updated_at`
FROM `borrower`;
DROP TABLE `borrower`;
ALTER TABLE `borrower_upgrade` RENAME TO `borrower`;
CREATE INDEX `borrower_idx_list` ON `borrower` (`organization_id`, `status`, `created_at` DESC, `id`);
CREATE INDEX `borrower_idx_payment_tag` ON `borrower` (`organization_id`, `payment_tag`, `id`);
CREATE INDEX `borrower_idx_duplicate_contact` ON `borrower` (`organization_id`, `normalized_contact_number`, `id`);
CREATE INDEX `borrower_idx_duplicate_secondary_contact` ON `borrower` (`organization_id`, `normalized_secondary_contact_number`, `id`);
CREATE INDEX `borrower_idx_duplicate_email` ON `borrower` (`organization_id`, `normalized_email`, `id`);
CREATE INDEX `borrower_idx_duplicate_name_birth_date` ON `borrower` (`organization_id`, `normalized_full_name`, `birth_date`, `id`);
ALTER TABLE `borrower_document` ADD COLUMN `idempotency_key` text;
CREATE UNIQUE INDEX `borrower_document_organization_id_idempotency_key_unique` ON `borrower_document` (`organization_id`, `idempotency_key`);
--> statement-breakpoint
-- Loan origination
CREATE UNIQUE INDEX `loan_formula_profile_organization_id_id_unique` ON `loan_formula_profile` (`organization_id`, `id`);
CREATE TABLE `loan_product` (
    `id` integer PRIMARY KEY AUTOINCREMENT,
    `public_id` text NOT NULL,
    `organization_id` text NOT NULL,
    `formula_profile_id` integer NOT NULL,
    `name` text NOT NULL,
    `is_active` integer DEFAULT true NOT NULL,
    `interest_method` text NOT NULL,
    `interest_rate_basis_points` integer DEFAULT 0 NOT NULL,
    `fixed_interest_amount_minor` integer,
    `term_days` integer NOT NULL,
    `payment_frequency` text NOT NULL,
    `installment_count` integer NOT NULL,
    `timezone` text DEFAULT 'Asia/Manila' NOT NULL,
    `rounding_mode` text NOT NULL,
    `final_installment_residue_policy` text NOT NULL,
    `renewal_settlement_method` text NOT NULL,
    `partial_credit_policy` text NOT NULL,
    `min_completed_installments` integer DEFAULT 0 NOT NULL,
    `allow_renewal_principal_change` integer DEFAULT false NOT NULL,
    `minimum_principal_amount_minor` integer NOT NULL,
    `maximum_principal_amount_minor` integer NOT NULL,
    `idempotency_key` text,
    `created_by_user_id` text NOT NULL,
    `updated_by_user_id` text NOT NULL,
    `created_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
    `updated_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
    CONSTRAINT `loan_product_organization_id_id_unique` UNIQUE(`organization_id`, `id`),
    CONSTRAINT `loan_product_organization_id_public_id_unique` UNIQUE(`organization_id`, `public_id`),
    CONSTRAINT `loan_product_organization_id_idempotency_key_unique` UNIQUE(`organization_id`, `idempotency_key`),
    CONSTRAINT `loan_product_fk_organization` FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT `loan_product_fk_formula_profile` FOREIGN KEY (`organization_id`, `formula_profile_id`) REFERENCES `loan_formula_profile`(`organization_id`, `id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT `loan_product_fk_created_by_member` FOREIGN KEY (`organization_id`, `created_by_user_id`) REFERENCES `member`(`organization_id`, `user_id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT `loan_product_fk_updated_by_member` FOREIGN KEY (`organization_id`, `updated_by_user_id`) REFERENCES `member`(`organization_id`, `user_id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT `loan_product_check_name` CHECK(length(trim(`name`)) > 0),
    CONSTRAINT `loan_product_check_interest` CHECK((`interest_method` = 'FLAT_PERCENTAGE' AND `interest_rate_basis_points` >= 0 AND `fixed_interest_amount_minor` IS NULL) OR (`interest_method` = 'FIXED_AMOUNT' AND `interest_rate_basis_points` = 0 AND `fixed_interest_amount_minor` IS NOT NULL AND `fixed_interest_amount_minor` >= 0)),
    CONSTRAINT `loan_product_check_term_days` CHECK(`term_days` > 0),
    CONSTRAINT `loan_product_check_payment_frequency` CHECK(`payment_frequency` IN ('DAILY', 'WEEKLY', 'MONTHLY')),
    CONSTRAINT `loan_product_check_installment_count` CHECK(`installment_count` > 0),
    CONSTRAINT `loan_product_check_timezone` CHECK(`timezone` = 'Asia/Manila'),
    CONSTRAINT `loan_product_check_rounding_mode` CHECK(`rounding_mode` IN ('HALF_UP', 'DOWN', 'UP')),
    CONSTRAINT `loan_product_check_final_installment_residue_policy` CHECK(`final_installment_residue_policy` = 'LAST_INSTALLMENT_ABSORBS_RESIDUE'),
    CONSTRAINT `loan_product_check_renewal_settlement_method` CHECK(`renewal_settlement_method` IN ('COMPLETED_INSTALLMENT_BALANCE', 'EXACT_OUTSTANDING_BALANCE')),
    CONSTRAINT `loan_product_check_partial_credit_policy` CHECK(`partial_credit_policy` IN ('CARRY_FORWARD', 'APPLY_TO_SETTLEMENT', 'REFUND', 'MANUAL_REVIEW')),
    CONSTRAINT `loan_product_check_min_completed_installments` CHECK(`min_completed_installments` >= 0 AND `min_completed_installments` <= `installment_count`),
    CONSTRAINT `loan_product_check_principal_range` CHECK(`minimum_principal_amount_minor` > 0 AND `maximum_principal_amount_minor` >= `minimum_principal_amount_minor`)
);
CREATE TABLE `loan` (
    `id` integer PRIMARY KEY AUTOINCREMENT,
    `public_id` text NOT NULL,
    `organization_id` text NOT NULL,
    `loan_number` text NOT NULL,
    `borrower_id` integer NOT NULL,
    `loan_product_id` integer NOT NULL,
    `formula_profile_id` integer NOT NULL,
    `loan_product_name_snapshot` text NOT NULL,
    `formula_profile_name_snapshot` text NOT NULL,
    `formula_profile_version_snapshot` integer NOT NULL,
    `interest_method` text NOT NULL,
    `interest_rate_basis_points` integer DEFAULT 0 NOT NULL,
    `fixed_interest_amount_minor` integer,
    `principal_amount_minor` integer NOT NULL,
    `minimum_principal_amount_minor_snapshot` integer NOT NULL,
    `maximum_principal_amount_minor_snapshot` integer NOT NULL,
    `interest_amount_minor` integer NOT NULL,
    `total_payable_amount_minor` integer NOT NULL,
    `term_days` integer NOT NULL,
    `payment_frequency` text NOT NULL,
    `installment_count` integer NOT NULL,
    `installment_amount_minor` integer NOT NULL,
    `daily_payment_amount_minor` integer NOT NULL,
    `timezone` text DEFAULT 'Asia/Manila' NOT NULL,
    `rounding_mode` text NOT NULL,
    `final_installment_residue_policy` text NOT NULL,
    `renewal_settlement_method` text NOT NULL,
    `partial_credit_policy` text NOT NULL,
    `min_completed_installments` integer DEFAULT 0 NOT NULL,
    `allow_renewal_principal_change` integer DEFAULT false NOT NULL,
    `release_date` text,
    `first_payment_date` text NOT NULL,
    `expected_completion_date` text NOT NULL,
    `total_amount_paid_minor` integer DEFAULT 0 NOT NULL,
    `completed_installment_count` integer DEFAULT 0 NOT NULL,
    `partial_payment_credit_minor` integer DEFAULT 0 NOT NULL,
    `actual_outstanding_balance_minor` integer NOT NULL,
    `status` text DEFAULT 'DRAFT' NOT NULL,
    `create_idempotency_key` text,
    `release_idempotency_key` text,
    `created_by_user_id` text NOT NULL,
    `updated_by_user_id` text NOT NULL,
    `approved_by_user_id` text,
    `approved_at` integer,
    `released_by_user_id` text,
    `released_at` integer,
    `created_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
    `updated_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
    CONSTRAINT `loan_organization_id_id_unique` UNIQUE(`organization_id`, `id`),
    CONSTRAINT `loan_organization_id_public_id_unique` UNIQUE(`organization_id`, `public_id`),
    CONSTRAINT `loan_organization_id_loan_number_unique` UNIQUE(`organization_id`, `loan_number`),
    CONSTRAINT `loan_organization_id_create_idempotency_key_unique` UNIQUE(`organization_id`, `create_idempotency_key`),
    CONSTRAINT `loan_organization_id_release_idempotency_key_unique` UNIQUE(`organization_id`, `release_idempotency_key`),
    CONSTRAINT `loan_fk_organization` FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT `loan_fk_borrower` FOREIGN KEY (`organization_id`, `borrower_id`) REFERENCES `borrower`(`organization_id`, `id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT `loan_fk_product` FOREIGN KEY (`organization_id`, `loan_product_id`) REFERENCES `loan_product`(`organization_id`, `id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT `loan_fk_formula_profile` FOREIGN KEY (`organization_id`, `formula_profile_id`) REFERENCES `loan_formula_profile`(`organization_id`, `id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT `loan_fk_created_by_member` FOREIGN KEY (`organization_id`, `created_by_user_id`) REFERENCES `member`(`organization_id`, `user_id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT `loan_fk_updated_by_member` FOREIGN KEY (`organization_id`, `updated_by_user_id`) REFERENCES `member`(`organization_id`, `user_id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT `loan_fk_approved_by_member` FOREIGN KEY (`organization_id`, `approved_by_user_id`) REFERENCES `member`(`organization_id`, `user_id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT `loan_fk_released_by_member` FOREIGN KEY (`organization_id`, `released_by_user_id`) REFERENCES `member`(`organization_id`, `user_id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT `loan_check_loan_number` CHECK(length(trim(`loan_number`)) > 0),
    CONSTRAINT `loan_check_snapshot_names` CHECK(length(trim(`loan_product_name_snapshot`)) > 0 AND length(trim(`formula_profile_name_snapshot`)) > 0 AND `formula_profile_version_snapshot` > 0),
    CONSTRAINT `loan_check_interest` CHECK((`interest_method` = 'FLAT_PERCENTAGE' AND `interest_rate_basis_points` >= 0 AND `fixed_interest_amount_minor` IS NULL) OR (`interest_method` = 'FIXED_AMOUNT' AND `interest_rate_basis_points` = 0 AND `fixed_interest_amount_minor` IS NOT NULL AND `fixed_interest_amount_minor` >= 0)),
    CONSTRAINT `loan_check_principal_range` CHECK(`minimum_principal_amount_minor_snapshot` > 0 AND `maximum_principal_amount_minor_snapshot` >= `minimum_principal_amount_minor_snapshot` AND `principal_amount_minor` >= `minimum_principal_amount_minor_snapshot` AND `principal_amount_minor` <= `maximum_principal_amount_minor_snapshot`),
    CONSTRAINT `loan_check_amounts` CHECK(`interest_amount_minor` >= 0 AND `total_payable_amount_minor` = `principal_amount_minor` + `interest_amount_minor` AND `installment_amount_minor` > 0 AND `daily_payment_amount_minor` > 0 AND `total_amount_paid_minor` >= 0 AND `partial_payment_credit_minor` >= 0 AND `actual_outstanding_balance_minor` >= 0 AND `actual_outstanding_balance_minor` = `total_payable_amount_minor` - `total_amount_paid_minor`),
    CONSTRAINT `loan_check_term_days` CHECK(`term_days` > 0),
    CONSTRAINT `loan_check_payment_frequency` CHECK(`payment_frequency` IN ('DAILY', 'WEEKLY', 'MONTHLY')),
    CONSTRAINT `loan_check_installment_count` CHECK(`installment_count` > 0),
    CONSTRAINT `loan_check_completed_installment_count` CHECK(`completed_installment_count` >= 0 AND `completed_installment_count` <= `installment_count`),
    CONSTRAINT `loan_check_timezone` CHECK(`timezone` = 'Asia/Manila'),
    CONSTRAINT `loan_check_rounding_mode` CHECK(`rounding_mode` IN ('HALF_UP', 'DOWN', 'UP')),
    CONSTRAINT `loan_check_final_installment_residue_policy` CHECK(`final_installment_residue_policy` = 'LAST_INSTALLMENT_ABSORBS_RESIDUE'),
    CONSTRAINT `loan_check_renewal_settlement_method` CHECK(`renewal_settlement_method` IN ('COMPLETED_INSTALLMENT_BALANCE', 'EXACT_OUTSTANDING_BALANCE')),
    CONSTRAINT `loan_check_partial_credit_policy` CHECK(`partial_credit_policy` IN ('CARRY_FORWARD', 'APPLY_TO_SETTLEMENT', 'REFUND', 'MANUAL_REVIEW')),
    CONSTRAINT `loan_check_min_completed_installments` CHECK(`min_completed_installments` >= 0 AND `min_completed_installments` <= `installment_count`),
    CONSTRAINT `loan_check_dates` CHECK(length(`first_payment_date`) = 10 AND `first_payment_date` GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND length(`expected_completion_date`) = 10 AND `expected_completion_date` GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND (`release_date` IS NULL OR (length(`release_date`) = 10 AND `release_date` GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'))),
    CONSTRAINT `loan_check_approval_actor` CHECK((`approved_by_user_id` IS NULL AND `approved_at` IS NULL) OR (`approved_by_user_id` IS NOT NULL AND `approved_at` IS NOT NULL)),
    CONSTRAINT `loan_check_release_actor` CHECK((`released_by_user_id` IS NULL AND `released_at` IS NULL AND `release_date` IS NULL) OR (`released_by_user_id` IS NOT NULL AND `released_at` IS NOT NULL AND `release_date` IS NOT NULL)),
    CONSTRAINT `loan_check_status` CHECK(`status` IN ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'ACTIVE', 'OVERDUE', 'RENEWED', 'FULLY_PAID', 'CANCELLED', 'WRITTEN_OFF')),
    CONSTRAINT `loan_check_lifecycle` CHECK((`status` IN ('DRAFT', 'PENDING_APPROVAL', 'CANCELLED') AND `approved_by_user_id` IS NULL AND `approved_at` IS NULL AND `released_by_user_id` IS NULL AND `released_at` IS NULL AND `release_date` IS NULL) OR (`status` = 'APPROVED' AND `approved_by_user_id` IS NOT NULL AND `approved_at` IS NOT NULL AND `released_by_user_id` IS NULL AND `released_at` IS NULL AND `release_date` IS NULL) OR (`status` IN ('ACTIVE', 'OVERDUE', 'RENEWED', 'FULLY_PAID', 'WRITTEN_OFF') AND `approved_by_user_id` IS NOT NULL AND `approved_at` IS NOT NULL AND `released_by_user_id` IS NOT NULL AND `released_at` IS NOT NULL AND `release_date` IS NOT NULL))
);
CREATE TABLE `loan_installment` (
    `id` integer PRIMARY KEY AUTOINCREMENT,
    `public_id` text NOT NULL,
    `organization_id` text NOT NULL,
    `loan_id` integer NOT NULL,
    `installment_number` integer NOT NULL,
    `payment_frequency` text NOT NULL,
    `period_start` text NOT NULL,
    `period_end` text NOT NULL,
    `due_date` text NOT NULL,
    `amount_due_minor` integer NOT NULL,
    `amount_paid_minor` integer DEFAULT 0 NOT NULL,
    `paid_at` integer,
    `status` text DEFAULT 'UPCOMING' NOT NULL,
    CONSTRAINT `loan_installment_organization_id_public_id_unique` UNIQUE(`organization_id`, `public_id`),
    CONSTRAINT `loan_installment_organization_id_loan_id_number_unique` UNIQUE(`organization_id`, `loan_id`, `installment_number`),
    CONSTRAINT `loan_installment_fk_loan` FOREIGN KEY (`organization_id`, `loan_id`) REFERENCES `loan`(`organization_id`, `id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT `loan_installment_check_number` CHECK(`installment_number` > 0),
    CONSTRAINT `loan_installment_check_payment_frequency` CHECK(`payment_frequency` IN ('DAILY', 'WEEKLY', 'MONTHLY')),
    CONSTRAINT `loan_installment_check_dates` CHECK(length(`period_start`) = 10 AND `period_start` GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND length(`period_end`) = 10 AND `period_end` GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND length(`due_date`) = 10 AND `due_date` GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND `period_start` <= `period_end` AND `period_end` <= `due_date`),
    CONSTRAINT `loan_installment_check_amounts` CHECK(`amount_due_minor` > 0 AND `amount_paid_minor` >= 0 AND `amount_paid_minor` <= `amount_due_minor`),
    CONSTRAINT `loan_installment_check_status` CHECK(`status` IN ('UPCOMING', 'PARTIAL', 'PAID', 'OVERDUE', 'WAIVED')),
    CONSTRAINT `loan_installment_check_payment_state` CHECK((`status` IN ('UPCOMING', 'OVERDUE', 'WAIVED') AND `paid_at` IS NULL) OR (`status` = 'PARTIAL' AND `amount_paid_minor` > 0 AND `amount_paid_minor` < `amount_due_minor` AND `paid_at` IS NOT NULL) OR (`status` = 'PAID' AND `amount_paid_minor` = `amount_due_minor` AND `paid_at` IS NOT NULL))
);
CREATE TABLE `cash_transaction` (
    `id` integer PRIMARY KEY AUTOINCREMENT,
    `public_id` text NOT NULL,
    `organization_id` text NOT NULL,
    `transaction_number` text NOT NULL,
    `transaction_type` text NOT NULL,
    `direction` text NOT NULL,
    `borrower_id` integer NOT NULL,
    `loan_id` integer NOT NULL,
    `amount_minor` integer NOT NULL,
    `transaction_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
    `idempotency_key` text,
    `notes` text,
    `created_by_user_id` text NOT NULL,
    `created_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
    CONSTRAINT `cash_transaction_organization_id_public_id_unique` UNIQUE(`organization_id`, `public_id`),
    CONSTRAINT `cash_transaction_organization_id_transaction_number_unique` UNIQUE(`organization_id`, `transaction_number`),
    CONSTRAINT `cash_transaction_organization_id_idempotency_key_unique` UNIQUE(`organization_id`, `idempotency_key`),
    CONSTRAINT `cash_transaction_organization_id_loan_id_type_unique` UNIQUE(`organization_id`, `loan_id`, `transaction_type`),
    CONSTRAINT `cash_transaction_fk_organization` FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT `cash_transaction_fk_borrower` FOREIGN KEY (`organization_id`, `borrower_id`) REFERENCES `borrower`(`organization_id`, `id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT `cash_transaction_fk_loan` FOREIGN KEY (`organization_id`, `loan_id`) REFERENCES `loan`(`organization_id`, `id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT `cash_transaction_fk_created_by_member` FOREIGN KEY (`organization_id`, `created_by_user_id`) REFERENCES `member`(`organization_id`, `user_id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT `cash_transaction_check_number` CHECK(length(trim(`transaction_number`)) > 0),
    CONSTRAINT `cash_transaction_check_type_direction` CHECK(`transaction_type` = 'LOAN_RELEASE' AND `direction` = 'CASH_OUT'),
    CONSTRAINT `cash_transaction_check_amount` CHECK(`amount_minor` > 0)
);
CREATE INDEX `loan_product_idx_list` ON `loan_product` (`organization_id`, `is_active`, `updated_at` DESC, `id`);
CREATE INDEX `loan_idx_list` ON `loan` (`organization_id`, `status`, `created_at` DESC, `id`);
CREATE INDEX `loan_idx_borrower_history` ON `loan` (`organization_id`, `borrower_id`, `created_at` DESC, `id`);
CREATE INDEX `loan_installment_idx_schedule` ON `loan_installment` (`organization_id`, `loan_id`, `installment_number`);
CREATE INDEX `cash_transaction_idx_loan` ON `cash_transaction` (`organization_id`, `loan_id`, `transaction_at` DESC, `id`);
--> statement-breakpoint
-- Payment collections
CREATE UNIQUE INDEX `loan_installment_organization_id_id_unique` ON `loan_installment` (`organization_id`, `id`);
CREATE INDEX `loan_installment_idx_collections` ON `loan_installment` (`organization_id`, `due_date`, `status`, `id`);
CREATE TABLE `payment` (
    `id` integer PRIMARY KEY AUTOINCREMENT,
    `public_id` text NOT NULL,
    `organization_id` text NOT NULL,
    `payment_number` text NOT NULL,
    `borrower_id` integer NOT NULL,
    `loan_id` integer NOT NULL,
    `amount_received_minor` integer NOT NULL,
    `amount_allocated_minor` integer NOT NULL,
    `unallocated_minor` integer NOT NULL,
    `payment_type_snapshot` text NOT NULL,
    `payment_date` text NOT NULL,
    `payment_method` text NOT NULL,
    `reference_number` text,
    `notes` text,
    `partial_payment_credit_after_payment_minor` integer NOT NULL,
    `completed_installments_after_payment` integer NOT NULL,
    `remaining_installments_after_payment` integer NOT NULL,
    `actual_outstanding_balance_after_payment_minor` integer NOT NULL,
    `status` text DEFAULT 'POSTED' NOT NULL,
    `idempotency_key` text,
    `created_by_user_id` text NOT NULL,
    `created_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
    `reversed_by_user_id` text,
    `reversed_at` integer,
    `reversal_reason` text,
    CONSTRAINT `payment_organization_id_id_unique` UNIQUE(`organization_id`, `id`),
    CONSTRAINT `payment_organization_id_public_id_unique` UNIQUE(`organization_id`, `public_id`),
    CONSTRAINT `payment_organization_id_payment_number_unique` UNIQUE(`organization_id`, `payment_number`),
    CONSTRAINT `payment_organization_id_idempotency_key_unique` UNIQUE(`organization_id`, `idempotency_key`),
    CONSTRAINT `payment_fk_organization` FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT `payment_fk_borrower` FOREIGN KEY (`organization_id`, `borrower_id`) REFERENCES `borrower`(`organization_id`, `id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT `payment_fk_loan` FOREIGN KEY (`organization_id`, `loan_id`) REFERENCES `loan`(`organization_id`, `id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT `payment_fk_created_by_member` FOREIGN KEY (`organization_id`, `created_by_user_id`) REFERENCES `member`(`organization_id`, `user_id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT `payment_fk_reversed_by_member` FOREIGN KEY (`organization_id`, `reversed_by_user_id`) REFERENCES `member`(`organization_id`, `user_id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT `payment_check_number` CHECK(length(trim(`payment_number`)) > 0),
    CONSTRAINT `payment_check_amounts` CHECK(`amount_received_minor` > 0 AND `amount_allocated_minor` >= 0 AND `unallocated_minor` >= 0 AND `amount_received_minor` = `amount_allocated_minor` + `unallocated_minor`),
    CONSTRAINT `payment_check_type` CHECK(`payment_type_snapshot` IN ('DAILY', 'WEEKLY', 'MONTHLY')),
    CONSTRAINT `payment_check_date` CHECK(length(`payment_date`) = 10 AND `payment_date` GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
    CONSTRAINT `payment_check_method` CHECK(length(trim(`payment_method`)) > 0),
    CONSTRAINT `payment_check_post_payment_state` CHECK(`partial_payment_credit_after_payment_minor` >= 0 AND `completed_installments_after_payment` >= 0 AND `remaining_installments_after_payment` >= 0 AND `actual_outstanding_balance_after_payment_minor` >= 0),
    CONSTRAINT `payment_check_status` CHECK(`status` IN ('POSTED', 'REVERSED')),
    CONSTRAINT `payment_check_reversal` CHECK((`status` = 'POSTED' AND `reversed_by_user_id` IS NULL AND `reversed_at` IS NULL AND `reversal_reason` IS NULL) OR (`status` = 'REVERSED' AND `reversed_by_user_id` IS NOT NULL AND `reversed_at` IS NOT NULL AND length(trim(`reversal_reason`)) > 0))
);
CREATE INDEX `payment_idx_borrower_history` ON `payment` (`organization_id`, `borrower_id`, `payment_type_snapshot`, `payment_date` DESC, `id`);
CREATE INDEX `payment_idx_collections` ON `payment` (`organization_id`, `status`, `payment_date`, `id`);
CREATE TABLE `payment_allocation` (
    `id` integer PRIMARY KEY AUTOINCREMENT,
    `organization_id` text NOT NULL,
    `payment_id` integer NOT NULL,
    `loan_installment_id` integer NOT NULL,
    `allocated_amount_minor` integer NOT NULL,
    `amount_paid_before_minor` integer NOT NULL,
    `status_before` text NOT NULL,
    `paid_at_before` integer,
    `created_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
    `reversed_by_user_id` text,
    `reversed_at` integer,
    CONSTRAINT `payment_allocation_organization_id_payment_id_installment_id_unique` UNIQUE(`organization_id`, `payment_id`, `loan_installment_id`),
    CONSTRAINT `payment_allocation_fk_organization` FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT `payment_allocation_fk_payment` FOREIGN KEY (`organization_id`, `payment_id`) REFERENCES `payment`(`organization_id`, `id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT `payment_allocation_fk_loan_installment` FOREIGN KEY (`organization_id`, `loan_installment_id`) REFERENCES `loan_installment`(`organization_id`, `id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT `payment_allocation_fk_reversed_by_member` FOREIGN KEY (`organization_id`, `reversed_by_user_id`) REFERENCES `member`(`organization_id`, `user_id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT `payment_allocation_check_amount` CHECK(`allocated_amount_minor` > 0 AND `amount_paid_before_minor` >= 0),
    CONSTRAINT `payment_allocation_check_before_payment_state` CHECK((`status_before` IN ('UPCOMING', 'OVERDUE', 'WAIVED') AND `paid_at_before` IS NULL) OR (`status_before` IN ('PARTIAL', 'PAID') AND `paid_at_before` IS NOT NULL)),
    CONSTRAINT `payment_allocation_check_reversal` CHECK((`reversed_by_user_id` IS NULL AND `reversed_at` IS NULL) OR (`reversed_by_user_id` IS NOT NULL AND `reversed_at` IS NOT NULL))
);
DROP INDEX `cash_transaction_idx_loan`;
ALTER TABLE `cash_transaction` RENAME TO `cash_transaction_phase3`;
CREATE TABLE `cash_transaction` (
    `id` integer PRIMARY KEY AUTOINCREMENT,
    `public_id` text NOT NULL,
    `organization_id` text NOT NULL,
    `transaction_number` text NOT NULL,
    `transaction_type` text NOT NULL,
    `direction` text NOT NULL,
    `borrower_id` integer NOT NULL,
    `loan_id` integer NOT NULL,
    `payment_id` integer,
    `amount_minor` integer NOT NULL,
    `transaction_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
    `idempotency_key` text,
    `notes` text,
    `created_by_user_id` text NOT NULL,
    `created_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
    CONSTRAINT `cash_transaction_organization_id_public_id_unique` UNIQUE(`organization_id`, `public_id`),
    CONSTRAINT `cash_transaction_organization_id_transaction_number_unique` UNIQUE(`organization_id`, `transaction_number`),
    CONSTRAINT `cash_transaction_organization_id_idempotency_key_unique` UNIQUE(`organization_id`, `idempotency_key`),
    CONSTRAINT `cash_transaction_organization_id_payment_id_type_unique` UNIQUE(`organization_id`, `payment_id`, `transaction_type`),
    CONSTRAINT `cash_transaction_fk_organization` FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT `cash_transaction_fk_borrower` FOREIGN KEY (`organization_id`, `borrower_id`) REFERENCES `borrower`(`organization_id`, `id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT `cash_transaction_fk_loan` FOREIGN KEY (`organization_id`, `loan_id`) REFERENCES `loan`(`organization_id`, `id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT `cash_transaction_fk_payment` FOREIGN KEY (`organization_id`, `payment_id`) REFERENCES `payment`(`organization_id`, `id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT `cash_transaction_fk_created_by_member` FOREIGN KEY (`organization_id`, `created_by_user_id`) REFERENCES `member`(`organization_id`, `user_id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT `cash_transaction_check_number` CHECK(length(trim(`transaction_number`)) > 0),
    CONSTRAINT `cash_transaction_check_type_direction` CHECK((`transaction_type` = 'LOAN_RELEASE' AND `direction` = 'CASH_OUT' AND `payment_id` IS NULL) OR (`transaction_type` = 'PAYMENT_RECEIVED' AND `direction` = 'CASH_IN' AND `payment_id` IS NOT NULL) OR (`transaction_type` = 'PAYMENT_REVERSAL' AND `direction` = 'CASH_OUT' AND `payment_id` IS NOT NULL)),
    CONSTRAINT `cash_transaction_check_amount` CHECK(`amount_minor` > 0)
);
INSERT INTO `cash_transaction` (
    `id`, `public_id`, `organization_id`, `transaction_number`, `transaction_type`,
    `direction`, `borrower_id`, `loan_id`, `payment_id`, `amount_minor`,
    `transaction_at`, `idempotency_key`, `notes`, `created_by_user_id`, `created_at`
)
SELECT
    `id`, `public_id`, `organization_id`, `transaction_number`, `transaction_type`,
    `direction`, `borrower_id`, `loan_id`, NULL, `amount_minor`,
    `transaction_at`, `idempotency_key`, `notes`, `created_by_user_id`, `created_at`
FROM `cash_transaction_phase3`;
DROP TABLE `cash_transaction_phase3`;
CREATE UNIQUE INDEX `cash_transaction_unique_loan_release` ON `cash_transaction` (`organization_id`, `loan_id`) WHERE `transaction_type` = 'LOAN_RELEASE';
CREATE INDEX `cash_transaction_idx_loan` ON `cash_transaction` (`organization_id`, `loan_id`, `transaction_at` DESC, `id`);
--> statement-breakpoint
-- Loan renewals
CREATE TABLE `loan_renewal` (
    `id` integer PRIMARY KEY AUTOINCREMENT,
    `public_id` text NOT NULL,
    `organization_id` text NOT NULL,
    `borrower_id` integer NOT NULL,
    `old_loan_id` integer NOT NULL,
    `new_loan_id` integer,
    `previous_loan_number` text NOT NULL,
    `renewal_settlement_method` text NOT NULL,
    `partial_credit_handling` text NOT NULL,
    `previous_principal_amount_minor` integer NOT NULL,
    `previous_completed_installment_count` integer NOT NULL,
    `previous_remaining_installment_count` integer NOT NULL,
    `previous_partial_credit_minor` integer NOT NULL,
    `renewal_principal_amount_minor` integer NOT NULL,
    `renewal_settlement_balance_minor` integer NOT NULL,
    `cash_release_amount_minor` integer NOT NULL,
    `partial_credit_applied_to_settlement_minor` integer DEFAULT 0 NOT NULL,
    `partial_credit_carried_forward_minor` integer DEFAULT 0 NOT NULL,
    `partial_credit_refunded_minor` integer DEFAULT 0 NOT NULL,
    `manual_review_required` integer DEFAULT false NOT NULL,
    `manual_review_reason` text,
    `status` text DEFAULT 'PENDING_APPROVAL' NOT NULL,
    `idempotency_key` text,
    `processed_by_user_id` text NOT NULL,
    `processed_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
    `approved_by_user_id` text,
    `approved_at` integer,
    `released_by_user_id` text,
    `released_at` integer,
    `cancelled_by_user_id` text,
    `cancelled_at` integer,
    `cancellation_reason` text,
    `created_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
    `updated_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
    CONSTRAINT `loan_renewal_organization_id_id_unique` UNIQUE(`organization_id`, `id`),
    CONSTRAINT `loan_renewal_organization_id_public_id_unique` UNIQUE(`organization_id`, `public_id`),
    CONSTRAINT `loan_renewal_organization_id_old_loan_id_unique` UNIQUE(`organization_id`, `old_loan_id`),
    CONSTRAINT `loan_renewal_organization_id_new_loan_id_unique` UNIQUE(`organization_id`, `new_loan_id`),
    CONSTRAINT `loan_renewal_organization_id_idempotency_key_unique` UNIQUE(`organization_id`, `idempotency_key`),
    CONSTRAINT `loan_renewal_fk_organization` FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT `loan_renewal_fk_borrower` FOREIGN KEY (`organization_id`, `borrower_id`) REFERENCES `borrower`(`organization_id`, `id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT `loan_renewal_fk_old_loan` FOREIGN KEY (`organization_id`, `old_loan_id`) REFERENCES `loan`(`organization_id`, `id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT `loan_renewal_fk_new_loan` FOREIGN KEY (`organization_id`, `new_loan_id`) REFERENCES `loan`(`organization_id`, `id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT `loan_renewal_fk_processed_by_member` FOREIGN KEY (`organization_id`, `processed_by_user_id`) REFERENCES `member`(`organization_id`, `user_id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT `loan_renewal_fk_approved_by_member` FOREIGN KEY (`organization_id`, `approved_by_user_id`) REFERENCES `member`(`organization_id`, `user_id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT `loan_renewal_fk_released_by_member` FOREIGN KEY (`organization_id`, `released_by_user_id`) REFERENCES `member`(`organization_id`, `user_id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT `loan_renewal_fk_cancelled_by_member` FOREIGN KEY (`organization_id`, `cancelled_by_user_id`) REFERENCES `member`(`organization_id`, `user_id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT `loan_renewal_check_previous_loan_number` CHECK(length(trim(`previous_loan_number`)) > 0),
    CONSTRAINT `loan_renewal_check_settlement_method` CHECK(`renewal_settlement_method` IN ('COMPLETED_INSTALLMENT_BALANCE', 'EXACT_OUTSTANDING_BALANCE')),
    CONSTRAINT `loan_renewal_check_partial_credit_handling` CHECK(`partial_credit_handling` IN ('CARRY_FORWARD', 'APPLY_TO_SETTLEMENT', 'REFUND', 'MANUAL_REVIEW')),
    CONSTRAINT `loan_renewal_check_amounts` CHECK(`previous_principal_amount_minor` > 0 AND `previous_completed_installment_count` >= 0 AND `previous_remaining_installment_count` >= 0 AND `previous_partial_credit_minor` >= 0 AND `renewal_principal_amount_minor` > 0 AND `renewal_settlement_balance_minor` >= 0 AND `cash_release_amount_minor` >= 0 AND `partial_credit_applied_to_settlement_minor` >= 0 AND `partial_credit_carried_forward_minor` >= 0 AND `partial_credit_refunded_minor` >= 0),
    CONSTRAINT `loan_renewal_check_credit_handling_evidence` CHECK((`partial_credit_handling` = 'CARRY_FORWARD' AND `partial_credit_applied_to_settlement_minor` = 0 AND `partial_credit_carried_forward_minor` = `previous_partial_credit_minor` AND `partial_credit_refunded_minor` = 0 AND `manual_review_required` = FALSE) OR (`partial_credit_handling` = 'APPLY_TO_SETTLEMENT' AND `partial_credit_applied_to_settlement_minor` = `previous_partial_credit_minor` AND `partial_credit_carried_forward_minor` = 0 AND `partial_credit_refunded_minor` = 0 AND `manual_review_required` = FALSE) OR (`partial_credit_handling` = 'REFUND' AND `partial_credit_applied_to_settlement_minor` = 0 AND `partial_credit_carried_forward_minor` = 0 AND `partial_credit_refunded_minor` = `previous_partial_credit_minor` AND `manual_review_required` = FALSE) OR (`partial_credit_handling` = 'MANUAL_REVIEW' AND `partial_credit_applied_to_settlement_minor` = 0 AND `partial_credit_carried_forward_minor` = 0 AND `partial_credit_refunded_minor` = 0 AND `manual_review_required` = TRUE)),
    CONSTRAINT `loan_renewal_check_approval_actor_pair` CHECK((`approved_by_user_id` IS NULL AND `approved_at` IS NULL) OR (`approved_by_user_id` IS NOT NULL AND `approved_at` IS NOT NULL)),
    CONSTRAINT `loan_renewal_check_release_actor_pair` CHECK((`released_by_user_id` IS NULL AND `released_at` IS NULL) OR (`released_by_user_id` IS NOT NULL AND `released_at` IS NOT NULL)),
    CONSTRAINT `loan_renewal_check_cancellation` CHECK((`cancelled_by_user_id` IS NULL AND `cancelled_at` IS NULL AND `cancellation_reason` IS NULL) OR (`cancelled_by_user_id` IS NOT NULL AND `cancelled_at` IS NOT NULL AND length(trim(`cancellation_reason`)) > 0)),
    CONSTRAINT `loan_renewal_check_lifecycle` CHECK((`status` = 'PENDING_APPROVAL' AND `new_loan_id` IS NULL AND `approved_by_user_id` IS NULL AND `released_by_user_id` IS NULL AND `cancelled_by_user_id` IS NULL) OR (`status` = 'APPROVED' AND `new_loan_id` IS NULL AND `approved_by_user_id` IS NOT NULL AND `released_by_user_id` IS NULL AND `cancelled_by_user_id` IS NULL) OR (`status` = 'RELEASED' AND `new_loan_id` IS NOT NULL AND `approved_by_user_id` IS NOT NULL AND `released_by_user_id` IS NOT NULL AND `cancelled_by_user_id` IS NULL AND `manual_review_required` = FALSE) OR (`status` = 'CANCELLED' AND `new_loan_id` IS NULL AND `released_by_user_id` IS NULL AND `cancelled_by_user_id` IS NOT NULL))
);
CREATE INDEX `loan_renewal_idx_list` ON `loan_renewal` (`organization_id`, `status`, `processed_at` DESC, `id`);
CREATE INDEX `loan_renewal_idx_borrower` ON `loan_renewal` (`organization_id`, `borrower_id`, `processed_at` DESC, `id`);
DROP INDEX `cash_transaction_idx_loan`;
ALTER TABLE `cash_transaction` RENAME TO `cash_transaction_phase4`;
CREATE TABLE `cash_transaction` (
    `id` integer PRIMARY KEY AUTOINCREMENT,
    `public_id` text NOT NULL,
    `organization_id` text NOT NULL,
    `transaction_number` text NOT NULL,
    `transaction_type` text NOT NULL,
    `direction` text NOT NULL,
    `borrower_id` integer NOT NULL,
    `loan_id` integer NOT NULL,
    `payment_id` integer,
    `loan_renewal_id` integer,
    `amount_minor` integer NOT NULL,
    `transaction_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
    `idempotency_key` text,
    `notes` text,
    `created_by_user_id` text NOT NULL,
    `created_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
    CONSTRAINT `cash_transaction_organization_id_public_id_unique` UNIQUE(`organization_id`, `public_id`),
    CONSTRAINT `cash_transaction_organization_id_transaction_number_unique` UNIQUE(`organization_id`, `transaction_number`),
    CONSTRAINT `cash_transaction_organization_id_idempotency_key_unique` UNIQUE(`organization_id`, `idempotency_key`),
    CONSTRAINT `cash_transaction_organization_id_payment_id_type_unique` UNIQUE(`organization_id`, `payment_id`, `transaction_type`),
    CONSTRAINT `cash_transaction_fk_organization` FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT `cash_transaction_fk_borrower` FOREIGN KEY (`organization_id`, `borrower_id`) REFERENCES `borrower`(`organization_id`, `id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT `cash_transaction_fk_loan` FOREIGN KEY (`organization_id`, `loan_id`) REFERENCES `loan`(`organization_id`, `id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT `cash_transaction_fk_payment` FOREIGN KEY (`organization_id`, `payment_id`) REFERENCES `payment`(`organization_id`, `id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT `cash_transaction_fk_loan_renewal` FOREIGN KEY (`organization_id`, `loan_renewal_id`) REFERENCES `loan_renewal`(`organization_id`, `id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT `cash_transaction_fk_created_by_member` FOREIGN KEY (`organization_id`, `created_by_user_id`) REFERENCES `member`(`organization_id`, `user_id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT `cash_transaction_check_number` CHECK(length(trim(`transaction_number`)) > 0),
    CONSTRAINT `cash_transaction_check_type_direction` CHECK((`transaction_type` = 'LOAN_RELEASE' AND `direction` = 'CASH_OUT' AND `payment_id` IS NULL AND `loan_renewal_id` IS NULL) OR (`transaction_type` = 'PAYMENT_RECEIVED' AND `direction` = 'CASH_IN' AND `payment_id` IS NOT NULL AND `loan_renewal_id` IS NULL) OR (`transaction_type` = 'PAYMENT_REVERSAL' AND `direction` = 'CASH_OUT' AND `payment_id` IS NOT NULL AND `loan_renewal_id` IS NULL) OR (`transaction_type` = 'RENEWAL_RELEASE' AND `direction` = 'CASH_OUT' AND `payment_id` IS NULL AND `loan_renewal_id` IS NOT NULL) OR (`transaction_type` = 'PARTIAL_CREDIT_REFUND' AND `direction` = 'CASH_OUT' AND `payment_id` IS NULL AND `loan_renewal_id` IS NOT NULL)),
    CONSTRAINT `cash_transaction_check_amount` CHECK(`amount_minor` > 0)
);
INSERT INTO `cash_transaction` (
    `id`, `public_id`, `organization_id`, `transaction_number`, `transaction_type`,
    `direction`, `borrower_id`, `loan_id`, `payment_id`, `loan_renewal_id`,
    `amount_minor`, `transaction_at`, `idempotency_key`, `notes`, `created_by_user_id`, `created_at`
)
SELECT
    `id`, `public_id`, `organization_id`, `transaction_number`, `transaction_type`,
    `direction`, `borrower_id`, `loan_id`, `payment_id`, NULL,
    `amount_minor`, `transaction_at`, `idempotency_key`, `notes`, `created_by_user_id`, `created_at`
FROM `cash_transaction_phase4`;
DROP TABLE `cash_transaction_phase4`;
CREATE UNIQUE INDEX `cash_transaction_unique_loan_release` ON `cash_transaction` (`organization_id`, `loan_id`) WHERE `transaction_type` = 'LOAN_RELEASE';
CREATE UNIQUE INDEX `cash_transaction_unique_renewal_release` ON `cash_transaction` (`organization_id`, `loan_renewal_id`) WHERE `transaction_type` = 'RENEWAL_RELEASE';
CREATE UNIQUE INDEX `cash_transaction_unique_partial_credit_refund` ON `cash_transaction` (`organization_id`, `loan_renewal_id`) WHERE `transaction_type` = 'PARTIAL_CREDIT_REFUND';
CREATE INDEX `cash_transaction_idx_loan` ON `cash_transaction` (`organization_id`, `loan_id`, `transaction_at` DESC, `id`);
CREATE INDEX `cash_transaction_idx_renewal` ON `cash_transaction` (`organization_id`, `loan_renewal_id`, `transaction_at` DESC, `id`);
--> statement-breakpoint
-- Company fund
CREATE UNIQUE INDEX `cash_transaction_organization_id_id_unique` ON `cash_transaction` (`organization_id`, `id`);
CREATE TABLE `company_fund` (
    `id` integer PRIMARY KEY AUTOINCREMENT,
    `public_id` text NOT NULL,
    `organization_id` text NOT NULL,
    `fund_name` text NOT NULL,
    `opening_capital_minor` integer NOT NULL,
    `current_capital_minor` integer DEFAULT 0 NOT NULL,
    `currency` text DEFAULT 'PHP' NOT NULL,
    `is_primary` integer DEFAULT false NOT NULL,
    `created_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
    `updated_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
    CONSTRAINT `company_fund_organization_id_id_unique` UNIQUE(`organization_id`, `id`),
    CONSTRAINT `company_fund_organization_id_public_id_unique` UNIQUE(`organization_id`, `public_id`),
    CONSTRAINT `company_fund_organization_id_fund_name_unique` UNIQUE(`organization_id`, `fund_name`),
    CONSTRAINT `company_fund_fk_organization` FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT `company_fund_check_name` CHECK(length(trim(`fund_name`)) > 0),
    CONSTRAINT `company_fund_check_opening_capital` CHECK(`opening_capital_minor` >= 0),
    CONSTRAINT `company_fund_check_currency` CHECK(length(`currency`) = 3 AND `currency` = UPPER(`currency`) AND `currency` NOT GLOB '*[^A-Z]*')
);
CREATE UNIQUE INDEX `company_fund_unique_primary` ON `company_fund` (`organization_id`) WHERE `is_primary` = TRUE;
CREATE TABLE `capital_transaction` (
    `id` integer PRIMARY KEY AUTOINCREMENT,
    `public_id` text NOT NULL,
    `organization_id` text NOT NULL,
    `company_fund_id` integer NOT NULL,
    `transaction_number` text NOT NULL,
    `transaction_type` text NOT NULL,
    `direction` text NOT NULL,
    `amount_minor` integer NOT NULL,
    `loan_id` integer,
    `payment_id` integer,
    `loan_renewal_id` integer,
    `cash_transaction_id` integer,
    `reference_number` text,
    `notes` text,
    `transaction_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
    `idempotency_key` text,
    `created_by_user_id` text NOT NULL,
    `created_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
    CONSTRAINT `capital_transaction_organization_id_id_unique` UNIQUE(`organization_id`, `id`),
    CONSTRAINT `capital_transaction_organization_id_public_id_unique` UNIQUE(`organization_id`, `public_id`),
    CONSTRAINT `capital_transaction_organization_id_transaction_number_unique` UNIQUE(`organization_id`, `transaction_number`),
    CONSTRAINT `capital_transaction_organization_id_idempotency_key_unique` UNIQUE(`organization_id`, `idempotency_key`),
    CONSTRAINT `capital_transaction_organization_id_cash_transaction_id_type_unique` UNIQUE(`organization_id`, `cash_transaction_id`, `transaction_type`),
    CONSTRAINT `capital_transaction_fk_organization` FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT `capital_transaction_fk_company_fund` FOREIGN KEY (`organization_id`, `company_fund_id`) REFERENCES `company_fund`(`organization_id`, `id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT `capital_transaction_fk_loan` FOREIGN KEY (`organization_id`, `loan_id`) REFERENCES `loan`(`organization_id`, `id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT `capital_transaction_fk_payment` FOREIGN KEY (`organization_id`, `payment_id`) REFERENCES `payment`(`organization_id`, `id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT `capital_transaction_fk_loan_renewal` FOREIGN KEY (`organization_id`, `loan_renewal_id`) REFERENCES `loan_renewal`(`organization_id`, `id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT `capital_transaction_fk_cash_transaction` FOREIGN KEY (`organization_id`, `cash_transaction_id`) REFERENCES `cash_transaction`(`organization_id`, `id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT `capital_transaction_fk_created_by_member` FOREIGN KEY (`organization_id`, `created_by_user_id`) REFERENCES `member`(`organization_id`, `user_id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT `capital_transaction_check_number` CHECK(length(trim(`transaction_number`)) > 0),
    CONSTRAINT `capital_transaction_check_amount` CHECK(`amount_minor` > 0),
    CONSTRAINT `capital_transaction_check_type_direction_links` CHECK((`transaction_type` = 'OPENING_CAPITAL' AND `direction` = 'IN' AND `loan_id` IS NULL AND `payment_id` IS NULL AND `loan_renewal_id` IS NULL AND `cash_transaction_id` IS NULL) OR (`transaction_type` = 'CAPITAL_INJECTION' AND `direction` = 'IN' AND `loan_id` IS NULL AND `payment_id` IS NULL AND `loan_renewal_id` IS NULL AND `cash_transaction_id` IS NULL) OR (`transaction_type` = 'CAPITAL_WITHDRAWAL' AND `direction` = 'OUT' AND `loan_id` IS NULL AND `payment_id` IS NULL AND `loan_renewal_id` IS NULL AND `cash_transaction_id` IS NULL) OR (`transaction_type` = 'LOAN_PRINCIPAL_RELEASE' AND `direction` = 'OUT' AND `loan_id` IS NOT NULL AND `payment_id` IS NULL AND `loan_renewal_id` IS NULL AND `cash_transaction_id` IS NOT NULL) OR (`transaction_type` IN ('PRINCIPAL_COLLECTION', 'INTEREST_COLLECTION') AND `loan_id` IS NOT NULL AND `payment_id` IS NOT NULL AND `loan_renewal_id` IS NULL AND `cash_transaction_id` IS NOT NULL) OR (`transaction_type` = 'RENEWAL_RELEASE' AND `direction` = 'OUT' AND `loan_id` IS NOT NULL AND `payment_id` IS NULL AND `loan_renewal_id` IS NOT NULL AND `cash_transaction_id` IS NOT NULL) OR (`transaction_type` = 'REFUND' AND `direction` = 'OUT' AND `loan_id` IS NOT NULL AND `payment_id` IS NULL AND `loan_renewal_id` IS NOT NULL AND `cash_transaction_id` IS NOT NULL) OR (`transaction_type` IN ('EXPENSE', 'WRITE_OFF') AND `direction` = 'OUT' AND `loan_id` IS NULL AND `payment_id` IS NULL AND `loan_renewal_id` IS NULL AND `cash_transaction_id` IS NULL) OR (`transaction_type` = 'ADJUSTMENT' AND `loan_id` IS NULL AND `payment_id` IS NULL AND `loan_renewal_id` IS NULL AND `cash_transaction_id` IS NULL))
);
CREATE INDEX `capital_transaction_idx_list` ON `capital_transaction` (`organization_id`, `transaction_type`, `transaction_at` DESC, `id`);
CREATE INDEX `capital_transaction_idx_fund` ON `capital_transaction` (`organization_id`, `company_fund_id`, `transaction_at` DESC, `id`);
--> statement-breakpoint
-- System settings
CREATE TABLE `system_settings` (
    `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
    `public_id` text NOT NULL,
    `organization_id` text NOT NULL,
    `version` integer NOT NULL,
    `is_current` integer DEFAULT TRUE NOT NULL,
    `default_loan_product_id` integer,
    `default_payment_frequency` text NOT NULL,
    `enabled_payment_frequencies` text NOT NULL,
    `allow_partial_payments` integer DEFAULT TRUE NOT NULL,
    `allow_advance_payments` integer DEFAULT TRUE NOT NULL,
    `require_renewal_approval` integer DEFAULT TRUE NOT NULL,
    `borrower_tag_policy` text NOT NULL,
    `idempotency_key` text,
    `request_fingerprint` text,
    `created_by_user_id` text NOT NULL,
    `created_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
    CONSTRAINT `system_settings_fk_organization` FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT `system_settings_fk_default_loan_product` FOREIGN KEY (`organization_id`,`default_loan_product_id`) REFERENCES `loan_product`(`organization_id`,`id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT `system_settings_fk_created_by_member` FOREIGN KEY (`organization_id`,`created_by_user_id`) REFERENCES `member`(`organization_id`,`user_id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT `system_settings_organization_id_id_unique` UNIQUE(`organization_id`,`id`),
    CONSTRAINT `system_settings_organization_id_public_id_unique` UNIQUE(`organization_id`,`public_id`),
    CONSTRAINT `system_settings_organization_id_version_unique` UNIQUE(`organization_id`,`version`),
    CONSTRAINT `system_settings_organization_id_idempotency_key_unique` UNIQUE(`organization_id`,`idempotency_key`),
    CONSTRAINT `system_settings_check_version` CHECK(`version` > 0),
    CONSTRAINT `system_settings_check_default_frequency` CHECK(`default_payment_frequency` IN ('DAILY', 'WEEKLY', 'MONTHLY')),
    CONSTRAINT `system_settings_check_enabled_payment_frequencies` CHECK(json_valid(`enabled_payment_frequencies`) AND json_type(`enabled_payment_frequencies`) = 'array' AND json_array_length(`enabled_payment_frequencies`) > 0),
    CONSTRAINT `system_settings_check_borrower_tag_policy` CHECK(json_valid(`borrower_tag_policy`) AND json_type(`borrower_tag_policy`) = 'object'),
    CONSTRAINT `system_settings_check_idempotency_fingerprint` CHECK((`idempotency_key` IS NULL AND `request_fingerprint` IS NULL) OR (`idempotency_key` IS NOT NULL AND length(`request_fingerprint`) = 64 AND `request_fingerprint` NOT GLOB '*[^0-9a-f]*'))
);
CREATE UNIQUE INDEX `system_settings_unique_current` ON `system_settings` (`organization_id`) WHERE `system_settings`.`is_current` = TRUE;
--> statement-breakpoint
-- Renewal reconciliation
-- Renewal settlements use non-cash capital postings so a gross renewed
-- principal, the settled old receivable, and the actual net cash release all
-- reconcile without treating carried partial credit as earnings.
PRAGMA foreign_keys=OFF;
ALTER TABLE `capital_transaction` RENAME TO `capital_transaction__before_renewal_reconciliation`;
CREATE TABLE `capital_transaction` (
    `id` integer PRIMARY KEY AUTOINCREMENT,
    `public_id` text NOT NULL,
    `organization_id` text NOT NULL,
    `company_fund_id` integer NOT NULL,
    `transaction_number` text NOT NULL,
    `transaction_type` text NOT NULL,
    `direction` text NOT NULL,
    `amount_minor` integer NOT NULL,
    `loan_id` integer,
    `payment_id` integer,
    `loan_renewal_id` integer,
    `cash_transaction_id` integer,
    `reference_number` text,
    `notes` text,
    `transaction_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
    `idempotency_key` text,
    `created_by_user_id` text NOT NULL,
    `created_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
    CONSTRAINT `capital_transaction_organization_id_id_unique` UNIQUE(`organization_id`, `id`),
    CONSTRAINT `capital_transaction_organization_id_public_id_unique` UNIQUE(`organization_id`, `public_id`),
    CONSTRAINT `capital_transaction_organization_id_transaction_number_unique` UNIQUE(`organization_id`, `transaction_number`),
    CONSTRAINT `capital_transaction_organization_id_idempotency_key_unique` UNIQUE(`organization_id`, `idempotency_key`),
    CONSTRAINT `capital_transaction_organization_id_cash_transaction_id_type_unique` UNIQUE(`organization_id`, `cash_transaction_id`, `transaction_type`),
    CONSTRAINT `capital_transaction_fk_organization` FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT `capital_transaction_fk_company_fund` FOREIGN KEY (`organization_id`, `company_fund_id`) REFERENCES `company_fund`(`organization_id`, `id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT `capital_transaction_fk_loan` FOREIGN KEY (`organization_id`, `loan_id`) REFERENCES `loan`(`organization_id`, `id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT `capital_transaction_fk_payment` FOREIGN KEY (`organization_id`, `payment_id`) REFERENCES `payment`(`organization_id`, `id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT `capital_transaction_fk_loan_renewal` FOREIGN KEY (`organization_id`, `loan_renewal_id`) REFERENCES `loan_renewal`(`organization_id`, `id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT `capital_transaction_fk_cash_transaction` FOREIGN KEY (`organization_id`, `cash_transaction_id`) REFERENCES `cash_transaction`(`organization_id`, `id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT `capital_transaction_fk_created_by_member` FOREIGN KEY (`organization_id`, `created_by_user_id`) REFERENCES `member`(`organization_id`, `user_id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT `capital_transaction_check_number` CHECK(length(trim(`transaction_number`)) > 0),
    CONSTRAINT `capital_transaction_check_amount` CHECK(`amount_minor` > 0),
    CONSTRAINT `capital_transaction_check_type_direction_links` CHECK((`transaction_type` = 'OPENING_CAPITAL' AND `direction` = 'IN' AND `loan_id` IS NULL AND `payment_id` IS NULL AND `loan_renewal_id` IS NULL AND `cash_transaction_id` IS NULL) OR (`transaction_type` = 'CAPITAL_INJECTION' AND `direction` = 'IN' AND `loan_id` IS NULL AND `payment_id` IS NULL AND `loan_renewal_id` IS NULL AND `cash_transaction_id` IS NULL) OR (`transaction_type` = 'CAPITAL_WITHDRAWAL' AND `direction` = 'OUT' AND `loan_id` IS NULL AND `payment_id` IS NULL AND `loan_renewal_id` IS NULL AND `cash_transaction_id` IS NULL) OR (`transaction_type` = 'LOAN_PRINCIPAL_RELEASE' AND `direction` = 'OUT' AND `loan_id` IS NOT NULL AND `payment_id` IS NULL AND `loan_renewal_id` IS NULL AND `cash_transaction_id` IS NOT NULL) OR (`transaction_type` IN ('PRINCIPAL_COLLECTION', 'INTEREST_COLLECTION') AND `loan_id` IS NOT NULL AND `payment_id` IS NOT NULL AND `loan_renewal_id` IS NULL AND `cash_transaction_id` IS NOT NULL) OR (`transaction_type` = 'RENEWAL_RELEASE' AND `direction` = 'OUT' AND `loan_id` IS NOT NULL AND `payment_id` IS NULL AND `loan_renewal_id` IS NOT NULL) OR (`transaction_type` IN ('RENEWAL_SETTLEMENT_PRINCIPAL', 'RENEWAL_SETTLEMENT_INTEREST', 'RENEWAL_PARTIAL_CREDIT_TRANSFER') AND `direction` = 'IN' AND `loan_id` IS NOT NULL AND `payment_id` IS NULL AND `loan_renewal_id` IS NOT NULL AND `cash_transaction_id` IS NULL) OR (`transaction_type` = 'REFUND' AND `direction` = 'OUT' AND `loan_id` IS NOT NULL AND `payment_id` IS NULL AND `loan_renewal_id` IS NOT NULL AND `cash_transaction_id` IS NOT NULL) OR (`transaction_type` IN ('EXPENSE', 'WRITE_OFF') AND `direction` = 'OUT' AND `loan_id` IS NULL AND `payment_id` IS NULL AND `loan_renewal_id` IS NULL AND `cash_transaction_id` IS NULL) OR (`transaction_type` = 'ADJUSTMENT' AND `loan_id` IS NULL AND `payment_id` IS NULL AND `loan_renewal_id` IS NULL AND `cash_transaction_id` IS NULL))
);
INSERT INTO `capital_transaction` (
    `id`, `public_id`, `organization_id`, `company_fund_id`, `transaction_number`,
    `transaction_type`, `direction`, `amount_minor`, `loan_id`, `payment_id`,
    `loan_renewal_id`, `cash_transaction_id`, `reference_number`, `notes`,
    `transaction_at`, `idempotency_key`, `created_by_user_id`, `created_at`
)
SELECT
    `id`, `public_id`, `organization_id`, `company_fund_id`, `transaction_number`,
    `transaction_type`, `direction`, `amount_minor`, `loan_id`, `payment_id`,
    `loan_renewal_id`, `cash_transaction_id`, `reference_number`, `notes`,
    `transaction_at`, `idempotency_key`, `created_by_user_id`, `created_at`
FROM `capital_transaction__before_renewal_reconciliation`;
DROP TABLE `capital_transaction__before_renewal_reconciliation`;
CREATE INDEX `capital_transaction_idx_list` ON `capital_transaction` (`organization_id`, `transaction_type`, `transaction_at` DESC, `id`);
CREATE INDEX `capital_transaction_idx_fund` ON `capital_transaction` (`organization_id`, `company_fund_id`, `transaction_at` DESC, `id`);
PRAGMA foreign_keys=ON;
--> statement-breakpoint
-- Collection roles
CREATE TABLE `loan_collection_assignment` (
    `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
    `public_id` text NOT NULL,
    `organization_id` text NOT NULL,
    `loan_id` integer NOT NULL,
    `collector_user_id` text NOT NULL,
    `assigned_by_user_id` text NOT NULL,
    `assigned_at` integer NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)),
    `unassigned_at` integer,
    CONSTRAINT `loan_collection_assignment_organization_id_id_unique` UNIQUE(`organization_id`,`id`),
    CONSTRAINT `loan_collection_assignment_organization_id_public_id_unique` UNIQUE(`organization_id`,`public_id`),
    CONSTRAINT `loan_collection_assignment_organization_loan_collector_unique` UNIQUE(`organization_id`,`loan_id`,`collector_user_id`),
    CONSTRAINT `loan_collection_assignment_fk_loan` FOREIGN KEY (`organization_id`,`loan_id`) REFERENCES `loan`(`organization_id`,`id`) ON UPDATE no action ON DELETE no action,
    CONSTRAINT `loan_collection_assignment_fk_collector` FOREIGN KEY (`organization_id`,`collector_user_id`) REFERENCES `member`(`organization_id`,`user_id`) ON UPDATE no action ON DELETE no action,
    CONSTRAINT `loan_collection_assignment_fk_assigner` FOREIGN KEY (`organization_id`,`assigned_by_user_id`) REFERENCES `member`(`organization_id`,`user_id`) ON UPDATE no action ON DELETE no action,
    CONSTRAINT `loan_collection_assignment_check_dates` CHECK(`unassigned_at` IS NULL OR `unassigned_at` >= `assigned_at`)
);
CREATE INDEX `loan_collection_assignment_idx_collector_active` ON `loan_collection_assignment` (`organization_id`,`collector_user_id`,`unassigned_at`,`loan_id`);
INSERT INTO `role` (`name`, `description`)
VALUES
    ('cashier', 'Payment Cashier'),
    ('collector', 'Assigned Collection Collector'),
    ('viewer', 'Read-only Viewer'),
    ('auditor', 'Read-only Auditor')
ON CONFLICT (`name`) DO NOTHING;
INSERT INTO `permission` (`component`, `action`, `api_key_assignable`, `role_id`) SELECT 'payment', 'create', false, `id` FROM `role` WHERE `name` = 'cashier' ON CONFLICT (`component`, `action`, `role_id`) DO NOTHING;
INSERT INTO `permission` (`component`, `action`, `api_key_assignable`, `role_id`) SELECT 'payment', 'read', false, `id` FROM `role` WHERE `name` = 'cashier' ON CONFLICT (`component`, `action`, `role_id`) DO NOTHING;
INSERT INTO `permission` (`component`, `action`, `api_key_assignable`, `role_id`) SELECT 'payment', 'create', false, `id` FROM `role` WHERE `name` = 'collector' ON CONFLICT (`component`, `action`, `role_id`) DO NOTHING;
INSERT INTO `permission` (`component`, `action`, `api_key_assignable`, `role_id`) SELECT 'payment', 'read', false, `id` FROM `role` WHERE `name` = 'collector' ON CONFLICT (`component`, `action`, `role_id`) DO NOTHING;
INSERT INTO `permission` (`component`, `action`, `api_key_assignable`, `role_id`) SELECT 'collections', 'read', false, `id` FROM `role` WHERE `name` = 'collector' ON CONFLICT (`component`, `action`, `role_id`) DO NOTHING;
INSERT INTO `permission` (`component`, `action`, `api_key_assignable`, `role_id`) SELECT 'payment', 'read', false, `id` FROM `role` WHERE `name` = 'viewer' ON CONFLICT (`component`, `action`, `role_id`) DO NOTHING;
INSERT INTO `permission` (`component`, `action`, `api_key_assignable`, `role_id`) SELECT 'collections', 'read', false, `id` FROM `role` WHERE `name` = 'viewer' ON CONFLICT (`component`, `action`, `role_id`) DO NOTHING;
INSERT INTO `permission` (`component`, `action`, `api_key_assignable`, `role_id`) SELECT 'payment', 'read', false, `id` FROM `role` WHERE `name` = 'auditor' ON CONFLICT (`component`, `action`, `role_id`) DO NOTHING;
INSERT INTO `permission` (`component`, `action`, `api_key_assignable`, `role_id`) SELECT 'collections', 'read', false, `id` FROM `role` WHERE `name` = 'auditor' ON CONFLICT (`component`, `action`, `role_id`) DO NOTHING;
--> statement-breakpoint
-- Borrower tag history
CREATE TABLE `__new_borrower_payment_tag_history` (
    `id` integer PRIMARY KEY AUTOINCREMENT,
    `public_id` text NOT NULL,
    `organization_id` text NOT NULL,
    `borrower_id` integer NOT NULL,
    `payment_tag` text NOT NULL,
    `system_payment_tag` text NOT NULL,
    `payment_tag_source` text NOT NULL,
    `override_reason` text,
    `changed_by_user_id` text,
    `changed_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
    CONSTRAINT `borrower_payment_tag_history_organization_id_public_id_unique` UNIQUE(`organization_id`, `public_id`),
    CONSTRAINT `borrower_payment_tag_history_fk_borrower` FOREIGN KEY (`organization_id`, `borrower_id`) REFERENCES `borrower`(`organization_id`, `id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT `borrower_payment_tag_history_fk_changed_by_member` FOREIGN KEY (`organization_id`, `changed_by_user_id`) REFERENCES `member`(`organization_id`, `user_id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT `borrower_payment_tag_history_check_tag` CHECK(`payment_tag` IN ('GOOD_PAYER', 'BAD_PAYER', 'SCAMMER') AND `system_payment_tag` IN ('GOOD_PAYER', 'BAD_PAYER', 'SCAMMER')),
    CONSTRAINT `borrower_payment_tag_history_check_source` CHECK((`payment_tag_source` = 'SYSTEM' AND `override_reason` IS NULL) OR (`payment_tag_source` = 'MANUAL_OVERRIDE' AND length(trim(`override_reason`)) > 0 AND `changed_by_user_id` IS NOT NULL))
);
INSERT INTO `__new_borrower_payment_tag_history` (
    `id`, `public_id`, `organization_id`, `borrower_id`, `payment_tag`,
    `system_payment_tag`, `payment_tag_source`, `override_reason`,
    `changed_by_user_id`, `changed_at`
)
SELECT `id`, `public_id`, `organization_id`, `borrower_id`, `payment_tag`,
       `payment_tag`, `payment_tag_source`, `override_reason`,
       `changed_by_user_id`, `changed_at`
FROM `borrower_payment_tag_history`;
DROP TABLE `borrower_payment_tag_history`;
ALTER TABLE `__new_borrower_payment_tag_history` RENAME TO `borrower_payment_tag_history`;
CREATE INDEX `borrower_payment_tag_history_idx_borrower` ON `borrower_payment_tag_history` (`organization_id`, `borrower_id`, `changed_at` DESC, `id`);
--> statement-breakpoint
-- Formula profile management
ALTER TABLE `loan_formula_profile` ADD `idempotency_key` text;
ALTER TABLE `loan_formula_profile` ADD `request_fingerprint` text;
CREATE UNIQUE INDEX `loan_formula_profile_organization_id_idempotency_key_unique`
ON `loan_formula_profile` (`organization_id`, `idempotency_key`)
WHERE `idempotency_key` IS NOT NULL;
