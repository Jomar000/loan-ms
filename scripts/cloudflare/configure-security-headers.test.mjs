import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

import {
    createCurlRequester,
    createRule,
    createRuleReference,
    loadPolicy,
    parseArguments,
    synchronizeSecurityHeaders,
} from './configure-security-headers.mjs'

const root = resolve(import.meta.dirname, '../..')
const policy = loadPolicy()
const zoneId = 'a'.repeat(32)
const publicTarget = { hostname: 'www.example.com', profile: 'public' }
const backofficeTarget = {
    hostname: 'admin.example.com',
    profile: 'backoffice',
}
const globalTarget = { profile: 'global' }

function parseHeadersFile(path) {
    const headers = {}
    for (const line of readFileSync(path, 'utf8').split(/\r?\n/u)) {
        if (!line.startsWith('  ')) continue
        const separatorIndex = line.indexOf(':')
        assert.notEqual(separatorIndex, -1, `Malformed header line: ${line}`)
        headers[line.slice(2, separatorIndex)] = line
            .slice(separatorIndex + 1)
            .trim()
    }
    return headers
}

function clone(value) {
    return value === undefined ? undefined : structuredClone(value)
}

function createCloudflareFixture({
    failAt,
    managedEnabled = true,
    rules = undefined,
} = {}) {
    const requests = []
    const state = {
        managedEnabled,
        nextRuleId: 1,
        ruleset:
            rules === undefined
                ? undefined
                : {
                      description: 'Existing response transform rules',
                      id: 'ruleset-id',
                      kind: 'zone',
                      name: 'Existing response transform rules',
                      phase: policy.phase,
                      rules: clone(rules),
                  },
    }

    for (const rule of state.ruleset?.rules ?? []) {
        if (!rule.id) rule.id = `existing-${state.nextRuleId++}`
    }

    function request(method, path, body) {
        requests.push({ body: clone(body), method, path })
        if (failAt?.({ body, method, path })) {
            throw new Error('Simulated Cloudflare API failure')
        }

        if (path === `/zones/${zoneId}/managed_headers`) {
            if (method === 'PATCH') {
                assert.deepEqual(body, {
                    managed_response_headers: [policy.managedTransform],
                })
                state.managedEnabled = false
            }
            return {
                managed_request_headers: [],
                managed_response_headers: [
                    {
                        enabled: state.managedEnabled,
                        id: policy.managedTransform.id,
                    },
                ],
            }
        }

        if (path === `/zones/${zoneId}/rulesets` && method === 'GET') {
            return state.ruleset
                ? [
                      {
                          id: state.ruleset.id,
                          kind: state.ruleset.kind,
                          phase: state.ruleset.phase,
                      },
                  ]
                : []
        }

        if (path === `/zones/${zoneId}/rulesets` && method === 'POST') {
            state.ruleset = {
                ...clone(body),
                id: 'ruleset-id',
                rules: body.rules.map((rule) => ({
                    ...clone(rule),
                    id: `created-${state.nextRuleId++}`,
                })),
            }
            return clone(state.ruleset)
        }

        if (
            path === `/zones/${zoneId}/rulesets/ruleset-id` &&
            method === 'GET'
        ) {
            assert.ok(state.ruleset)
            return clone(state.ruleset)
        }

        if (
            path === `/zones/${zoneId}/rulesets/ruleset-id/rules` &&
            method === 'POST'
        ) {
            assert.ok(state.ruleset)
            state.ruleset.rules.push({
                ...clone(body),
                id: `created-${state.nextRuleId++}`,
            })
            return clone(state.ruleset)
        }

        const rulePath = `/zones/${zoneId}/rulesets/ruleset-id/rules/`
        if (path.startsWith(rulePath) && method === 'PATCH') {
            assert.ok(state.ruleset)
            const ruleId = path.slice(rulePath.length)
            const existingIndex = state.ruleset.rules.findIndex(
                ({ id }) => id === ruleId,
            )
            assert.notEqual(existingIndex, -1)
            const { position, ...rule } = body
            assert.deepEqual(position, { after: '' })
            state.ruleset.rules.splice(existingIndex, 1)
            state.ruleset.rules.push({ ...clone(rule), id: ruleId })
            return clone(state.ruleset)
        }

        throw new Error(`Unexpected request: ${method} ${path}`)
    }

    return { request, requests, state }
}

function applyConfiguration(targets) {
    return {
        acknowledgeZoneWideDisable: true,
        apply: true,
        targets,
        zoneId,
    }
}

