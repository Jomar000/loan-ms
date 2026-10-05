ALTER TABLE `loan_formula_profile` ADD `idempotency_key` text;
--> statement-breakpoint
ALTER TABLE `loan_formula_profile` ADD `request_fingerprint` text;
--> statement-breakpoint
CREATE UNIQUE INDEX `loan_formula_profile_organization_id_idempotency_key_unique`
ON `loan_formula_profile` (`organization_id`, `idempotency_key`)
WHERE `idempotency_key` IS NOT NULL;
