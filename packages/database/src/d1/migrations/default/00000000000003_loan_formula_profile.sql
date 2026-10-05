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
--> statement-breakpoint
CREATE UNIQUE INDEX `loan_formula_profile_unique_active_default` ON `loan_formula_profile` (`organization_id`) WHERE `loan_formula_profile`.`is_active` = TRUE AND `loan_formula_profile`.`is_default` = TRUE;
