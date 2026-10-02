export const API_KEY_AUDIENCES = [
    'public-v1',
    'backoffice-v1',
] as const

export type TApiKeyAudience = (typeof API_KEY_AUDIENCES)[number]

export type TApiKeyPermissionRecord = Record<string, string[]>

export type TApiKeyPermissions = TApiKeyPermissionRecord

export type TReadonlyApiKeyPermissionRecord = Readonly<
    Record<string, readonly string[]>
>

export type TReadonlyApiKeyPermissions = TReadonlyApiKeyPermissionRecord

export const API_KEY_PERMISSION_NAMESPACE_PATTERN =
    /^api\.(?:public|backoffice)(?:\.[a-z][a-zA-Z0-9]*)*$/

export const API_KEY_PERMISSION_ACTION_PATTERN = /^[a-z][a-zA-Z0-9]*$/

export const API_KEY_AUDIENCE_NAMESPACES = {
    'backoffice-v1': 'api.backoffice',
    'public-v1': 'api.public',
} as const satisfies Record<TApiKeyAudience, string>

export const API_KEY_AUDIENCE_ROOT_PERMISSIONS = {
    'backoffice-v1': { 'api.backoffice': ['access'] },
    'public-v1': { 'api.public': ['access'] },
} as const satisfies Record<TApiKeyAudience, TReadonlyApiKeyPermissionRecord>

export function isApiKeyPermissionNamespace(component: string) {
    return API_KEY_PERMISSION_NAMESPACE_PATTERN.test(component)
}

export function getApiKeyPermissionAudience(
    component: string,
): TApiKeyAudience | null {
    if (!isApiKeyPermissionNamespace(component)) return null

    const audiences = API_KEY_AUDIENCES.filter((audience) => {
        const namespace = API_KEY_AUDIENCE_NAMESPACES[audience]
        return component === namespace || component.startsWith(`${namespace}.`)
    })

    return audiences.length === 1 ? audiences[0] : null
}

export function isApiKeyPermissionForAudience(
    audience: TApiKeyAudience,
    component: string,
) {
    return getApiKeyPermissionAudience(component) === audience
}

export function isApiKeyPermissionAllowedForAudience(
    audience: TApiKeyAudience,
    component: string,
    action: string,
) {
    if (!isApiKeyPermissionForAudience(audience, component)) return false

    const rootNamespace = API_KEY_AUDIENCE_NAMESPACES[audience]
    return component === rootNamespace
        ? action === 'access'
        : action !== 'access'
}

export function hasApiKeyAudienceRootAccess(
    audience: TApiKeyAudience,
    permissions: TReadonlyApiKeyPermissionRecord,
) {
    const rootNamespace = API_KEY_AUDIENCE_NAMESPACES[audience]
    return permissions[rootNamespace]?.includes('access') === true
}