test('shared JSON policy exactly mirrors both authoritative _headers files', () => {
    const publicHeaders = parseHeadersFile(
        resolve(root, 'apps/web-public/static/_headers'),
    )
    const backofficeHeaders = parseHeadersFile(
        resolve(root, 'apps/web-backoffice/static/_headers'),
    )

    assert.deepEqual(publicHeaders, policy.sharedHeaders)
    assert.deepEqual(backofficeHeaders, {
        ...policy.sharedHeaders,
        ...policy.profiles.backoffice.headers,
    })
})

test('builds plainly named profile rules with the required match scope', () => {
    const publicRule = createRule(publicTarget, policy)
    const backofficeRule = createRule(backofficeTarget, policy)
    const globalRule = createRule(globalTarget, policy)

    assert.equal(publicRule.description, 'Public Security Headers')
    assert.equal(publicRule.expression, '(http.host eq "www.example.com")')
    assert.equal(backofficeRule.description, 'BackOffice Security Headers')
    assert.equal(
        backofficeRule.expression,
        '(http.host eq "admin.example.com")',
    )
    assert.equal(globalRule.description, 'Global Security Headers')
    assert.equal(globalRule.expression, 'true')
    assert.equal(
        publicRule.action_parameters.headers['X-Frame-Options'].operation,
        'set',
    )
    assert.equal(
        publicRule.action_parameters.headers['X-Robots-Tag'],
        undefined,
    )
    assert.deepEqual(backofficeRule.action_parameters.headers['X-Robots-Tag'], {
        operation: 'set',
        value: 'noindex, nofollow, noarchive',
    })
})

test('derives stable, profile-specific rule references', () => {
    assert.equal(
        createRuleReference(publicTarget),
        createRuleReference({ ...publicTarget }),
    )
    assert.notEqual(
        createRuleReference(publicTarget),
        createRuleReference({ ...publicTarget, profile: 'backoffice' }),
    )
    assert.match(
        createRuleReference(publicTarget),
        /^hyperion_security_headers_public_[a-f0-9]{12}$/u,
    )
    assert.equal(
        createRuleReference(globalTarget),
        'hyperion_security_headers_global',
    )
})

test('validates hostnames, target uniqueness, and zone-wide acknowledgement', () => {
    assert.throws(
        () =>
            parseArguments(
                [
                    '--zone-id',
                    zoneId,
                    '--target',
                    'public=https://www.example.com',
                ],
                policy,
            ),
        /Invalid hostname/u,
    )
    assert.throws(
        () =>
            parseArguments(
                [
                    '--zone-id',
                    zoneId,
                    '--target',
                    'public=www.example.com',
                    '--target',
                    'public=WWW.EXAMPLE.COM',
                ],
                policy,
            ),
        /Duplicate --target/u,
    )
    assert.throws(
        () =>
            parseArguments(
                [
                    '--zone-id',
                    zoneId,
                    '--target',
                    'public=www.example.com',
                    '--apply',
                ],
                policy,
            ),
        /--acknowledge-zone-wide-disable/u,
    )

    const parsed = parseArguments(
        [
            '--zone-id',
            zoneId,
            '--target',
            'Public=WWW.EXAMPLE.COM',
            '--target',
            'BackOffice=ADMIN.EXAMPLE.COM',
            '--target',
            'Global',
        ],
        policy,
    )
    assert.deepEqual(parsed.targets, [
        publicTarget,
        backofficeTarget,
        globalTarget,
    ])
    assert.throws(
        () =>
            parseArguments(
                [
                    '--zone-id',
                    zoneId,
                    '--target',
                    'global=www.example.com',
                ],
                policy,
            ),
        /must not include a hostname/u,
    )
    assert.throws(
        () =>
            parseArguments(
                [
                    '--zone-id',
                    zoneId,
                    '--target',
                    'public',
                ],
                policy,
            ),
        /requires --target public=<hostname>/u,
    )
})

test('keeps the API token out of cURL process arguments and errors', () => {
    const token = 'secret-cloudflare-token'
    let invocation
    const request = createCurlRequester({
        curlExecutable: 'curl',
        spawn(executable, arguments_, options) {
            invocation = { arguments_, executable, options }
            return {
                status: 0,
                stderr: '',
                stdout: JSON.stringify({ result: [], success: true }),
            }
        },
        token,
    })

    assert.deepEqual(request('GET', `/zones/${zoneId}/rulesets`), [])
    assert.equal(invocation.executable, 'curl')
    assert.equal(invocation.arguments_.join(' ').includes(token), false)
    assert.equal(invocation.options.input.includes(token), true)

    const failingRequest = createCurlRequester({
        spawn() {
            return {
                status: 22,
                stderr: `request failed for ${token}`,
                stdout: '',
            }
        },
        token,
    })
    assert.throws(
        () => failingRequest('GET', `/zones/${zoneId}/rulesets`),
        (error) =>
            error instanceof Error &&
            !error.message.includes(token) &&
            error.message.includes('[REDACTED]'),
    )
})

