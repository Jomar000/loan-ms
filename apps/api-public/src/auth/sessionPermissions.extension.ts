import type { THonoVariables } from '../types.js'

export const buildSessionPermissions: (
    userRoles: readonly string[],
    aclRoles: THonoVariables['acl']['roles'],
) => Record<string, never> = () => ({})
