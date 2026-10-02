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
import { join } from 'node:path'
import test from 'node:test'
import { pathToFileURL } from 'node:url'

import { configureTemplate } from './profile-init.mjs'

const templateAuthor = [
    '4thDEVision',
    'Tech',
].join('')
const templateDisplayName = [
    'Hyper',
    'ion',
].join('')

const validArguments = [
    '--slug',
    'acme-portal',
    '--display-name',
    'Acme Portal',
    '--author',
    'Acme Inc.',
    '--scope',
    '@acme',
    '--binding-prefix',
    'ACME_PORTAL',
    '--domain',
    'acme.example',
]

const overlappingArguments = [
    '--slug',
    'acme-portal',
    '--display-name',
    'Acme Portal',
    '--author',
    `${templateDisplayName} Labs`,
    '--scope',
    '@loanms-labs',
    '--binding-prefix',
    'ACME_PORTAL',
    '--domain',
    'loanms-labs.example',
]

const punctuatedDisplayName = `O'Reilly "Portal" \\ $BRAND`
const punctuatedAuthor = `O'Reilly "Labs" \\ $OWNER`
const punctuatedArguments = [
    '--slug',
    'punctuated-portal',
    '--display-name',
    punctuatedDisplayName,
    '--author',
    punctuatedAuthor,
]

const localConfigurationCopies = [
    [
        'apps/api-public/.dev.vars.example',
        'apps/api-public/.dev.vars',
    ],
    [
        'apps/api-backoffice/.dev.vars.example',
        'apps/api-backoffice/.dev.vars',
    ],
    [
        'apps/web-public/.env.example',
        'apps/web-public/.env',
    ],
    [
        'apps/web-backoffice/.env.example',
        'apps/web-backoffice/.env',
    ],
]

const deploymentFiles = [
    'apps/api-public/.dev.vars.staging',
    'apps/api-public/.dev.vars.production',
    'apps/api-public/wrangler-staging.toml',
    'apps/api-public/wrangler-production.toml',
    'apps/api-backoffice/.dev.vars.staging',
    'apps/api-backoffice/.dev.vars.production',
    'apps/api-backoffice/wrangler-staging.toml',
    'apps/api-backoffice/wrangler-production.toml',
    'apps/web-public/.env.staging',
    'apps/web-public/.env.production',
    'apps/web-public/wrangler-staging.toml',
    'apps/web-public/wrangler-production.toml',
    'apps/web-backoffice/.env.staging',
    'apps/web-backoffice/.env.production',
    'apps/web-backoffice/wrangler-staging.toml',
    'apps/web-backoffice/wrangler-production.toml',
]

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

