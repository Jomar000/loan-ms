import { env } from 'cloudflare:workers'
import { vi } from 'vitest'

import { getTestingRequest, queryTestingRequest } from '../utilities.js'

export async function traceQueryRequest(
    path: string,
    input: unknown,
    cookie: string,
) {
    return traceDatabaseRequest(() =>
        queryTestingRequest(path, input, { cookie }),
    )
}

export async function traceGetRequest(path: string, cookie: string) {
    return traceDatabaseRequest(() => getTestingRequest(path, { cookie }))
}

async function traceDatabaseRequest(request: () => Promise<Response>) {
    const statements: string[] = []
    const boundParameters: number[] = []
    const prepare = env.LOANMSBOFC_D1.prepare.bind(env.LOANMSBOFC_D1)
    const spy = vi
        .spyOn(env.LOANMSBOFC_D1, 'prepare')
        .mockImplementation((query) => {
            statements.push(query)
            const statement = prepare(query)
            const bind = statement.bind.bind(statement)
            statement.bind = (...values: unknown[]) => {
                boundParameters.push(values.length)
                return bind(...values)
            }
            return statement
        })
    try {
        const response = await request()
        return { response, statements, boundParameters }
    } finally {
        spy.mockRestore()
    }
}