test('dry run inspects state without making API writes', () => {
    const fixture = createCloudflareFixture()
    const result = synchronizeSecurityHeaders(
        {
            acknowledgeZoneWideDisable: false,
            apply: false,
            targets: [publicTarget],
            zoneId,
        },
        { log() {}, policy, request: fixture.request },
    )

    assert.equal(result.applied, false)
    assert.deepEqual(
        fixture.requests.map(({ method }) => method),
        [
            'GET',
            'GET',
        ],
    )
})

test('creates all target rules before disabling the zone-wide transform', () => {
    const fixture = createCloudflareFixture()
    synchronizeSecurityHeaders(
        applyConfiguration([
            publicTarget,
            backofficeTarget,
            globalTarget,
        ]),
        { log() {}, policy, request: fixture.request },
    )

    assert.deepEqual(
        fixture.state.ruleset.rules.map(({ ref }) => ref),
        [
            createRuleReference(publicTarget),
            createRuleReference(backofficeTarget),
            createRuleReference(globalTarget),
        ],
    )
    assert.equal(fixture.state.managedEnabled, false)
    const rulesetWriteIndex = fixture.requests.findIndex(
        ({ method, path }) =>
            method === 'POST' && path === `/zones/${zoneId}/rulesets`,
    )
    const transformWriteIndex = fixture.requests.findIndex(
        ({ method, path }) =>
            method === 'PATCH' && path === `/zones/${zoneId}/managed_headers`,
    )
    assert.ok(rulesetWriteIndex >= 0)
    assert.ok(transformWriteIndex > rulesetWriteIndex)
    assert.equal(
        fixture.requests.some(({ method }) => method === 'PUT'),
        false,
    )
})

test('updates and reorders an owned rule without replacing unrelated rules', () => {
    const desiredRule = createRule(publicTarget, policy)
    const unrelatedRule = {
        action: 'rewrite',
        action_parameters: {
            headers: { 'X-Unrelated': { operation: 'set', value: 'kept' } },
        },
        description: 'Unrelated rule',
        enabled: true,
        expression: 'true',
        id: 'unrelated-rule',
        ref: 'unrelated_rule',
    }
    const fixture = createCloudflareFixture({
        rules: [
            { ...desiredRule, description: 'Outdated description' },
            unrelatedRule,
        ],
    })

    synchronizeSecurityHeaders(applyConfiguration([publicTarget]), {
        log() {},
        policy,
        request: fixture.request,
    })

    assert.deepEqual(
        fixture.state.ruleset.rules.map(({ ref }) => ref),
        [
            'unrelated_rule',
            desiredRule.ref,
        ],
    )
    assert.deepEqual(fixture.state.ruleset.rules[0], unrelatedRule)
    assert.equal(
        fixture.requests.some(({ method }) => method === 'PUT'),
        false,
    )
})

test('a repeated application performs no writes or duplicate creation', () => {
    const fixture = createCloudflareFixture({
        managedEnabled: false,
        rules: [createRule(publicTarget, policy)],
    })

    synchronizeSecurityHeaders(applyConfiguration([publicTarget]), {
        log() {},
        policy,
        request: fixture.request,
    })

    assert.equal(
        fixture.requests.some(({ method }) => method !== 'GET'),
        false,
    )
    assert.equal(fixture.state.ruleset.rules.length, 1)
})

test('does not disable Managed Security Headers after a rule write failure', () => {
    const fixture = createCloudflareFixture({
        failAt: ({ method, path }) =>
            method === 'POST' && path === `/zones/${zoneId}/rulesets`,
    })

    assert.throws(
        () =>
            synchronizeSecurityHeaders(applyConfiguration([publicTarget]), {
                log() {},
                policy,
                request: fixture.request,
            }),
        /Simulated Cloudflare API failure/u,
    )
    assert.equal(fixture.state.managedEnabled, true)
    assert.equal(
        fixture.requests.some(
            ({ method, path }) =>
                method === 'PATCH' &&
                path === `/zones/${zoneId}/managed_headers`,
        ),
        false,
    )
})

test('fails when duplicate owned rule references make state ambiguous', () => {
    const rule = createRule(publicTarget, policy)
    const fixture = createCloudflareFixture({
        rules: [
            rule,
            rule,
        ],
    })

    assert.throws(
        () =>
            synchronizeSecurityHeaders(
                {
                    acknowledgeZoneWideDisable: false,
                    apply: false,
                    targets: [publicTarget],
                    zoneId,
                },
                { log() {}, policy, request: fixture.request },
            ),
        /Multiple Cloudflare rules use the owned ref/u,
    )
})

// =============================================================================
// END OF BASE TEMPLATE TESTS - FORK-SPECIFIC TESTS MUST BE ADDED BELOW
// =============================================================================
