CREATE TRIGGER `key_counter_set_updated_at`
AFTER UPDATE ON `key_counter`
FOR EACH ROW
WHEN NEW.`updated_at` = OLD.`updated_at`
BEGIN
    UPDATE `key_counter`
    SET `updated_at` = MAX(CAST(unixepoch('subsec') * 1000 AS INTEGER), OLD.`updated_at` + 1)
    WHERE rowid = NEW.rowid;
END;
--> statement-breakpoint

CREATE TRIGGER `key_value_set_updated_at`
AFTER UPDATE ON `key_value`
FOR EACH ROW
WHEN NEW.`updated_at` = OLD.`updated_at`
BEGIN
    UPDATE `key_value`
    SET `updated_at` = MAX(CAST(unixepoch('subsec') * 1000 AS INTEGER), OLD.`updated_at` + 1)
    WHERE rowid = NEW.rowid;
END;
--> statement-breakpoint

CREATE TRIGGER `object_storage_set_updated_at`
AFTER UPDATE ON `object_storage`
FOR EACH ROW
WHEN NEW.`updated_at` = OLD.`updated_at`
BEGIN
    UPDATE `object_storage`
    SET `updated_at` = MAX(CAST(unixepoch('subsec') * 1000 AS INTEGER), OLD.`updated_at` + 1)
    WHERE rowid = NEW.rowid;
END;
--> statement-breakpoint

CREATE TRIGGER `upload_set_updated_at`
AFTER UPDATE ON `upload`
FOR EACH ROW
WHEN NEW.`updated_at` = OLD.`updated_at`
BEGIN
    UPDATE `upload`
    SET `updated_at` = MAX(CAST(unixepoch('subsec') * 1000 AS INTEGER), OLD.`updated_at` + 1)
    WHERE rowid = NEW.rowid;
END;
--> statement-breakpoint

CREATE TRIGGER `user_attribute_set_updated_at`
AFTER UPDATE ON `user_attribute`
FOR EACH ROW
WHEN NEW.`updated_at` = OLD.`updated_at`
BEGIN
    UPDATE `user_attribute`
    SET `updated_at` = MAX(CAST(unixepoch('subsec') * 1000 AS INTEGER), OLD.`updated_at` + 1)
    WHERE rowid = NEW.rowid;
END;
--> statement-breakpoint

CREATE TRIGGER `user_profile_set_updated_at`
AFTER UPDATE ON `user_profile`
FOR EACH ROW
WHEN NEW.`updated_at` = OLD.`updated_at`
BEGIN
    UPDATE `user_profile`
    SET `updated_at` = MAX(CAST(unixepoch('subsec') * 1000 AS INTEGER), OLD.`updated_at` + 1)
    WHERE rowid = NEW.rowid;
END;
--> statement-breakpoint

CREATE TRIGGER `user_address_set_updated_at`
AFTER UPDATE ON `user_address`
FOR EACH ROW
WHEN NEW.`updated_at` = OLD.`updated_at`
BEGIN
    UPDATE `user_address`
    SET `updated_at` = MAX(CAST(unixepoch('subsec') * 1000 AS INTEGER), OLD.`updated_at` + 1)
    WHERE rowid = NEW.rowid;
END;
--> statement-breakpoint

CREATE TRIGGER `user_relationship_set_updated_at`
AFTER UPDATE ON `user_relationship`
FOR EACH ROW
WHEN NEW.`updated_at` = OLD.`updated_at`
BEGIN
    UPDATE `user_relationship`
    SET `updated_at` = MAX(CAST(unixepoch('subsec') * 1000 AS INTEGER), OLD.`updated_at` + 1)
    WHERE rowid = NEW.rowid;
END;
--> statement-breakpoint

CREATE TRIGGER `account_set_updated_at`
AFTER UPDATE ON `account`
FOR EACH ROW
WHEN NEW.`updated_at` = OLD.`updated_at`
BEGIN
    UPDATE `account`
    SET `updated_at` = MAX(CAST(unixepoch('subsec') * 1000 AS INTEGER), OLD.`updated_at` + 1)
    WHERE rowid = NEW.rowid;
END;
--> statement-breakpoint

CREATE TRIGGER `invitation_set_updated_at`
AFTER UPDATE ON `invitation`
FOR EACH ROW
WHEN NEW.`updated_at` = OLD.`updated_at`
BEGIN
    UPDATE `invitation`
    SET `updated_at` = MAX(CAST(unixepoch('subsec') * 1000 AS INTEGER), OLD.`updated_at` + 1)
    WHERE rowid = NEW.rowid;
END;
--> statement-breakpoint

CREATE TRIGGER `member_set_updated_at`
AFTER UPDATE ON `member`
FOR EACH ROW
WHEN NEW.`updated_at` = OLD.`updated_at`
BEGIN
    UPDATE `member`
    SET `updated_at` = MAX(CAST(unixepoch('subsec') * 1000 AS INTEGER), OLD.`updated_at` + 1)
    WHERE rowid = NEW.rowid;
