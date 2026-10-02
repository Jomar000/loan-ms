import { z } from 'zod'

import * as base from '../../../shared/base.js'

export const readManyInputSchema = z.object({
    userPublicId: z.uuid({ error: 'User public ID must be a valid UUID.' }),
})

export const readManyOutputSchema = base.outputSchema(
    z.array(base.userAddressOutputDataSchema),
)
