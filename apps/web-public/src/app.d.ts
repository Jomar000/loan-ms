// See https://kit.svelte.dev/docs/types#app
// for information about these interfaces

import type { auth as authValidator } from '@hyperion/validator/public'
import type { Component } from 'svelte'
import type { z } from 'zod'

declare global {
    const __FEATURE_IN_APP_BROWSER_DETECTION__: boolean
    const __FEATURE_OBJECT_STORAGE__: boolean

    namespace App {
        // interface Error {}
        // interface Locals {}
        // interface PageData {}
        // interface Platform {}
    }

    // Make *.svelte imports recognizable by Typescript when imported in *.ts files
    // Primarily used when testing individual components
    // node_modules/svelte/types/index.d.ts
    module '*.svelte' {
        const Comp: Component
        export default Comp
    }

    // Vite ImageTools Optimized Imports
    // https://github.com/microsoft/TypeScript/issues/38638#issuecomment-1088247956
    module '*&imagetools' {
        const out: string
        export default out
    }

    type TSessionData = z.output<
        (typeof authValidator.sessionOutputSchema.def.options)['0']['shape']['data']
    >
}

export {}
