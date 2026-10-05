CREATE TABLE `loan_collection_assignment` (
    `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
    `public_id` text NOT NULL,
    `organization_id` text NOT NULL,
    `loan_id` integer NOT NULL,
    `collector_user_id` text NOT NULL,
    `assigned_by_user_id` text NOT NULL,
    `assigned_at` integer NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)),
    `unassigned_at` integer,
    CONSTRAINT `loan_collection_assignment_organization_id_id_unique` UNIQUE(`organization_id`,`id`),
    CONSTRAINT `loan_collection_assignment_organization_id_public_id_unique` UNIQUE(`organization_id`,`public_id`),
    CONSTRAINT `loan_collection_assignment_organization_loan_collector_unique` UNIQUE(`organization_id`,`loan_id`,`collector_user_id`),
    CONSTRAINT `loan_collection_assignment_fk_loan` FOREIGN KEY (`organization_id`,`loan_id`) REFERENCES `loan`(`organization_id`,`id`) ON UPDATE no action ON DELETE no action,
    CONSTRAINT `loan_collection_assignment_fk_collector` FOREIGN KEY (`organization_id`,`collector_user_id`) REFERENCES `member`(`organization_id`,`user_id`) ON UPDATE no action ON DELETE no action,
    CONSTRAINT `loan_collection_assignment_fk_assigner` FOREIGN KEY (`organization_id`,`assigned_by_user_id`) REFERENCES `member`(`organization_id`,`user_id`) ON UPDATE no action ON DELETE no action,
    CONSTRAINT `loan_collection_assignment_check_dates` CHECK(`unassigned_at` IS NULL OR `unassigned_at` >= `assigned_at`)
);
--> statement-breakpoint
CREATE INDEX `loan_collection_assignment_idx_collector_active` ON `loan_collection_assignment` (`organization_id`,`collector_user_id`,`unassigned_at`,`loan_id`);
--> statement-breakpoint
INSERT INTO `role` (`name`, `description`)
VALUES
    ('cashier', 'Payment Cashier'),
    ('collector', 'Assigned Collection Collector'),
    ('viewer', 'Read-only Viewer'),
    ('auditor', 'Read-only Auditor')
ON CONFLICT (`name`) DO NOTHING;
--> statement-breakpoint
INSERT INTO `permission` (`component`, `action`, `api_key_assignable`, `role_id`) SELECT 'payment', 'create', false, `id` FROM `role` WHERE `name` = 'cashier' ON CONFLICT (`component`, `action`, `role_id`) DO NOTHING;
--> statement-breakpoint
INSERT INTO `permission` (`component`, `action`, `api_key_assignable`, `role_id`) SELECT 'payment', 'read', false, `id` FROM `role` WHERE `name` = 'cashier' ON CONFLICT (`component`, `action`, `role_id`) DO NOTHING;
--> statement-breakpoint
INSERT INTO `permission` (`component`, `action`, `api_key_assignable`, `role_id`) SELECT 'payment', 'create', false, `id` FROM `role` WHERE `name` = 'collector' ON CONFLICT (`component`, `action`, `role_id`) DO NOTHING;
--> statement-breakpoint
INSERT INTO `permission` (`component`, `action`, `api_key_assignable`, `role_id`) SELECT 'payment', 'read', false, `id` FROM `role` WHERE `name` = 'collector' ON CONFLICT (`component`, `action`, `role_id`) DO NOTHING;
--> statement-breakpoint
INSERT INTO `permission` (`component`, `action`, `api_key_assignable`, `role_id`) SELECT 'collections', 'read', false, `id` FROM `role` WHERE `name` = 'collector' ON CONFLICT (`component`, `action`, `role_id`) DO NOTHING;
--> statement-breakpoint
INSERT INTO `permission` (`component`, `action`, `api_key_assignable`, `role_id`) SELECT 'payment', 'read', false, `id` FROM `role` WHERE `name` = 'viewer' ON CONFLICT (`component`, `action`, `role_id`) DO NOTHING;
--> statement-breakpoint
INSERT INTO `permission` (`component`, `action`, `api_key_assignable`, `role_id`) SELECT 'collections', 'read', false, `id` FROM `role` WHERE `name` = 'viewer' ON CONFLICT (`component`, `action`, `role_id`) DO NOTHING;
--> statement-breakpoint
INSERT INTO `permission` (`component`, `action`, `api_key_assignable`, `role_id`) SELECT 'payment', 'read', false, `id` FROM `role` WHERE `name` = 'auditor' ON CONFLICT (`component`, `action`, `role_id`) DO NOTHING;
--> statement-breakpoint
INSERT INTO `permission` (`component`, `action`, `api_key_assignable`, `role_id`) SELECT 'collections', 'read', false, `id` FROM `role` WHERE `name` = 'auditor' ON CONFLICT (`component`, `action`, `role_id`) DO NOTHING;
