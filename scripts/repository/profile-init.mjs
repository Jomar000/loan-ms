#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import {
    constants as fsConstants,
    copyFileSync,
    existsSync,
    readFileSync,
    renameSync,
    writeFileSync,
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const INITIALIZATION_INPUT = '.template.json'
const INITIALIZATION_MARKER = '.template-initialized.json'
const LOCAL_CONFIGURATION_COPIES = [
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
const TEMPLATE_AUTHOR = [
    '4thDEVision',
    'Tech',
].join('')
const TEMPLATE_DISPLAY_NAME = [
    'Hyper',
    'ion',
].join('')

const TEMPLATE_IDENTITIES = [
    [
        TEMPLATE_AUTHOR,
        ({ author }) => author,
    ],
    [
        '@hyperion',
        ({ scope }) => scope,
    ],
    [
        'HYPERION',
        ({ bindingPrefix }) => bindingPrefix,
    ],
    [
        TEMPLATE_DISPLAY_NAME,
        ({ displayName }) => displayName,
    ],
    [
        'hyperion.example',
        ({ domain }) => domain,
    ],
    [
        'hyperion.app',
        ({ domain }) => domain,
    ],
    [
        '4thdevision.tech',
        ({ domain }) => domain,
    ],
    [
        'hyperion',
        ({ slug }) => slug,
    ],
]

const TEMPLATE_IDENTITY_PATTERN = new RegExp(
    TEMPLATE_IDENTITIES.map(([identity]) =>
        identity.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'),
    )
        .sort((left, right) => right.length - left.length)
        .join('|'),
    'gu',
)

const templateIdentityReplacements = new Map(TEMPLATE_IDENTITIES)
const humanReadableIdentities = new Set([
    TEMPLATE_AUTHOR,
    TEMPLATE_DISPLAY_NAME,
])

const optionNames = new Map([
    [
        '--slug',
        'slug',
    ],
    [
        '--display-name',
        'displayName',
    ],
    [
        '--author',
        'author',
    ],
    [
        '--scope',
        'scope',
    ],
    [
        '--binding-prefix',
        'bindingPrefix',
    ],
    [
        '--domain',
        'domain',
    ],
])

const configurationKeys = new Set(optionNames.values())

const usage = `Usage:
  pnpm profile:init -- [--slug <slug>] [--display-name "<name>"] [--author "<owner>"] [--scope @scope] [--binding-prefix PREFIX] [--domain domain] [--write]

Values are read from ${INITIALIZATION_INPUT} when it exists, with command-line values taking precedence.
The command is a dry run unless --write is present.`

function fail(message) {
    throw new Error(`${message}\n\n${usage}`)
}

function validateSingleLine(value, option) {
    if (!value.trim() || /[\p{Cc}\p{Zl}\p{Zp}]/u.test(value)) {
        fail(
            `${option} must be a nonempty, single-line value without control characters.`,
        )
    }
}

export function parseArguments(argv) {
    const arguments_ = argv[0] === '--' ? argv.slice(1) : argv
    const overrides = {}
    let write = false

    for (let index = 0; index < arguments_.length; index += 1) {
        const argument = arguments_[index]

        if (argument === '--write') {
            if (write) fail('--write may be supplied only once.')
            write = true
            continue
        }

        const key = optionNames.get(argument)
        if (!key) fail(`Unknown option: ${argument}`)
        if (key in overrides) fail(`${argument} may be supplied only once.`)

        const value = arguments_[index + 1]
        if (!value || value.startsWith('--')) {
            fail(`${argument} requires a value.`)
        }

        overrides[key] = value
        index += 1
    }

    return { overrides, write }
}

export function validateTemplateConfiguration(values) {
    for (const required of [
        'slug',
        'displayName',
        'author',
    ]) {
        if (!(required in values)) {
            fail(
                `Missing required configuration value: ${required}. Set it in ${INITIALIZATION_INPUT} or supply its command-line option.`,
            )
        }
    }

    for (const [
        key,
        value,
    ] of Object.entries(values)) {
        if (typeof value !== 'string') {
            fail(`Configuration value ${key} must be a string.`)
        }
    }

    const { author, displayName, slug } = values
    const scope = values.scope || `@${slug}`
    const bindingPrefix =
        values.bindingPrefix || slug.replaceAll('-', '_').toUpperCase()
    const domain = values.domain || `${slug}.example`

    if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u.test(slug)) {
        fail('--slug must be lowercase kebab-case and start with a letter.')
    }
    if (!/^@[a-z0-9][a-z0-9._-]*$/u.test(scope)) {
        fail('--scope must be a valid lowercase npm scope such as @example.')
    }
    if (!/^[A-Z][A-Z0-9_]*$/u.test(bindingPrefix)) {
        fail(
            '--binding-prefix must contain only uppercase letters, digits, and underscores, and start with a letter.',
        )
    }
    if (!/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/iu.test(domain)) {
        fail('--domain must be a hostname without a scheme, port, or path.')
    }

    validateSingleLine(displayName, '--display-name')
    validateSingleLine(author, '--author')

    return {
        author,
        bindingPrefix,
        displayName,
        domain: domain.toLowerCase(),
        scope,
        slug,
    }
}