function createFixture() {
    const root = mkdtempSync(join(tmpdir(), 'loanms-template-'))
    git(root, 'init', '--quiet')
    git(root, 'config', 'user.email', 'template-test@example.com')
    git(root, 'config', 'user.name', 'Template Test')
    for (const directory of [
        'apps/api-backoffice',
        'apps/api-public',
        'apps/web-backoffice',
        'apps/web-public',
        'apps/web-public/src/lib',
        'packages/database',
    ]) {
        mkdirSync(join(root, directory), { recursive: true })
    }
    writeFileSync(
        join(root, '.gitignore'),
        [
            '.env',
            '.env.test',
            '.dev.vars',
            '/.template.json',
            'wrangler-staging.toml',
            'wrangler-production.toml',
            '',
        ].join('\n'),
    )
    writeFileSync(
        join(root, 'package.json'),
        `${JSON.stringify({
            author: templateAuthor,
            dependencies: { '@loanms/types': 'workspace:*' },
            description: templateDisplayName,
            name: 'loanms',
        })}\n`,
    )
    writeFileSync(
        join(root, '.template.json.example'),
        `${JSON.stringify(
            {
                author: templateAuthor,
                bindingPrefix: 'LOANMS',
                displayName: templateDisplayName,
                domain: 'loanms.example',
                scope: '@loanms',
                slug: 'loanms',
            },
            null,
            4,
        )}\n`,
    )
    writeFileSync(
        join(root, 'identity.mjs'),
        [
            `export const author = '${templateAuthor}'`,
            `export const displayName = '${templateDisplayName}'`,
            '',
        ].join('\n'),
    )
    writeFileSync(
        join(root, '.env.example'),
        [
            `PUBLIC_NAME="${escapeExpectedDotenv(templateDisplayName)}"`,
            `PUBLIC_OWNER="${escapeExpectedDotenv(templateAuthor)}"`,
            '',
        ].join('\n'),
    )
    writeFileSync(
        join(root, 'README.md'),
        `# ${templateDisplayName}\n\nOwned by ${templateAuthor}.\n`,
    )
    writeFileSync(
        join(root, 'wrangler.toml'),
        [
            'name = "loanms-api"',
            'BINDING = "LOANMS_BUCKET"',
            'URL = "https://api.loanms.example"',
            '',
        ].join('\n'),
    )
    writeFileSync(
        join(root, 'apps/web-public/src/lib/TemplateComponent.svelte'),
        [
            '<script lang="ts">',
            "    import { Button } from '@loanms/ui/components/button'",
            '',
            "    import { PUBLIC_NAME } from '$env/static/public'",
            '</script>',
            '',
            '<h1>{PUBLIC_NAME}</h1>',
            '<Button>Continue</Button>',
            '',
        ].join('\n'),
    )
    for (const [source] of localConfigurationCopies) {
        let content = 'LOCAL_PLACEHOLDER="LOANMS_LOCAL"\n'
        if (source.endsWith('/.env.example')) {
            content = `PUBLIC_NAME="${templateDisplayName}"\n`
        }
        writeFileSync(join(root, source), content)
    }
    git(root, 'add', '.')
    git(root, 'commit', '--quiet', '-m', 'fixture')
    return root
}

function escapeExpectedDotenv(value) {
    return value
        .replaceAll('\\', '\\\\')
        .replaceAll('"', '\\"')
        .replaceAll('$', '\\$')
}

function writeInitializationInput(root, values) {
    const content =
        typeof values === 'string'
            ? values
            : `${JSON.stringify(values, null, 4)}\n`
    writeFileSync(join(root, '.template.json'), content)
    return content
}

test('rejects invalid input before inspecting the repository', () => {
    assert.throws(
        () =>
            configureTemplate(
                [
                    '--slug',
                    'Not Valid',
                    '--display-name',
                    'Invalid',
                    '--author',
                    'Owner',
                ],
                { root: join(tmpdir(), 'missing-template-repository') },
            ),
        /lowercase kebab-case/u,
    )
    for (const displayName of [
        'Invalid\tName',
        'Invalid\u2028Name',
        'Invalid\u2029Name',
    ]) {
        assert.throws(
            () =>
                configureTemplate(
                    [
                        '--slug',
                        'valid',
                        '--display-name',
                        displayName,
                        '--author',
                        'Owner',
                    ],
                    { root: join(tmpdir(), 'missing-template-repository') },
                ),
            /control characters/u,
        )
    }
})

test('dry run reports changes without writing them', (context) => {
    const root = createFixture()
    context.after(() => rmSync(root, { force: true, recursive: true }))
    const before = readFileSync(join(root, 'package.json'), 'utf8')
    const logs = []

    const result = configureTemplate(
        [
            '--',
            ...validArguments,
        ],
        {
            root,
            log(message) {
                logs.push(message)
            },
        },
    )

    assert.equal(result.written, false)
    assert.deepEqual(result.changes, [
        '.env.example',
        '.template.json.example',
        'README.md',
        'apps/api-backoffice/.dev.vars.example',
        'apps/api-public/.dev.vars.example',
        'apps/web-backoffice/.env.example',
        'apps/web-public/.env.example',
        'apps/web-public/src/lib/TemplateComponent.svelte',
        'identity.mjs',
        'package.json',
        'wrangler.toml',
    ])
    assert.equal(readFileSync(join(root, 'package.json'), 'utf8'), before)
    assert.equal(existsSync(join(root, '.template-initialized.json')), false)
    assert.ok(logs.includes('Local configuration files that would be created:'))
    for (const [
        ,
        destination,
    ] of localConfigurationCopies) {
        assert.equal(existsSync(join(root, destination)), false)
        assert.ok(logs.includes(`  ${destination}`))
    }
})

