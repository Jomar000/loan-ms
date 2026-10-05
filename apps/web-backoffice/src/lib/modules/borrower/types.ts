export type BorrowerStatus = 'ACTIVE' | 'ARCHIVED' | 'BLOCKED' | 'INACTIVE'

export type BorrowerPaymentTag = 'BAD_PAYER' | 'GOOD_PAYER' | 'SCAMMER'

export type BorrowerPaymentTagSource = 'MANUAL_OVERRIDE' | 'SYSTEM'

export type BorrowerGender = 'FEMALE' | 'MALE' | 'OTHER' | 'PREFER_NOT_TO_SAY'

export type BorrowerDocumentType =
    'BORROWER_PHOTO' | 'PROOF_OF_ADDRESS' | 'SUPPORTING_DOCUMENT' | 'VALID_ID'

export type BorrowerListItem = {
    borrowerNumber: string
    contactNumber: string
    fullName: string
    paymentTag: BorrowerPaymentTag
    paymentTagSource: BorrowerPaymentTagSource
    publicId: string
    status: BorrowerStatus
}

export type Borrower = BorrowerListItem & {
    addressLine: string
    barangay: string
    cityMunicipality: string
    email: string | null
    gender: BorrowerGender
    notes: string | null
    paymentTagOverrideReason: string | null
    paymentTagUpdatedAt: string
    province: string
    secondaryContactNumber: string | null
    systemPaymentTag: BorrowerPaymentTag
}

export type BorrowerDocument = {
    documentNumber: string | null
    documentType: BorrowerDocumentType
    expirationDate: string | null
    issuedDate: string | null
    notes: string | null
    objectStorageId: string
    publicId: string
}

export type BorrowerPaymentTagSummary = {
    currentCalculatedTag: BorrowerPaymentTag
    currentTag: BorrowerPaymentTag
    historicalWorstTag: BorrowerPaymentTag | null
    lastCalculatedAt: string
    missedInstallmentCount: number
    paymentType: 'DAILY' | 'MONTHLY' | 'WEEKLY' | null
    source: BorrowerPaymentTagSource
    thresholds: {
        badPayerMaximumMissedInstallments: number
        badPayerMinimumMissedInstallments: number
        goodPayerMaximumMissedInstallments: number
        scammerMinimumMissedInstallments: number
    }
}

export type BorrowerFilters = {
    paymentTag?: BorrowerPaymentTag
    search?: string
    status?: BorrowerStatus
}

export type BorrowerCreateInput = {
    addressLine: string
    barangay: string
    cityMunicipality: string
    contactNumber: string
    email?: string
    fullName: string
    gender: BorrowerGender
    idempotencyKey: string
    notes?: string
    postalCode?: string
    province: string
    secondaryContactNumber?: string
}

export type BorrowerUpdateInput = Omit<
    BorrowerCreateInput,
    'idempotencyKey'
> & {
    publicId: string
}
