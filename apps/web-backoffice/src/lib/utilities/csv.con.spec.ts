import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
    CSV_FORMULA_PATTERN,
    createCsvFileName,
    csvHeaderFromKey,
    downloadCsv,
    isCsvFile,
    parseCsv,
    parseCsvFile,
    toCsv,
    toCsvSections,
} from './csv'

describe('csvHeaderFromKey', () => {
    it('replaces underscores with spaces', () => {
        expect(csvHeaderFromKey('Order_Id')).toBe('Order Id')
        expect(csvHeaderFromKey('total__amount_')).toBe('total amount')
        expect(csvHeaderFromKey('status')).toBe('status')
    })
})

describe('CSV_FORMULA_PATTERN', () => {
    it.each([
        '=1+1',
        '@SUM(A1)',
        '+cmd',
        '-cmd',
        '\tcmd',
        '\rcmd',
        '-1+2',
    ])('flags %j', (value) => {
        expect(CSV_FORMULA_PATTERN.test(value)).toBe(true)
    })

    it.each([
        'plain',
        'a=b',
        '-12',
        '+3.5',
        '-0.5',
        '',
    ])('spares %j', (value) => {
        expect(CSV_FORMULA_PATTERN.test(value)).toBe(false)
    })
})

describe('toCsv', () => {
    it('quotes fields without altering their content', () => {
        expect(
            toCsv([
                {
                    name: 'Doe, John',
                    note: 'said "hi"\nagain',
                },
            ]),
        ).toBe('name,note\r\n"Doe, John","said ""hi""\nagain"')
    })

    it('formats headers, dates, and empty values', () => {
        expect(
            toCsv([
                {
                    Order_Id: 7,
                    created_at: new Date('2026-09-29T01:02:03.000Z'),
                    missing: null,
                    voided: undefined,
                    paid: false,
                    invalid: new Date(Number.NaN),
                },
            ]),
        ).toBe(
            'Order Id,created at,missing,voided,paid,invalid\r\n7,2026-09-29T01:02:03.000Z,,,false,',
        )
    })

    it('neutralizes formulas in text and headers but keeps numbers intact', () => {
        expect(
            toCsv([
                { '=header': '=1+1', amount: -12.5, text: '-12', memo: '-x' },
            ]),
        ).toBe("'=header,amount,text,memo\r\n'=1+1,-12.5,-12,'-x")
    })

    it('honors explicit columns and a custom header formatter', () => {
        expect(
            toCsv([{ a: 1, b: 2, c: 3 }], {
                columns: [
                    'c',
                    'a',
                ],
                formatHeader: (key) => key.toUpperCase(),
            }),
        ).toBe('C,A\r\n3,1')
    })

    it('returns an empty string without rows or columns and a header row with columns', () => {
        expect(toCsv([])).toBe('')
        expect(
            toCsv([], {
                columns: [
                    'a',
                    'b',
                ],
            }),
        ).toBe('a,b')
    })
})

describe('toCsvSections', () => {
    it('joins sections with one blank line and skips empty ones', () => {
        expect(
            toCsvSections([
                { rows: [{ a: 1 }], title: 'First' },
                { rows: [] },
                { rows: [{ b: 2 }] },
            ]),
        ).toBe('First\r\na\r\n1\r\n\r\nb\r\n2')
    })
})

describe('createCsvFileName', () => {
    it('builds a safe name and keeps spaces', () => {
        expect(createCsvFileName('Sales Report.csv', '20260929')).toBe(
            'Sales Report_20260929.csv',
        )
        expect(createCsvFileName('a/b:c', '2026-09-29')).toBe(
            'a-b-c_2026-09-29.csv',
        )
        expect(createCsvFileName('  ', '1')).toBe('export_1.csv')
    })

    it('defaults to a file-system-safe timestamp', () => {
        expect(createCsvFileName('orders')).toMatch(
            /^orders_\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z\.csv$/,
        )
    })
})

