import { z } from 'zod'

type CheckContext<TInput> = {
    issues: {
        push: (issue: {
            code: 'custom'
            input: unknown
            message: string
            path?: (number | string)[]
        }) => unknown
    }
    value: TInput
}

type UniqueArrayOptions = {
    key?: string
    message: string
    path?: (number | string)[]
    values: readonly unknown[]
}

export const password = () => {
    const callbackFn: Parameters<z.ZodType<string | undefined>['check']>[0] = (
        ctx,
    ) => {
        if (ctx.value) {
            const regexp = {
                lowercase: (ctx.value.match(/[a-z]/) ?? []).length,
                uppercase: (ctx.value.match(/[A-Z]/) ?? []).length,
                numeric: (ctx.value.match(/[\d]/) ?? []).length,
                basicLatinSymbols: (
                    ctx.value.match(
                        /[\u0021-\u002f,\u003a-\u0040,\u005b-\u0060,\u007b-\u007e]/,
                    ) ?? []
                ).length,
            }

            if (Object.values(regexp).some((value) => value === 0)) {
                ctx.issues.push({
                    path: ['password'],
                    code: 'custom',
                    message:
                        'Password must be a combination of uppercase [A-Z], lowercase [a-z], numbers [0-9] & symbols [!@#...].',
                    input: ctx.value,
                })
            }
        }
    }

    return callbackFn
}

export const uniqueArrayValues = <TInput>(
    ctx: CheckContext<TInput>,
    options: UniqueArrayOptions,
) => {
    const seen = new Set<unknown>()

    for (const value of options.values) {
        const checkedValue =
            options.key === undefined
                ? value
                : value !== null && typeof value === 'object'
                  ? (value as Record<string, unknown>)[options.key]
                  : undefined

        if (!seen.has(checkedValue)) {
            seen.add(checkedValue)
            continue
        }

        ctx.issues.push({
            path: options.path,
            code: 'custom',
            message: options.message,
            input: ctx.value,
        })
        break
    }
}

export const updatedFields = (
    exclusions: string[] = [],
    path: string[] = [],
) => {
    const callbackFn: Parameters<
        z.ZodType<Record<string, unknown>>['check']
    >[0] = (ctx) => {
        const hasUpdatedFields = Object.entries(ctx.value).some(
            ([
                key,
                value,
            ]) => !exclusions.includes(key) && value !== undefined,
        )

        if (!hasUpdatedFields) {
            ctx.issues.push({
                path,
                code: 'custom',
                message: 'Nothing to update.',
                input: ctx.value,
            })
        }
    }

    return callbackFn
}
