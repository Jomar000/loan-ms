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
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
CREATE TABLE `object_storage_acl` (
	`organization_id` text NOT NULL,
	`object_storage_id` text NOT NULL,
	`user_id` text NOT NULL,
	`mode` integer DEFAULT 1 NOT NULL,
	CONSTRAINT `object_storage_acl_fk_osorg1` FOREIGN KEY (`organization_id`,`object_storage_id`) REFERENCES `object_storage`(`organization_id`,`id`) ON DELETE CASCADE,
	CONSTRAINT `object_storage_acl_fk_member` FOREIGN KEY (`organization_id`,`user_id`) REFERENCES `member`(`organization_id`,`user_id`) ON DELETE CASCADE,
	CONSTRAINT `object_storage_acl_organization_id_object_storage_id_user_id_unique` UNIQUE(`organization_id`,`object_storage_id`,`user_id`)
);
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
CREATE TABLE `role` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`name` text NOT NULL UNIQUE,
	`description` text,
	`created_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
	`updated_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
	CONSTRAINT "role_name_check" CHECK(name = LOWER(name))
);
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
CREATE TABLE `upload_attachment` (
	`organization_id` text NOT NULL,
	`upload_id` text NOT NULL,
	`object_storage_id` text NOT NULL,
	CONSTRAINT `fk_upload_attachment_organization_id_organization_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`),
	CONSTRAINT `upload_attachment_fk_uporg1` FOREIGN KEY (`organization_id`,`upload_id`) REFERENCES `upload`(`organization_id`,`id`),
	CONSTRAINT `upload_attachment_fk_osorg1` FOREIGN KEY (`organization_id`,`object_storage_id`) REFERENCES `object_storage`(`organization_id`,`id`) ON DELETE CASCADE,
	CONSTRAINT `upload_attachment_organization_id_upload_id_object_storage_id_unique` UNIQUE(`organization_id`,`upload_id`,`object_storage_id`)
);
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
CREATE TABLE `user_attribute` (
	`user_id` text PRIMARY KEY,
	`is_locked` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
	`updated_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
	CONSTRAINT `fk_user_attribute_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`)
);
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
	`updated_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL
);
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
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
