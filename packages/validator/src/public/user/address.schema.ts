import { z } from 'zod'

import * as base from '../../shared/base.js'
import * as field from '../../shared/field.js'

const publicIdSchema = z.uuid({ error: 'Public ID must be a valid UUID.' })

const addressResourceInputSchema = base.postalAddressInputSchema.safeExtend({
    type: base.userAddressTypeSchema,
    label: field.vText({ fieldName: 'Address Label', max: 64 }).optional(),
})

export const createInputSchema = addressResourceInputSchema.safeExtend({
    idempotencyKey: z.uuidv7({
        error: 'Idempotency Key must be a valid UUID v7.',
    }),
    makePrimary: field.vBoolean('Make Primary').optional().default(false),
})

export const createOutputSchema = base.outputSchema(
    base.userAddressOutputDataSchema,
)

export const deleteInputSchema = z.object({ publicId: publicIdSchema })

export const deleteOutputSchema = base.outputSchema(base.objectOutputDataSchema)

export const readManyOutputSchema = base.outputSchema(
    z.array(base.userAddressOutputDataSchema),
)

export const setPrimaryInputSchema = z.object({ publicId: publicIdSchema })

export const setPrimaryOutputSchema = base.outputSchema(
    base.userAddressOutputDataSchema,
)

export const updateInputSchema = addressResourceInputSchema.safeExtend({
    publicId: publicIdSchema,
})

export const updateOutputSchema = base.outputSchema(
    base.userAddressOutputDataSchema,
)
