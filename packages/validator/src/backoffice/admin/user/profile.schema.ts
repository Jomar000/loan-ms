import { z } from 'zod'

import * as base from '../../../shared/base.js'
import { outputDataSchema } from '../../../shared/profile.js'
import * as profile from '../../user/profile.schema.js'

const adminOutputDataSchema = outputDataSchema.extend({
    userPublicId: z.uuid({ error: 'User public ID must be a valid UUID.' }),
})

export const readInputSchema = z.object({
    userPublicId: z.uuid({ error: 'User public ID must be a valid UUID.' }),
})

export const readManyInputSchema = base.readManyInputSchema

export const readManyOutputSchema = base.paginatedOutputSchema(
    z.array(adminOutputDataSchema),
)

export const readOutputSchema = base.outputSchema(adminOutputDataSchema)

export const updateInputSchema = profile.updateInputSchema.extend({
    userPublicId: z.uuid({ error: 'User public ID must be a valid UUID.' }),
})

export const updateOutputSchema = base.outputSchema(adminOutputDataSchema)
