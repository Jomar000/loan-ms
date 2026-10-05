CREATE UNIQUE INDEX `loan_installment_organization_id_id_unique` ON `loan_installment` (`organization_id`, `id`);
--> statement-breakpoint
CREATE INDEX `loan_installment_idx_collections` ON `loan_installment` (`organization_id`, `due_date`, `status`, `id`);
--> statement-breakpoint
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
--> statement-breakpoint
CREATE INDEX `payment_idx_borrower_history` ON `payment` (`organization_id`, `borrower_id`, `payment_type_snapshot`, `payment_date` DESC, `id`);
--> statement-breakpoint
CREATE INDEX `payment_idx_collections` ON `payment` (`organization_id`, `status`, `payment_date`, `id`);
--> statement-breakpoint
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
--> statement-breakpoint
DROP INDEX `cash_transaction_idx_loan`;
--> statement-breakpoint
ALTER TABLE `cash_transaction` RENAME TO `cash_transaction_phase3`;
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
DROP TABLE `cash_transaction_phase3`;
--> statement-breakpoint
CREATE UNIQUE INDEX `cash_transaction_unique_loan_release` ON `cash_transaction` (`organization_id`, `loan_id`) WHERE `transaction_type` = 'LOAN_RELEASE';
--> statement-breakpoint
CREATE INDEX `cash_transaction_idx_loan` ON `cash_transaction` (`organization_id`, `loan_id`, `transaction_at` DESC, `id`);