test('reads configuration from the ignored JSON input without changing it during a dry run', (context) => {
    const root = createFixture()
    context.after(() => rmSync(root, { force: true, recursive: true }))
    const input = writeInitializationInput(root, {
        author: 'JSON Inc.',
        bindingPrefix: '',
        displayName: 'JSON Portal',
        domain: '',
        scope: '',
        slug: 'json-portal',
    })
    const logs = []

    const result = configureTemplate([], {
        root,
        log(message) {
            logs.push(message)
        },
    })

    assert.equal(result.written, false)
    assert.equal(readFileSync(join(root, '.template.json'), 'utf8'), input)
    assert.equal(existsSync(join(root, '.template-initialized.json')), false)
    assert.match(logs.join('\n'), /"scope": "@json-portal"/u)
    assert.match(logs.join('\n'), /"bindingPrefix": "JSON_PORTAL"/u)
    assert.match(logs.join('\n'), /"domain": "json-portal\.example"/u)
})

test('command-line values override JSON input and the write consumes it', (context) => {
    const root = createFixture()
    context.after(() => rmSync(root, { force: true, recursive: true }))
    writeInitializationInput(root, {
        author: 'JSON Inc.',
        bindingPrefix: 'JSON_PORTAL',
        displayName: 'JSON Portal',
        domain: 'json.example',
        scope: '@json',
        slug: 'json-portal',
    })

    configureTemplate(
        [
            '--slug',
            'cli-portal',
            '--display-name',
            'CLI Portal',
            '--scope',
            '@cli',
            '--binding-prefix',
            'CLI_PORTAL',
            '--domain',
            'cli.example',
            '--write',
        ],
        { root, log() {} },
    )

    assert.equal(existsSync(join(root, '.template.json')), false)
    const marker = JSON.parse(
        readFileSync(join(root, '.template-initialized.json'), 'utf8'),
    )
    assert.deepEqual(marker, {
        author: 'JSON Inc.',
        bindingPrefix: 'CLI_PORTAL',
        configuredAt: marker.configuredAt,
        displayName: 'CLI Portal',
        domain: 'cli.example',
        scope: '@cli',
        slug: 'cli-portal',
    })
    assert.equal(Number.isNaN(Date.parse(marker.configuredAt)), false)
})

test('rejects invalid JSON input without consuming or applying it', (context) => {
    const cases = [
        [
            '{',
            /Cannot parse \.template\.json/u,
        ],
        [
            {
                author: 'Owner',
                displayName: 'Portal',
                extra: true,
                slug: 'portal',
            },
            /unknown configuration field: extra/u,
        ],
        [
            {
                author: 'Owner',
                configuredAt: '2026-01-01T00:00:00.000Z',
                displayName: 'Portal',
                slug: 'portal',
            },
            /must not contain configuredAt/u,
        ],
        [
            { slug: 'portal' },
            /Missing required configuration value: displayName/u,
        ],
    ]
    const roots = []
    context.after(() => {
        for (const root of roots) {
            rmSync(root, { force: true, recursive: true })
        }
    })

    for (const [
        values,
        expectedError,
    ] of cases) {
        const root = createFixture()
        roots.push(root)
        const input = writeInitializationInput(root, values)
        const before = readFileSync(join(root, 'package.json'), 'utf8')

        assert.throws(
            () => configureTemplate(['--write'], { root, log() {} }),
            expectedError,
        )
        assert.equal(readFileSync(join(root, '.template.json'), 'utf8'), input)
        assert.equal(readFileSync(join(root, 'package.json'), 'utf8'), before)
        assert.equal(
            existsSync(join(root, '.template-initialized.json')),
            false,
        )
    }
})

