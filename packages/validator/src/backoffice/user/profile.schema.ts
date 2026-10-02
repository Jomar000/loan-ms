import { z } from 'zod'

import * as base from '../../shared/base.js'
import * as field from '../../shared/field.js'
import { outputDataSchema } from '../../shared/profile.js'

export const readOutputSchema = base.outputSchema(outputDataSchema)

export const updateInputSchema = z.object({
    firstName: field.vText({ fieldName: 'First Name' }).uppercase(),
    middleName: field
        .vText({ fieldName: 'Middle Name' })
        .uppercase()
        .optional(),
    lastName: field.vText({ fieldName: 'Last Name' }).uppercase(),
    nameExtension: field
        .vText({ fieldName: 'Name Extension' })
        .uppercase()
        .optional(),
    gender: z.enum(
        [
            'MALE',
            'FEMALE',
        ],
        {
            error: (issue) => {
                switch (issue.code) {
                    case 'invalid_value':
                        return {
                            message: 'Provided gender is not in the choices.',
                        }
                    default:
                        return { message: 'Invalid gender provided.' }
                }
            },
        },
    ),
    backupPhoneNumber: field
        .vText({
            fieldName: 'Backup Phone Number',
        })
        .uppercase(),
})

export const updateOutputSchema = base.outputSchema(outputDataSchema)
