import type { TValidatorIssue } from '@loanms/types/shared'
import { z } from 'zod'

import { vText } from './field.js'

const outputErrorSchema = z.object({
    success: z.literal(false),
    data: z.null().optional(),
    error: z.object({
        requestId: z.string(),
        code: z.string(),
        message: z.string(),
        validatorIssues: z.array(z.custom<TValidatorIssue>()).optional(),
    }),
})

export const postalAddressInputSchema = z
    .object({
        addressLine1: vText({ fieldName: 'Address Line 1', max: 160 }),
        addressLine2: vText({
            fieldName: 'Address Line 2',
            max: 160,
        }).optional(),
        dependentLocality: vText({
            fieldName: 'Dependent Locality',
            max: 100,
        }).optional(),
        locality: vText({ fieldName: 'Locality', max: 100 }).optional(),
        administrativeArea: vText({
            fieldName: 'Administrative Area',
            max: 100,
        }).optional(),
        postalCode: vText({ fieldName: 'Postal Code', max: 32 })
            .transform((value) => value.toUpperCase())
            .optional(),
        countryCode: vText({ fieldName: 'Country Code', max: 2 })
            .length(2, 'Country Code must contain exactly 2 characters.')
            .transform((value) => value.toUpperCase())
            .pipe(
                z
                    .string()
                    .regex(
                        /^[A-Z]{2}$/,
                        'Country Code must be an ISO alpha-2 code.',
                    ),
            ),
        psgcCode: vText({ fieldName: 'PSGC Code', max: 10 })
            .regex(/^\d{10}$/, 'PSGC Code must contain exactly 10 digits.')
            .optional(),
    })
    .check((ctx) => {
        const address = ctx.value

        if (address.psgcCode && address.countryCode !== 'PH') {
            ctx.issues.push({
                code: 'custom',
                input: address.psgcCode,
                message: 'PSGC Code is only valid for Philippine addresses.',
                path: ['psgcCode'],
            })
        }

        if (address.countryCode !== 'PH') return

        for (const [
            field,
            label,
        ] of [
            [
                'dependentLocality',
                'Dependent Locality',
            ],
            [
                'locality',
                'Locality',
            ],
            [
                'administrativeArea',
                'Administrative Area',
            ],
            [
                'postalCode',
                'Postal Code',
            ],
        ] as const) {
            if (!address[field]) {
                ctx.issues.push({
                    code: 'custom',
                    input: address[field],
                    message: `${label} is required for Philippine addresses.`,
                    path: [field],
                })
            }
        }
    })

export const userAddressTypeSchema = z.enum([
    'RESIDENTIAL',
    'MAILING',
    'OTHER',
])

export const userAddressOutputDataSchema = z.object({
    publicId: z.uuid(),
    type: userAddressTypeSchema,
    label: z.string().nullable(),
    isPrimary: z.boolean(),
    addressLine1: z.string(),
    addressLine2: z.string().nullable(),
    dependentLocality: z.string().nullable(),
    locality: z.string().nullable(),
    administrativeArea: z.string().nullable(),
    postalCode: z.string().nullable(),
    countryCode: z.string(),
    psgcCode: z.string().nullable(),
})

export const objectOutputDataSchema = z.looseObject({})

export const objectArrayOutputDataSchema = z.array(objectOutputDataSchema)

export const cursorPaginatedOutputSchema = <
    Data extends z.ZodType = z.ZodType,
    Cursor extends z.ZodType = z.ZodType,
>(
    data: Data,
    cursor: Cursor,
) =>
    z.union([
        z.object({
            success: z.literal(true),
            data,
            error: z.null().optional(),
            limit: z.number(),
            nextCursor: cursor.nullable(),
        }),
        outputErrorSchema,
    ])

export const outputSchema = <Data extends z.ZodType = z.ZodType>(data: Data) =>
    z.union([
        z.object({
            success: z.literal(true),
            data,
            error: z.null().optional(),
        }),
        outputErrorSchema,
    ])

export const paginatedOutputSchema = <Data extends z.ZodType = z.ZodType>(
    data: Data,
) =>
    z.union([
        z.object({
            success: z.literal(true),
            data,
            error: z.null().optional(),
            count: z.number(),
            limit: z.number(),
            offset: z.number(),
        }),
        outputErrorSchema,
    ])

export const readManyInputSchema = z.object({
    limit: z.coerce
        .number({
            error: 'Limit must be a number or a string that can be cast as a number.',
        })
        .int({ error: 'Limit must be an integer.' })
        .min(1, { error: 'Limit must be greater than or equal to 1.' })
        .max(100, { error: 'Limit must be less than or equal to 100.' })
        .optional()
        .default(100),
    offset: z.coerce
        .number({
            error: 'Offset must be a number or a string that can be cast as a number.',
        })
        .int({ error: 'Offset must be an integer.' })
        .gte(0, { error: 'Offset must be greater than or equal to 0.' })
        .optional()
        .default(0),
    sortOrder: z
        .enum(
            [
                'asc',
                'desc',
            ],
            {
                error: (issue) => {
                    switch (issue.code) {
                        case 'invalid_value':
                            return {
                                message:
                                    'Provided sort order is not in the choices.',
                            }
                        default:
                            return { message: 'Invalid sort order provided.' }
                    }
                },
            },
        )
        .optional()
        .default('asc'),
})
