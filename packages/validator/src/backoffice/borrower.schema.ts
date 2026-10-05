import { z } from 'zod'

import * as base from '../shared/base.js'
import * as field from '../shared/field.js'
import * as refinement from '../shared/refinement.js'

export const borrowerStatusSchema = z.enum([
    'ACTIVE',
    'ARCHIVED',
    'BLOCKED',
    'INACTIVE',
])

export const borrowerPaymentTagSchema = z.enum([
    'BAD_PAYER',
    'GOOD_PAYER',
    'SCAMMER',
])

export const borrowerPaymentTagSourceSchema = z.enum([
    'MANUAL_OVERRIDE',
    'SYSTEM',
])

export const borrowerDocumentTypeSchema = z.enum([
    'BORROWER_PHOTO',
    'PROOF_OF_ADDRESS',
    'SUPPORTING_DOCUMENT',
    'VALID_ID',
])

export const borrowerGenderSchema = z.enum([
    'FEMALE',
    'MALE',
    'OTHER',
    'PREFER_NOT_TO_SAY',
])

const publicIdSchema = z.uuid({ error: 'Public ID must be a valid UUID.' })
const idempotencyKeySchema = z.uuidv7({
    error: 'Idempotency Key must be a valid UUID v7.',
})
const phoneNumberSchema = field
    .vText({ fieldName: 'Contact Number', max: 32 })
    .regex(
        /^\+?[0-9][0-9 ()-]{5,30}$/,
        'Contact Number must contain a valid phone number.',
    )

const fullNameSchema = field
    .vText({ fieldName: 'Full Name', max: 234 })
    .refine(
        (value) => value.trim().split(/\s+/).length >= 2,
        'Full Name must include at least a first and last name.',
    )

const borrowerSharedFieldsSchema = z.object({
    addressLine: field.vText({ fieldName: 'Address Line', max: 200 }),
    barangay: field.vText({ fieldName: 'Barangay', max: 100 }),
    birthDate: field.vIsoDate('Birth Date').nullable().optional(),
    cityMunicipality: field.vText({
        fieldName: 'City or Municipality',
        max: 100,
    }),
    contactNumber: phoneNumberSchema,
    email: z.email('Email must be a valid email address.').max(254).optional(),
    emergencyContactName: field
        .vText({ fieldName: 'Emergency Contact Name', max: 160 })
        .nullable()
        .optional(),
    emergencyContactNumber: phoneNumberSchema.nullable().optional(),
    emergencyContactRelationship: field
        .vText({ fieldName: 'Emergency Contact Relationship', max: 80 })
        .nullable()
        .optional(),
    gender: borrowerGenderSchema,
    notes: field.vText({ fieldName: 'Notes', max: 2_000 }).optional(),
    postalCode: field.vText({ fieldName: 'Postal Code', max: 32 }).optional(),
    province: field.vText({ fieldName: 'Province', max: 100 }),
    secondaryContactNumber: phoneNumberSchema.optional(),
})

const borrowerLegacyNameFieldsSchema = z.object({
    firstName: field.vText({ fieldName: 'First Name', max: 100 }),
    lastName: field.vText({ fieldName: 'Last Name', max: 100 }),
    middleName: field.vText({ fieldName: 'Middle Name', max: 100 }).optional(),
    suffix: field.vText({ fieldName: 'Suffix', max: 32 }).optional(),
})

const borrowerCreateFieldsSchema = z.union([
    borrowerSharedFieldsSchema.extend({ fullName: fullNameSchema }),
    borrowerSharedFieldsSchema.extend(borrowerLegacyNameFieldsSchema.shape),
])

const borrowerUpdateFieldsSchema = borrowerSharedFieldsSchema.partial().extend({
    firstName: borrowerLegacyNameFieldsSchema.shape.firstName.optional(),
    fullName: fullNameSchema.optional(),
    lastName: borrowerLegacyNameFieldsSchema.shape.lastName.optional(),
    middleName: borrowerLegacyNameFieldsSchema.shape.middleName,
    suffix: borrowerLegacyNameFieldsSchema.shape.suffix,
})

const borrowerOutputDataSchema = z.object({
    addressLine: z.string(),
    barangay: z.string(),
    birthDate: z.string().nullable(),
    borrowerNumber: z.string(),
    cityMunicipality: z.string(),
    contactNumber: z.string(),
    email: z.string().nullable(),
    emergencyContactName: z.string().nullable(),
    emergencyContactNumber: z.string().nullable(),
    emergencyContactRelationship: z.string().nullable(),
    firstName: z.string(),
    fullName: z.string(),
    gender: borrowerGenderSchema,
    lastName: z.string(),
    middleName: z.string().nullable(),
    notes: z.string().nullable(),
    paymentTag: borrowerPaymentTagSchema,
    paymentTagOverrideReason: z.string().nullable(),
    paymentTagSource: borrowerPaymentTagSourceSchema,
    paymentTagUpdatedAt: z.iso.datetime(),
    postalCode: z.string().nullable(),
    province: z.string(),
    publicId: publicIdSchema,
    secondaryContactNumber: z.string().nullable(),
    status: borrowerStatusSchema,
    suffix: z.string().nullable(),
    systemPaymentTag: borrowerPaymentTagSchema,
})

