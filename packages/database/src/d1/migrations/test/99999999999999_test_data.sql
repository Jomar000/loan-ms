-- Organization
INSERT INTO "organization"
    (id, name, slug)
VALUES
    ('__TEST-ORG_PRIMARY', '__TEST-PRIMARY ORGANIZATION', '__test-primary'),
    ('__TEST-ORG_ISOLATED', '__TEST-ISOLATED ORGANIZATION', '__test-isolated')
ON CONFLICT DO NOTHING;
--> statement-breakpoint

-- User
INSERT INTO "user"
    (id, public_id, name, email, username)
VALUES
    ('__TEST-USER_OWNER', '019936e2-b837-7000-8000-000000000101', '__TEST-OWNER', 'owner@test.loanms.example', '__test_owner'),
    ('__TEST-USER_ADMIN', '019936e2-b837-7000-8000-000000000102', '__TEST-ADMINISTRATOR', 'administrator@test.loanms.example', '__test_admin'),
    ('__TEST-USER_MEMBER', '019936e2-b837-7000-8000-000000000103', '__TEST-MEMBER', 'member@test.loanms.example', '__test_member'),
    ('__TEST-USER_MULTI_ROLE', '019936e2-b837-7000-8000-000000000104', '__TEST-MULTI ROLE MEMBER', 'multi.role@test.loanms.example', '__test_multi_role'),
    ('__TEST-USER_AUTH_MUTABLE', '019936e2-b837-7000-8000-000000000105', '__TEST-AUTH MUTABLE', 'auth.mutable@test.loanms.example', '__test_auth_mutable'),
    ('__TEST-USER_PASSWORD_MUTABLE', '019936e2-b837-7000-8000-000000000106', '__TEST-PASSWORD MUTABLE', 'password.mutable@test.loanms.example', '__test_password_mutable'),
    ('__TEST-USER_NO_ATTRIBUTE', '019936e2-b837-7000-8000-000000000107', '__TEST-NO ATTRIBUTE', 'no.attribute@test.loanms.example', '__test_no_attribute'),
    ('__TEST-USER_NO_CREDENTIAL', '019936e2-b837-7000-8000-000000000108', '__TEST-NO CREDENTIAL', 'no.credential@test.loanms.example', '__test_no_credential'),
    ('__TEST-USER_LOCKED', '019936e2-b837-7000-8000-000000000109', '__TEST-LOCKED', 'locked@test.loanms.example', '__test_locked')
ON CONFLICT DO NOTHING;
--> statement-breakpoint

-- Account
-- Default password is P@ssw0rd1234
INSERT INTO "account"
    (id, user_id, account_id, provider_id, password)
