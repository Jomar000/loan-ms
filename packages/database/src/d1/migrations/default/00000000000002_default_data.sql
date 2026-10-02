-- Organization
INSERT INTO "organization"
    (id, name, slug)
VALUES
    ('ORGANIZATION_001', 'SUPER ORGANIZATION', 'superorganization')
ON CONFLICT DO NOTHING;
--> statement-breakpoint
-- User
INSERT INTO "user"
    (id, public_id, name, email, username)
VALUES
    ('USER_001', '019936e2-b837-7000-8000-000000000001', 'SUPER ADMINISTRATOR', 'superadministrator@hyperion.app', 'superadministrator'),
    ('USER_002', '019936e2-b837-7000-8000-000000000002', 'ADMINISTRATOR', 'administrator@hyperion.app', 'administrator'),
    ('USER_003', '019936e2-b837-7000-8000-000000000003', 'MEMBER', 'member@hyperion.app', 'member')
ON CONFLICT DO NOTHING;
--> statement-breakpoint

-- Account
-- Default password is P@ssw0rd1234
INSERT INTO "account"
    (id, user_id, account_id, provider_id, password)
VALUES
    ('ACCOUNT_001', 'USER_001', 'USER_001', 'credential', 'ZLdlpfqhiPOY5tot3wc5Iq3xt-N8eHrB:691f4315a32bb67e45572fdfa8d0556076062d63e3402844bfb8eed3f7a09a5460ee6553fe751d79e076bcf00fece142d5b4315df8475f15c9acf46c4897412e'),
    ('ACCOUNT_002', 'USER_002', 'USER_002', 'credential', 'ZLdlpfqhiPOY5tot3wc5Iq3xt-N8eHrB:691f4315a32bb67e45572fdfa8d0556076062d63e3402844bfb8eed3f7a09a5460ee6553fe751d79e076bcf00fece142d5b4315df8475f15c9acf46c4897412e'),
    ('ACCOUNT_003', 'USER_003', 'USER_003', 'credential', 'ZLdlpfqhiPOY5tot3wc5Iq3xt-N8eHrB:691f4315a32bb67e45572fdfa8d0556076062d63e3402844bfb8eed3f7a09a5460ee6553fe751d79e076bcf00fece142d5b4315df8475f15c9acf46c4897412e')
ON CONFLICT DO NOTHING;
--> statement-breakpoint

-- Member
INSERT INTO "member"
    (id, user_id, organization_id, role, websocket_authorization_version)
VALUES
    ('MEMBER_001', 'USER_001', 'ORGANIZATION_001', 'owner', '019c9b48-0000-7000-8000-000000000001'),
    ('MEMBER_002', 'USER_002', 'ORGANIZATION_001', 'admin', '019c9b48-0000-7000-8000-000000000002'),
    ('MEMBER_003', 'USER_003', 'ORGANIZATION_001', 'member', '019c9b48-0000-7000-8000-000000000003')
ON CONFLICT DO NOTHING;
--> statement-breakpoint

-- Role
INSERT INTO "role"
    (id, name, description)
VALUES
    (1, 'owner', 'Organization Owner'),
    (2, 'admin', 'Organization Administrator'),
    (3, 'member', 'Organization Member');
--> statement-breakpoint

-- Permission
INSERT INTO "permission"
    (component, action, api_key_assignable, role_id)
VALUES
    /**
     * OWNER (role_id: 1) - Full access to all components
     */
    ('SYSOWNER', 'ANY', false, 1),
    ('SYSADMIN', 'ANY', false, 1),
    ('auditTrail', 'read', false, 1),
    ('apiKey', 'create', false, 1),
    ('apiKey', 'read', false, 1),
    ('apiKey', 'update', false, 1),
    ('apiKey', 'delete', false, 1),
    ('servicePrincipal', 'create', false, 1),
    ('servicePrincipal', 'read', false, 1),
    ('servicePrincipal', 'update', false, 1),
    ('servicePrincipal', 'delete', false, 1),
    ('api.public', 'access', true, 1),
    ('api.backoffice', 'access', true, 1),
    ('ws', 'listen', false, 1),
    /**
     * ADMIN (role_id: 2) - Full access to all components
     */
    ('SYSADMIN', 'ANY', false, 2),
    ('auditTrail', 'read', false, 2),
    ('apiKey', 'create', false, 2),
    ('apiKey', 'read', false, 2),
    ('apiKey', 'update', false, 2),
    ('apiKey', 'delete', false, 2),
    ('servicePrincipal', 'create', false, 2),
    ('servicePrincipal', 'read', false, 2),
    ('servicePrincipal', 'update', false, 2),
    ('servicePrincipal', 'delete', false, 2),
    ('api.public', 'access', true, 2),
    ('api.backoffice', 'access', true, 2),
    ('ws', 'listen', false, 2),
    /**
     * MEMBER (role_id: 3) - Limited access
     */
    ('ws', 'listen', false, 3);
--> statement-breakpoint

-- User Attribute
INSERT INTO "user_attribute"
    (user_id, is_locked)
VALUES
    ('USER_001', false),
    ('USER_002', false),
    ('USER_003', false)
ON CONFLICT DO NOTHING;
--> statement-breakpoint
