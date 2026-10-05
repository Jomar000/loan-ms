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
--> statement-breakpoint
INSERT INTO `__new_borrower_payment_tag_history` (
    `id`, `public_id`, `organization_id`, `borrower_id`, `payment_tag`,
    `system_payment_tag`, `payment_tag_source`, `override_reason`,
    `changed_by_user_id`, `changed_at`
)
SELECT `id`, `public_id`, `organization_id`, `borrower_id`, `payment_tag`,
       `payment_tag`, `payment_tag_source`, `override_reason`,
       `changed_by_user_id`, `changed_at`
FROM `borrower_payment_tag_history`;
--> statement-breakpoint
DROP TABLE `borrower_payment_tag_history`;
--> statement-breakpoint
ALTER TABLE `__new_borrower_payment_tag_history` RENAME TO `borrower_payment_tag_history`;
--> statement-breakpoint
CREATE INDEX `borrower_payment_tag_history_idx_borrower` ON `borrower_payment_tag_history` (`organization_id`, `borrower_id`, `changed_at` DESC, `id`);
