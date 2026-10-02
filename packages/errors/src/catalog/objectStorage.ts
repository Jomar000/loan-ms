import { defineError } from '../publicCodes.js'

export const objectStorageErrors = {
    downloadListRetrievalFailed: defineError(
        'OBJECT_STORAGE_DOWNLOAD_LIST_RETRIEVAL_FAILED',
        'DOWNLOAD_LIST_RETRIEVAL_FAILED',
        'Download list retrieval failed.',
    ),
    uploadAlreadyCommitted: defineError(
        'OBJECT_STORAGE_UPLOAD_ALREADY_COMMITTED',
        'UPLOAD_ALREADY_COMMITTED',
        'Upload is already committed.',
    ),
    uploadAttachmentAdditionFailed: defineError(
        'OBJECT_STORAGE_UPLOAD_ATTACHMENT_ADDITION_FAILED',
        'UPLOAD_ATTACHMENT_ADDITION_FAILED',
        'Upload attachment addition failed.',
    ),
    uploadAttachmentCommitFailed: defineError(
        'OBJECT_STORAGE_UPLOAD_ATTACHMENT_COMMIT_FAILED',
        'UPLOAD_ATTACHMENT_COMMIT_FAILED',
        'Upload attachment commit failed.',
    ),
    uploadAttachmentIdempotencyConflict: defineError(
        'OBJECT_STORAGE_UPLOAD_ATTACHMENT_IDEMPOTENCY_CONFLICT',
        'IDEMPOTENCY_KEY_CONFLICT',
        'Idempotency key was already used for a different request.',
    ),
    uploadAttachmentsAlreadyCommitted: defineError(
        'OBJECT_STORAGE_UPLOAD_ATTACHMENTS_ALREADY_COMMITTED',
        'UPLOAD_ATTACHMENTS_ALREADY_COMMITTED',
        'Upload attachments are already committed.',
    ),
    uploadAttachmentsNotCommitted: defineError(
        'OBJECT_STORAGE_UPLOAD_ATTACHMENTS_NOT_COMMITTED',
        'UPLOAD_ATTACHMENTS_NOT_COMMITTED',
        'Upload attachments are not committed.',
    ),
    uploadAttachmentsNotFound: defineError(
        'OBJECT_STORAGE_UPLOAD_ATTACHMENTS_NOT_FOUND',
        'UPLOAD_ATTACHMENTS_NOT_FOUND',
        'Upload attachments not found.',
    ),
    uploadCommitFailed: defineError(
        'OBJECT_STORAGE_UPLOAD_COMMIT_FAILED',
        'UPLOAD_COMMIT_FAILED',
        'Upload commit failed.',
    ),
    uploadIdCreationFailed: defineError(
        'OBJECT_STORAGE_UPLOAD_ID_CREATION_FAILED',
        'UPLOAD_ID_CREATION_FAILED',
        'Upload ID creation failed.',
    ),
    uploadIdempotencyOwnerConflict: defineError(
        'OBJECT_STORAGE_UPLOAD_IDEMPOTENCY_OWNER_CONFLICT',
        'IDEMPOTENCY_KEY_CONFLICT',
        'Idempotency Key was already used by another user.',
    ),
    uploadNotFound: defineError(
        'OBJECT_STORAGE_UPLOAD_NOT_FOUND',
        'NOT_FOUND',
        'Upload ID not found.',
    ),
    uploadNotFoundOrCommitted: defineError(
        'OBJECT_STORAGE_UPLOAD_NOT_FOUND_OR_COMMITTED',
        'NOT_FOUND',
        'Upload ID not found or is already committed.',
    ),
} as const
