import ActivitySquareIcon from '@lucide/svelte/icons/activity-square'
import BellRingIcon from '@lucide/svelte/icons/bell-ring'
import ShieldCheckIcon from '@lucide/svelte/icons/shield-check'
import UserRoundIcon from '@lucide/svelte/icons/user-round'

import type { ActivityLogGroup } from './types'

export const EXTENSION_ACTIVITY_LOG_STAT_CARDS = [
    {
        description: 'All recorded operations',
        icon: ActivitySquareIcon,
        key: 'all',
        label: 'All Activity',
        tone: 'neutral',
    },
    {
        description: 'Authentication and access',
        icon: ShieldCheckIcon,
        key: 'accessSecurity',
        label: 'Access & Security',
        tone: 'danger',
    },
    {
        description: 'Account, profile, and address changes',
        icon: UserRoundIcon,
        key: 'accountProfile',
        label: 'Account & Profile',
        tone: 'success',
    },
    {
        description: 'Uploads and notification activity',
        icon: BellRingIcon,
        key: 'storageNotifications',
        label: 'Storage & Notifications',
        tone: 'warning',
    },
] as const satisfies readonly {
    description: string
    icon: typeof ActivitySquareIcon
    key: ActivityLogGroup
    label: string
    tone: 'danger' | 'neutral' | 'success' | 'warning'
}[]
