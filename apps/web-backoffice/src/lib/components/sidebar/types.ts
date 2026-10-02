import type { Component } from 'svelte'

export interface AppNavItem {
    label: string
    href?: string
    icon: Component
    disabled?: boolean
    children?: AppNavItem[]
}

export interface AppRouteMeta {
    title: string
    breadcrumb?: string[]
}
