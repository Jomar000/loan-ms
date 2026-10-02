import { EXTENSION_ACTIVITY_LOG_STAT_CARDS } from './config.extension'
import type { ActivityLogGroup } from './types'

export const ACTIVITY_LOG_STAT_CARDS = EXTENSION_ACTIVITY_LOG_STAT_CARDS

export function isActivityLogGroup(
    value: string | null,
): value is ActivityLogGroup {
    return ACTIVITY_LOG_STAT_CARDS.some((card) => card.key === value)
}

export function activityComponentLabel(component: string) {
    return component
        .split('.')
        .map((segment) => segment.replace(/([a-z0-9])([A-Z])/g, '$1 $2'))
        .map((segment) => segment.replace(/^./, (value) => value.toUpperCase()))
        .join(' · ')
}

export function activityActionLabel(action: string) {
    return action
        .split('.')
        .map((segment) => segment.replace(/([a-z0-9])([A-Z])/g, '$1 $2'))
        .join(' · ')
}
