import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
    applyTemplateIdentity,
    validateTemplateConfiguration,
} from './profile-init.mjs'

const initializationMarkerPath = '.template-initialized.json'
const initializationMarkerKeys = [
    'author',
    'bindingPrefix',
    'configuredAt',
    'displayName',
    'domain',
    'scope',
    'slug',
]

export function createProfileRepository(repositoryRoot) {
    const root = resolve(repositoryRoot)
    const bufferCache = new Map()
    const textCache = new Map()

    return {
        changedFiles(reference) {
            return new Set(
                splitLines(
                    this.runGit([
                        'diff',
                        '--name-only',
                        reference,
                        '--',
                    ]),
                ),
            )
        },
        exists(path) {
            return existsSync(resolve(root, path))
        },
        readBuffer(path) {
            const cachedContents = bufferCache.get(path)
            if (cachedContents !== undefined) return cachedContents

            const contents = readFileSync(resolve(root, path))
            bufferCache.set(path, contents)
            return contents
        },
        readJson(path) {
            return JSON.parse(this.readText(path))
        },
        readReferenceBuffer(reference, path) {
            return this.runGitBuffer([
                'show',
                `${reference}:${path}`,
            ])
        },
        readText(path) {
            const cachedContents = textCache.get(path)
            if (cachedContents !== undefined) return cachedContents

            const contents = readFileSync(resolve(root, path), 'utf8')
            textCache.set(path, contents)
            return contents
        },
        referenceTree(reference) {
            return parseGitTree(
                this.runGit([
                    'ls-tree',
                    '-r',
                    reference,
                ]),
            )
        },
        root,
        runGit(arguments_) {
            return execFileSync('git', arguments_, {
                cwd: root,
                encoding: 'utf8',
                stdio: [
                    'ignore',
                    'pipe',
                    'pipe',
                ],
            })
        },
        runGitBuffer(arguments_) {
            return execFileSync('git', arguments_, {
                cwd: root,
                stdio: [
                    'ignore',
                    'pipe',
                    'pipe',
                ],
            })
        },
        trackedFiles() {
            return splitLines(
                this.runGit([
                    'ls-files',
                    '--cached',
                    '--others',
                    '--exclude-standard',
                ]),
            ).filter((file) => this.exists(file))
        },
    }
}

export function readTemplateInitialization(repository, errors) {
    if (!repository.exists(initializationMarkerPath)) {
        return { configuration: undefined, present: false }
    }

    let contents
    try {
        contents = repository.readJson(initializationMarkerPath)
    } catch (error) {
        errors.push(
            `${initializationMarkerPath} is invalid JSON: ${firstParagraph(error)}`,
        )
        return { configuration: undefined, present: true }
    }

    if (!contents || typeof contents !== 'object' || Array.isArray(contents)) {
        errors.push(`${initializationMarkerPath} must contain a JSON object`)
        return { configuration: undefined, present: true }
    }

    const actualKeys = Object.keys(contents).sort()
    const expectedKeys = [...initializationMarkerKeys].sort()
    const missing = expectedKeys.filter((key) => !actualKeys.includes(key))
    const unexpected = actualKeys.filter((key) => !expectedKeys.includes(key))

    if (missing.length > 0) {
        errors.push(
            `${initializationMarkerPath} fields missing: ${missing.join(', ')}`,
        )
    }
    if (unexpected.length > 0) {
        errors.push(
            `${initializationMarkerPath} fields unexpected: ${unexpected.join(', ')}`,
        )
    }
    if (missing.length > 0 || unexpected.length > 0) {
        return { configuration: undefined, present: true }
    }

    let configuration
    try {
        configuration = validateTemplateConfiguration(contents)
    } catch (error) {
        errors.push(
            `${initializationMarkerPath} is invalid: ${firstParagraph(error)}`,
        )
        return { configuration: undefined, present: true }
    }

    if (
        typeof contents.configuredAt !== 'string' ||
        Number.isNaN(Date.parse(contents.configuredAt)) ||
        new Date(contents.configuredAt).toISOString() !== contents.configuredAt
    ) {
        errors.push(
            `${initializationMarkerPath} configuredAt must be an ISO-8601 UTC timestamp`,
        )
        return { configuration: undefined, present: true }
    }

    return { configuration, present: true }
}

export function projectReferenceBuffer({
    actual,
    configuration,
    path,
    reference,
}) {
    if (!configuration || reference.includes(0) || actual.includes(0)) {
        return reference
    }

    return Buffer.from(
        applyTemplateIdentity(reference.toString('utf8'), configuration, path),
        'utf8',
    )
}

export function compareLists(errors, actual, expected, description) {
    const actualSet = new Set(actual)
    const expectedSet = new Set(expected)
    const missing = [...expectedSet]
        .filter((item) => !actualSet.has(item))
        .sort()
    const unexpected = [...actualSet]
        .filter((item) => !expectedSet.has(item))
        .sort()

    if (missing.length > 0) {
        errors.push(`${description} missing: ${missing.join(', ')}`)
    }
    if (unexpected.length > 0) {
        errors.push(`${description} unexpected: ${unexpected.join(', ')}`)
    }
}

export function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
}

export function firstParagraph(error) {
    const message = error instanceof Error ? error.message : String(error)
    return message.split(/\r?\n\r?\n/u)[0]
}

export function splitLines(contents) {
    return contents.split(/\r?\n/u).filter(Boolean)
}

function parseGitTree(contents) {
    const tree = new Map()

    for (const line of splitLines(contents)) {
        const match = line.match(/^\d+\s+\S+\s+([0-9a-f]+)\t(.+)$/u)
        if (match) tree.set(match[2], match[1])
    }

    return tree
}
