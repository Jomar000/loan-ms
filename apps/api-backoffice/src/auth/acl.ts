import { AppError, catalog } from '@hyperion/errors'
import {
    adminAc,
    defaultStatements,
    memberAc,
    ownerAc,
} from 'better-auth/plugins/organization/access'
import { eq } from 'drizzle-orm'

import type { THonoVariables } from '../types.js'

type TAclStatements = Record<string, string[]>
type TAclRoles = Record<string, TAclStatements>
type TAclData = {
    apiKeyAssignablePermissions: TAclStatements
    permissions: TAclStatements
    roles: TAclRoles
}

const ACL_CACHE_KEY = 'api-backoffice:cache:acl:v20260903'
const ACL_CACHE_TTL_SECONDS = 300
const ACL_MEMORY_TTL_MILLISECONDS = 30_000

const memoryCache = new WeakMap<
    KVNamespace,
    { expiresAt: number; value: TAclData }
>()
const pendingBuilds = new WeakMap<KVNamespace, Promise<TAclData>>()

function cloneStatements(
    statements: Record<string, readonly string[]>,
): TAclStatements {
    return Object.fromEntries(
        Object.entries(statements).map(
            ([
                component,
                actions,
            ]) => [
                component,
                [...actions],
            ],
        ),
    )
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonemptyString(value: unknown): value is string {
    return typeof value === 'string' && value.trim().length > 0
}

function isStatements(value: unknown): value is TAclStatements {
    if (!isPlainRecord(value)) return false

    return Object.entries(value).every(
        ([
            component,
            actions,
        ]) =>
            isNonemptyString(component) &&
            Array.isArray(actions) &&
            actions.every(isNonemptyString),
    )
}

function isAclData(value: unknown): value is TAclData {
    if (!isPlainRecord(value)) return false

    const candidate = value as Partial<TAclData>
    return (
        isStatements(candidate.apiKeyAssignablePermissions) &&
        isStatements(candidate.permissions) &&
        isPlainRecord(candidate.roles) &&
        Object.entries(candidate.roles).every(
            ([
                role,
                statements,
            ]) => isNonemptyString(role) && isStatements(statements),
        )
    )
}

async function readCachedAcl(kv: KVNamespace) {
    const cached = memoryCache.get(kv)
    if (cached && cached.expiresAt > Date.now()) return cached.value

    const stored = await kv.get(ACL_CACHE_KEY)
    if (!stored) return null

    try {
        const parsed: unknown = JSON.parse(stored)
        if (isAclData(parsed)) {
            memoryCache.set(kv, {
                expiresAt: Date.now() + ACL_MEMORY_TTL_MILLISECONDS,
                value: parsed,
            })
            return parsed
        }
    } catch {
        // Invalid cache entries are deleted below and rebuilt from D1.
    }

    await kv.delete(ACL_CACHE_KEY)
    return null
}

async function buildAcl(
    db: THonoVariables['dbClient'],
    dbSchema: THonoVariables['dbSchema'],
): Promise<TAclData> {
    const { permission, role } = dbSchema
    const rows = await db
        .select({
            action: permission.action,
            apiKeyAssignable: permission.apiKeyAssignable,
            component: permission.component,
            role: role.name,
        })
        .from(permission)
        .innerJoin(role, eq(permission.roleId, role.id))

    const apiKeyAssignablePermissions: TAclStatements = {}
    const tupleAssignability = new Map<string, boolean>()
    const permissions = cloneStatements(defaultStatements)
    const roles: TAclRoles = {
        admin: cloneStatements(adminAc.statements),
        member: cloneStatements(memberAc.statements),
        owner: cloneStatements(ownerAc.statements),
    }

    for (const row of rows) {
        const tuple = `${row.component}\u0000${row.action}`
        const existingAssignability = tupleAssignability.get(tuple)
        if (
            existingAssignability !== undefined &&
            existingAssignability !== row.apiKeyAssignable
        ) {
            throw new AppError(catalog.authenticationUnavailable, {
                cause: new Error(
                    `Conflicting API-key assignability for ${row.component}:${row.action}.`,
                ),
            })
        }
        tupleAssignability.set(tuple, row.apiKeyAssignable)

        permissions[row.component] ??= []
        if (!permissions[row.component].includes(row.action)) {
            permissions[row.component].push(row.action)
        }

        roles[row.role] ??= {}
        roles[row.role][row.component] ??= []
        if (!roles[row.role][row.component].includes(row.action)) {
            roles[row.role][row.component].push(row.action)
        }

        if (row.apiKeyAssignable) {
            apiKeyAssignablePermissions[row.component] ??= []
            if (
                !apiKeyAssignablePermissions[row.component].includes(row.action)
            ) {
                apiKeyAssignablePermissions[row.component].push(row.action)
            }
        }
    }

    return { apiKeyAssignablePermissions, permissions, roles }
}

export async function aclBuilder(
    db: THonoVariables['dbClient'],
    dbSchema: THonoVariables['dbSchema'],
    kv: THonoVariables['kvClient'],
) {
    const existingBuild = pendingBuilds.get(kv)
    if (existingBuild) return existingBuild

    const build = (async () => {
        const cached = await readCachedAcl(kv)
        const value = cached ?? (await buildAcl(db, dbSchema))

        if (!cached) {
            await kv.put(ACL_CACHE_KEY, JSON.stringify(value), {
                expirationTtl: ACL_CACHE_TTL_SECONDS,
            })
        }

        if (!cached) {
            memoryCache.set(kv, {
                expiresAt: Date.now() + ACL_MEMORY_TTL_MILLISECONDS,
                value,
            })
        }
        return value
    })()

    pendingBuilds.set(kv, build)
    try {
        return await build
    } finally {
        pendingBuilds.delete(kv)
    }
}

export default aclBuilder
