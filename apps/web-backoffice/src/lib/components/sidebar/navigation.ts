import ActivitySquareIcon from '@lucide/svelte/icons/activity-square'
import BarChart3Icon from '@lucide/svelte/icons/bar-chart-3'
import CalendarDaysIcon from '@lucide/svelte/icons/calendar-days'
import ContactRoundIcon from '@lucide/svelte/icons/contact-round'
import DownloadIcon from '@lucide/svelte/icons/download'
import FolderIcon from '@lucide/svelte/icons/folder'
import KeyRoundIcon from '@lucide/svelte/icons/key-round'
import LandmarkIcon from '@lucide/svelte/icons/landmark'
import LayoutDashboardIcon from '@lucide/svelte/icons/layout-dashboard'
import Repeat2Icon from '@lucide/svelte/icons/repeat-2'
import SettingsIcon from '@lucide/svelte/icons/settings'
import TablePropertiesIcon from '@lucide/svelte/icons/table-properties'
import UploadIcon from '@lucide/svelte/icons/upload'
import UsersRoundIcon from '@lucide/svelte/icons/users-round'

import type { AppRole } from '$lib/modules/app/utilities/navigation'
import type { AppNavItem, AppRouteMeta } from './types'

export function createRoleNavigation(
    role: AppRole,
    apiKeyEnabled: boolean,
    objectStorageEnabled: boolean,
): AppNavItem[] {
    if (role === 'member') return []

    const prefix = `/app/${role}`

    if (role === 'cashier') {
        return [
            {
                label: 'Payments',
                href: `${prefix}/loans`,
                icon: LandmarkIcon,
            },
        ]
    }

    if (role === 'collector') {
        return [
            {
                label: 'Assigned Collections',
                href: `${prefix}/collections`,
                icon: CalendarDaysIcon,
            },
        ]
    }

    if (role === 'viewer' || role === 'auditor') {
        return [
            {
                label: 'Loan Records',
                href: `${prefix}/loans`,
                icon: LandmarkIcon,
            },
            {
                label: 'Collection Records',
                href: `${prefix}/collections`,
                icon: CalendarDaysIcon,
            },
            {
                label: 'Overdue',
                href: `${prefix}/overdue`,
                icon: CalendarDaysIcon,
            },
            {
                label: 'Reports',
                href: `${prefix}/reports`,
                icon: BarChart3Icon,
            },
        ]
    }

    return [
        {
            label: 'Dashboard',
            href: `${prefix}/dashboard`,
            icon: LayoutDashboardIcon,
        },
        ...(apiKeyEnabled
            ? [
                  {
                      label: 'Service Principals',
                      href: `${prefix}/service-principals`,
                      icon: KeyRoundIcon,
                  },
              ]
            : []),
        ...(objectStorageEnabled
            ? [
                  {
                      label: 'Workspace',
                      icon: FolderIcon,
                      children: [
                          {
                              label: 'Downloads',
                              href: `${prefix}/object-storage/download`,
                              icon: DownloadIcon,
                          },
                          {
                              label: 'Uploads',
                              href: `${prefix}/object-storage/upload`,
                              icon: UploadIcon,
                          },
                      ],
                  },
              ]
            : []),
        {
            label: 'Borrowers',
            href: `${prefix}/borrowers`,
            icon: ContactRoundIcon,
        },
        {
            label: 'Loans',
            href: `${prefix}/loans`,
            icon: LandmarkIcon,
        },
        {
            label: 'Collections',
            href: `${prefix}/collections`,
            icon: CalendarDaysIcon,
        },
        {
            label: 'Renewals',
            href: `${prefix}/renewals`,
            icon: Repeat2Icon,
        },
        {
            label: 'Overdue',
            href: `${prefix}/overdue`,
            icon: CalendarDaysIcon,
        },
        {
            label: 'Company Fund',
            href: `${prefix}/company-fund`,
            icon: LandmarkIcon,
        },
        {
            label: 'Loan Products',
            href: `${prefix}/loan-products`,
            icon: TablePropertiesIcon,
        },
        { label: 'Records', icon: TablePropertiesIcon, disabled: true },
        {
            label: 'Reports',
            href: `${prefix}/reports`,
            icon: BarChart3Icon,
        },
        {
            label: 'Users',
            href: `${prefix}/users`,
            icon: UsersRoundIcon,
        },
        {
            label: 'Activity Logs',
            href: `${prefix}/activity-logs`,
            icon: ActivitySquareIcon,
        },
        {
            label: 'Settings',
            href: `${prefix}/settings`,
            icon: SettingsIcon,
        },
    ]
}

export function getRouteMeta(pathname: string): AppRouteMeta {
    if (pathname.endsWith('/activity-logs')) {
        return { title: 'Activity Logs' }
    }

    if (/\/borrowers(?:\/|$)/.test(pathname)) {
        return { title: 'Borrowers' }
    }

    if (/\/loan-products(?:\/|$)/.test(pathname)) {
        return { title: 'Loan Products' }
    }

    if (/\/loans(?:\/|$)/.test(pathname)) {
        return { title: 'Loans' }
    }

    if (/\/collections(?:\/|$)/.test(pathname)) {
        return { title: 'Collections' }
    }

    if (/\/renewals(?:\/|$)/.test(pathname)) {
        return { title: 'Renewals' }
    }

    if (/\/overdue(?:\/|$)/.test(pathname)) {
        return { title: 'Overdue loans' }
    }

    if (/\/company-fund(?:\/|$)/.test(pathname)) {
        return { title: 'Company fund' }
    }

    if (/\/reports(?:\/|$)/.test(pathname)) {
        return { title: 'Reports' }
    }

    if (pathname.endsWith('/service-principals')) {
        return { title: 'Service Principals' }
    }

    if (pathname.endsWith('/users')) {
        return { title: 'Users and roles' }
    }

    if (pathname.endsWith('/settings')) {
        return { title: 'System settings' }
    }

    if (pathname.endsWith('/object-storage/download')) {
        return {
            title: 'Downloads',
            breadcrumb: [
                'Workspace',
                'Downloads',
            ],
        }
    }

    if (pathname.endsWith('/object-storage/upload')) {
        return {
            title: 'Uploads',
            breadcrumb: [
                'Workspace',
                'Uploads',
            ],
        }
    }

    if (pathname === '/app') {
        return { title: 'Role Selection' }
    }

    return { title: 'Dashboard' }
}
