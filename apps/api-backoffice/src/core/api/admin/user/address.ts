import { address as addressValidator } from '@loanms/validator/backoffice/admin/user'
import { and, asc, desc, eq } from 'drizzle-orm'
import { Hono } from 'hono'

import type { THonoInstance } from '../../../../types.js'
import {
    apiResponseOkWrapper,
    getActiveOrganizationId,
} from '../../../../utilities/helpers.js'
import { isAuthorized } from '../../../middleware/isAuthorized.js'
import { validateRequest } from '../../../middleware/validateRequest.js'

type TDatabaseSchema = typeof import('@loanms/database/d1').dbSchema

const addressSelection = (userAddress: TDatabaseSchema['userAddress']) => ({
    publicId: userAddress.publicId,
    type: userAddress.type,
    label: userAddress.label,
    isPrimary: userAddress.isPrimary,
    addressLine1: userAddress.addressLine1,
    addressLine2: userAddress.addressLine2,
    dependentLocality: userAddress.dependentLocality,
    locality: userAddress.locality,
    administrativeArea: userAddress.administrativeArea,
    postalCode: userAddress.postalCode,
    countryCode: userAddress.countryCode,
    psgcCode: userAddress.psgcCode,
})

export const addressRoute = new Hono<THonoInstance>().get(
    '/readMany',
    isAuthorized({ SYSADMIN: ['ANY'] }),
    validateRequest('query', addressValidator.readManyInputSchema),
    async (ctx) => {
        const input = ctx.req.valid('query')
        const organizationId = getActiveOrganizationId(ctx)
        const { member, user, userAddress } = ctx.get('dbSchema')

        const data = await ctx
            .get('dbClient')
            .select(addressSelection(userAddress))
            .from(userAddress)
            .innerJoin(user, eq(user.id, userAddress.userId))
            .innerJoin(
                member,
                and(
                    eq(member.userId, userAddress.userId),
                    eq(member.organizationId, organizationId),
                ),
            )
            .where(eq(user.publicId, input.userPublicId))
            .orderBy(desc(userAddress.isPrimary), asc(userAddress.createdAt))

        return apiResponseOkWrapper(ctx, { data })
    },
)

export default addressRoute
