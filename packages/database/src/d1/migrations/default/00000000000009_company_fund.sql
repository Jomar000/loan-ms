CREATE UNIQUE INDEX `cash_transaction_organization_id_id_unique` ON `cash_transaction` (`organization_id`, `id`);
--> statement-breakpoint
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
--> statement-breakpoint
CREATE UNIQUE INDEX `company_fund_unique_primary` ON `company_fund` (`organization_id`) WHERE `is_primary` = TRUE;
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
    CONSTRAINT `capital_transaction_check_type_direction_links` CHECK((`transaction_type` = 'OPENING_CAPITAL' AND `direction` = 'IN' AND `loan_id` IS NULL AND `payment_id` IS NULL AND `loan_renewal_id` IS NULL AND `cash_transaction_id` IS NULL) OR (`transaction_type` = 'CAPITAL_INJECTION' AND `direction` = 'IN' AND `loan_id` IS NULL AND `payment_id` IS NULL AND `loan_renewal_id` IS NULL AND `cash_transaction_id` IS NULL) OR (`transaction_type` = 'CAPITAL_WITHDRAWAL' AND `direction` = 'OUT' AND `loan_id` IS NULL AND `payment_id` IS NULL AND `loan_renewal_id` IS NULL AND `cash_transaction_id` IS NULL) OR (`transaction_type` = 'LOAN_PRINCIPAL_RELEASE' AND `direction` = 'OUT' AND `loan_id` IS NOT NULL AND `payment_id` IS NULL AND `loan_renewal_id` IS NULL AND `cash_transaction_id` IS NOT NULL) OR (`transaction_type` IN ('PRINCIPAL_COLLECTION', 'INTEREST_COLLECTION') AND `loan_id` IS NOT NULL AND `payment_id` IS NOT NULL AND `loan_renewal_id` IS NULL AND `cash_transaction_id` IS NOT NULL) OR (`transaction_type` = 'RENEWAL_RELEASE' AND `direction` = 'OUT' AND `loan_id` IS NOT NULL AND `payment_id` IS NULL AND `loan_renewal_id` IS NOT NULL AND `cash_transaction_id` IS NOT NULL) OR (`transaction_type` = 'REFUND' AND `direction` = 'OUT' AND `loan_id` IS NOT NULL AND `payment_id` IS NULL AND `loan_renewal_id` IS NOT NULL AND `cash_transaction_id` IS NOT NULL) OR (`transaction_type` IN ('EXPENSE', 'WRITE_OFF') AND `direction` = 'OUT' AND `loan_id` IS NULL AND `payment_id` IS NULL AND `loan_renewal_id` IS NULL AND `cash_transaction_id` IS NULL) OR (`transaction_type` = 'ADJUSTMENT' AND `loan_id` IS NULL AND `payment_id` IS NULL AND `loan_renewal_id` IS NULL AND `cash_transaction_id` IS NULL))
);
--> statement-breakpoint
CREATE INDEX `capital_transaction_idx_list` ON `capital_transaction` (`organization_id`, `transaction_type`, `transaction_at` DESC, `id`);
--> statement-breakpoint
CREATE INDEX `capital_transaction_idx_fund` ON `capital_transaction` (`organization_id`, `company_fund_id`, `transaction_at` DESC, `id`);
