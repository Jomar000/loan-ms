import {
    API_KEY_AUDIENCES,
    API_KEY_PERMISSION_ACTION_PATTERN,
    API_KEY_PERMISSION_NAMESPACE_PATTERN,
} from '@loanms/types/shared'
import { z } from 'zod'

import { vText } from './field.js'
import { uniqueArrayValues } from './refinement.js'

export const apiKeyAudienceSchema = z.enum(API_KEY_AUDIENCES)

const permissionNamespaceSchema = vText({
    fieldName: 'Permission namespace',
    max: 64,
}).regex(
    API_KEY_PERMISSION_NAMESPACE_PATTERN,
    'Permission namespaces must use an API audience dot namespace.',
)

const permissionActionSchema = vText({
    fieldName: 'Permission action',
    max: 64,
}).regex(
    API_KEY_PERMISSION_ACTION_PATTERN,
    'Permission actions must use lower camel case.',
)

export const apiKeyPermissionsSchema = z
    .record(
        permissionNamespaceSchema,
        z
            .array(permissionActionSchema)
            .min(1, 'Each permission namespace must contain an action.')
            .max(
                64,
                'Each permission namespace may contain at most 64 actions.',
            )
            .check((ctx) =>
                uniqueArrayValues(ctx, {
                    message: 'Permission actions must be unique.',
                    values: ctx.value,
                }),
            ),
    )
    .refine((permissions) => Object.keys(permissions).length > 0, {
        message: 'At least one permission is required.',
    })
    .refine((permissions) => Object.keys(permissions).length <= 64, {
        message: 'At most 64 permission namespaces are allowed.',
    })