VALUES
    ('__TEST-ACCOUNT_OWNER', '__TEST-USER_OWNER', '__TEST-USER_OWNER', 'credential', 'ZLdlpfqhiPOY5tot3wc5Iq3xt-N8eHrB:691f4315a32bb67e45572fdfa8d0556076062d63e3402844bfb8eed3f7a09a5460ee6553fe751d79e076bcf00fece142d5b4315df8475f15c9acf46c4897412e'),
    ('__TEST-ACCOUNT_ADMIN', '__TEST-USER_ADMIN', '__TEST-USER_ADMIN', 'credential', 'ZLdlpfqhiPOY5tot3wc5Iq3xt-N8eHrB:691f4315a32bb67e45572fdfa8d0556076062d63e3402844bfb8eed3f7a09a5460ee6553fe751d79e076bcf00fece142d5b4315df8475f15c9acf46c4897412e'),
    ('__TEST-ACCOUNT_MEMBER', '__TEST-USER_MEMBER', '__TEST-USER_MEMBER', 'credential', 'ZLdlpfqhiPOY5tot3wc5Iq3xt-N8eHrB:691f4315a32bb67e45572fdfa8d0556076062d63e3402844bfb8eed3f7a09a5460ee6553fe751d79e076bcf00fece142d5b4315df8475f15c9acf46c4897412e'),
    ('__TEST-ACCOUNT_MULTI_ROLE', '__TEST-USER_MULTI_ROLE', '__TEST-USER_MULTI_ROLE', 'credential', 'ZLdlpfqhiPOY5tot3wc5Iq3xt-N8eHrB:691f4315a32bb67e45572fdfa8d0556076062d63e3402844bfb8eed3f7a09a5460ee6553fe751d79e076bcf00fece142d5b4315df8475f15c9acf46c4897412e'),
    ('__TEST-ACCOUNT_AUTH_MUTABLE', '__TEST-USER_AUTH_MUTABLE', '__TEST-USER_AUTH_MUTABLE', 'credential', 'ZLdlpfqhiPOY5tot3wc5Iq3xt-N8eHrB:691f4315a32bb67e45572fdfa8d0556076062d63e3402844bfb8eed3f7a09a5460ee6553fe751d79e076bcf00fece142d5b4315df8475f15c9acf46c4897412e'),
    ('__TEST-ACCOUNT_PASSWORD_MUTABLE', '__TEST-USER_PASSWORD_MUTABLE', '__TEST-USER_PASSWORD_MUTABLE', 'credential', 'ZLdlpfqhiPOY5tot3wc5Iq3xt-N8eHrB:691f4315a32bb67e45572fdfa8d0556076062d63e3402844bfb8eed3f7a09a5460ee6553fe751d79e076bcf00fece142d5b4315df8475f15c9acf46c4897412e'),
    ('__TEST-ACCOUNT_NO_ATTRIBUTE', '__TEST-USER_NO_ATTRIBUTE', '__TEST-USER_NO_ATTRIBUTE', 'credential', 'ZLdlpfqhiPOY5tot3wc5Iq3xt-N8eHrB:691f4315a32bb67e45572fdfa8d0556076062d63e3402844bfb8eed3f7a09a5460ee6553fe751d79e076bcf00fece142d5b4315df8475f15c9acf46c4897412e'),
    ('__TEST-ACCOUNT_LOCKED', '__TEST-USER_LOCKED', '__TEST-USER_LOCKED', 'credential', 'ZLdlpfqhiPOY5tot3wc5Iq3xt-N8eHrB:691f4315a32bb67e45572fdfa8d0556076062d63e3402844bfb8eed3f7a09a5460ee6553fe751d79e076bcf00fece142d5b4315df8475f15c9acf46c4897412e')
ON CONFLICT DO NOTHING;
--> statement-breakpoint

-- User Address
INSERT INTO "user_address"
    (id, public_id, user_id, type, is_primary, address_line_1, address_line_2, dependent_locality, locality, administrative_area, postal_code, country_code)
VALUES
    (100, '019c9b48-1000-7000-8000-000000000100', '__TEST-USER_MEMBER', 'RESIDENTIAL', true, '__TEST-1 SEED STREET', NULL, '__TEST-SEED BARANGAY', '__TEST-SEED CITY', '__TEST-SEED REGION', '1000', 'PH');
--> statement-breakpoint

-- Member
INSERT INTO "member"
    (id, user_id, organization_id, role, websocket_authorization_version)
