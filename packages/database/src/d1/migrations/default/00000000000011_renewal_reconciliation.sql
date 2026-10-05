-- Renewal settlements use non-cash capital postings so a gross renewed
-- principal, the settled old receivable, and the actual net cash release all
-- reconcile without treating carried partial credit as earnings.
PRAGMA foreign_keys=OFF;
--> statement-breakpoint
ALTER TABLE `capital_transaction` RENAME TO `capital_transaction__before_renewal_reconciliation`;
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
DROP TABLE `capital_transaction__before_renewal_reconciliation`;
--> statement-breakpoint
CREATE INDEX `capital_transaction_idx_list` ON `capital_transaction` (`organization_id`, `transaction_type`, `transaction_at` DESC, `id`);
--> statement-breakpoint
CREATE INDEX `capital_transaction_idx_fund` ON `capital_transaction` (`organization_id`, `company_fund_id`, `transaction_at` DESC, `id`);
--> statement-breakpoint
PRAGMA foreign_keys=ON;
