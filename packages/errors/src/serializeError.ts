const MAX_CAUSE_DEPTH = 5
const MAX_AGGREGATE_ERRORS = 5
const MAX_PARAM_TYPES = 100
const MAX_NAME_LENGTH = 128
const MAX_MESSAGE_LENGTH = 4096
const MAX_SQL_LENGTH = 16384
const MAX_STACK_LENGTH = 8192
const MAX_STACK_HEADER_LENGTH = 32768
const MAX_STACK_FRAMES = 50
const MAX_STACK_FRAME_LENGTH = 512
const REDACTED = '<redacted>'
const TRUNCATED = '…[truncated]'
const QUERY_FAILED_MESSAGE = 'Failed query.'
const DATA_EXCEPTION_MESSAGE = 'Database data exception.'
const UNSERIALIZABLE_MESSAGE = 'The thrown value could not be serialized.'

/** String fields a Postgres driver error may carry; values are never read from elsewhere. */
const DATABASE_ERROR_FIELDS = [
    'code',
    'severity',
    'detail',
    'hint',
    'position',
    'where',
    'schema_name',
    'table_name',
    'column_name',
    'data_type_name',
    'constraint_name',
    'routine',
] as const

/** Postgres echoes row and input values in these fields for SQLSTATE classes 22 and 23. */
const VALUE_ECHO_FIELDS: ReadonlySet<string> = new Set([
    'detail',
    'where',
])

/**
 * Credentials never need a minimum length or a terminator to be secret, so
 * these are unbounded. They only run on text already cut to its field limit,
 * which keeps them linear.
 */
