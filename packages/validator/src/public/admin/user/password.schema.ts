import { z } from 'zod'

import * as base from '../../../shared/base.js'
import * as field from '../../../shared/field.js'
import * as refinement from '../../../shared/refinement.js'

export const resetInputSchema = z.object({
    userPublicId: z.uuid({ error: 'User public ID must be a valid UUID.' }),
    newPassword: field
        .vText({
            fieldName: 'New Password',
            min: 12,
            max: 128,
        })
        .check(refinement.password()),
})

export const resetOutputSchema = base.outputSchema(z.null())

export const resetRequestInputSchema = z.object({
    userPublicId: z.uuid({ error: 'User public ID must be a valid UUID.' }),
})

export const resetRequestOutputSchema = base.outputSchema(z.null())
