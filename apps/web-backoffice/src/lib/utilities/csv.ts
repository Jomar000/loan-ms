import { parse, unparse } from 'papaparse'

const CSV_MIME_TYPE = 'text/csv;charset=utf-8'
const CSV_NEWLINE = '\r\n'
const CSV_BOM = '﻿'
const DEFAULT_PARSE_MAX_BYTES = 2 * 1024 * 1024
const DEFAULT_PARSE_MAX_ROWS = 10_000
const DEFAULT_REVOKE_AFTER_MS = 1000
const FILE_NAME_UNSAFE_CHARACTERS = /[\\/:*?"<>|]+/g

export type TCsvValue =
    bigint | boolean | Date | null | number | string | undefined

export type TCsvRow = Readonly<Record<string, TCsvValue>>

export type TCsvOptions = {
    /** Row keys to export, in column order. Defaults to the first row's keys. */
    columns?: readonly string[]
    /** Maps a row key to its header text. Defaults to `csvHeaderFromKey`. */
    formatHeader?: (key: string) => string
}

export type TCsvSection = TCsvOptions & {
    rows: readonly TCsvRow[]
    /** Optional single-cell heading row written above the section. */
    title?: string
}

export type TDownloadCsvOptions = {
    /** Prefix the file with a UTF-8 byte order mark so Excel detects UTF-8. */
    bom?: boolean
    /** Delay before the object URL is revoked, in milliseconds. */
    revokeAfterMs?: number
}

export type TParseCsvFileOptions = {
    /** Maps a lower-cased, trimmed alias header to its canonical header. */
    headerAliases?: Readonly<Record<string, string>>
    maxBytes?: number
    maxRows?: number
    /** Canonical headers the file must provide, matched case-insensitively. */
    requiredHeaders?: readonly string[]
}

export type TParsedCsv = {
    headers: string[]
    rows: Record<string, string>[]
}

export type TParseCsvFileResult =
    | ({ ok: true } & TParsedCsv)
    | {
          code: 'empty' | 'file-too-large' | 'malformed' | 'too-many-rows'
          message: string
          ok: false
      }
    | {
          code: 'missing-headers'
          message: string
          missing: string[]
          ok: false
      }

/**
 * @description
 * Matches text a spreadsheet would evaluate as a formula: a leading `=`, `@`,
 * tab, or carriage return, or a leading `+`/`-` that is not a plain number.
 * Plain negative and positive numerics are spared so exported amounts stay
 * numeric.
 */
export const CSV_FORMULA_PATTERN = /^(?:[=@\t\r]|[+-](?!\d+(?:\.\d+)?$))/

/**
 * @description
 * Turns a row key into header text by replacing underscores with spaces, for
 * example `Order_Id` becomes `Order Id`.
 */
export function csvHeaderFromKey(key: string) {
    return key.replace(/_+/g, ' ').trim()
}

/**
 * @description
 * Serializes rows to CSV text with RFC 4180 quoting. Dates become ISO strings,
 * null and undefined become empty cells, and text that a spreadsheet could
 * evaluate as a formula is prefixed with an apostrophe. Returns an empty string
 * when there are no rows and no explicit columns.
 */
export function toCsv(rows: readonly TCsvRow[], options: TCsvOptions = {}) {
    const columns = options.columns ?? Object.keys(rows[0] ?? {})

    if (columns.length === 0) return ''

    const formatHeader = options.formatHeader ?? csvHeaderFromKey

    const csv = unparse(
        {
            data: rows.map((row) =>
                columns.map((column) => toCsvCell(row[column])),
            ),
            fields: columns.map((column) =>
                neutralizeFormula(formatHeader(column)),
            ),
        },
        { escapeFormulae: false, newline: CSV_NEWLINE },
    )

    return rows.length === 0 ? csv.replace(/(?:\r\n)+$/, '') : csv
}

/**
 * @description
 * Serializes several tables into one CSV text, separated by a single blank
 * line. Sections without columns are skipped.
 */
export function toCsvSections(
    sections: readonly TCsvSection[],
    options: TCsvOptions = {},
) {
    return sections
        .map(({ rows, title, ...sectionOptions }) => {
            const body = toCsv(rows, { ...options, ...sectionOptions })

            if (body === '') return ''
            if (title === undefined) return body

            return `${unparse([[neutralizeFormula(title)]], { newline: CSV_NEWLINE })}${CSV_NEWLINE}${body}`
        })
        .filter((section) => section !== '')
        .join(CSV_NEWLINE + CSV_NEWLINE)
}

/**
 * @description
 * Builds a download name as `<base>_<stamp>.csv`. The base has path and
 * reserved characters replaced and any `.csv` suffix removed; spaces are kept.
 * The stamp defaults to the current UTC time without characters that are
 * invalid in file names.
 */
export function createCsvFileName(base: string, stamp?: string) {
    const safeBase =
        base
            .replace(/\.csv$/i, '')
            .replace(FILE_NAME_UNSAFE_CHARACTERS, '-')
            .trim() || 'export'
    const safeStamp = (stamp ?? new Date().toISOString().replace(/[:.]/g, '-'))
        .replace(FILE_NAME_UNSAFE_CHARACTERS, '-')
        .trim()

    return safeStamp === '' ? `${safeBase}.csv` : `${safeBase}_${safeStamp}.csv`
}

/**
 * @description
 * Downloads CSV text through a temporary `<a download>` link. The file starts
 * with a UTF-8 byte order mark by default, and the object URL is revoked after
 * `revokeAfterMs`. Browser only.
 */
export function downloadCsv(
    csv: string,
    fileName: string,
    {
        bom = true,
        revokeAfterMs = DEFAULT_REVOKE_AFTER_MS,
    }: TDownloadCsvOptions = {},
) {
    const content = bom && !csv.startsWith(CSV_BOM) ? CSV_BOM + csv : csv
    const url = URL.createObjectURL(
        new Blob([content], { type: CSV_MIME_TYPE }),
    )
    const link = document.createElement('a')

    link.href = url
    link.download = fileName
    link.style.display = 'none'
    document.body.append(link)
    link.click()
    link.remove()

    setTimeout(() => URL.revokeObjectURL(url), revokeAfterMs)
}

/**
 * @description
 * Parses CSV text with a header row into string records. Blank lines are
 * skipped, a leading byte order mark is ignored, and the delimiter is always a
 * comma so single-column files parse without delimiter detection.
 */
export function parseCsv(
    text: string,
    transformHeader?: (header: string) => string,
) {
    const result = parse<Record<string, string>>(text, {
        delimiter: ',',
        header: true,
        skipEmptyLines: 'greedy',
        transformHeader,
    })

    return {
        errors: result.errors,
        headers: result.meta.fields ?? [],
        rows: result.data,
    }
}

/**
 * @description
 * Reports whether a file looks like CSV by extension or MIME type.
 */
export function isCsvFile(file: Pick<File, 'name' | 'type'>) {
    return /\.csv$/i.test(file.name) || file.type === 'text/csv'
}

/**
 * @description
 * Reads and validates an uploaded CSV file. Enforces size and row limits,
 * requires headers (resolving aliases and letter case to the canonical name),
 * and rejects malformed rows. Returns a discriminated result and never throws
 * for bad content.
 */
export async function parseCsvFile(
    file: Blob,
    {
        headerAliases = {},
        maxBytes = DEFAULT_PARSE_MAX_BYTES,
        maxRows = DEFAULT_PARSE_MAX_ROWS,
        requiredHeaders = [],
    }: TParseCsvFileOptions = {},
): Promise<TParseCsvFileResult> {
    if (file.size > maxBytes) {
        return {
            code: 'file-too-large',
            message: `The file exceeds the ${maxBytes} byte limit.`,
            ok: false,
        }
    }

    const canonicalHeaders = new Map<string, string>()

    for (const header of requiredHeaders) {
        canonicalHeaders.set(normalizeHeader(header), header)
    }

    for (const [
        alias,
        header,
    ] of Object.entries(headerAliases)) {
        canonicalHeaders.set(normalizeHeader(alias), header)
    }

    const { errors, headers, rows } = parseCsv(await file.text(), (header) => {
        return canonicalHeaders.get(normalizeHeader(header)) ?? header.trim()
    })

    if (errors.length > 0) {
        const [error] = errors
        const location =
            error?.row === undefined ? '' : `Data row ${error.row + 1}: `

        return {
            code: 'malformed',
            message: `${location}${error?.message ?? 'The file is not valid CSV.'}`,
            ok: false,
        }
    }

    if (rows.length === 0) {
        return {
            code: 'empty',
            message: 'The file has no data rows.',
            ok: false,
        }
    }

    if (rows.length > maxRows) {
        return {
            code: 'too-many-rows',
            message: `The file has more than ${maxRows} rows.`,
            ok: false,
        }
    }

    const missing = requiredHeaders.filter(
        (header) => !headers.includes(header),
    )

    if (missing.length > 0) {
        return {
            code: 'missing-headers',
            message: `Missing required columns: ${missing.join(', ')}.`,
            missing,
            ok: false,
        }
    }

    return { headers, ok: true, rows }
}

function neutralizeFormula(value: string) {
    return CSV_FORMULA_PATTERN.test(value) ? `'${value}` : value
}

function normalizeHeader(header: string) {
    return header.trim().toLowerCase()
}

function toCsvCell(value: TCsvValue) {
    if (value === null || value === undefined) return ''
    if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? '' : value.toISOString()
    }
    if (typeof value === 'string') return neutralizeFormula(value)

    return String(value)
}
