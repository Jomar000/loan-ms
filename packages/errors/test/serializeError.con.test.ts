import { describe, expect, it } from 'vitest'

import { AppError, BaseError, catalog, serializeError } from '../src/index.js'

const MESSAGE_LIMIT = 4_096
const NAME_LIMIT = 128
const SQL_LIMIT = 16_384
const STACK_LIMIT = 8_192

const createQueryFailure = () => {
    const driverError = Object.assign(
        new Error('relation "archive.order_item" does not exist'),
        {
            name: 'PostgresError',
            code: '42P01',
            severity: 'ERROR',
            table_name: 'order_item',
        },
    )
    Object.defineProperties(driverError, {
        parameters: { value: ['PRIVATE_PARAMETER'] },
        query: { value: 'select PRIVATE_DRIVER_QUERY' },
    })

    return Object.assign(
        new Error(
            'Failed query: select "id" from "archive"."order_item" where "organization_id" = $1\nparams: PRIVATE_ORGANIZATION,PRIVATE_RECORD',
            { cause: driverError },
        ),
        {
            name: 'DrizzleQueryError',
            query: 'select "id" from "archive"."order_item" where "organization_id" = $1',
            params: [
                'PRIVATE_ORGANIZATION',
                7,
                null,
            ],
        },
    )
}

const wrap = (cause: unknown) => new Error('Wrapped.', { cause })

const frame = (label: string, place: string) => `    at ${label} (${place})`

const trustedFrames = [
    frame('handler', 'src/core/index.ts:12:3'),
    frame('async Object.fetch', 'file:///worker/index.js:44:9'),
    '    at file:///worker/bootstrap.js:7:1',
    frame('new Promise', '<anonymous>'),
    frame('async Promise.all', 'index 0'),
]

/** What `trustedFrames` become: only source locations survive, never labels or frames without one. */
const trustedLocations = [
    '    at src/core/index.ts:12:3',
    '    at file:///worker/index.js:44:9',
    '    at file:///worker/bootstrap.js:7:1',
]

/** The runtime writes the header when the error is constructed, so a stack can be set to any shape. */
const withStack = <T extends Error>(error: T, ...lines: string[]) => {
    error.stack = [
        `${Object.getPrototypeOf(error).name}: ${error.message}`,
        ...lines,
    ].join('\n')
    return error
}

/** Places the start of `secret` so that only its first `keep` characters fit before `limit`. */
const crossing = (limit: number, secret: string, keep: number) =>
    `${'x'.repeat(limit - keep - 1)} ${secret}`

const withRepeatedFrames = (count: number, place = 'src/a.ts:1:1') =>
    Array.from({ length: count }, () => frame('handler', place))

