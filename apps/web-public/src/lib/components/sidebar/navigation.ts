import ActivitySquareIcon from '@lucide/svelte/icons/activity-square'
import BarChart3Icon from '@lucide/svelte/icons/bar-chart-3'
import FolderIcon from '@lucide/svelte/icons/folder'
import LayoutDashboardIcon from '@lucide/svelte/icons/layout-dashboard'
import SettingsIcon from '@lucide/svelte/icons/settings'
import TablePropertiesIcon from '@lucide/svelte/icons/table-properties'

import type { AppNavItem, AppRouteMeta } from './types'

export function createRoleNavigation(role: string): AppNavItem[] {
    if (role === 'member') return []

    const prefix = `/app/${role}`

    return [
        {
            label: 'Dashboard',
            href: `${prefix}/dashboard`,
            icon: LayoutDashboardIcon,
        },
        { label: 'Workspace', icon: FolderIcon, disabled: true },
        { label: 'Records', icon: TablePropertiesIcon, disabled: true },
        { label: 'Reports', icon: BarChart3Icon, disabled: true },
        { label: 'Settings', icon: SettingsIcon, disabled: true },
        { label: 'Activity Logs', icon: ActivitySquareIcon, disabled: true },
    ]
}

export function getRouteMeta(pathname: string): AppRouteMeta {
    if (pathname === '/app') {
        return { title: 'Role Selection' }
    }

    return { title: 'Dashboard' }
}