test('write applies identity and refuses a second initialization', (context) => {
    const root = createFixture()
    context.after(() => rmSync(root, { force: true, recursive: true }))

    const result = configureTemplate(
        [
            ...validArguments,
            '--write',
        ],
        {
            root,
            log() {},
        },
    )

    assert.equal(result.written, true)
    assert.match(
        readFileSync(join(root, 'package.json'), 'utf8'),
        /@acme\/types/u,
    )
    const svelteComponent = readFileSync(
        join(root, 'apps/web-public/src/lib/TemplateComponent.svelte'),
        'utf8',
    )
    assert.match(svelteComponent, /@acme\/ui\/components\/button/u)
    assert.match(svelteComponent, /\{PUBLIC_NAME\}/u)
    const wrangler = readFileSync(join(root, 'wrangler.toml'), 'utf8')
    assert.match(wrangler, /ACME_PORTAL_BUCKET/u)
    assert.match(wrangler, /https:\/\/api\.acme\.example/u)
    for (const [
        source,
        destination,
    ] of localConfigurationCopies) {
        const destinationContent = readFileSync(join(root, destination), 'utf8')
        assert.equal(
            destinationContent,
            readFileSync(join(root, source), 'utf8'),
        )
        assert.doesNotMatch(destinationContent, /LoanMS|LOANMS|loanms/u)
    }
    assert.equal(existsSync(join(root, '.template-initialized.json')), true)
    const marker = JSON.parse(
        readFileSync(join(root, '.template-initialized.json'), 'utf8'),
    )
    assert.deepEqual(
        {
            author: marker.author,
            bindingPrefix: marker.bindingPrefix,
            displayName: marker.displayName,
            domain: marker.domain,
            scope: marker.scope,
            slug: marker.slug,
        },
        {
            author: 'Acme Inc.',
            bindingPrefix: 'ACME_PORTAL',
            displayName: 'Acme Portal',
            domain: 'acme.example',
            scope: '@acme',
            slug: 'acme-portal',
        },
    )
    assert.equal(Number.isNaN(Date.parse(marker.configuredAt)), false)
    for (const file of deploymentFiles) {
        assert.equal(existsSync(join(root, file)), false)
    }
    assert.throws(
        () => configureTemplate(validArguments, { root, log() {} }),
        /already initialized/u,
    )
})

test('preserves existing local configuration files', (context) => {
    const root = createFixture()
    context.after(() => rmSync(root, { force: true, recursive: true }))
    const existingDestination = 'apps/web-public/.env'
    const existingContent = 'PUBLIC_NAME="Existing local value"\n'
    const logs = []
    writeFileSync(join(root, existingDestination), existingContent)

    configureTemplate(
        [
            ...validArguments,
            '--write',
        ],
        {
            root,
            log(message) {
                logs.push(message)
            },
        },
    )

    assert.equal(
        readFileSync(join(root, existingDestination), 'utf8'),
        existingContent,
    )
    assert.ok(logs.includes('Existing local configuration files preserved:'))
    assert.ok(logs.join('\n').includes(existingDestination))
    for (const [
        ,
        destination,
    ] of localConfigurationCopies) {
        assert.equal(existsSync(join(root, destination)), true)
    }
})

test('preserves replacement values that contain template identities', (context) => {
    const root = createFixture()
    context.after(() => rmSync(root, { force: true, recursive: true }))

    configureTemplate(
        [
            ...overlappingArguments,
            '--write',
        ],
        {
            root,
            log() {},
        },
    )

    const packageManifest = JSON.parse(
        readFileSync(join(root, 'package.json'), 'utf8'),
    )
    const wrangler = readFileSync(join(root, 'wrangler.toml'), 'utf8')

    assert.equal(packageManifest.author, `${templateDisplayName} Labs`)
    assert.equal(
        packageManifest.dependencies['@loanms-labs/types'],
        'workspace:*',
    )
    assert.match(wrangler, /https:\/\/api\.loanms-labs\.example/u)
    assert.doesNotMatch(wrangler, /api\.acme-portal-labs\.example/u)
})