function readInitializationInput(root) {
    const path = join(root, INITIALIZATION_INPUT)
    if (!existsSync(path)) return undefined

    const content = readFileSync(path, 'utf8')
    let values
    try {
        values = JSON.parse(content)
    } catch (error) {
        const detail = error instanceof Error ? error.message : String(error)
        fail(`Cannot parse ${INITIALIZATION_INPUT}: ${detail}`)
    }

    if (!values || typeof values !== 'object' || Array.isArray(values)) {
        fail(`${INITIALIZATION_INPUT} must contain a JSON object.`)
    }
    if (Object.hasOwn(values, 'configuredAt')) {
        fail(
            `${INITIALIZATION_INPUT} must not contain configuredAt; that field is added only after successful initialization.`,
        )
    }

    const unknownKeys = Object.keys(values).filter(
        (key) => !configurationKeys.has(key),
    )
    if (unknownKeys.length > 0) {
        fail(
            `${INITIALIZATION_INPUT} contains unknown configuration field${unknownKeys.length === 1 ? '' : 's'}: ${unknownKeys.join(', ')}`,
        )
    }

    return { content, path, values }
}

function runGit(root, arguments_) {
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

function getTrackedFiles(root) {
    return runGit(root, [
        'ls-files',
        '-z',
    ])
        .split('\0')
        .filter(Boolean)
        .filter(
            (file) =>
                !/(?:^|\/)(?:node_modules|dist|build|\.svelte-kit|\.wrangler|\.pnpm-store)(?:\/|$)/u.test(
                    file,
                ) &&
                !/^apps\/api-(?:backoffice|public)\/src\/worker-configuration\.d\.ts$/u.test(
                    file,
                ),
        )
}

function escapeDotenvDoubleQuoted(value) {
    return value
        .replaceAll('\\', '\\\\')
        .replaceAll('"', '\\"')
        .replaceAll('$', '\\$')
}

function escapeJsonString(value) {
    return JSON.stringify(value).slice(1, -1)
}

function escapeSingleQuotedCode(value) {
    return value.replaceAll('\\', '\\\\').replaceAll("'", "\\'")
}

function serializeHumanReadableReplacement(file, identity, value) {
    if (file.endsWith('.json') || file.endsWith('.json.example')) {
        return escapeJsonString(value)
    }
    if (/\.(?:[cm]?[jt]s)$/u.test(file)) return escapeSingleQuotedCode(value)
    if (/(?:^|\/)\.env(?:\..+)?$/u.test(file)) {
        return escapeDotenvDoubleQuoted(value)
    }
    if (/\.(?:md|txt)$/u.test(file)) return value

    throw new Error(
        `Cannot safely replace ${identity} in unsupported text format: ${file}`,
    )
}

export function applyTemplateIdentity(content, configuration, file) {
    return content.replace(TEMPLATE_IDENTITY_PATTERN, (identity) => {
        const replacement = templateIdentityReplacements.get(identity)

        if (!replacement) return identity
        const value = replacement(configuration)
        return humanReadableIdentities.has(identity)
            ? serializeHumanReadableReplacement(file, identity, value)
            : value
    })
}

function findHumanReadableSvelteIdentities(content, file) {
    if (!file.endsWith('.svelte')) return []

    const findings = []
    for (const identity of humanReadableIdentities) {
        let offset = 0
        while ((offset = content.indexOf(identity, offset)) !== -1) {
            const line = content.slice(0, offset).split('\n').length
            findings.push({ file, identity, line })
            offset += identity.length
        }
    }

    return findings
}

function formatUnsupportedSvelteIdentities(findings) {
    const locations = findings
        .sort(
            (left, right) =>
                left.file.localeCompare(right.file) || left.line - right.line,
        )
        .map(({ file, identity, line }) => `  ${file}:${line} (${identity})`)
        .join('\n')

    return `Cannot safely replace human-readable template identities in Svelte files:\n${locations}\n\nUse PUBLIC_NAME from $env/static/public for the display name. Keep other human-readable template identity values outside .svelte source.`
}

function printableConfiguration(configuration) {
    return {
        author: configuration.author,
        bindingPrefix: configuration.bindingPrefix,
        displayName: configuration.displayName,
        domain: configuration.domain,
        scope: configuration.scope,
        slug: configuration.slug,
    }
}

function writeInitializationMarker(input, markerPath, printable, configuredAt) {
    const markerContent = `${JSON.stringify(
        {
            ...printable,
            configuredAt,
        },
        null,
        4,
    )}\n`

    if (!input) {
        writeFileSync(markerPath, markerContent, { flag: 'wx' })
        return
    }

    try {
        writeFileSync(input.path, markerContent)
        renameSync(input.path, markerPath)
    } catch (error) {
        if (existsSync(input.path)) {
            writeFileSync(input.path, input.content)
        }
        throw error
    }
}

export function configureTemplate(
    argv,
    {
        root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..'),
        log = console.log,
    } = {},
) {
    const { overrides, write } = parseArguments(argv)
    const markerPath = join(root, INITIALIZATION_MARKER)

    if (existsSync(markerPath)) {
        throw new Error(
            `This checkout was already initialized; ${INITIALIZATION_MARKER} exists.`,
        )
    }

    const initializationInput = readInitializationInput(root)
    const configuration = {
        ...validateTemplateConfiguration({
            ...initializationInput?.values,
            ...overrides,
        }),
        write,
    }

    const status = runGit(root, [
        'status',
        '--porcelain',
        '--untracked-files=all',
    ])
    if (status.trim()) {
        throw new Error(
            'Refusing to initialize a dirty worktree. Commit or stash all changes first.',
        )
    }

    const changes = []
    const unsupportedSvelteIdentities = []
    for (const file of getTrackedFiles(root)) {
        const path = join(root, file)
        const buffer = readFileSync(path)
        if (buffer.includes(0)) continue

        const content = buffer.toString('utf8')
        const findings = findHumanReadableSvelteIdentities(content, file)
        if (findings.length > 0) {
            unsupportedSvelteIdentities.push(...findings)
            continue
        }
        const next = applyTemplateIdentity(content, configuration, file)
        if (next !== content) changes.push({ content: next, file, path })
    }

    if (unsupportedSvelteIdentities.length > 0) {
        throw new Error(
            formatUnsupportedSvelteIdentities(unsupportedSvelteIdentities),
        )
    }

    const localConfigurationCopies = LOCAL_CONFIGURATION_COPIES.map(
        ([
            source,
            destination,
        ]) => ({
            destination,
            destinationPath: join(root, destination),
            source,
            sourcePath: join(root, source),
        }),
    )
    const localConfigurationFilesToCreate = localConfigurationCopies.filter(
        ({ destinationPath }) => !existsSync(destinationPath),
    )
    const localConfigurationFilesToPreserve = localConfigurationCopies.filter(
        ({ destinationPath }) => existsSync(destinationPath),
    )

    if (changes.length === 0) {
        throw new Error(
            'No template identity tokens were found. This checkout may already be initialized.',
        )
    }

    log(
        configuration.write
            ? 'Applying template identity:'
            : 'Template identity dry run:',
    )
    log(JSON.stringify(printableConfiguration(configuration), null, 2))
    log('Files that would change:')
    for (const change of changes) log(`  ${change.file}`)
    log(
        configuration.write
            ? 'Local configuration files to create:'
            : 'Local configuration files that would be created:',
    )
    if (localConfigurationFilesToCreate.length === 0) log('  (none)')
    for (const { destination } of localConfigurationFilesToCreate) {
        log(`  ${destination}`)
    }
    log('Existing local configuration files preserved:')
    if (localConfigurationFilesToPreserve.length === 0) log('  (none)')
    for (const { destination } of localConfigurationFilesToPreserve) {
        log(`  ${destination}`)
    }

    if (!configuration.write) {
        log(
            '\nNo files changed. Re-run with --write to apply this configuration.',
        )
        return { changes: changes.map(({ file }) => file), written: false }
    }

    for (const change of changes) writeFileSync(change.path, change.content)
    for (const {
        destinationPath,
        sourcePath,
    } of localConfigurationFilesToCreate) {
        copyFileSync(sourcePath, destinationPath, fsConstants.COPYFILE_EXCL)
    }
    writeInitializationMarker(
        initializationInput,
        markerPath,
        printableConfiguration(configuration),
        new Date().toISOString(),
    )

    log('\nTemplate identity applied. Review the diff, then run exactly:')
    log('  pnpm install --lockfile-only')
    log(`  pnpm --filter=${configuration.scope}/api-public types:worker`)
    log(`  pnpm --filter=${configuration.scope}/api-backoffice types:worker`)
    log('  pnpm install --frozen-lockfile')

    return { changes: changes.map(({ file }) => file), written: true }
}

const isMain =
    process.argv[1] &&
    resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))

if (isMain) {
    try {
        configureTemplate(process.argv.slice(2))
    } catch (error) {
        console.error(error instanceof Error ? error.message : error)
        process.exitCode = 1
    }
}
