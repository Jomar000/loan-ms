import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import {
    existsSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'

import { verifyFullstackD1Profile } from './profile-check-fullstack-d1.mjs'
import { applyTemplateIdentity } from './profile-init.mjs'
import { fullstackD1OwnershipGroups } from './profile-ownership-fullstack-d1.mjs'

const workspacePaths = [
    'apps/api-backoffice',
    'apps/api-public',
    'apps/web-backoffice',
    'apps/web-public',
    'packages/database',
    'packages/errors',
    'packages/rate-limit',
    'packages/types',
    'packages/ui',
    'packages/validator',
    'packages/websocket',
]
const customConfiguration = {
    author: 'Acme Inc.',
    bindingPrefix: 'ACME_PORTAL',
    displayName: 'Acme Portal',
    domain: 'acme.example',
    scope: '@acme',
    slug: 'acme-portal',
}

function git(root, ...arguments_) {
    return execFileSync(
        'git',
        [
            '-C',
            root,
            ...arguments_,
        ],
        {
            encoding: 'utf8',
            stdio: [
                'ignore',
                'pipe',
                'pipe',
            ],
        },
    )
}

function writeFixtureFile(root, path, contents) {
    const absolutePath = join(root, path)
    mkdirSync(dirname(absolutePath), { recursive: true })
    writeFileSync(absolutePath, contents)
}

function writeJson(root, path, contents) {
    writeFixtureFile(root, path, `${JSON.stringify(contents, null, 4)}\n`)
}

function workspacePackageName(path) {
    return `@hyperion/${path.slice(path.lastIndexOf('/') + 1)}`
}

function createFixture() {
    const root = mkdtempSync(join(tmpdir(), 'hyperion-check-d1-'))
    git(root, 'init', '--quiet')
    git(root, 'config', 'user.email', 'template-test@example.com')
    git(root, 'config', 'user.name', 'Template Test')

    writeJson(root, 'package.json', {
        author: '4thDEVisionTech',
        description: 'Hyperion',
        name: 'hyperion',
        private: true,
        scripts: {
            'profile:init': 'node ./scripts/repository/profile-init.mjs',
            'profile:test':
                'node --test ./scripts/repository/profile-init.test.mjs ./scripts/repository/profile-check-fullstack-d1.test.mjs',
        },
    })
    for (const path of workspacePaths) {
        const manifest = {
            name: workspacePackageName(path),
            private: true,
        }
        if (path.startsWith('apps/api-')) {
            manifest.devDependencies = {
                '@hyperion/database': 'workspace:*',
            }
        }
        writeJson(root, `${path}/package.json`, manifest)
    }
    writeJson(root, 'packages/database/package.json', {
        dependencies: {
            postgres: 'catalog:',
        },
        exports: {
            './postgres': './src/postgres/index.ts',
        },
        name: '@hyperion/database',
        private: true,
    })

    writeFixtureFile(root, '.agents/context/NOTES.md', '# PostgreSQL notes\n')
    const skillContents = '# Skill\n\n## Guidance\n\nText.\n'
    writeFixtureFile(root, '.agents/skills/example/SKILL.md', skillContents)
    writeFixtureFile(root, '.claude/skills/example/SKILL.md', skillContents)
    writeFixtureFile(root, 'README.md', '# Hyperion\n')
    writeFixtureFile(
        root,
        'scripts/repository/profile-init.mjs',
        '// full stack\n',
    )
    writeFixtureFile(
        root,
        'scripts/repository/profile-init.test.mjs',
        '// tests\n',
    )
    writeFixtureFile(
        root,
        'packages/database/src/postgres/index.ts',
        "export const dialect = 'postgres'\n",
    )
    writeFixtureFile(
        root,
        'packages/database/drizzle.config.ts',
        "export default { dialect: 'postgresql' }\n",
    )
    for (const surface of [
        'api-public',
        'api-backoffice',
    ]) {
        writeFixtureFile(
            root,
            `apps/${surface}/src/core/middleware/initContext.ts`,
            "import { dbClient } from '@hyperion/database/postgres'\n",
        )
        writeFixtureFile(
            root,
            `apps/${surface}/src/worker-configuration.d.ts`,
            'interface Env { DB: Hyperdrive }\n',
        )
        writeFixtureFile(
            root,
            `apps/${surface}/wrangler.toml`,
            '[[hyperdrive]]\nbinding = "DB"\n',
        )
    }
    writeFixtureFile(
        root,
        'packages/ui/src/common.ts',
        "export const packageName = '@hyperion/ui'\n",
    )
    writeFixtureFile(
        root,
        'packages/ui/src/asset.bin',
        Buffer.from([
            0,
            1,
            2,
            3,
        ]),
    )
    writeFixtureFile(
        root,
        'pnpm-workspace.yaml',
        [
            'catalog:',
            '  postgres: ^3.4.0',
            '',
            'packages:',
            "  - 'apps/**'",
            "  - 'packages/**'",
            '',
        ].join('\n'),
    )
    writeLockfile(root)
    ensureOwnershipFixturePaths(root)

    git(root, 'add', '.')
    git(root, 'commit', '--quiet', '-m', 'full-stack baseline')
    git(root, 'branch', '-M', 'fullstack_postgres')
    git(root, 'switch', '--quiet', '-c', 'fullstack_d1')
    applyD1Profile(root)
    return root
}

function writeLockfile(root) {
    writeFixtureFile(
        root,
        'pnpm-lock.yaml',
        [
            "lockfileVersion: '9.0'",
            '',
            'importers:',
            '',
            '  .:',
            '',
            ...workspacePaths.flatMap((path) =>
                path === 'packages/types'
                    ? [
                          `  ${path}: {}`,
                          '',
                      ]
                    : [
                          `  ${path}:`,
                          '',
                      ],
            ),
        ].join('\n'),
    )
}

function applyD1Profile(root) {
    rmSync(join(root, 'packages/database/src/postgres'), {
        force: true,
        recursive: true,
    })
    writeJson(root, 'package.json', {
        author: '4thDEVisionTech',
        description: 'Hyperion',
        name: 'hyperion',
        private: true,
        profile: 'fullstack-d1',
        scripts: {
            'profile:check':
                'node ./scripts/repository/profile-check-fullstack-d1.mjs',
            'profile:check:postgres':
                'node ./scripts/repository/profile-check-fullstack-d1.mjs --compare-postgres',
            'profile:init': 'node ./scripts/repository/profile-init.mjs',
            'profile:test':
                'node --test ./scripts/repository/profile-init.test.mjs ./scripts/repository/profile-check-fullstack-d1.test.mjs',
        },
    })
    writeJson(root, 'packages/database/package.json', {
        dependencies: {
            'drizzle-orm': 'catalog:',
        },
        exports: {
            './d1': './src/d1/index.ts',
        },
        name: '@hyperion/database',
        private: true,
        scripts: {
            'migrate:dev': 'pnpm exec wrangler d1 migrations apply app-dev',
            'migrate:prod': 'pnpm exec wrangler d1 migrations apply app-prod',
            'migrate:staging':
                'pnpm exec wrangler d1 migrations apply app-staging',
        },
    })
    writeFixtureFile(
        root,
        'packages/database/drizzle.config.ts',
        [
            'export default {',
            "    dialect: 'sqlite',",
            "    out: './src/d1/migrations/default',",
            "    schema: './src/d1/schema.ts',",
            '}',
            '',
        ].join('\n'),
    )
    writeFixtureFile(
        root,
        'packages/database/src/d1/client.ts',
        'export const dbClient = () => ({})\n',
    )
    writeFixtureFile(
        root,
        'packages/database/src/d1/index.ts',
        "export * from './client.js'\nexport * from './schema.js'\n",
    )
    writeFixtureFile(
        root,
        'packages/database/src/d1/schema.ts',
        'export const dbSchema = {}\n',
    )
    writeFixtureFile(
        root,
        'packages/database/src/d1/migrations/default/0000_schema.sql',
        'CREATE TABLE example (id text PRIMARY KEY);\n',
    )
    writeFixtureFile(
        root,
        'packages/database/src/d1/migrations/test/9999_test.sql',
        "INSERT INTO example (id) VALUES ('test');\n",
    )
    writeFixtureFile(root, '.agents/context/NOTES.md', '# D1 notes\n')
    writeFixtureFile(root, 'scripts/repository/profile-init.mjs', '// d1\n')
    writeFixtureFile(
        root,
        'scripts/repository/profile-init.test.mjs',
        '// d1 tests\n',
    )
    writeFixtureFile(
        root,
        'pnpm-workspace.yaml',
        [
            'catalog:',
            '  drizzle-orm: ^1.0.0',
            '',
            'packages:',
            "  - 'apps/**'",
            "  - 'packages/**'",
            '',
        ].join('\n'),
    )

    for (const [
        surface,
        suffix,
    ] of [
        [
            'api-public',
            'PUB',
        ],
        [
            'api-backoffice',
            'BOFC',
        ],
    ]) {
        writeFixtureFile(
            root,
            `apps/${surface}/src/core/middleware/initContext.ts`,
            "import { dbClient } from '@hyperion/database/d1'\n",
        )
        writeFixtureFile(
            root,
            `apps/${surface}/src/worker-configuration.d.ts`,
            [
                `interface Env { HYPERION${suffix}_D1: D1Database }`,
                '// Begin runtime types',
                'interface Hyperdrive { connect(): unknown }',
                '',
            ].join('\n'),
        )
        writeFixtureFile(
            root,
            `apps/${surface}/wrangler.toml`,
            createWranglerFixture(suffix, surface === 'api-public'),
        )
    }
    differentiateOwnershipFixturePaths(root)
}

function ensureOwnershipFixturePaths(root) {
    for (const group of fullstackD1OwnershipGroups) {
        for (const path of group.paths ?? []) {
            ensureOwnershipFixturePath(root, path)
        }
        for (const relativePath of group.apiRelativePaths ?? []) {
            for (const surface of [
                'apps/api-public',
                'apps/api-backoffice',
            ]) {
                ensureOwnershipFixturePath(root, `${surface}/${relativePath}`)
            }
        }
    }
}

function ensureOwnershipFixturePath(root, path) {
    if (existsSync(join(root, path))) return
    if (path.endsWith('.json')) {
        writeJson(root, path, { fixture: true })
        return
    }
    const contents = /\.(?:md|txt)$/u.test(path)
        ? '# Profile fixture\n'
        : '// Profile fixture\n'
    writeFixtureFile(root, path, contents)
}

function differentiateOwnershipFixturePaths(root) {
    const changedPaths = new Set(
        git(root, 'diff', '--name-only', 'fullstack_postgres', '--')
            .split(/\r?\n/u)
            .filter(Boolean),
    )
    for (const group of fullstackD1OwnershipGroups) {
        const paths = [
            ...(group.paths ?? []),
            ...[
                'apps/api-public',
                'apps/api-backoffice',
            ].flatMap((surface) =>
                (group.apiRelativePaths ?? []).map(
                    (relativePath) => `${surface}/${relativePath}`,
                ),
            ),
        ]
        for (const path of paths) {
            const absolutePath = join(root, path)
            if (!existsSync(absolutePath)) continue
            if (changedPaths.has(path)) continue
            const contents = readFileSync(absolutePath, 'utf8')

            if (path.endsWith('.json')) {
                writeJson(root, path, {
                    ...JSON.parse(contents),
                    d1ProfileFixture: true,
                })
            } else if (/\.(?:md|txt)$/u.test(path)) {
                writeFixtureFile(root, path, `${contents}\nD1 profile.\n`)
            } else if (/\.(?:toml|yaml|yml)$/u.test(path)) {
                writeFixtureFile(root, path, `${contents}\n# D1 profile.\n`)
            } else {
                writeFixtureFile(root, path, `${contents}\n// D1 profile.\n`)
            }
        }
    }
}

function createWranglerFixture(suffix, migrationOwner) {
    const migrationLines = migrationOwner
        ? [
              'migrations_dir = "../../packages/database/src/d1/migrations/default"',
              'migrations_pattern = "../../packages/database/src/d1/migrations/default/*.sql"',
          ]
        : []
    return [
        '[[d1_databases]]',
        `binding = "HYPERION${suffix}_D1"`,
        'database_name = "hyperion-development"',
        'database_id = "development-id"',
        ...migrationLines,
        '',
        '[[env.test.d1_databases]]',
        `binding = "HYPERION${suffix}_D1"`,
        'database_name = "hyperion-test"',
        'database_id = "test-id"',
        ...migrationLines,
        '',
    ].join('\n')
}

function initializeFixture(root, configuration = customConfiguration) {
    const files = git(
        root,
        'ls-files',
        '--cached',
        '--others',
        '--exclude-standard',
        '-z',
    )
        .split('\0')
        .filter(Boolean)
    for (const file of files) {
        const path = join(root, file)
        if (!existsSync(path)) continue
        const buffer = readFileSync(path)
        if (buffer.includes(0)) continue

        const contents = buffer.toString('utf8')
        const next = applyTemplateIdentity(contents, configuration, file)
        if (next !== contents) writeFileSync(path, next)
    }
    writeJson(root, '.template-initialized.json', {
        ...configuration,
        configuredAt: '2026-08-27T01:02:03.456Z',
    })
}

function verify(root, comparePostgres = true) {
    return verifyFullstackD1Profile({
        comparePostgres,
        repositoryRoot: root,
    })
}

test('accepts a valid D1 profile and exact shared baseline', (context) => {
    const root = createFixture()
    context.after(() => rmSync(root, { force: true, recursive: true }))

    assert.deepEqual(verify(root, false), [])
    assert.deepEqual(verify(root), [])
})

test('accepts a profile-local skill audit completion timestamp', (context) => {
    const root = createFixture()
    context.after(() => rmSync(root, { force: true, recursive: true }))
    const auditedSkillContents =
        '# Skill\n\n## Last Comprehensive Audit Timestamp\n\n2099-01-02T03:04:05+08:00\n\n## Guidance\n\nText.\n'

    for (const path of [
        '.agents/skills/example/SKILL.md',
        '.claude/skills/example/SKILL.md',
    ]) {
        writeFixtureFile(root, path, auditedSkillContents)
    }

    assert.deepEqual(verify(root), [])
})

test('accepts initialized identities without recursive replacement', (context) => {
    const root = createFixture()
    context.after(() => rmSync(root, { force: true, recursive: true }))
    initializeFixture(root, {
        ...customConfiguration,
        author: 'Hyperion Labs',
        scope: '@hyperion-labs',
    })

    assert.deepEqual(verify(root), [])
})

test('rejects shared drift and unclassified paths', (context) => {
    const root = createFixture()
    context.after(() => rmSync(root, { force: true, recursive: true }))
    writeFixtureFile(
        root,
        'packages/ui/src/common.ts',
        "export const packageName = '@hyperion/ui' // drift\n",
    )
    writeFixtureFile(
        root,
        'packages/ui/src/d1-only.ts',
        'export const d1Only = true\n',
    )

    const errors = verify(root)
    assert.ok(
        errors.includes(
            'Shared file differs from fullstack_postgres: packages/ui/src/common.ts',
        ),
    )
    assert.ok(
        errors.includes(
            'shared fullstack_d1/fullstack_postgres baseline paths unexpected: packages/ui/src/d1-only.ts',
        ),
    )
})

test('requires newly propagated shared files to use the fork identity', (context) => {
    const root = createFixture()
    context.after(() => rmSync(root, { force: true, recursive: true }))
    initializeFixture(root)
    const path = 'packages/ui/src/common.ts'
    const canonicalContents = git(root, 'show', `fullstack_postgres:${path}`)
    rmSync(join(root, path))

    assert.ok(
        verify(root).includes(
            `shared fullstack_d1/fullstack_postgres baseline paths missing: ${path}`,
        ),
    )

    writeFixtureFile(root, path, canonicalContents)
    assert.ok(
        verify(root).includes(
            `Shared file differs from fullstack_postgres: ${path}`,
        ),
    )

    writeFixtureFile(
        root,
        path,
        applyTemplateIdentity(canonicalContents, customConfiguration, path),
    )
    assert.deepEqual(verify(root), [])
})

test('rejects PostgreSQL leakage and invalid D1 contracts', (context) => {
    const root = createFixture()
    context.after(() => rmSync(root, { force: true, recursive: true }))
    const databaseManifest = JSON.parse(
        readFileSync(join(root, 'packages/database/package.json'), 'utf8'),
    )
    databaseManifest.dependencies.postgres = 'catalog:'
    databaseManifest.exports['./postgres'] = './src/postgres/index.ts'
    writeJson(root, 'packages/database/package.json', databaseManifest)
    writeFixtureFile(
        root,
        'packages/database/src/postgres/index.ts',
        "export const dialect = 'postgres'\n",
    )
    writeFixtureFile(
        root,
        'apps/api-public/src/core/middleware/initContext.ts',
        "import postgres from 'postgres'\n",
    )
    writeFixtureFile(
        root,
        'apps/api-public/src/worker-configuration.d.ts',
        'interface Env { HYPERIONPUB_D1: Hyperdrive }\n',
    )
    const backofficeWrangler = createWranglerFixture('BOFC', false).replace(
        'database_id = "test-id"',
        [
            'database_id = "different-test-id"',
            'migrations_dir = "../../packages/database/src/d1/migrations/default"',
        ].join('\n'),
    )
    writeFixtureFile(
        root,
        'apps/api-backoffice/wrangler.toml',
        backofficeWrangler,
    )

    const errors = verify(root, false)
    assert.ok(
        errors.includes(
            'packages/database/package.json declares forbidden dependency postgres',
        ),
    )
    assert.ok(
        errors.includes(
            'PostgreSQL database source is tracked: packages/database/src/postgres/index.ts',
        ),
    )
    assert.ok(
        errors.includes('database package exports unexpected: ./postgres'),
    )
    assert.ok(
        errors.some((error) =>
            error.includes('must import @hyperion/database/d1'),
        ),
    )
    assert.ok(
        errors.some((error) =>
            error.includes('must declare HYPERIONPUB_D1: D1Database'),
        ),
    )
    assert.ok(
        errors.some((error) =>
            error.includes('must not declare migrations_dir'),
        ),
    )
    assert.ok(
        errors.includes(
            'Public and backoffice test D1 bindings must share database_id',
        ),
    )
})

test('reports stale ownership groups', (context) => {
    const root = createFixture()
    context.after(() => rmSync(root, { force: true, recursive: true }))
    writeFixtureFile(root, '.agents/context/NOTES.md', '# PostgreSQL notes\n')

    assert.ok(
        verify(root).includes(
            'Fullstack D1 ownership rule is stale: D1 profile guidance path .agents/context/NOTES.md',
        ),
    )
})

test('rejects malformed markers and the retired smoke command', (context) => {
    const root = createFixture()
    context.after(() => rmSync(root, { force: true, recursive: true }))
    const manifest = JSON.parse(
        readFileSync(join(root, 'package.json'), 'utf8'),
    )
    manifest.scripts['test:d1-shared-persistence'] =
        'node ./scripts/d1-shared-persistence-smoke.mjs'
    manifest.scripts['configure:template'] =
        'node ./scripts/configure-template.mjs'
    writeJson(root, 'package.json', manifest)
    writeFixtureFile(root, '.template-initialized.json', '{\n')

    const errors = verify(root, false)
    assert.ok(
        errors.some((error) =>
            error.startsWith('.template-initialized.json is invalid JSON:'),
        ),
    )
    assert.ok(
        errors.includes(
            'package.json must not declare the retired test:d1-shared-persistence command',
        ),
    )
    assert.ok(
        errors.includes(
            'package.json must not declare deprecated profile command configure:template',
        ),
    )
})

// =============================================================================
// END OF BASE TEMPLATE TESTS - FORK-SPECIFIC TESTS MUST BE ADDED BELOW
// =============================================================================
