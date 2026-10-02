#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isDeepStrictEqual } from 'node:util'

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const defaultPolicyPath = resolve(scriptDirectory, 'security-headers.json')
const apiBaseUrl = 'https://api.cloudflare.com/client/v4'
const ownedRulePrefix = 'loanms_security_headers_'

const usage = `Usage:
  configure-security-headers [--apply --acknowledge-zone-wide-disable] \\
    --zone-id <32-character-zone-id> \\
    --target public=<hostname> [--target backoffice=<hostname> | --target global ...]

The command performs a read-only dry run unless --apply is present.
CLOUDFLARE_API_TOKEN must contain a zone-scoped API token.`

function fail(message) {
    throw new Error(message)
}

export function loadPolicy(path = defaultPolicyPath) {
    const policy = JSON.parse(readFileSync(path, 'utf8'))
    if (
        typeof policy.phase !== 'string' ||
        typeof policy.ruleset?.name !== 'string' ||
        typeof policy.ruleset?.description !== 'string' ||
        typeof policy.managedTransform?.id !== 'string' ||
        policy.managedTransform.enabled !== false ||
        typeof policy.sharedHeaders !== 'object' ||
        policy.sharedHeaders === null ||
        typeof policy.profiles !== 'object' ||
        policy.profiles === null ||
        Object.values(policy.profiles).some(
            (profile) =>
                typeof profile?.name !== 'string' ||
                ![
                    'all',
                    'hostname',
                ].includes(profile.match) ||
                typeof profile.headers !== 'object' ||
                profile.headers === null,
        )
    ) {
        fail(`Invalid Cloudflare security header policy: ${path}`)
    }
    return policy
}

export function validateHostname(value) {
    const hostname = value.toLowerCase()
    if (hostname.length === 0 || hostname.length > 253) {
        fail(`Invalid hostname: ${value}`)
    }
    if (hostname.endsWith('.')) {
        fail(`Use a hostname without a trailing dot: ${value}`)
    }
    const labels = hostname.split('.')
    if (
        labels.length < 2 ||
        labels.some(
            (label) =>
                label.length === 0 ||
                label.length > 63 ||
                !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/u.test(label),
        )
    ) {
        fail(`Invalid hostname: ${value}`)
    }
    return hostname
}

export function parseArguments(argv, policy = loadPolicy()) {
    const arguments_ = argv[0] === '--' ? argv.slice(1) : [...argv]
    const configuration = {
        acknowledgeZoneWideDisable: false,
        apply: false,
        targets: [],
        zoneId: undefined,
    }

    for (let index = 0; index < arguments_.length; index += 1) {
        const argument = arguments_[index]
        if (argument === '--apply') {
            configuration.apply = true
            continue
        }
        if (argument === '--acknowledge-zone-wide-disable') {
            configuration.acknowledgeZoneWideDisable = true
            continue
        }
        if (argument === '--zone-id') {
            configuration.zoneId = arguments_[index + 1]
            index += 1
            continue
        }
        if (argument === '--target') {
            const target = arguments_[index + 1]
            index += 1
            if (!target) {
                fail('Each --target must specify a profile.')
            }
            const separatorIndex = target.indexOf('=')
            const requestedProfile = (
                separatorIndex === -1 ? target : target.slice(0, separatorIndex)
            ).toLowerCase()
            const profile = Object.keys(policy.profiles).find(
                (key) =>
                    key.toLowerCase() === requestedProfile ||
                    policy.profiles[key].name.toLowerCase() ===
                        requestedProfile,
            )
            if (!profile) {
                fail(
                    `Unknown security header profile: ${requestedProfile}. Expected one of: ${Object.values(
                        policy.profiles,
                    )
                        .map(({ name }) => name)
                        .join(', ')}.`,
                )
            }
            const profileDefinition = policy.profiles[profile]
            if (profileDefinition.match === 'all') {
                if (separatorIndex !== -1) {
                    fail(
                        `${profileDefinition.name} matches all incoming requests and must not include a hostname.`,
                    )
                }
                configuration.targets.push({ profile })
                continue
            }
            if (separatorIndex === -1) {
                fail(
                    `${profileDefinition.name} requires --target ${profile}=<hostname>.`,
                )
            }
            const hostname = validateHostname(target.slice(separatorIndex + 1))
            configuration.targets.push({ hostname, profile })
            continue
        }
        fail(`Unknown or incomplete argument: ${argument}\n\n${usage}`)
    }

    if (!/^[a-f0-9]{32}$/iu.test(configuration.zoneId ?? '')) {
        fail('--zone-id must be a 32-character Cloudflare zone ID.')
    }
    if (configuration.targets.length === 0) {
        fail('At least one --target is required.')
    }

    const targetKeys = configuration.targets.map(({ hostname, profile }) =>
        hostname === undefined ? profile : `${profile}=${hostname}`,
    )
    if (new Set(targetKeys).size !== targetKeys.length) {
        fail('Duplicate --target values are not allowed.')
    }
    if (configuration.apply && !configuration.acknowledgeZoneWideDisable) {
        fail(
            '--apply also requires --acknowledge-zone-wide-disable because the Managed Transform setting affects the entire zone.',
        )
    }

    return configuration
}

