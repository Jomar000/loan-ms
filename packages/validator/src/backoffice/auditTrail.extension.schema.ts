export const extensionAuditTrailActions = [] as const

export const extensionAuditTrailComponents = [] as const

export const extensionAuditTrailEntityTypes = [] as const

export const extensionAuditTrailGroupDefinitions = [
    { key: 'all' },
    {
        key: 'accessSecurity',
        exactComponents: [
            'admin.servicePrincipal',
            'admin.user.password',
            'auth',
        ],
    },
    {
        key: 'accountProfile',
        exactComponents: [
            'admin.user.profile',
            'user.address',
            'user.profile',
        ],
    },
    {
        key: 'storageNotifications',
        exactComponents: ['user.notification'],
        componentPrefixes: ['objectStorage.'],
    },
] as const
