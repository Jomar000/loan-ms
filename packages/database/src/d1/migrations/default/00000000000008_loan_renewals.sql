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
--> statement-breakpoint
CREATE INDEX `loan_renewal_idx_list` ON `loan_renewal` (`organization_id`, `status`, `processed_at` DESC, `id`);
--> statement-breakpoint
CREATE INDEX `loan_renewal_idx_borrower` ON `loan_renewal` (`organization_id`, `borrower_id`, `processed_at` DESC, `id`);
--> statement-breakpoint
DROP INDEX `cash_transaction_idx_loan`;
--> statement-breakpoint
ALTER TABLE `cash_transaction` RENAME TO `cash_transaction_phase4`;
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
--> statement-breakpoint
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
--> statement-breakpoint
DROP TABLE `cash_transaction_phase4`;
--> statement-breakpoint
CREATE UNIQUE INDEX `cash_transaction_unique_loan_release` ON `cash_transaction` (`organization_id`, `loan_id`) WHERE `transaction_type` = 'LOAN_RELEASE';
--> statement-breakpoint
CREATE UNIQUE INDEX `cash_transaction_unique_renewal_release` ON `cash_transaction` (`organization_id`, `loan_renewal_id`) WHERE `transaction_type` = 'RENEWAL_RELEASE';
--> statement-breakpoint
CREATE UNIQUE INDEX `cash_transaction_unique_partial_credit_refund` ON `cash_transaction` (`organization_id`, `loan_renewal_id`) WHERE `transaction_type` = 'PARTIAL_CREDIT_REFUND';
--> statement-breakpoint
CREATE INDEX `cash_transaction_idx_loan` ON `cash_transaction` (`organization_id`, `loan_id`, `transaction_at` DESC, `id`);
--> statement-breakpoint
CREATE INDEX `cash_transaction_idx_renewal` ON `cash_transaction` (`organization_id`, `loan_renewal_id`, `transaction_at` DESC, `id`);
