CREATE INDEX `borrower_idx_recent` ON `borrower` (`organization_id`,"created_at" DESC,"id" DESC);--> statement-breakpoint
CREATE INDEX `capital_transaction_idx_period` ON `capital_transaction` (`organization_id`,"transaction_at" DESC,"id" DESC);--> statement-breakpoint
CREATE INDEX `loan_idx_recent` ON `loan` (`organization_id`,"created_at" DESC,"id" DESC);--> statement-breakpoint
CREATE INDEX `loan_renewal_idx_recent` ON `loan_renewal` (`organization_id`,"processed_at" DESC,"id" DESC);--> statement-breakpoint
CREATE INDEX `payment_idx_recent` ON `payment` (`organization_id`,"created_at" DESC,"id" DESC);