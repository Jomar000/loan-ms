import { defineError } from '../publicCodes.js'

export const notificationErrors = {
    notificationAlreadyRead: defineError(
        'NOTIFICATION_ALREADY_READ',
        'NOTIFICATION_ALREADY_READ',
        'One or more notifications are already read.',
    ),
    notificationCursorInvalid: defineError(
        'NOTIFICATION_CURSOR_INVALID',
        'NOTIFICATION_CURSOR_INVALID',
        'Notification cursor is invalid for this user.',
    ),
    notificationEventConflict: defineError(
        'NOTIFICATION_EVENT_CONFLICT',
        'NOTIFICATION_EVENT_CONFLICT',
        'Notification event key was already used for different content.',
    ),
    notificationListFetchFailed: defineError(
        'NOTIFICATION_LIST_FETCH_FAILED',
        'NOTIFICATION_LIST_FETCH_FAILED',
        'Failed to fetch notifications.',
    ),
    notificationMarkReadFailed: defineError(
        'NOTIFICATION_MARK_READ_FAILED',
        'NOTIFICATION_MARK_READ_FAILED',
        'Failed to mark notifications as read.',
    ),
    notificationNotFound: defineError(
        'NOTIFICATION_NOT_FOUND',
        'NOTIFICATION_NOT_FOUND',
        'One or more notifications were not found for this user.',
    ),
    notificationRecipientsRequired: defineError(
        'NOTIFICATION_RECIPIENTS_REQUIRED',
        'NOTIFICATION_RECIPIENTS_REQUIRED',
        'At least one notification recipient is required.',
    ),
    notificationUnreadCountFetchFailed: defineError(
        'NOTIFICATION_UNREAD_COUNT_FETCH_FAILED',
        'NOTIFICATION_UNREAD_COUNT_FETCH_FAILED',
        'Failed to fetch the unread notification count.',
    ),
} as const
