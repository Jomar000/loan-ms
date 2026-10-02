import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
    compareLists,
    createProfileRepository,
    escapeRegExp,
    firstParagraph,
    projectReferenceBuffer,
    readTemplateInitialization,
} from './profile-check.mjs'
import {
    getFullstackD1Owner,
    fullstackD1OwnershipRules,
} from './profile-ownership-fullstack-d1.mjs'

const defaultRepositoryRoot = resolve(
    dirname(fileURLToPath(import.meta.url)),
    '..',
    '..',
)
const postgresReference = 'fullstack_postgres'
const workspaceManifestPattern = /^(?:apps|packages)\/[^/]+\/package\.json$/u
const expectedWorkspaceManifests = [
    'apps/api-backoffice/package.json',
    'apps/api-public/package.json',
    'apps/web-backoffice/package.json',
    'apps/web-public/package.json',
    'packages/database/package.json',
    'packages/errors/package.json',
    'packages/rate-limit/package.json',
    'packages/types/package.json',
    'packages/ui/package.json',
    'packages/validator/package.json',
    'packages/websocket/package.json',
]
const expectedLockfileImporters = [
    '.',
    ...expectedWorkspaceManifests.map((path) =>
        path.slice(0, -'/package.json'.length),
    ),
]
const dependencySections = [
    'dependencies',
    'devDependencies',
    'optionalDependencies',
    'peerDependencies',
]
const expectedProfileScripts = {
    'profile:check': 'node ./scripts/repository/profile-check-fullstack-d1.mjs',
    'profile:check:postgres':
        'node ./scripts/repository/profile-check-fullstack-d1.mjs --compare-postgres',
    'profile:init': 'node ./scripts/repository/profile-init.mjs',
    'profile:test':
        'node --test ./scripts/repository/profile-init.test.mjs ./scripts/repository/profile-check-fullstack-d1.test.mjs',
}
const deprecatedProfileScripts = [
    'configure:template',
    'test:template',
]
const requiredDatabasePaths = [
    'packages/database/src/d1/client.ts',
    'packages/database/src/d1/index.ts',
    'packages/database/src/d1/schema.ts',
]
const forbiddenDatabasePaths = [
    'packages/database/.env.example',
    'packages/database/.env.test.example',
    'packages/database/drizzle.config.ts.example',
]
const profileMetadataPaths = new Set(['.template-initialized.json'])
const skillAuditTimestampPattern =
    /## Last Comprehensive Audit Timestamp\r?\n\r?\n[^\r\n]+\r?\n\r?\n/gu