export function createRuleReference({ hostname, profile }) {
    if (hostname === undefined) return `${ownedRulePrefix}${profile}`
    const hostnameHash = createHash('sha256')
        .update(hostname)
        .digest('hex')
        .slice(0, 12)
    return `${ownedRulePrefix}${profile}_${hostnameHash}`
}

export function createRule(target, policy = loadPolicy()) {
    const profile = policy.profiles[target.profile]
    if (!profile) fail(`Unknown security header profile: ${target.profile}`)

    const headers = Object.fromEntries(
        Object.entries({
            ...policy.sharedHeaders,
            ...profile.headers,
        }).map(
            ([
                name,
                value,
            ]) => [
                name,
                { operation: 'set', value },
            ],
        ),
    )

    return {
        action: 'rewrite',
        action_parameters: { headers },
        description: `${profile.name} Security Headers`,
        enabled: true,
        expression:
            profile.match === 'all'
                ? 'true'
                : `(http.host eq "${target.hostname}")`,
        ref: createRuleReference(target),
    }
}

function redact(value, secret) {
    return secret ? value.replaceAll(secret, '[REDACTED]') : value
}

function escapeCurlConfig(value) {
    return value
        .replaceAll('\\', '\\\\')
        .replaceAll('"', '\\"')
        .replaceAll('\r', '\\r')
        .replaceAll('\n', '\\n')
}

export function createCurlRequester({
    curlExecutable = process.platform === 'win32' ? 'curl.exe' : 'curl',
    spawn = spawnSync,
    token,
} = {}) {
    if (!token || /[\r\n]/u.test(token)) {
        fail('CLOUDFLARE_API_TOKEN is required and must not contain newlines.')
    }

    return function request(method, path, body) {
        const curlConfiguration = [
            'silent',
            'show-error',
            `request = "${escapeCurlConfig(method)}"`,
            `url = "${escapeCurlConfig(`${apiBaseUrl}${path}`)}"`,
            `header = "${escapeCurlConfig(`Authorization: Bearer ${token}`)}"`,
            'header = "Content-Type: application/json"',
            '',
        ].join('\n')
        const arguments_ = [
            '--config',
            '-',
        ]
        if (body !== undefined) {
            arguments_.push('--data-binary', JSON.stringify(body))
        }

        const result = spawn(curlExecutable, arguments_, {
            encoding: 'utf8',
            input: curlConfiguration,
            maxBuffer: 10 * 1024 * 1024,
            stdio: [
                'pipe',
                'pipe',
                'pipe',
            ],
        })
        if (result.error) {
            fail(
                `Unable to execute cURL: ${redact(result.error.message, token)}`,
            )
        }
        if (result.status !== 0) {
            fail(
                `cURL request failed: ${redact(result.stderr.trim() || `exit code ${result.status}`, token)}`,
            )
        }

        let response
        try {
            response = JSON.parse(result.stdout)
        } catch {
            fail('Cloudflare returned a non-JSON response.')
        }
        if (response.success !== true) {
            const messages = [
                ...(response.errors ?? []),
                ...(response.messages ?? []),
            ]
                .map(({ code, message }) =>
                    code === undefined ? message : `${code}: ${message}`,
                )
                .filter(Boolean)
                .join('; ')
            fail(
                `Cloudflare API request failed: ${redact(messages || 'unknown error', token)}`,
            )
        }
        return response.result
    }
}

