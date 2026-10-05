PRAGMA defer_foreign_keys = ON;
--> statement-breakpoint
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
    CONSTRAINT `borrower_check_names` CHECK(length(trim(`first_name`)) > 0 AND length(trim(`last_name`)) > 0),
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
--> statement-breakpoint
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
--> statement-breakpoint
DROP TABLE `borrower`;
--> statement-breakpoint
ALTER TABLE `borrower_upgrade` RENAME TO `borrower`;
--> statement-breakpoint
CREATE INDEX `borrower_idx_list` ON `borrower` (`organization_id`, `status`, `created_at` DESC, `id`);
--> statement-breakpoint
CREATE INDEX `borrower_idx_payment_tag` ON `borrower` (`organization_id`, `payment_tag`, `id`);
--> statement-breakpoint
CREATE INDEX `borrower_idx_duplicate_contact` ON `borrower` (`organization_id`, `normalized_contact_number`, `id`);
--> statement-breakpoint
CREATE INDEX `borrower_idx_duplicate_secondary_contact` ON `borrower` (`organization_id`, `normalized_secondary_contact_number`, `id`);
--> statement-breakpoint
CREATE INDEX `borrower_idx_duplicate_email` ON `borrower` (`organization_id`, `normalized_email`, `id`);
--> statement-breakpoint
CREATE INDEX `borrower_idx_duplicate_name_birth_date` ON `borrower` (`organization_id`, `normalized_full_name`, `birth_date`, `id`);