export function verifyFullstackD1Profile({
    comparePostgres = false,
    repositoryRoot = defaultRepositoryRoot,
} = {}) {
    const errors = []
    const repository = createProfileRepository(repositoryRoot)
    const trackedFiles = repository.trackedFiles()
    const trackedFileSet = new Set(trackedFiles)
    const workspaceManifestPaths = trackedFiles.filter((file) =>
        workspaceManifestPattern.test(file),
    )
    const initialization = readTemplateInitialization(repository, errors)
    const scope = initialization.configuration?.scope ?? '@loanms'
    const bindingPrefix =
        initialization.configuration?.bindingPrefix ?? 'LOANMS'

    verifyWorkspaceProfile()
    verifySkillMirrors()
    verifyD1DatabasePackage()
    verifyApiDatabaseBoundary()
    verifyD1WranglerBindings()
    verifyRootScripts()

    if (comparePostgres) verifyPostgresBaseline()

    return errors

    function verifyWorkspaceProfile() {
        compareLists(
            errors,
            workspaceManifestPaths,
            expectedWorkspaceManifests,
            'tracked workspace manifests',
        )

        const lockfile = readTextIfPresent('pnpm-lock.yaml')
        if (lockfile !== undefined) {
            const actualImporters = [
                ...lockfile.matchAll(
                    /^ {2}(\.|(?:apps|packages)\/[^:\r\n]+):(?: \{\})?\r?$/gmu,
                ),
            ].map((match) => match[1])
            compareLists(
                errors,
                actualImporters,
                expectedLockfileImporters,
                'pnpm lockfile importers',
            )
        }

        for (const path of [
            'package.json',
            ...workspaceManifestPaths,
        ]) {
            const manifest = readJsonIfPresent(path)
            if (!manifest) continue

            for (const section of dependencySections) {
                if (Object.hasOwn(manifest[section] ?? {}, 'postgres')) {
                    errors.push(
                        `${path} declares forbidden dependency postgres`,
                    )
                }
            }
        }

        const workspaceContents = readTextIfPresent('pnpm-workspace.yaml')
        if (
            workspaceContents !== undefined &&
            /^ {2}(?:['"]?postgres['"]?):/mu.test(workspaceContents)
        ) {
            errors.push(
                'pnpm-workspace.yaml declares forbidden catalog entry postgres',
            )
        }
    }

    function verifySkillMirrors() {
        const canonicalSkills = trackedFiles
            .filter((file) => file.startsWith('.agents/skills/'))
            .map((file) => file.slice('.agents/skills/'.length))
        const mirroredSkills = trackedFiles
            .filter((file) => file.startsWith('.claude/skills/'))
            .map((file) => file.slice('.claude/skills/'.length))

        compareLists(
            errors,
            canonicalSkills,
            mirroredSkills,
            'skill mirror paths',
        )

        for (const relativePath of canonicalSkills) {
            const canonicalPath = `.agents/skills/${relativePath}`
            const mirrorPath = `.claude/skills/${relativePath}`
            if (
                trackedFileSet.has(mirrorPath) &&
                repository.readText(canonicalPath) !==
                    repository.readText(mirrorPath)
            ) {
                errors.push(`Skill mirror content differs: ${relativePath}`)
            }
        }
    }

    function verifyD1DatabasePackage() {
        for (const path of requiredDatabasePaths) requirePath(path)
        for (const path of forbiddenDatabasePaths) {
            if (trackedFileSet.has(path)) {
                errors.push(`PostgreSQL-only database path is tracked: ${path}`)
            }
        }
        for (const path of trackedFiles) {
            if (path.startsWith('packages/database/src/postgres/')) {
                errors.push(`PostgreSQL database source is tracked: ${path}`)
            }
        }

        const defaultMigrations = trackedFiles.filter(
            (path) =>
                path.startsWith(
                    'packages/database/src/d1/migrations/default/',
                ) && path.endsWith('.sql'),
        )
        const testMigrations = trackedFiles.filter(
            (path) =>
                path.startsWith('packages/database/src/d1/migrations/test/') &&
                path.endsWith('.sql'),
        )
        if (defaultMigrations.length === 0) {
            errors.push('D1 default migrations are missing')
        }
        if (testMigrations.length === 0) {
            errors.push('D1 test migrations are missing')
        }

        const databaseManifest = readJsonIfPresent(
            'packages/database/package.json',
        )
        if (databaseManifest) {
            compareLists(
                errors,
                Object.keys(databaseManifest.exports ?? {}),
                ['./d1'],
                'database package exports',
            )
            for (const script of [
                'migrate:dev',
                'migrate:prod',
                'migrate:staging',
            ]) {
                const command = databaseManifest.scripts?.[script]
                if (
                    typeof command !== 'string' ||
                    !/wrangler d1 migrations apply/u.test(command)
                ) {
                    errors.push(
                        `packages/database/package.json ${script} must use Wrangler D1 migrations`,
                    )
                }
            }
        }

        const drizzleConfig = readTextIfPresent(
            'packages/database/drizzle.config.ts',
        )
        if (drizzleConfig !== undefined) {
            for (const [
                description,
                pattern,
            ] of [
                [
                    "dialect 'sqlite'",
                    /dialect:\s*['"]sqlite['"]/u,
                ],
                [
                    'D1 migration output',
                    /out:\s*['"]\.\/src\/d1\/migrations\/default['"]/u,
                ],
                [
                    'D1 schema',
                    /schema:\s*['"]\.\/src\/d1\/schema\.ts['"]/u,
                ],
            ]) {
                if (!pattern.test(drizzleConfig)) {
                    errors.push(
                        `packages/database/drizzle.config.ts is missing ${description}`,
                    )
                }
            }
        }
    }

    function verifyApiDatabaseBoundary() {
        const escapedScope = escapeRegExp(scope)
        const requiredImport = new RegExp(
            `from\\s+['"]${escapedScope}/database/d1['"]`,
            'u',
        )

        for (const surface of [
            'api-public',
            'api-backoffice',
        ]) {
            const root = `apps/${surface}`
            const manifest = readJsonIfPresent(`${root}/package.json`)
            if (
                manifest &&
                manifest.devDependencies?.[`${scope}/database`] !==
                    'workspace:*'
            ) {
                errors.push(
                    `${root}/package.json must declare ${scope}/database as workspace:*`,
                )
            }

            const initContext = readTextIfPresent(
                `${root}/src/core/middleware/initContext.ts`,
            )
            if (
                initContext !== undefined &&
                !requiredImport.test(initContext)
            ) {
                errors.push(
                    `${root}/src/core/middleware/initContext.ts must import ${scope}/database/d1`,
                )
            }

            const bindingName = `${bindingPrefix}${surface === 'api-public' ? 'PUB' : 'BOFC'}_D1`
            const workerTypes = readTextIfPresent(
                `${root}/src/worker-configuration.d.ts`,
            )
            if (
                workerTypes !== undefined &&
                !new RegExp(
                    `\\b${escapeRegExp(bindingName)}:\\s*D1Database\\b`,
                    'u',
                ).test(workerTypes)
            ) {
                errors.push(
                    `${root}/src/worker-configuration.d.ts must declare ${bindingName}: D1Database`,
                )
            }
        }

        const operationalFiles = trackedFiles.filter(
            (path) =>
                /^apps\/api-(?:public|backoffice)\/src\//u.test(path) ||
                /^apps\/api-(?:public|backoffice)\/wrangler\.toml$/u.test(
                    path,
                ) ||
                /^packages\/database\/(?:package\.json|drizzle\.config\.ts|src\/)/u.test(
                    path,
                ),
        )
        const forbiddenPatterns = [
            /\/database\/postgres\b/u,
            /\bDATABASE_URL\b/u,
            /\bHYPERDRIVE\b/u,
            /\blocalConnectionString\b/u,
            /from\s+['"]postgres['"]/u,
            /\bHyperdrive\b/u,
        ]

        for (const path of operationalFiles) {
            const contents = repository.readText(path)
            const profileContents = path.endsWith(
                '/src/worker-configuration.d.ts',
            )
                ? contents.split('// Begin runtime types', 1)[0]
                : contents
            if (
                forbiddenPatterns.some((pattern) =>
                    pattern.test(profileContents),
                )
            ) {
                errors.push(
                    `${path} contains a PostgreSQL/Hyperdrive reference`,
                )
            }
        }
    }

    function verifyD1WranglerBindings() {
        const surfaces = [
            {
                binding: `${bindingPrefix}PUB_D1`,
                migrationOwner: true,
                path: 'apps/api-public/wrangler.toml',
            },
            {
                binding: `${bindingPrefix}BOFC_D1`,
                migrationOwner: false,
                path: 'apps/api-backoffice/wrangler.toml',
            },
        ]
        const parsedSurfaces = []

        for (const surface of surfaces) {
            const contents = readTextIfPresent(surface.path)
            if (contents === undefined) continue
            if (/\[\[(?:env\.test\.)?hyperdrive\]\]/u.test(contents)) {
                errors.push(
                    `${surface.path} must not declare Hyperdrive bindings`,
                )
            }

            const development = parseTomlArrayTables(contents, 'd1_databases')
            const test = parseTomlArrayTables(contents, 'env.test.d1_databases')
            if (development.length !== 1) {
                errors.push(
                    `${surface.path} must declare exactly one development D1 binding`,
                )
            }
            if (test.length !== 1) {
                errors.push(
                    `${surface.path} must declare exactly one test D1 binding`,
                )
            }

            for (const [
                environment,
                tables,
            ] of [
                [
                    'development',
                    development,
                ],
                [
                    'test',
                    test,
                ],
            ]) {
                const table = tables[0]
                if (!table) continue
                if (table.binding !== surface.binding) {
                    errors.push(
                        `${surface.path} ${environment} D1 binding must be ${surface.binding}`,
                    )
                }

                const migrationKeys = [
                    'migrations_dir',
                    'migrations_pattern',
                ]
                for (const key of migrationKeys) {
                    const present = typeof table[key] === 'string'
                    if (surface.migrationOwner && !present) {
                        errors.push(
                            `${surface.path} ${environment} D1 binding must declare ${key}`,
                        )
                    }
                    if (!surface.migrationOwner && present) {
                        errors.push(
                            `${surface.path} ${environment} D1 binding must not declare ${key}`,
                        )
                    }
                }
            }

            parsedSurfaces.push({ development, test })
        }

        if (parsedSurfaces.length === 2) {
            for (const environment of [
                'development',
                'test',
            ]) {
                const publicDatabase = parsedSurfaces[0][environment][0]
                const backofficeDatabase = parsedSurfaces[1][environment][0]
                if (!publicDatabase || !backofficeDatabase) continue

                for (const key of [
                    'database_name',
                    'database_id',
                ]) {
                    if (
                        !publicDatabase[key] ||
                        publicDatabase[key] !== backofficeDatabase[key]
                    ) {
                        errors.push(
                            `Public and backoffice ${environment} D1 bindings must share ${key}`,
                        )
                    }
                }
            }
        }
    }

    function verifyRootScripts() {
        const rootManifest = readJsonIfPresent('package.json')
        const scripts = rootManifest?.scripts ?? {}

        for (const [
            name,
            command,
        ] of Object.entries(expectedProfileScripts)) {
            if (scripts[name] !== command) {
                errors.push(`package.json must declare ${name} as ${command}`)
            }
        }

        for (const name of deprecatedProfileScripts) {
            if (name in scripts) {
                errors.push(
                    `package.json must not declare deprecated profile command ${name}`,
                )
            }
        }

        if (rootManifest?.scripts?.['test:d1-shared-persistence']) {
            errors.push(
                'package.json must not declare the retired test:d1-shared-persistence command',
            )
        }
    }

    function verifyPostgresBaseline() {
        if (initialization.present && !initialization.configuration) return

        try {
            repository.runGit([
                'rev-parse',
                '--verify',
                `${postgresReference}^{commit}`,
            ])
        } catch {
            errors.push(
                `${postgresReference} is unavailable for the optional comparison`,
            )
            return
        }

        const referenceTree = repository.referenceTree(postgresReference)
        const changedFiles = repository.changedFiles(postgresReference)
        const referenceFiles = [...referenceTree.keys()]
        const isShared = (path) =>
            !profileMetadataPaths.has(path) && !getFullstackD1Owner(path)
        const actualSharedFiles = trackedFiles.filter(isShared)
        const referenceSharedFiles = referenceFiles.filter(isShared)
        const referenceSharedFileSet = new Set(referenceSharedFiles)

        compareLists(
            errors,
            actualSharedFiles,
            referenceSharedFiles,
            'shared fullstack_d1/fullstack_postgres baseline paths',
        )

        for (const path of actualSharedFiles) {
            if (
                !referenceSharedFileSet.has(path) ||
                (!initialization.configuration && !changedFiles.has(path))
            ) {
                continue
            }
            if (!matchesProjectedReference(path)) {
                errors.push(
                    `Shared file differs from ${postgresReference}: ${path}`,
                )
            }
        }

        const allPaths = new Set([
            ...trackedFiles,
            ...referenceFiles,
        ])
        const differenceCache = new Map()
        const differs = (path) => {
            const cached = differenceCache.get(path)
            if (cached !== undefined) return cached

            const result =
                !trackedFileSet.has(path) ||
                !referenceTree.has(path) ||
                (changedFiles.has(path) &&
                    (!initialization.configuration ||
                        !matchesProjectedReference(path)))
            differenceCache.set(path, result)
            return result
        }

        for (const rule of fullstackD1OwnershipRules) {
            const matchingPaths = [...allPaths].filter(rule.matches)
            if (matchingPaths.length === 0) {
                errors.push(
                    `Fullstack D1 ownership rule is unmatched: ${rule.description}`,
                )
                continue
            }
            if (!matchingPaths.some(differs)) {
                errors.push(
                    `Fullstack D1 ownership rule is stale: ${rule.description}`,
                )
            }
        }
    }

    function matchesProjectedReference(path) {
        const actual = repository.readBuffer(path)
        const reference = repository.readReferenceBuffer(
            postgresReference,
            path,
        )
        let expected
        try {
            expected = projectReferenceBuffer({
                actual,
                configuration: initialization.configuration,
                path,
                reference,
            })
        } catch (error) {
            errors.push(
                `Cannot project full-stack identity for ${path}: ${firstParagraph(error)}`,
            )
            return false
        }
        if (/^\.(?:agents|claude)\/skills\/[^/]+\/SKILL\.md$/u.test(path)) {
            return stripSkillAuditTimestamp(actual).equals(
                stripSkillAuditTimestamp(expected),
            )
        }
        return actual.equals(expected)
    }

    function readJsonIfPresent(path) {
        if (!requirePath(path)) return undefined
        try {
            return repository.readJson(path)
        } catch (error) {
            errors.push(`${path} is invalid JSON: ${firstParagraph(error)}`)
            return undefined
        }
    }

    function readTextIfPresent(path) {
        if (!requirePath(path)) return undefined
        return repository.readText(path)
    }

    function requirePath(path) {
        if (trackedFileSet.has(path)) return true
        errors.push(`Required fullstack D1 path is missing: ${path}`)
        return false
    }
}

function stripSkillAuditTimestamp(contents) {
    return Buffer.from(
        contents.toString('utf8').replace(skillAuditTimestampPattern, ''),
    )
}

function parseTomlArrayTables(contents, expectedTable) {
    const tables = []
    let current

    for (const line of contents.split(/\r?\n/u)) {
        const tableMatch = line.match(/^\[\[([^\]]+)\]\]$/u)
        if (tableMatch) {
            current = tableMatch[1] === expectedTable ? {} : undefined
            if (current) tables.push(current)
            continue
        }
        if (/^\[/u.test(line)) {
            current = undefined
            continue
        }
        if (!current) continue

        const valueMatch = line.match(
            /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*"([^"]*)"/u,
        )
        if (valueMatch) current[valueMatch[1]] = valueMatch[2]
    }

    return tables
}

function runCli(argv) {
    const comparePostgres = argv.includes('--compare-postgres')
    const unexpectedArguments = argv.filter(
        (argument) => argument !== '--compare-postgres',
    )
    const errors = verifyFullstackD1Profile({ comparePostgres })

    if (unexpectedArguments.length > 0) {
        errors.unshift(
            `Unexpected arguments: ${unexpectedArguments.join(', ')}. ` +
                'Only --compare-postgres is supported.',
        )
    }

    if (errors.length > 0) {
        console.error('Fullstack D1 profile verification failed:')
        for (const error of errors) console.error(`- ${error}`)
        process.exitCode = 1
        return
    }

    const comparison = comparePostgres
        ? ' Shared files match fullstack_postgres.'
        : ''
    console.log(`Fullstack D1 profile verification passed.${comparison}`)
}

const isMain =
    process.argv[1] &&
    resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))

if (isMain) runCli(process.argv.slice(2))
