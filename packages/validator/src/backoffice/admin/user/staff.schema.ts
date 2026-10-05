import { z } from 'zod'

import * as base from '../../../shared/base.js'

export const manageableStaffRoleSchema = z.enum([
    'admin',
    'auditor',
    'cashier',
    'collector',
    'member',
    'viewer',
])

const staffOutputDataSchema = z.object({
    email: z.email(),
    isLocked: z.boolean(),
    name: z.string(),
    roles: z.array(z.string()).min(1),
    userPublicId: z.uuid(),
    username: z.string(),
})

export const readManyInputSchema = base.readManyInputSchema

export const readManyOutputSchema = base.paginatedOutputSchema(
    z.array(staffOutputDataSchema),
)

const staffMutationInputSchema = z.object({
    userPublicId: z.uuid({ error: 'User public ID must be a valid UUID.' }),
})

export const updateAccessInputSchema = staffMutationInputSchema.extend({
    isLocked: z.boolean(),
})

export const updateAccessOutputSchema = base.outputSchema(staffOutputDataSchema)

export const updateRoleInputSchema = staffMutationInputSchema.extend({
    role: manageableStaffRoleSchema,
})

export const updateRoleOutputSchema = base.outputSchema(staffOutputDataSchema)