describe.concurrent('error log serialization', () => {
    it('describes the top-level error without a cause chain', () => {
        const serialized = serializeError(new Error('Plain failure.'))

        expect(serialized).toMatchObject({
            name: 'Error',
            message: 'Plain failure.',
        })
        expect(serialized.stack).toContain('Plain failure.')
        expect(serialized).not.toHaveProperty('causes')
    })

    it('keeps the query text and driver fields but never copies parameter values', () => {
        const error = new AppError(catalog.internalServerError, {
            cause: createQueryFailure(),
        })
        const serialized = serializeError(error)
        const [
            query,
            driver,
        ] = serialized.causes ?? []

        expect(serialized.causes).toHaveLength(2)
        expect(query).toMatchObject({
            name: 'DrizzleQueryError',
            message: 'Failed query.',
            sql: 'select "id" from "archive"."order_item" where "organization_id" = $1',
            paramCount: 3,
            paramTypes: [
                'string',
                'number',
                'null',
            ],
        })
        expect(driver).toMatchObject({
            name: 'PostgresError',
            code: '42P01',
            severity: 'ERROR',
            table_name: 'order_item',
            message: 'relation "archive.order_item" does not exist',
        })
        const text = JSON.stringify(serialized)
        for (const secret of [
            'PRIVATE_ORGANIZATION',
            'PRIVATE_RECORD',
            'PRIVATE_PARAMETER',
            'PRIVATE_DRIVER_QUERY',
        ])
            expect(text).not.toContain(secret)
    })

    it('ignores unlisted enumerable properties on any error', () => {
        const error = Object.assign(new Error('Failed.'), {
            params: ['PRIVATE_PARAM'],
            parameters: ['PRIVATE_PARAM'],
            internal_query: 'select PRIVATE_INTERNAL',
            request: { headers: { authorization: 'PRIVATE_HEADER' } },
        })

        expect(JSON.stringify(serializeError(error))).not.toContain('PRIVATE_')
    })

    it('omits detail and where for integrity violations', () => {
        const error = Object.assign(
            new Error(
                'duplicate key value violates unique constraint "user_email_key"',
            ),
            {
                name: 'PostgresError',
                code: '23505',
                detail: 'Key (email)=(private@example.com) already exists.',
                where: 'PL/pgSQL function f() line 1 for PRIVATE_WHERE',
                constraint_name: 'user_email_key',
                table_name: 'user',
            },
        )
        const [cause] = serializeError(wrap(error)).causes ?? []

        expect(cause).toMatchObject({
            message:
                'duplicate key value violates unique constraint "user_email_key"',
            code: '23505',
            constraint_name: 'user_email_key',
            table_name: 'user',
        })
        expect(cause).not.toHaveProperty('detail')
        expect(cause).not.toHaveProperty('where')
        expect(JSON.stringify(cause)).not.toMatch(/private|PRIVATE/)
    })

    it('keeps the postgres.js data type field', () => {
        const error = Object.assign(new Error('bad'), {
            code: '42804',
            'data type_name': 'uuid',
        })

        expect(serializeError(error)).toMatchObject({
            code: '42804',
            data_type_name: 'uuid',
        })
    })

    describe.concurrent('data exception messages', () => {
        const createDataException = (message: string, code = '22P02') =>
            Object.assign(new Error(message), {
                name: 'PostgresError',
                code,
                detail: 'Value "PRIVATE_DETAIL" is invalid.',
                routine: 'string_to_uuid',
            })
        const dataException = (message: string, code = '22P02') =>
            serializeError(createDataException(message, code))

        it('drops the rejected input from the colon and quoted formats', () => {
            const serialized = serializeError(
                new AggregateError([
                    createDataException(
                        'invalid input syntax for type uuid: "PRIVATE_INPUT"',
                    ),
                    createDataException(
                        'value "PRIVATE_NUMBER" is out of range for type integer',
                        '22003',
                    ),
                ]),
            )

            expect(serialized.errors).toMatchObject([
                {
                    message: 'invalid input syntax for type uuid: <redacted>',
                    code: '22P02',
                    routine: 'string_to_uuid',
                },
                {
                    message:
                        'value "<redacted>" is out of range for type integer',
                    code: '22003',
                },
            ])
            expect(serialized.errors?.[0]).not.toHaveProperty('detail')
            expect(JSON.stringify(serialized)).not.toContain('PRIVATE_')
        })

        it('withholds a message whose value is not quoted', () => {
            for (const message of [
                'value PRIVATE_VALUE is out of range for type integer',
                'value private_value is out of range for type integer',
                'invalid escape string PRIVATE_VALUE',
                'PRIVATE_VALUE',
            ]) {
                const serialized = dataException(message, '22003')

                expect(serialized.message).toBe('Database data exception.')
                expect(serialized.code).toBe('22003')
                expect(JSON.stringify(serialized)).not.toContain('PRIVATE_')
                expect(JSON.stringify(serialized)).not.toContain('private_')
            }
        })

        it('does not trust a colon head or quoted head that carries an unquoted value', () => {
            const serialized = dataException(
                'value PRIVATE_VALUE is out of range for type integer: overflow',
                '22003',
            )

            expect(serialized.message).toBe('Database data exception.')
            expect(JSON.stringify(serialized)).not.toContain('PRIVATE_')
        })

        it('keeps messages that name no value', () => {
            for (const message of [
                'division by zero',
                'integer out of range',
                'numeric field overflow',
                'value too long for type character varying(255)',
            ])
                expect(dataException(message, '22012').message).toBe(message)
        })

        it('bounds the message before redacting, including a value cut mid-quote', () => {
            const unterminated = dataException(
                `value "${'A'.repeat(10_000)}PRIVATE_TAIL`,
                '22003',
            )
            const colon = dataException(
                `invalid input syntax for type uuid: ${'A'.repeat(10_000)}PRIVATE_TAIL`,
            )
            const noSlot = dataException(`${'a'.repeat(10_000)}PRIVATE_TAIL`)
            const lateColon = dataException(
                `${'a'.repeat(5_000)}: PRIVATE_TAIL`,
            )

            expect(unterminated.message).toBe('value "<redacted>"')
            expect(colon.message).toBe(
                'invalid input syntax for type uuid: <redacted>',
            )
            expect(noSlot.message).toBe('Database data exception.')
            expect(lateColon.message).toBe('Database data exception.')
            for (const serialized of [
                unterminated,
                colon,
                noSlot,
                lateColon,
            ])
                expect(JSON.stringify(serialized)).not.toContain('PRIVATE_')
        })
    })

    describe.concurrent('credential redaction', () => {
        const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.c2lnbmF0dXJl'

        it('redacts URL credentials, bearer tokens, and JWTs', () => {
            const serialized = serializeError(
                new Error(
                    `connect postgres://admin:PRIVATE_PASSWORD@db.internal:5432/app failed; Authorization: Bearer PRIVATE_TOKEN_VALUE; jwt ${jwt}`,
                ),
            )

            expect(serialized.message).toBe(
                'connect postgres://<redacted>@db.internal:5432/app failed; Authorization: Bearer <redacted>; jwt <redacted>',
            )
            expect(serialized.stack).not.toContain('PRIVATE_')
            expect(serialized.stack).not.toContain(jwt)
            expect(
                serializeError('token Bearer PRIVATE_TOKEN_VALUE').message,
            ).toBe('token Bearer <redacted>')
        })

        it('has no minimum token length', () => {
            expect(serializeError('Bearer abc').message).toBe(
                'Bearer <redacted>',
            )
            expect(serializeError('Basic Zm9v').message).toBe(
                'Basic <redacted>',
            )
            expect(serializeError('jwt eyJhb.eyJ.x').message).toBe(
                'jwt <redacted>',
            )
        })

        it('redacts URL credentials over 256 characters or containing an at sign', () => {
            const long = serializeError(
                new Error(
                    `postgres://user:${'p'.repeat(300)}PRIVATE_TAIL@db.internal/app`,
                ),
            )
            const atSign = serializeError(
                'postgres://user:PRIVATE_A@PRIVATE_B@db.internal/app',
            )

            expect(long.message).toBe('postgres://<redacted>@db.internal/app')
            expect(atSign.message).toBe('postgres://<redacted>@db.internal/app')
            expect(
                JSON.stringify([
                    long,
                    atSign,
                ]),
            ).not.toContain('PRIVATE_')
        })

        it('redacts bearer and basic tokens over 2,048 characters', () => {
            for (const scheme of [
                'Bearer',
                'Basic',
            ]) {
                const serialized = serializeError(
                    `${scheme} ${'A'.repeat(3_000)}PRIVATE_TAIL done`,
                )

                expect(serialized.message).toBe(`${scheme} <redacted> done`)
            }
        })

        it('redacts oversized and truncated JWT segments', () => {
            const oversized = `eyJ${'a'.repeat(100)}.${'b'.repeat(2_500)}.${'c'.repeat(100)}PRIVATE_SIGNATURE`
            const oversizedSegments = `eyJ${'a'.repeat(2_500)}.${'b'.repeat(2_500)}.${'c'.repeat(2_500)}PRIVATE_SIGNATURE`

            expect(serializeError(`jwt ${oversized} end`).message).toBe(
                'jwt <redacted> end',
            )
            expect(serializeError(oversizedSegments).message).toBe(
                '<redacted>…[truncated]',
            )
            expect(serializeError('jwt eyJhbGciOiJIUzI1NiJ9.').message).toBe(
                'jwt <redacted>',
            )
        })

        it('keeps identifiers that merely contain the JWT prefix', () => {
            expect(serializeError('publicKeyJwk is missing').message).toBe(
                'publicKeyJwk is missing',
            )
        })

        it('redacts a credential cut by any field limit before its terminator', () => {
            const secrets = [
                {
                    complete: 'postgres://user:PRIVATE_PASSWORD@db.internal',
                    keep: 'postgres://user:PRIVATE'.length,
                },
                {
                    complete: 'Bearer PRIVATE_TOKEN_VALUE',
                    keep: 'Bearer PRIVATE'.length,
                },
                {
                    complete: 'Basic PRIVATE_TOKEN_VALUE',
                    keep: 'Basic PRIVATE'.length,
                },
                {
                    complete:
                        'eyJhbGciOiJIUzI1NiJ9.PRIVATE_PAYLOAD.PRIVATE_SIG',
                    keep: 'eyJhbGciOiJIUzI1NiJ9.PRIVATE'.length,
                },
            ]

            for (const { complete, keep } of secrets) {
                const name = serializeError(
                    Object.assign(new Error('x'), {
                        name: crossing(NAME_LIMIT, complete, keep),
                    }),
                )
                const message = serializeError(
                    new Error(crossing(MESSAGE_LIMIT, complete, keep)),
                )
                const hint = serializeError(
                    Object.assign(new Error('x'), {
                        code: '42P01',
                        hint: crossing(MESSAGE_LIMIT, complete, keep),
                    }),
                )
                const sql = serializeError(
                    Object.assign(new Error('x'), {
                        query: `"${crossing(SQL_LIMIT - 1, complete, keep)}`,
                        params: [],
                    }),
                )

                for (const serialized of [
                    name,
                    message,
                    hint,
                    sql,
                ])
                    expect(JSON.stringify(serialized)).not.toContain('PRIVATE')
                expect(message.message.endsWith('…[truncated]')).toBe(true)
            }
        })

        it('redacts a URL credential cut by the stack limit', () => {
            const place = `${'a'.repeat(230)}.ts:1:1`
            const filler = frame('handler', place)
            // Only the location of each frame is emitted, not its label.
            const emittedFiller = `    at ${place}`
            const prefix = '    at https://user:'
            const fillerCount = 28
            // The header absorbs the slack so that exactly ten characters of
            // the credential frame's password fit before the limit.
            const message = 'm'.repeat(
                STACK_LIMIT -
                    10 -
                    prefix.length -
                    1 -
                    'Error: '.length -
                    fillerCount * (emittedFiller.length + 1),
            )
            const error = new Error(message)
            error.stack = [
                `Error: ${message}`,
                ...Array.from({ length: fillerCount }, () => filler),
                frame(
                    'credential',
                    `https://user:PRIVATE_${'p'.repeat(80)}@host/x.js:1:1`,
                ),
            ].join('\n')

            const serialized = serializeError(error)

            expect(
                serialized.stack?.endsWith('https://<redacted>…[truncated]'),
            ).toBe(true)
            expect(JSON.stringify(serialized)).not.toContain('PRIVATE')
        })
    })

    describe.concurrent('SQL text', () => {
        const sqlOf = (query: string, params: unknown[] = []) =>
            serializeError(Object.assign(new Error('x'), { query, params }))

        it('redacts inline literals while keeping bound parameters and their types', () => {
            const serialized = sqlOf(
                `select "id" from "user" where "email" = 'private@example.com' and "age" > 42 and "id" = $1 and "org" = $2`,
                [
                    'PRIVATE_PARAMETER',
                    7,
                ],
            )

            expect(serialized).toMatchObject({
                sql: `select "id" from "user" where "email" = '<redacted>' and "age" > <redacted> and "id" = $1 and "org" = $2`,
                paramCount: 2,
                paramTypes: [
                    'string',
                    'number',
                ],
            })
            expect(JSON.stringify(serialized)).not.toContain('PRIVATE')
            expect(JSON.stringify(serialized)).not.toContain('private@')
        })

        it('handles escaped quotes, escape strings, dollar quotes, and comments', () => {
            const literals = [
                `'it''s PRIVATE'`,
                `E'a\\'b PRIVATE'`,
                `e'a\\\\' || 'PRIVATE'`,
                `$$PRIVATE$$`,
                `$tag$ PRIVATE ' $$ $tag$`,
                `U&'PRIVATE'`,
                `'PRIVATE`,
            ]

            for (const literal of literals) {
                const serialized = sqlOf(`select ${literal}`)

                expect(serialized.sql).not.toContain('PRIVATE')
                expect(serialized.sql?.startsWith('select ')).toBe(true)
            }
            expect(
                sqlOf(
                    `select 1 -- PRIVATE\n, /* PRIVATE /* nested */ PRIVATE */ "id"`,
                ).sql,
            ).toBe('select <redacted>  \n,   "id"')
            expect(sqlOf(`select /* PRIVATE`).sql).toBe('select  ')
        })

        it('keeps quoted identifiers and identifiers containing digits', () => {
            expect(
                sqlOf(
                    `select t1.col2, "it's", "a""b" from "schema_1"."table_2" t1 where t1.id = $1 limit $2`,
                ).sql,
            ).toBe(
                `select t1.col2, "it's", "a""b" from "schema_1"."table_2" t1 where t1.id = $1 limit $2`,
            )
        })

        it('redacts a literal cut by the SQL limit', () => {
            const serialized = sqlOf(
                `${'select "id" from "user" where '.padEnd(SQL_LIMIT - 12, ' ')}"email" = 'PRIVATE_LITERAL_SECRET'`,
            )

            expect(serialized.sql).not.toContain('PRIVATE')
            expect(serialized.sql).toContain(`"email" = '<`)
            expect(serialized.sql?.endsWith('…[truncated]')).toBe(true)
            expect(serialized.sql?.length).toBeLessThan(SQL_LIMIT + 100)
        })

        it('stays linear on hostile SQL', () => {
            for (const query of [
                "'".repeat(40_000),
                '/*'.repeat(40_000),
                '$a$'.repeat(20_000),
                '$'.repeat(40_000),
                '"'.repeat(40_000),
                '1'.repeat(40_000),
                '-'.repeat(40_000),
                `E'${'\\'.repeat(40_000)}`,
            ])
                expect(sqlOf(query).sql?.length).toBeLessThan(SQL_LIMIT + 100)
        })
    })

    describe.concurrent('stack verification', () => {
        it('keeps source-mapped locations behind a trusted header', () => {
            const serialized = serializeError(
                withStack(new Error('Trusted.'), ...trustedFrames),
            )

            expect(serialized.stack).toBe(
                [
                    'Error: Trusted.',
                    ...trustedLocations,
                ].join('\n'),
            )
        })

        it('emits only the location of a frame, never its label', () => {
            const serialized = serializeError(
                withStack(
                    new Error('Labeled.'),
                    '    at PRIVATE_VALUE (src/a.ts:1:1)',
                    frame(
                        'async PRIVATE_OTHER.<anonymous> [as PRIVATE_ALIAS]',
                        'file:///worker/b.js:2:3',
                    ),
                ),
            )

            expect(serialized.stack).toBe(
                [
                    'Error: Labeled.',
                    '    at src/a.ts:1:1',
                    '    at file:///worker/b.js:2:3',
                ].join('\n'),
            )
            expect(JSON.stringify(serialized)).not.toContain('PRIVATE_')
        })

        it('drops frames without a source location and omits a stack made only of them', () => {
            const mixed = serializeError(
                withStack(
                    new Error('Mixed.'),
                    frame('new Promise', '<anonymous>'),
                    frame('Object.inspect', 'native'),
                    frame('async Promise.all', 'index 0'),
                    frame('handler', 'src/a.ts:1:1'),
                ),
            )
            const opaque = serializeError(
                withStack(
                    new Error('Opaque.'),
                    frame('new Promise', '<anonymous>'),
                    frame('async Promise.all', 'index 0'),
                ),
            )

            expect(mixed.stack).toBe(
                [
                    'Error: Mixed.',
                    '    at src/a.ts:1:1',
                ].join('\n'),
            )
            expect(opaque).not.toHaveProperty('stack')
        })

        it('accepts the prototype name for classes that assign name after construction', () => {
            const serialized = serializeError(
                new AppError(catalog.internalServerError),
            )

            expect(serialized.name).toBe('AppError')
            expect(serialized.stack?.startsWith('AppError: ')).toBe(true)
        })

        it('removes a header that carries forged frames before reading frames', () => {
            const failure = createQueryFailure()
            failure.message = `${failure.message}\n    at PRIVATE_VALUE\n    at PRIVATE_OTHER (PRIVATE_FILE:1:1)`
            failure.params = ['PRIVATE_ORGANIZATION\n    at PRIVATE_VALUE']
            // Constructed as an `Error`, so the header carries that name.
            withStack(
                failure,
                ...trustedFrames,
                'Caused by: PostgresError: PRIVATE_CAUSE_MESSAGE',
                '    at PRIVATE_CAUSE_FRAME',
            )

            const serialized = serializeError(failure)

            expect(serialized.stack).toBe(
                [
                    'DrizzleQueryError: Failed query.',
                    ...trustedLocations,
                ].join('\n'),
            )
            expect(JSON.stringify(serialized)).not.toContain('PRIVATE')
        })

        it('omits a stack whose header no longer matches the error', () => {
            const changed = new Error(
                'PRIVATE_ORIGINAL postgres://u:PRIVATE_PW@h/db',
            )
            // The runtime writes the header on first read, so read it first.
            void changed.stack
            changed.message = 'Changed.'
            const swapped = withStack(new Error('Real.'), ...trustedFrames)
            swapped.stack = swapped.stack!.replace('Real.', 'PRIVATE_OTHER')

            for (const error of [
                changed,
                swapped,
            ]) {
                const serialized = serializeError(error)

                expect(serialized).not.toHaveProperty('stack')
                expect(JSON.stringify(serialized)).not.toContain('PRIVATE_')
            }
        })

        it('never restores a message that was changed before the stack was read', () => {
            const changed = new Error(
                'PRIVATE_ORIGINAL postgres://u:PRIVATE_PW@h/db',
            )
            changed.message = 'Changed.'

            const serialized = serializeError(changed)

            expect(serialized.message).toBe('Changed.')
            // Present or omitted depending on when the runtime wrote the
            // header; either way the original message is gone.
            expect(serialized.stack ?? 'Error: Changed.').toMatch(
                /^Error: Changed\./,
            )
            expect(JSON.stringify(serialized)).not.toContain('PRIVATE_')
        })

        it('accepts the header form that keeps the colon after an empty message', () => {
            const error = new Error('')
            error.stack = [
                'Error: ',
                ...trustedFrames,
            ].join('\n')

            expect(serializeError(error).stack).toBe(
                [
                    'Error',
                    ...trustedLocations,
                ].join('\n'),
            )
        })

        it('omits a custom stack with a matching header and unsafe frames', () => {
            for (const forged of [
                '    at PRIVATE_VALUE',
                '    at PRIVATE_VALUE (not a location)',
                '    at handler (src/a.ts:1:1) PRIVATE_TRAILER',
                '    at handler (PRIVATE_VALUE)',
                'PRIVATE_LINE',
                '      at handler (src/a.ts:1:1)',
                `    at handler (${'a'.repeat(600)}:1:1)`,
                '',
            ]) {
                const serialized = serializeError(
                    withStack(new Error('Forged.'), trustedFrames[0]!, forged),
                )

                expect(serialized).not.toHaveProperty('stack')
                expect(JSON.stringify(serialized)).not.toContain('PRIVATE_')
            }
        })

        it('omits a stack without frames or with an oversized header', () => {
            const empty = new Error('No frames.')
            empty.stack = 'Error: No frames.'
            const oversized = withStack(
                new Error(`Oversized ${'m'.repeat(40_000)}`),
                ...trustedFrames,
            )

            expect(serializeError(empty)).not.toHaveProperty('stack')
            expect(serializeError(oversized)).not.toHaveProperty('stack')
            expect(serializeError(oversized).message.length).toBeLessThan(
                MESSAGE_LIMIT + 20,
            )
        })

        it('bounds the frame count and length', () => {
            const many = serializeError(
                withStack(new Error('Deep.'), ...withRepeatedFrames(500)),
            )
            const long = serializeError(
                withStack(
                    new Error('m'.repeat(4_000)),
                    ...withRepeatedFrames(25, `${'a'.repeat(240)}.ts:1:1`),
                ),
            )

            expect(many.stack?.split('\n')).toHaveLength(51)
            expect(long.stack?.length).toBeLessThan(STACK_LIMIT + 20)
            expect(long.stack?.endsWith('…[truncated]')).toBe(true)
        })

        it('redacts credentials inside otherwise valid frame locations', () => {
            const serialized = serializeError(
                withStack(
                    new Error('Located.'),
                    frame(
                        'load',
                        'https://user:PRIVATE_PW@cdn.internal/x.js:1:1',
                    ),
                ),
            )

            expect(serialized.stack).toBe(
                [
                    'Error: Located.',
                    '    at https://<redacted>@cdn.internal/x.js:1:1',
                ].join('\n'),
            )
        })

        it('survives a stack that cannot be read', () => {
            const error = Object.defineProperty(
                new Error('Hostile stack.'),
                'stack',
                {
                    get: () => {
                        throw new Error('getter')
                    },
                },
            )

            expect(serializeError(error)).toEqual({
                name: 'Error',
                message: 'Hostile stack.',
            })
        })
    })

    it('bounds the chain depth and stops on cycles', () => {
        const first = new Error('first')
        const second = new Error('second', { cause: first })
        Object.assign(first, { cause: second })

        expect(serializeError(first).causes).toHaveLength(1)
        expect(serializeError(second).causes).toHaveLength(1)

        let chained: unknown = 'root failure'
        for (let index = 0; index < 9; index += 1)
            chained = new Error(`level ${index}`, { cause: chained })
        expect(serializeError(chained).causes).toHaveLength(5)
    })

    it('handles non-Error throwables and causes', () => {
        expect(serializeError('plain value')).toEqual({
            name: 'UnknownThrownValue',
            message: 'plain value',
        })
        expect(serializeError(wrap(42)).causes).toEqual([
            { name: 'UnknownThrownValue', message: '42' },
        ])
        expect(serializeError({ message: 'object message' }).message).toBe(
            'object message',
        )
        expect(serializeError(Object.create(null)).message).toBe(
            '[object Object]',
        )
        expect(serializeError(Symbol('x')).message).toBe('Symbol(x)')
    })

    it('never throws on hostile errors', () => {
        const throwingMessage = Object.defineProperty(
            new Error('x'),
            'message',
            {
                get: () => {
                    throw new Error('getter')
                },
            },
        )
        const throwingCause = Object.defineProperty(new Error('x'), 'cause', {
            get: () => {
                throw new Error('getter')
            },
        })
        const throwingToString = {
            toString: () => {
                throw new Error('toString')
            },
        }

        expect(serializeError(throwingMessage)).toEqual({
            name: 'UnserializableError',
            message: 'The thrown value could not be serialized.',
        })
        expect(serializeError(throwingCause)).toMatchObject({ message: 'x' })
        expect(serializeError(throwingToString).message).toBe('[object Object]')
    })

    it('serializes aggregate members one level deep', () => {
        const aggregate = new AggregateError(
            [
                new Error('mail down'),
                'queue down',
            ],
            'Delivery failed.',
        )
        const serialized = serializeError(
            new BaseError(
                {
                    category: 'internal',
                    id: 'TEST_AGGREGATE',
                    message: 'Wrapper.',
                    retryable: true,
                },
                { cause: aggregate },
            ),
        )

        expect(serialized.causes?.[0]?.errors).toEqual([
            expect.objectContaining({ name: 'Error', message: 'mail down' }),
            { name: 'UnknownThrownValue', message: 'queue down' },
        ])
    })

    it('caps oversized messages, queries, stacks, and pathological input', () => {
        const query = Object.assign(new Error('x'.repeat(10_000)), {
            query: 'q'.repeat(40_000),
            params: [],
        })
        const [serialized] = serializeError(wrap(query)).causes ?? []
        const pathological = serializeError(
            new Error(`${'a.'.repeat(50_000)}@ ${'https://'.repeat(20_000)}`),
        )
        const patterns = serializeError(
            new Error(
                `${'Bearer '.repeat(2_000)}${'a://'.repeat(2_000)}${'eyJ.'.repeat(2_000)}`,
            ),
        )

        expect(serialized?.sql?.length).toBeLessThan(SQL_LIMIT + 100)
        expect(serialized?.stack?.length ?? 0).toBeLessThan(STACK_LIMIT + 100)
        expect(
            serializeError(new Error('m'.repeat(10_000))).message.length,
        ).toBeLessThan(MESSAGE_LIMIT + 100)
        expect(pathological.message.length).toBeLessThan(MESSAGE_LIMIT + 100)
        expect(patterns.message.length).toBeLessThan(MESSAGE_LIMIT + 100)
    })

    it('keeps redaction from expanding a message past its limit', () => {
        const expanded = serializeError(new Error('a://b@'.repeat(2_000)))

        expect(expanded.message.length).toBeLessThan(MESSAGE_LIMIT + 100)
        expect(expanded.message.endsWith('…[truncated]')).toBe(true)
        expect(expanded.message).not.toContain('b@')
    })
})

// =============================================================================
// END OF BASE TEMPLATE TESTS - FORK-SPECIFIC TESTS MUST BE ADDED BELOW
// =============================================================================