function getPhaseRuleset(rulesets, phase) {
    const matches = rulesets.filter(
        (ruleset) => ruleset.kind === 'zone' && ruleset.phase === phase,
    )
    if (matches.length > 1) {
        fail(`Cloudflare returned multiple zone rulesets for phase ${phase}.`)
    }
    return matches[0]
}

function getManagedTransform(managedHeaders, transformId) {
    const matches = managedHeaders.managed_response_headers.filter(
        ({ id }) => id === transformId,
    )
    if (matches.length !== 1) {
        fail(
            `Expected exactly one ${transformId} Managed Transform, received ${matches.length}.`,
        )
    }
    return matches[0]
}

function getRuleMatches(rules, reference) {
    return rules.filter(({ ref }) => ref === reference)
}

function comparableRule(rule) {
    return {
        action: rule.action,
        action_parameters: rule.action_parameters,
        description: rule.description,
        enabled: rule.enabled !== false,
        expression: rule.expression,
        ref: rule.ref,
    }
}

function isEquivalentRule(existing, desired) {
    return isDeepStrictEqual(comparableRule(existing), desired)
}

function analyzeRules(rules, desiredRules) {
    const desiredReferences = desiredRules.map(({ ref }) => ref)
    const suffixReferences = rules
        .slice(-desiredRules.length)
        .map(({ ref }) => ref)
    const requiresReorder = !isDeepStrictEqual(
        suffixReferences,
        desiredReferences,
    )
    const operations = desiredRules.map((desiredRule) => {
        const matches = getRuleMatches(rules, desiredRule.ref)
        if (matches.length > 1) {
            fail(
                `Multiple Cloudflare rules use the owned ref ${desiredRule.ref}.`,
            )
        }
        if (matches.length === 0) return { action: 'create', rule: desiredRule }
        if (!isEquivalentRule(matches[0], desiredRule)) {
            return { action: 'update', existing: matches[0], rule: desiredRule }
        }
        if (requiresReorder) {
            return {
                action: 'reorder',
                existing: matches[0],
                rule: desiredRule,
            }
        }
        return { action: 'none', existing: matches[0], rule: desiredRule }
    })
    return { operations, requiresReorder }
}

function verifyRules(rules, desiredRules) {
    const analysis = analyzeRules(rules, desiredRules)
    const incomplete = analysis.operations.filter(
        ({ action }) => action !== 'none',
    )
    if (incomplete.length > 0) {
        fail(
            `Cloudflare rule verification failed for: ${incomplete.map(({ rule }) => rule.ref).join(', ')}.`,
        )
    }
}

function printPlan({ log, managedTransform, operations, targets }) {
    log('Cloudflare security header mirror plan:')
    for (const target of targets) {
        const reference = createRuleReference(target)
        const operation = operations.find(({ rule }) => rule.ref === reference)
        const targetLabel =
            target.hostname === undefined
                ? target.profile
                : `${target.profile} ${target.hostname}`
        log(`  ${targetLabel}: ${operation?.action ?? 'unknown'}`)
    }
    log(
        `  Managed Transform add_security_headers: ${managedTransform.enabled ? 'disable' : 'already disabled'}`,
    )
}

