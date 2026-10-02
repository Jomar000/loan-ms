import { z } from 'zod'

import * as base from '../shared/base.js'
import * as field from '../shared/field.js'
import * as refinement from '../shared/refinement.js'
import { sessionPermissionsSchema } from './sessionPermissions.extension.schema.js'

export { sessionPermissionsSchema } from './sessionPermissions.extension.schema.js'

const authEmailSchema = z
    .email({ error: 'Please provide a valid e-mail address.' })
    .max(254, 'E-mail address must be 254 characters or less.')
    .toLowerCase()

const authTokenSchema = z
    .string({ error: 'Token must be a string.' })
    .min(1, 'Token must be 1 character or more.')
    .max(512, 'Token must be 512 characters or less.')
    .regex(/^[A-Za-z0-9._-]+$/, 'Token contains invalid characters.')

const sessionDataSchema = z
    .object({
        name: z.string(),
        email: z.string(),
        avatar: z.string().optional().default(''),
        organizationName: z.string(),
        organizationSlug: z.string(),
        userRoles: z.array(z.string()).min(1),
        permissions: sessionPermissionsSchema.prefault({}),
        expiresAt: z.number().int().nonnegative(),
        refreshAt: z.number().int().nonnegative(),
    })
    .refine((session) => session.refreshAt <= session.expiresAt, {
        message: 'Session refresh must not occur after expiry.',
        path: ['refreshAt'],
    })

const organizationSummarySchema = z.object({
    name: z.string(),
    slug: z.string(),
})

export const organizationReadManyInputSchema = base.readManyInputSchema.extend({
    filters: z
        .object({
            searchFilter: field
                .vText({ fieldName: 'Search Filter', max: 255 })
                .optional(),
        })
        .default({}),
})

export const organizationReadManyOutputSchema = base.paginatedOutputSchema(
    z.array(organizationSummarySchema),
)

export const organizationSetActiveInputSchema = z.object({
    organizationSlug: field.vText({ fieldName: 'Organization' }),
})

export const organizationSetActiveOutputSchema = base.outputSchema(z.null())

export const passwordChangeInputSchema = z.object({
    currentPassword: field
        .vText({
            fieldName: 'Current Password',
            min: 12,
            max: 128,
        })
        .check(refinement.password()),
    newPassword: field
        .vText({
            fieldName: 'New Password',
            min: 12,
            max: 128,
        })
        .check(refinement.password()),
})

export const passwordChangeOutputSchema = base.outputSchema(z.null())

export const passwordResetInputSchema = z.object({
    token: authTokenSchema,
    newPassword: field
        .vText({
            fieldName: 'New Password',
            min: 12,
            max: 128,
        })
        .check(refinement.password()),
})

export const passwordResetOutputSchema = base.outputSchema(z.null())

export const passwordResetRequestInputSchema = z.object({
    email: authEmailSchema,
})

export const passwordResetRequestOutputSchema = base.outputSchema(z.null())

export const signInInputSchema = z.object({
    organizationId: field.vText({
        fieldName: 'Organization ID',
    }),
    accountId: field.vText({
        fieldName: 'Account ID',
    }),
    password: field
        .vText({
            fieldName: 'Password',
            min: 12,
            max: 128,
        })
        .check(refinement.password()),
})

export const sessionOutputSchema = base.outputSchema(sessionDataSchema)

export const signInOutputSchema = base.outputSchema(z.null())

export const signOutOutputSchema = base.outputSchema(z.null())

export const signUpInputSchema = z.object({
    email: authEmailSchema,
    username: field
        .vText({
            fieldName: 'Username',
            min: 6,
            max: 36,
        })
        .regex(/^[\w-.]+$/, {
            message:
                'Only alphanumeric, underscores, dashes & dots are allowed for username.',
        }),
    password: field
        .vText({
            fieldName: 'Password',
            min: 12,
            max: 128,
        })
        .check(refinement.password()),
    name: field.vText({
        fieldName: 'Name',
    }),
})

export const signUpOutputSchema = base.outputSchema(base.objectOutputDataSchema)

export const verifyEmailInputSchema = z.object({
    token: authTokenSchema,
})

export const verifyEmailOutputSchema = base.outputSchema(z.null())
