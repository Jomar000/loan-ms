CREATE TABLE `borrower` (
    `id` integer PRIMARY KEY AUTOINCREMENT,
    `public_id` text NOT NULL,
    `organization_id` text NOT NULL,
    `borrower_number` text NOT NULL,
    `first_name` text NOT NULL,
    `middle_name` text,
    `last_name` text NOT NULL,
    `suffix` text,
    `birth_date` text NOT NULL,
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
    CONSTRAINT `borrower_check_birth_date` CHECK(length(`birth_date`) = 10 AND `birth_date` GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
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
--> statement-breakpoint
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
--> statement-breakpoint
CREATE INDEX `borrower_document_idx_borrower` ON `borrower_document` (`organization_id`, `borrower_id`, `created_at` DESC, `id`);
--> statement-breakpoint
CREATE INDEX `borrower_document_idx_duplicate_number` ON `borrower_document` (`organization_id`, `document_type`, `normalized_document_number`, `id`);
--> statement-breakpoint
CREATE INDEX `borrower_payment_tag_history_idx_borrower` ON `borrower_payment_tag_history` (`organization_id`, `borrower_id`, `changed_at` DESC, `id`);