END;
--> statement-breakpoint

CREATE TRIGGER `websocket_revocation_delivery_set_updated_at`
AFTER UPDATE ON `websocket_revocation_delivery`
FOR EACH ROW
WHEN NEW.`updated_at` = OLD.`updated_at`
BEGIN
    UPDATE `websocket_revocation_delivery`
    SET `updated_at` = MAX(CAST(unixepoch('subsec') * 1000 AS INTEGER), OLD.`updated_at` + 1)
    WHERE rowid = NEW.rowid;
END;
--> statement-breakpoint

CREATE TRIGGER `organization_set_updated_at`
AFTER UPDATE ON `organization`
FOR EACH ROW
WHEN NEW.`updated_at` = OLD.`updated_at`
BEGIN
    UPDATE `organization`
    SET `updated_at` = MAX(CAST(unixepoch('subsec') * 1000 AS INTEGER), OLD.`updated_at` + 1)
    WHERE rowid = NEW.rowid;
END;
--> statement-breakpoint

CREATE TRIGGER `service_principal_set_updated_at`
AFTER UPDATE ON `service_principal`
FOR EACH ROW
WHEN NEW.`updated_at` = OLD.`updated_at`
BEGIN
    UPDATE `service_principal`
    SET `updated_at` = MAX(CAST(unixepoch('subsec') * 1000 AS INTEGER), OLD.`updated_at` + 1)
    WHERE rowid = NEW.rowid;
END;
--> statement-breakpoint

CREATE TRIGGER `service_principal_credential_issuance_set_updated_at`
AFTER UPDATE ON `service_principal_credential_issuance`
FOR EACH ROW
WHEN NEW.`updated_at` = OLD.`updated_at`
BEGIN
    UPDATE `service_principal_credential_issuance`
    SET `updated_at` = MAX(CAST(unixepoch('subsec') * 1000 AS INTEGER), OLD.`updated_at` + 1)
    WHERE rowid = NEW.rowid;
END;
--> statement-breakpoint

CREATE TRIGGER `apikey_set_updated_at`
AFTER UPDATE ON `apikey`
FOR EACH ROW
WHEN NEW.`updated_at` = OLD.`updated_at`
BEGIN
    UPDATE `apikey`
    SET `updated_at` = MAX(CAST(unixepoch('subsec') * 1000 AS INTEGER), OLD.`updated_at` + 1)
    WHERE rowid = NEW.rowid;
END;
--> statement-breakpoint

CREATE TRIGGER `permission_set_updated_at`
AFTER UPDATE ON `permission`
FOR EACH ROW
WHEN NEW.`updated_at` = OLD.`updated_at`
BEGIN
    UPDATE `permission`
    SET `updated_at` = MAX(CAST(unixepoch('subsec') * 1000 AS INTEGER), OLD.`updated_at` + 1)
    WHERE rowid = NEW.rowid;
END;
--> statement-breakpoint

CREATE TRIGGER `role_set_updated_at`
AFTER UPDATE ON `role`
FOR EACH ROW
WHEN NEW.`updated_at` = OLD.`updated_at`
BEGIN
    UPDATE `role`
    SET `updated_at` = MAX(CAST(unixepoch('subsec') * 1000 AS INTEGER), OLD.`updated_at` + 1)
    WHERE rowid = NEW.rowid;
END;
--> statement-breakpoint

CREATE TRIGGER `session_set_updated_at`
AFTER UPDATE ON `session`
FOR EACH ROW
WHEN NEW.`updated_at` = OLD.`updated_at`
BEGIN
    UPDATE `session`
    SET `updated_at` = MAX(CAST(unixepoch('subsec') * 1000 AS INTEGER), OLD.`updated_at` + 1)
    WHERE rowid = NEW.rowid;
END;
--> statement-breakpoint

CREATE TRIGGER `user_set_updated_at`
AFTER UPDATE ON `user`
FOR EACH ROW
WHEN NEW.`updated_at` = OLD.`updated_at`
BEGIN
    UPDATE `user`
    SET `updated_at` = MAX(CAST(unixepoch('subsec') * 1000 AS INTEGER), OLD.`updated_at` + 1)
    WHERE rowid = NEW.rowid;
END;
--> statement-breakpoint

CREATE TRIGGER `verification_set_updated_at`
AFTER UPDATE ON `verification`
FOR EACH ROW
WHEN NEW.`updated_at` = OLD.`updated_at`
BEGIN
    UPDATE `verification`
    SET `updated_at` = MAX(CAST(unixepoch('subsec') * 1000 AS INTEGER), OLD.`updated_at` + 1)
    WHERE rowid = NEW.rowid;
END;
--> statement-breakpoint
