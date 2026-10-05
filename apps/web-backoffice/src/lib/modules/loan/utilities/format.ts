export function formatCurrency(valueMinor: number): string {
    return new Intl.NumberFormat('en-PH', {
        currency: 'PHP',
        maximumFractionDigits: 2,
        minimumFractionDigits: 2,
        style: 'currency',
    }).format(valueMinor / 100)
}

export function formatDate(value: string | null): string {
    if (!value) return 'Not released'

    return new Intl.DateTimeFormat('en-PH', {
        dateStyle: 'medium',
    }).format(new Date(value))
}

export function toMinorUnits(value: number | string): number | null {
    const normalized = String(value).trim()
    if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null

    const [
        whole,
        fraction = '',
    ] = normalized.split('.')
    return Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
}

export function toPercent(valueBasisPoints: number): string {
    return `${(valueBasisPoints / 100).toLocaleString('en-PH', {
        maximumFractionDigits: 2,
    })}%`
}