export function synchronizeSecurityHeaders(
    configuration,
    { log = console.log, policy = loadPolicy(), request },
) {
    const zonePath = `/zones/${configuration.zoneId}`
    const managedHeaders = request('GET', `${zonePath}/managed_headers`)
    const managedTransform = getManagedTransform(
        managedHeaders,
        policy.managedTransform.id,
    )
    const rulesets = request('GET', `${zonePath}/rulesets`)
    let phaseRuleset = getPhaseRuleset(rulesets, policy.phase)
    let rules = []
    if (phaseRuleset) {
        phaseRuleset = request('GET', `${zonePath}/rulesets/${phaseRuleset.id}`)
        rules = phaseRuleset.rules ?? []
    }

    const desiredRules = configuration.targets.map((target) =>
        createRule(target, policy),
    )
    let analysis = analyzeRules(rules, desiredRules)
    printPlan({
        log,
        managedTransform,
        operations: analysis.operations,
        targets: configuration.targets,
    })

    if (!configuration.apply) {
        log(
            'Dry run only. Re-run with --apply --acknowledge-zone-wide-disable to write these changes.',
        )
        return { applied: false, operations: analysis.operations }
    }

    if (!phaseRuleset) {
        phaseRuleset = request('POST', `${zonePath}/rulesets`, {
            description: policy.ruleset.description,
            kind: 'zone',
            name: policy.ruleset.name,
            phase: policy.phase,
            rules: desiredRules,
        })
    } else if (analysis.operations.some(({ action }) => action !== 'none')) {
        for (const desiredRule of desiredRules) {
            const matches = getRuleMatches(
                phaseRuleset.rules ?? rules,
                desiredRule.ref,
            )
            if (matches.length > 1) {
                fail(
                    `Multiple Cloudflare rules use the owned ref ${desiredRule.ref}.`,
                )
            }
            if (matches.length === 0) {
                phaseRuleset = request(
                    'POST',
                    `${zonePath}/rulesets/${phaseRuleset.id}/rules`,
                    desiredRule,
                )
            } else {
                phaseRuleset = request(
                    'PATCH',
                    `${zonePath}/rulesets/${phaseRuleset.id}/rules/${matches[0].id}`,
                    { ...desiredRule, position: { after: '' } },
                )
            }
        }
    }

    const verifiedRuleset = request(
        'GET',
        `${zonePath}/rulesets/${phaseRuleset.id}`,
    )
    verifyRules(verifiedRuleset.rules ?? [], desiredRules)

    if (managedTransform.enabled) {
        request('PATCH', `${zonePath}/managed_headers`, {
            managed_response_headers: [policy.managedTransform],
        })
    }
    const verifiedManagedHeaders = request('GET', `${zonePath}/managed_headers`)
    if (
        getManagedTransform(verifiedManagedHeaders, policy.managedTransform.id)
            .enabled
    ) {
        fail('Cloudflare Managed Transform verification failed.')
    }

    analysis = analyzeRules(verifiedRuleset.rules ?? [], desiredRules)
    log('Cloudflare security header mirror is synchronized.')
    return { applied: true, operations: analysis.operations }
}

export function run(argv, dependencies = {}) {
    const policy = dependencies.policy ?? loadPolicy()
    const configuration = parseArguments(argv, policy)
    const request =
        dependencies.request ??
        createCurlRequester({ token: process.env.CLOUDFLARE_API_TOKEN })
    return synchronizeSecurityHeaders(configuration, {
        ...dependencies,
        policy,
        request,
    })
}

const isMain =
    process.argv[1] &&
    resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))

if (isMain) {
    try {
        run(process.argv.slice(2))
    } catch (error) {
        console.error(error instanceof Error ? error.message : error)
        process.exitCode = 1
    }
}
