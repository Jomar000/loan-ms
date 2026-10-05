import { z } from 'zod'

import * as base from '../shared/base.js'
import * as field from '../shared/field.js'

const reportFiltersSchema = z
    .object({
        dateFrom: field.vIsoDate('From date').optional(),
        dateTo: field.vIsoDate('To date').optional(),
    })
    .check((ctx) => {
        const { dateFrom, dateTo } = ctx.value
        if (dateFrom && dateTo && dateFrom > dateTo) {
            ctx.issues.push({
                code: 'custom',
                input: ctx.value,
                message: 'From date must be on or before To date.',
                path: ['dateFrom'],
            })
        }
    })

export const reportReadInputSchema = z.object({
    filters: reportFiltersSchema.default({}),
})

export const overdueReadManyInputSchema = base.readManyInputSchema.extend({
    filters: z
        .object({
            borrowerPublicId: z.uuid().optional(),
            maxDaysLate: field
                .vInt({ fieldName: 'Maximum days late', min: 1, max: 3650 })
                .optional(),
            minDaysLate: field
                .vInt({ fieldName: 'Minimum days late', min: 1, max: 3650 })
                .optional(),
        })
        .default({}),
})