const borrowerDocumentOutputDataSchema = z.object({
    documentNumber: z.string().nullable(),
    documentType: borrowerDocumentTypeSchema,
    expirationDate: z.string().nullable(),
    issuedDate: z.string().nullable(),
    notes: z.string().nullable(),
    objectStorageId: z.string(),
    publicId: publicIdSchema,
})

const duplicateCandidateOutputSchema = z.object({
    borrowerNumber: z.string(),
    contactNumber: z.string(),
    fullName: z.string(),
    publicId: publicIdSchema,
})

export const createInputSchema = borrowerCreateFieldsSchema.and(
    z.object({ idempotencyKey: idempotencyKeySchema }),
)

export const createOutputSchema = base.outputSchema(
    z.object({
        borrower: borrowerOutputDataSchema,
        duplicateCandidates: z.array(duplicateCandidateOutputSchema),
    }),
)

const borrowerFiltersSchema = z.object({
    paymentTag: borrowerPaymentTagSchema.optional(),
    search: field.vText({ fieldName: 'Search', max: 200 }).optional(),
    status: borrowerStatusSchema.optional(),
})

export const readManyInputSchema = base.readManyInputSchema.extend({
    filters: borrowerFiltersSchema.default({}),
})

export const readManyOutputSchema = base.paginatedOutputSchema(
    z.array(
        borrowerOutputDataSchema.pick({
            borrowerNumber: true,
            contactNumber: true,
            firstName: true,
            fullName: true,
            lastName: true,
            paymentTag: true,
            paymentTagSource: true,
            publicId: true,
            status: true,
        }),
    ),
)

export const readInputSchema = z.object({ publicId: publicIdSchema })

export const readOutputSchema = base.outputSchema(borrowerOutputDataSchema)

export const updateInputSchema = borrowerUpdateFieldsSchema
    .extend({ publicId: publicIdSchema })
    .check(refinement.updatedFields(['publicId']))

export const updateOutputSchema = base.outputSchema(borrowerOutputDataSchema)

export const archiveInputSchema = z.object({ publicId: publicIdSchema })

export const archiveOutputSchema = base.outputSchema(borrowerOutputDataSchema)

export const documentCreateInputSchema = z.object({
    borrowerPublicId: publicIdSchema,
    documentNumber: field
        .vText({ fieldName: 'Document Number', max: 128 })
        .optional(),
    documentType: borrowerDocumentTypeSchema,
    expirationDate: field.vIsoDate('Expiration Date').optional(),
    idempotencyKey: idempotencyKeySchema,
    issuedDate: field.vIsoDate('Issued Date').optional(),
    notes: field.vText({ fieldName: 'Document Notes', max: 1_000 }).optional(),
    objectStorageId: field
        .vText({ fieldName: 'Object Storage ID', min: 16, max: 128 })
        .regex(/^[a-zA-Z0-9]+$/, {
            error: 'Object Storage ID must be alphanumeric characters only.',
        }),
})

export const documentCreateOutputSchema = base.outputSchema(
    borrowerDocumentOutputDataSchema,
)

export const documentReadManyInputSchema = z.object({
    borrowerPublicId: publicIdSchema,
})

export const documentReadManyOutputSchema = base.outputSchema(
    z.array(borrowerDocumentOutputDataSchema),
)

export const paymentTagReadInputSchema = z.object({ publicId: publicIdSchema })

export const paymentTagReadOutputSchema = base.outputSchema(
    z.object({
        currentCalculatedTag: borrowerPaymentTagSchema,
        currentTag: borrowerPaymentTagSchema,
        historicalWorstTag: borrowerPaymentTagSchema.nullable(),
        lastCalculatedAt: z.iso.datetime(),
        missedInstallmentCount: z.number().int().nonnegative(),
        paymentType: z
            .enum([
                'DAILY',
                'WEEKLY',
                'MONTHLY',
            ])
            .nullable(),
        source: borrowerPaymentTagSourceSchema,
        thresholds: z.object({
            badPayerMaximumMissedInstallments: z.number().int().nonnegative(),
            badPayerMinimumMissedInstallments: z.number().int().nonnegative(),
            goodPayerMaximumMissedInstallments: z.number().int().nonnegative(),
            scammerMinimumMissedInstallments: z.number().int().nonnegative(),
        }),
    }),
)

export const paymentTagOverrideInputSchema = z.object({
    paymentTag: borrowerPaymentTagSchema,
    publicId: publicIdSchema,
    reason: field.vText({ fieldName: 'Override Reason', min: 3, max: 500 }),
})

export const paymentTagOverrideOutputSchema = base.outputSchema(
    borrowerOutputDataSchema.pick({
        paymentTag: true,
        paymentTagOverrideReason: true,
        paymentTagSource: true,
        paymentTagUpdatedAt: true,
        publicId: true,
        systemPaymentTag: true,
    }),
)

export const paymentTagResetInputSchema = z.object({ publicId: publicIdSchema })

export const paymentTagResetOutputSchema = paymentTagOverrideOutputSchema