VALUES
    ('__TEST-MEMBER_OWNER', '__TEST-USER_OWNER', '__TEST-ORG_PRIMARY', 'owner', '019c9b48-1000-7000-8000-000000000001'),
    ('__TEST-MEMBER_ADMIN', '__TEST-USER_ADMIN', '__TEST-ORG_PRIMARY', 'admin', '019c9b48-1000-7000-8000-000000000002'),
    ('__TEST-MEMBER_MEMBER', '__TEST-USER_MEMBER', '__TEST-ORG_PRIMARY', 'member', '019c9b48-1000-7000-8000-000000000003'),
    ('__TEST-MEMBER_MULTI_ROLE', '__TEST-USER_MULTI_ROLE', '__TEST-ORG_PRIMARY', 'owner,admin,member', '019c9b48-1000-7000-8000-000000000004'),
    ('__TEST-MEMBER_AUTH_MUTABLE', '__TEST-USER_AUTH_MUTABLE', '__TEST-ORG_PRIMARY', 'admin', '019c9b48-1000-7000-8000-000000000005'),
    ('__TEST-MEMBER_PASSWORD_MUTABLE', '__TEST-USER_PASSWORD_MUTABLE', '__TEST-ORG_PRIMARY', 'member', '019c9b48-1000-7000-8000-000000000006'),
    ('__TEST-MEMBER_NO_ATTRIBUTE', '__TEST-USER_NO_ATTRIBUTE', '__TEST-ORG_PRIMARY', 'member', '019c9b48-1000-7000-8000-000000000007'),
    ('__TEST-MEMBER_NO_CREDENTIAL', '__TEST-USER_NO_CREDENTIAL', '__TEST-ORG_PRIMARY', 'member', '019c9b48-1000-7000-8000-000000000008'),
    ('__TEST-MEMBER_LOCKED', '__TEST-USER_LOCKED', '__TEST-ORG_PRIMARY', 'member', '019c9b48-1000-7000-8000-000000000009'),
    ('__TEST-MEMBER_ISOLATED_OWNER', '__TEST-USER_OWNER', '__TEST-ORG_ISOLATED', 'owner', '019c9b48-1000-7000-8000-000000000010')
ON CONFLICT DO NOTHING;
--> statement-breakpoint

-- User Attribute
INSERT INTO "user_attribute"
    (user_id, is_locked)
VALUES
    ('__TEST-USER_OWNER', false),
    ('__TEST-USER_ADMIN', false),
    ('__TEST-USER_MEMBER', false),
    ('__TEST-USER_MULTI_ROLE', false),
    ('__TEST-USER_AUTH_MUTABLE', false),
    ('__TEST-USER_PASSWORD_MUTABLE', false),
    ('__TEST-USER_NO_CREDENTIAL', false),
    ('__TEST-USER_LOCKED', true)
ON CONFLICT DO NOTHING;
--> statement-breakpoint

-- User Profile
INSERT INTO "user_profile"
    (user_id, first_name, last_name, gender, backup_phone_number)
VALUES
    ('__TEST-USER_MEMBER', '__TEST-MEMBER', '__TEST-MEMBER', 'MALE', '09170000000')
ON CONFLICT DO NOTHING;
--> statement-breakpoint

-- Tenant isolation fixtures
INSERT INTO "key_value" (public_id, organization_id, key, value)
VALUES
    ('019c9b48-1000-7000-8000-000000000201', '__TEST-ORG_PRIMARY', '__TEST-tenantIsolation.sharedSetting', 'org-a'),
    ('019c9b48-1000-7000-8000-000000000202', '__TEST-ORG_ISOLATED', '__TEST-tenantIsolation.sharedSetting', 'org-b')
ON CONFLICT DO NOTHING;
--> statement-breakpoint

INSERT INTO "upload" (id, organization_id, user_id, idempotency_key, is_committed)
VALUES ('TESTTenantUploadIsolated001', '__TEST-ORG_ISOLATED', '__TEST-USER_OWNER', '00000000-0000-7000-8000-000000009002', true)
ON CONFLICT DO NOTHING;
--> statement-breakpoint

INSERT INTO "object_storage" (id, organization_id, size, mime_type, hash_sha256, is_public, is_uploaded)
VALUES (
    'TESTTenantObjectIsolated000000001',
    '__TEST-ORG_ISOLATED',
    128,
    'text/plain',
    'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    false,
    true
)
ON CONFLICT DO NOTHING;
--> statement-breakpoint

INSERT INTO "object_storage_acl" (organization_id, object_storage_id, user_id, mode)
VALUES ('__TEST-ORG_ISOLATED', 'TESTTenantObjectIsolated000000001', '__TEST-USER_OWNER', 1)
ON CONFLICT DO NOTHING;
--> statement-breakpoint

INSERT INTO "upload_attachment" (organization_id, upload_id, object_storage_id)
VALUES ('__TEST-ORG_ISOLATED', 'TESTTenantUploadIsolated001', 'TESTTenantObjectIsolated000000001')
ON CONFLICT DO NOTHING;
--> statement-breakpoint