const SECRET_PATTERNS: [
    RegExp,
    string,
][] = [
    [
        /\b([a-z][a-z\d+.-]{0,31}:\/\/)[^\s/]+@/gi,
        `$1${REDACTED}@`,
    ],
    [
        /\b(Bearer|Basic)\s+[^\s"'<>;,)\]}]+/gi,
        `$1 ${REDACTED}`,
    ],
    [
        /(?<![A-Za-z])eyJ[\w-]+(?:\.[\w-]*){0,2}/g,
        REDACTED,
    ],
]

/** A URL credential cut off before its `@` terminator by a field limit. */
const TRUNCATED_URL_CREDENTIAL = /\b([a-z][a-z\d+.-]{0,31}:\/\/)[^\s/]*$/i

/** Postgres messages that name no input value, so they are safe to keep whole. */
const VALUE_FREE_DATA_EXCEPTION =
    /^(?:division by zero|numeric field overflow|(?:integer|smallint|bigint|real|double precision|numeric|value) out of range|value too long for type [a-z ]{1,32}(?:\(\d{1,5}(?:,\d{1,5})?\))?)$/

const QUOTED_SPAN = /"[^"]*(?:"|$)/g

/** Lowercase template text: anything else in an unquoted position may be an echoed value. */
const DATA_EXCEPTION_TEMPLATE = /^[a-z][a-z\d ,./()%-]*$/

const SQL_DOLLAR_QUOTE_TAG = /\$(?:[\p{L}_][\p{L}\p{N}_]{0,62})?\$/uy
const SQL_IDENTIFIER_CHARACTER = /[\p{L}\p{N}_$]/u
const SQL_NUMBER_CHARACTER = /[\p{L}\p{N}_.]/u

/** `at label (place)` or `at place`. The label is discarded; only the place is ever read. */
const STACK_FRAME =
    /^ {4}at (?:[^()]{1,128} \((?<place>[^\s()]{1,256}|index \d{1,6})\)|(?:async )?(?<bare>[^\s()]{1,256}))$/
/** The only place text that is emitted. Its path is checked for shape alone. */
const STACK_FRAME_LOCATION = /^[^\s()<>]{1,256}:\d{1,9}:\d{1,9}$/
/** Places V8 prints for frames with no source location. */
const STACK_FRAME_OPAQUE_PLACE = /^(?:<anonymous>|native|index \d{1,6})$/

type TDatabaseErrorField = (typeof DATABASE_ERROR_FIELDS)[number]

export type TSerializedError = {
    name: string
    message: string
    stack?: string
    sql?: string
    paramCount?: number
    paramTypes?: string[]
    errors?: TSerializedError[]
} & Partial<Record<TDatabaseErrorField, string>>

export type TSerializedErrorChain = TSerializedError & {
    causes?: TSerializedError[]
}

type TQueryError = Error & { query: string; params: unknown[] }

const redactSecrets = (text: string, truncated: boolean) => {
    const redacted = SECRET_PATTERNS.reduce(
        (
            current,
            [
                pattern,
                replacement,
            ],
        ) => current.replace(pattern, replacement),
        text,
    )
    return truncated
        ? redacted.replace(TRUNCATED_URL_CREDENTIAL, `$1${REDACTED}`)
        : redacted
}

/**
 * Cuts the input to its limit before any pattern runs, then redacts. A secret
 * that straddles the limit is redacted from the cut text, and a redaction that
 * expands the text is cut again, so the result stays within the limit.
 */
const sanitizeText = (
    value: string,
    limit: number,
    redactSyntax: (text: string) => string = (text) => text,
) => {
    const truncated = value.length > limit
    const redacted = redactSecrets(
        redactSyntax(truncated ? value.slice(0, limit) : value),
        truncated,
    )
    const capped = redacted.length > limit
    return truncated || capped
        ? `${capped ? redacted.slice(0, limit) : redacted}${TRUNCATED}`
        : redacted
}

/**
 * SQLSTATE class 22 (data exception) messages echo the rejected input, such as
 * `invalid input syntax for type uuid: "value"`. Only the two echo formats that
 * can be located are kept, minus the value; everything else that could carry an
 * unquoted value gets a fixed message. The SQLSTATE code identifies the failure.
 */
const redactDataException = (message: string) => {
    const bounded = message.slice(0, MAX_MESSAGE_LENGTH)
    if (VALUE_FREE_DATA_EXCEPTION.test(bounded)) return bounded

    const colon = bounded.indexOf(':')
    const head = colon === -1 ? bounded : bounded.slice(0, colon)
    const quotedHead = head.replace(QUOTED_SPAN, `"${REDACTED}"`)
    const hasValueSlot = colon !== -1 || quotedHead !== head
    if (
        !hasValueSlot ||
        !DATA_EXCEPTION_TEMPLATE.test(head.replace(QUOTED_SPAN, ''))
    )
        return DATA_EXCEPTION_MESSAGE

    return colon === -1 ? quotedHead : `${quotedHead}: ${REDACTED}`
}

/**
 * Replaces string, dollar-quoted, and numeric literals and drops comments in
 * one linear pass. Bound parameters (`$1`) stay; an unterminated literal or
 * comment, such as one cut by the length limit, is redacted to the end.
 */
const redactSqlLiterals = (sql: string) => {
    let output = ''
    let index = 0

    while (index < sql.length) {
        const character = sql[index]!
        const next = sql[index + 1]
        const previous = sql[index - 1]

        if (character === '-' && next === '-') {
            const lineEnd = sql.indexOf('\n', index)
            index = lineEnd === -1 ? sql.length : lineEnd
            output += ' '
        } else if (character === '/' && next === '*') {
            let depth = 1
            let cursor = index + 2
            while (cursor < sql.length && depth > 0) {
                if (sql[cursor] === '/' && sql[cursor + 1] === '*') {
                    depth += 1
                    cursor += 2
                } else if (sql[cursor] === '*' && sql[cursor + 1] === '/') {
                    depth -= 1
                    cursor += 2
                } else cursor += 1
            }
            index = Math.min(cursor, sql.length)
            output += ' '
        } else if (character === "'") {
            const backslashEscapes =
                (previous === 'E' || previous === 'e') &&
                !SQL_IDENTIFIER_CHARACTER.test(sql[index - 2] ?? '')
            let cursor = index + 1
            while (cursor < sql.length) {
                if (backslashEscapes && sql[cursor] === '\\') cursor += 2
                else if (sql[cursor] !== "'") cursor += 1
                else if (sql[cursor + 1] === "'") cursor += 2
                else {
                    cursor += 1
                    break
                }
            }
            index = Math.min(cursor, sql.length)
            output += `'${REDACTED}'`
        } else if (character === '"') {
            let cursor = index + 1
            while (cursor < sql.length) {
                if (sql[cursor] !== '"') cursor += 1
                else if (sql[cursor + 1] === '"') cursor += 2
                else {
                    cursor += 1
                    break
                }
            }
            output += sql.slice(index, cursor)
            index = Math.min(cursor, sql.length)
        } else if (
            character === '$' &&
            !SQL_IDENTIFIER_CHARACTER.test(previous ?? '')
        ) {
            SQL_DOLLAR_QUOTE_TAG.lastIndex = index
            const tag = SQL_DOLLAR_QUOTE_TAG.exec(sql)?.[0]
            if (tag === undefined) {
                output += character
                index += 1
            } else {
                const close = sql.indexOf(tag, index + tag.length)
                index = close === -1 ? sql.length : close + tag.length
                output += `'${REDACTED}'`
            }
        } else if (
            /\d/.test(character) &&
            !SQL_IDENTIFIER_CHARACTER.test(previous ?? '')
        ) {
            let cursor = index + 1
            while (
                cursor < sql.length &&
                SQL_NUMBER_CHARACTER.test(sql[cursor]!)
            )
                cursor += 1
            index = cursor
            output += REDACTED
        } else {
            output += character
            index += 1
        }
    }

    return output
}

const isQueryError = (error: Error): error is TQueryError => {
    const candidate = error as Partial<TQueryError>
    return (
        typeof candidate.query === 'string' && Array.isArray(candidate.params)
    )
}

const describeParamType = (value: unknown) => {
    if (value === null) return 'null'
    if (Array.isArray(value)) return 'array'
    if (value instanceof Date) return 'date'
    if (value instanceof Uint8Array) return 'bytes'
    return typeof value
}

/** Never calls user code; objects contribute only a string `message`. */
const describeThrownValue = (value: unknown) => {
    if (typeof value === 'string') return value
    if (typeof value !== 'object' && typeof value !== 'function')
        return String(value)
    const message = (value as { message?: unknown } | null)?.message
    return typeof message === 'string'
        ? message
        : Object.prototype.toString.call(value)
}

/** The header V8 writes when it captures a stack: `name: message`, or whichever is non-empty. */
const describeStackHeader = (name: string, message: string) =>
    message === '' ? name : name === '' ? message : `${name}: ${message}`

/**
 * Returns where the frames begin, or -1 when the stack does not open with the
 * error's own header. The runtime may have written the header before a class
 * field assigned `name`, so the prototype's name and `Error` are also tried;
 * some formatters keep the colon when the message is empty.
 */
const findStackFrameStart = (
    error: Error,
    stack: string,
    rawMessage: string,
) => {
    const prototypeName = (
        Object.getPrototypeOf(error) as { name?: unknown } | null
    )?.name
    for (const name of new Set([
        prototypeName,
        error.name as unknown,
        'Error',
    ])) {
        if (
            typeof name !== 'string' ||
            name.length + rawMessage.length + 2 > MAX_STACK_HEADER_LENGTH
        )
            continue
        for (const header of new Set([
            describeStackHeader(name, rawMessage),
            `${name}: ${rawMessage}`,
        ]))
            if (stack.startsWith(`${header}\n`)) return header.length + 1
    }

    return -1
}

/**
 * The source location of a frame, `null` for a well-formed frame without one
 * (native or anonymous code), or `undefined` when the line is not a frame. The
 * label before the location is never read, so it cannot reach the output.
 */
const readStackFrameLocation = (line: string) => {
    if (line.length > MAX_STACK_FRAME_LENGTH) return undefined
    const groups = STACK_FRAME.exec(line)?.groups
    const place = groups?.place ?? groups?.bare
    if (place === undefined) return undefined
    if (STACK_FRAME_LOCATION.test(place)) return place
    return STACK_FRAME_OPAQUE_PLACE.test(place) ? null : undefined
}

/**
 * A stack is trusted only as far as it can be verified. The raw header must
 * match the error's own name and message exactly, so a message or parameter
 * cannot pose as frames; every frame after it must then be well formed, and
 * only their bounded `file:line:column` locations are emitted, never the
 * function labels. Anything else omits the stack. The header is rebuilt from
 * the sanitized name and message, never copied. A location's path can be
 * checked for shape only, so a value shaped like one cannot be told apart.
 */
const sanitizeStack = (
    error: Error,
    rawMessage: string,
    name: string,
    message: string,
) => {
    try {
        const stack = error.stack
        if (typeof stack !== 'string') return undefined

        const frameStart = findStackFrameStart(error, stack, rawMessage)
        if (frameStart === -1) return undefined

        const remainder = stack.slice(
            frameStart,
            frameStart + MAX_STACK_LENGTH + 1,
        )
        const lines = remainder.split('\n')
        // The last line is partial when the remainder was cut.
        if (remainder.length > MAX_STACK_LENGTH) lines.pop()
        // Some libraries append the cause's message and stack after the frames.
        const causedBy = lines.findIndex((line) =>
            line.startsWith('Caused by:'),
        )
        const places = (causedBy === -1 ? lines : lines.slice(0, causedBy))
            .slice(0, MAX_STACK_FRAMES)
            .map(readStackFrameLocation)
        // Without its label a frame that has no source location says nothing.
        const locations = places.filter(
            (place): place is string => typeof place === 'string',
        )
        if (
            places.length === 0 ||
            places.includes(undefined) ||
            locations.length === 0
        )
            return undefined

        return sanitizeText(
            [
                describeStackHeader(name, message),
                ...locations.map((location) => `    at ${location}`),
            ].join('\n'),
            MAX_STACK_LENGTH,
        )
    } catch {
        return undefined
    }
}

const readCause = (value: unknown) => {
    try {
        return value instanceof Error ? value.cause : undefined
    } catch {
        return undefined
    }
}

const serializeErrorEntry = (
    error: unknown,
    includeAggregate = true,
): TSerializedError => {
    try {
        if (!(error instanceof Error))
            return {
                name: 'UnknownThrownValue',
                message: sanitizeText(
                    describeThrownValue(error),
                    MAX_MESSAGE_LENGTH,
                ),
            }

        const fields = error as unknown as Record<string, unknown>
        const code = typeof fields.code === 'string' ? fields.code : ''
        const isDataException = code.startsWith('22')
        const isValueEcho = isDataException || code.startsWith('23')
        const queryError = isQueryError(error) ? error : undefined
        const rawMessage =
            typeof error.message === 'string' ? error.message : ''
        const name =
            typeof error.name === 'string'
                ? sanitizeText(error.name, MAX_NAME_LENGTH)
                : 'Error'
        const message = queryError
            ? QUERY_FAILED_MESSAGE
            : sanitizeText(
                  isDataException
                      ? redactDataException(rawMessage)
                      : rawMessage,
                  MAX_MESSAGE_LENGTH,
              )
        const stack = sanitizeStack(error, rawMessage, name, message)
        const serialized: TSerializedError = {
            name,
            message,
            ...(stack === undefined ? {} : { stack }),
        }

        if (queryError) {
            serialized.sql = sanitizeText(
                queryError.query,
                MAX_SQL_LENGTH,
                redactSqlLiterals,
            )
            serialized.paramCount = queryError.params.length
            serialized.paramTypes = queryError.params
                .slice(0, MAX_PARAM_TYPES)
                .map(describeParamType)
        }

        for (const field of DATABASE_ERROR_FIELDS) {
            if (isValueEcho && VALUE_ECHO_FIELDS.has(field)) continue
            // postgres.js spells this field `data type_name`.
            const value =
                fields[field] ??
                (field === 'data_type_name'
                    ? fields['data type_name']
                    : undefined)
            if (typeof value === 'string')
                serialized[field] = sanitizeText(value, MAX_MESSAGE_LENGTH)
        }

        if (includeAggregate && error instanceof AggregateError)
            serialized.errors = error.errors
                .slice(0, MAX_AGGREGATE_ERRORS)
                .map((entry) => serializeErrorEntry(entry, false))

        return serialized
    } catch {
        return { name: 'UnserializableError', message: UNSERIALIZABLE_MESSAGE }
    }
}

/**
 * Serializes a thrown value and its bounded, cycle-safe `cause` chain for
 * structured server logs. Only allowlisted fields are read: database driver
 * failures keep their SQLSTATE fields, SQL text with its literals redacted,
 * and parameter count and types, while bound parameter values are never copied
 * and `detail` and `where` are omitted for SQLSTATE classes 22 and 23, which
 * echo row and input values. Credentials in URLs, Bearer/Basic tokens, and JWTs
 * are redacted at every field limit, and a stack is kept only when its header
 * and frames verify. Never send the result to clients.
 */
export const serializeError = (error: unknown): TSerializedErrorChain => {
    const seen = new Set<unknown>([error])
    const causes: TSerializedError[] = []
    let current = readCause(error)
    while (
        current !== undefined &&
        causes.length < MAX_CAUSE_DEPTH &&
        !seen.has(current)
    ) {
        seen.add(current)
        causes.push(serializeErrorEntry(current))
        current = readCause(current)
    }

    return {
        ...serializeErrorEntry(error),
        ...(causes.length > 0 ? { causes } : {}),
    }
}