test('escapes printable punctuation for each tracked text format', async (context) => {
    const root = createFixture()
    context.after(() => rmSync(root, { force: true, recursive: true }))

    configureTemplate(
        [
            ...punctuatedArguments,
            '--write',
        ],
        {
            root,
            log() {},
        },
    )

    const packageManifest = JSON.parse(
        readFileSync(join(root, 'package.json'), 'utf8'),
    )
    const identityModule = await import(
        `${pathToFileURL(join(root, 'identity.mjs')).href}?test=${Date.now()}`
    )
    const initializationExample = JSON.parse(
        readFileSync(join(root, '.template.json.example'), 'utf8'),
    )
    const dotenv = readFileSync(join(root, '.env.example'), 'utf8')
    const readme = readFileSync(join(root, 'README.md'), 'utf8')

    assert.equal(packageManifest.author, punctuatedAuthor)
    assert.equal(packageManifest.description, punctuatedDisplayName)
    assert.equal(identityModule.author, punctuatedAuthor)
    assert.equal(identityModule.displayName, punctuatedDisplayName)
    assert.equal(initializationExample.author, punctuatedAuthor)
    assert.equal(initializationExample.displayName, punctuatedDisplayName)
    assert.equal(
        dotenv,
        [
            `PUBLIC_NAME="${escapeExpectedDotenv(punctuatedDisplayName)}"`,
            `PUBLIC_OWNER="${escapeExpectedDotenv(punctuatedAuthor)}"`,
            '',
        ].join('\n'),
    )
    assert.ok(readme.includes(punctuatedDisplayName))
    assert.ok(readme.includes(punctuatedAuthor))
})

test('reports every unsafe human-readable Svelte identity before writing', (context) => {
    const root = createFixture()
    context.after(() => rmSync(root, { force: true, recursive: true }))
    const displayNameFile = 'apps/web-public/src/lib/DisplayNameLiteral.svelte'
    const authorFile = 'apps/web-public/src/lib/AuthorLiteral.svelte'
    writeFileSync(
        join(root, displayNameFile),
        `<h1>${templateDisplayName}</h1>\n`,
    )
    writeFileSync(
        join(root, authorFile),
        `<footer>${templateAuthor}</footer>\n`,
    )
    git(root, 'add', displayNameFile, authorFile)
    git(root, 'commit', '--quiet', '-m', 'unsafe Svelte fixtures')
    const input = writeInitializationInput(root, {
        author: 'Acme Inc.',
        displayName: 'Acme Portal',
        slug: 'acme-portal',
    })
    const before = readFileSync(join(root, 'package.json'), 'utf8')

    assert.throws(
        () => configureTemplate(['--write'], { root, log() {} }),
        (error) => {
            assert.match(error.message, /AuthorLiteral\.svelte:1/u)
            assert.match(error.message, /DisplayNameLiteral\.svelte:1/u)
            assert.match(
                error.message,
                /PUBLIC_NAME from \$env\/static\/public/u,
            )
            return true
        },
    )

    assert.equal(readFileSync(join(root, '.template.json'), 'utf8'), input)
    assert.equal(readFileSync(join(root, 'package.json'), 'utf8'), before)
    assert.equal(existsSync(join(root, '.template-initialized.json')), false)
})

test('refuses a dirty worktree', (context) => {
    const root = createFixture()
    context.after(() => rmSync(root, { force: true, recursive: true }))
    writeFileSync(join(root, 'untracked.txt'), 'dirty\n')

    assert.throws(
        () => configureTemplate(validArguments, { root, log() {} }),
        /dirty worktree/u,
    )
})

// =============================================================================
// END OF BASE TEMPLATE TESTS - FORK-SPECIFIC TESTS MUST BE ADDED BELOW
// =============================================================================
