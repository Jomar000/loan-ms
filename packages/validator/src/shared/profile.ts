import { z } from 'zod'

export const outputDataSchema = z.object({
    backupPhoneNumber: z.string().nullable(),
    firstName: z.string(),
    gender: z.enum([
        'MALE',
        'FEMALE',
    ]),
    lastName: z.string(),
    middleName: z.string().nullable(),
    nameExtension: z.string().nullable(),
})