describe('downloadCsv', () => {
    const click = vi.fn()
    const remove = vi.fn()
    const append = vi.fn()
    let anchor: {
        click: typeof click
        download: string
        href: string
        remove: typeof remove
        style: Record<string, string>
    }
    let blobs: Blob[]

    beforeEach(() => {
        vi.useFakeTimers()
        blobs = []
        anchor = { click, download: '', href: '', remove, style: {} }
        vi.stubGlobal('document', {
            body: { append },
            createElement: vi.fn(() => anchor),
        })
        vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
            blobs.push(blob as Blob)
            return 'blob:test'
        })
        vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
    })

    afterEach(() => {
        vi.useRealTimers()
        vi.unstubAllGlobals()
        vi.restoreAllMocks()
        vi.clearAllMocks()
    })

    async function readBytes(blob: Blob | undefined) {
        return [...new Uint8Array((await blob?.arrayBuffer()) ?? [])]
    }

    it('clicks a download link with the exact file name and a UTF-8 BOM', async () => {
        downloadCsv('a,b', 'Sales Report_1.csv')

        expect(anchor.download).toBe('Sales Report_1.csv')
        expect(anchor.href).toBe('blob:test')
        expect(click).toHaveBeenCalledOnce()
        expect(blobs[0]?.type).toBe('text/csv;charset=utf-8')
        expect((await readBytes(blobs[0])).slice(0, 3)).toEqual([
            0xef,
            0xbb,
            0xbf,
        ])
    })

    it('does not duplicate an existing BOM and can omit it', async () => {
        downloadCsv('﻿a', 'a.csv')
        downloadCsv('a', 'b.csv', { bom: false })

        expect(await readBytes(blobs[0])).toEqual([
            0xef,
            0xbb,
            0xbf,
            0x61,
        ])
        expect(await readBytes(blobs[1])).toEqual([0x61])
    })

    it('revokes the object URL after the configured delay', () => {
        downloadCsv('a', 'a.csv', { revokeAfterMs: 500 })

        vi.advanceTimersByTime(499)
        expect(URL.revokeObjectURL).not.toHaveBeenCalled()

        vi.advanceTimersByTime(1)
        expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test')
    })
})

describe('parseCsv', () => {
    it('parses records, skips blank lines, and ignores a BOM', () => {
        const result = parseCsv('﻿name,qty\r\nTea,2\r\n\r\n  \r\nCoffee,3\r\n')

        expect(result.errors).toEqual([])
        expect(result.headers).toEqual([
            'name',
            'qty',
        ])
        expect(result.rows).toEqual([
            { name: 'Tea', qty: '2' },
            { name: 'Coffee', qty: '3' },
        ])
    })

    it('parses single-column files without delimiter detection errors', () => {
        const result = parseCsv('name\nTea\nCoffee')

        expect(result.errors).toEqual([])
        expect(result.rows).toEqual([
            { name: 'Tea' },
            { name: 'Coffee' },
        ])
    })

    it('round-trips quoted fields produced by toCsv', () => {
        const rows = [{ a: 'x, "y"', b: 'line\nbreak' }]

        expect(parseCsv(toCsv(rows)).rows).toEqual(rows)
    })
})

describe('isCsvFile', () => {
    it('accepts by extension or MIME type', () => {
        expect(isCsvFile({ name: 'a.CSV', type: '' })).toBe(true)
        expect(isCsvFile({ name: 'a', type: 'text/csv' })).toBe(true)
        expect(isCsvFile({ name: 'a.xlsx', type: 'application/zip' })).toBe(
            false,
        )
    })
})

describe('parseCsvFile', () => {
    const file = (content: string) =>
        new File([content], 'import.csv', { type: 'text/csv' })

    it('returns records and resolves aliases and letter case', async () => {
        const result = await parseCsvFile(file('Name, QTY\nTea,2\n'), {
            headerAliases: { quantity: 'qty' },
            requiredHeaders: [
                'name',
                'qty',
            ],
        })

        expect(result).toEqual({
            headers: [
                'name',
                'qty',
            ],
            ok: true,
            rows: [{ name: 'Tea', qty: '2' }],
        })
    })

    it('resolves an alias header to its canonical name', async () => {
        const result = await parseCsvFile(file('name,Quantity\nTea,2'), {
            headerAliases: { quantity: 'qty' },
            requiredHeaders: [
                'name',
                'qty',
            ],
        })

        expect(result).toMatchObject({ ok: true, rows: [{ qty: '2' }] })
    })

    it('reads a single-column file', async () => {
        expect(await parseCsvFile(file('name\nTea'))).toMatchObject({
            ok: true,
            rows: [{ name: 'Tea' }],
        })
    })

    it('reports missing required headers', async () => {
        expect(
            await parseCsvFile(file('name\nTea'), {
                requiredHeaders: [
                    'name',
                    'qty',
                ],
            }),
        ).toMatchObject({
            code: 'missing-headers',
            missing: ['qty'],
            ok: false,
        })
    })

    it('rejects empty, oversized, and too-long files', async () => {
        expect(await parseCsvFile(file('name\n'))).toMatchObject({
            code: 'empty',
            ok: false,
        })
        expect(
            await parseCsvFile(file('name\nTea'), { maxBytes: 3 }),
        ).toMatchObject({ code: 'file-too-large', ok: false })
        expect(
            await parseCsvFile(file('name\nA\nB\nC'), { maxRows: 2 }),
        ).toMatchObject({ code: 'too-many-rows', ok: false })
    })

    it('rejects malformed rows', async () => {
        expect(await parseCsvFile(file('name,qty\nTea\n'))).toMatchObject({
            code: 'malformed',
            ok: false,
        })
        expect(await parseCsvFile(file('name,qty\n"Tea,2\n'))).toMatchObject({
            code: 'malformed',
            ok: false,
        })
    })
})

// =============================================================================
// END OF BASE TEMPLATE TESTS - FORK-SPECIFIC TESTS MUST BE ADDED BELOW
// =============================================================================
