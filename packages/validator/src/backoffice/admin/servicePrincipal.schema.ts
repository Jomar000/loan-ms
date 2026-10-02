import {
    hasApiKeyAudienceRootAccess,
    isApiKeyPermissionAllowedForAudience,
} from '@hyperion/types/shared'
import { z } from 'zod'

import {
    apiKeyAudienceSchema,
    apiKeyPermissionsSchema,
} from '../../shared/apiKey.js'
import {
    outputSchema,
    paginatedOutputSchema,
    readManyInputSchema,
} from '../../shared/base.js'
import { vInt, vText } from '../../shared/field.js'
import { updatedFields } from '../../shared/refinement.js'

const principalPublicIdSchema = z.uuid({
    error: 'Invalid service principal ID.',
})

const servicePrincipalOutputDataSchema = z.object({
    publicId: principalPublicIdSchema,
    name: z.string(),
    description: z.string().nullable(),
    audience: apiKeyAudienceSchema,
    enabled: z.boolean(),
    permissions: apiKeyPermissionsSchema,
    activeCredentialCount: z.number().int().min(0),
    lastVerifiedAt: z.date().nullable(),
})

const servicePrincipalCredentialOutputDataSchema = z.object({
    id: z.string(),
    name: z.string(),
    start: z.string().nullable(),
    expiresAt: z.date().nullable(),
    createdAt: z.date(),
    lastVerifiedAt: z.date().nullable(),
})

export const servicePrincipalReadManyInputSchema = readManyInputSchema
    .extend({
        filters: z.object({ audience: apiKeyAudienceSchema }).strict(),
    })
    .strict()

export const servicePrincipalCreateInputSchema = z
    .object({
        idempotencyKey: z.uuidv7({ error: 'Invalid idempotency key.' }),
        name: vText({ fieldName: 'Name', max: 64 }),
        description: vText({ fieldName: 'Description', max: 512 })
            .nullable()
            .optional(),
        audience: apiKeyAudienceSchema,
        permissions: apiKeyPermissionsSchema,
    })
    .strict()
    .check((ctx) => {
        const hasInvalidPermission = Object.entries(ctx.value.permissions).some(
            ([
                component,
                actions,
            ]) =>
                actions.some(
                    (action) =>
                        !isApiKeyPermissionAllowedForAudience(
                            ctx.value.audience,
                            component,
                            action,
                        ),
                ),
        )

        if (
            hasInvalidPermission ||
            !hasApiKeyAudienceRootAccess(
                ctx.value.audience,
                ctx.value.permissions,
            )
        ) {
            ctx.issues.push({
                code: 'custom',
                input: ctx.value.permissions,
                message: 'Invalid permissions for the selected audience.',
                path: ['permissions'],
            })
        }
    })

export const servicePrincipalUpdateInputSchema = z
    .object({
        publicId: principalPublicIdSchema,
        name: vText({ fieldName: 'Name', max: 64 }).optional(),
        description: vText({ fieldName: 'Description', max: 512 })
            .nullable()
            .optional(),
        permissions: apiKeyPermissionsSchema.optional(),
    })
    .strict()
    .check(updatedFields(['publicId']))

export const servicePrincipalStatusInputSchema = z
    .object({ publicId: principalPublicIdSchema })
    .strict()

export const servicePrincipalEnableInputSchema =
    servicePrincipalStatusInputSchema
        .extend({ confirmed: z.literal(true) })
        .strict()

export const servicePrincipalCredentialReadManyInputSchema = readManyInputSchema
    .extend({
        filters: z
            .object({ principalPublicId: principalPublicIdSchema })
            .strict(),
    })
    .strict()

export const servicePrincipalCredentialCreateInputSchema = z
    .object({
        idempotencyKey: z.uuidv7({ error: 'Invalid idempotency key.' }),
        principalPublicId: principalPublicIdSchema,
        name: vText({ fieldName: 'Credential name', max: 64 }),
        expiryDays: vInt({
            fieldName: 'Expiry days',
            min: 1,
            max: 365,
        })
            .nullable()
            .optional()
            .default(90),
    })
    .strict()

export const servicePrincipalCredentialRevokeInputSchema = z
    .object({
        principalPublicId: principalPublicIdSchema,
        credentialId: vText({ fieldName: 'Credential ID', max: 255 }),
    })
    .strict()

export const servicePrincipalReadManyOutputSchema = paginatedOutputSchema(
    z.array(servicePrincipalOutputDataSchema),
)
export const servicePrincipalCreateOutputSchema = outputSchema(
    servicePrincipalOutputDataSchema,
)
export const servicePrincipalUpdateOutputSchema = outputSchema(
    servicePrincipalOutputDataSchema,
)
export const servicePrincipalStatusOutputSchema = outputSchema(
    servicePrincipalOutputDataSchema,
)
export const servicePrincipalDeleteOutputSchema = outputSchema(z.null())
export const servicePrincipalCredentialReadManyOutputSchema =
    paginatedOutputSchema(z.array(servicePrincipalCredentialOutputDataSchema))
export const servicePrincipalCredentialCreateOutputSchema = outputSchema(
    z.discriminatedUnion('outcome', [
        servicePrincipalCredentialOutputDataSchema.extend({
            key: z.string(),
            outcome: z.literal('issued'),
        }),
        servicePrincipalCredentialOutputDataSchema.extend({
            outcome: z.literal('alreadyIssued'),
        }),
    ]),
)
export const servicePrincipalCredentialRevokeOutputSchema = outputSchema(
    z.null(),
)
