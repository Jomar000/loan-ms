import type { TErrorCategory } from './publicCodes.js'

export type TBaseErrorDetail = {
    category: TErrorCategory
    id: string
    message: string
    retryable: boolean
}

export type TErrorOptions = {
    cause?: unknown
}

export class BaseError extends Error {
    public readonly name: string = 'BaseError'
    public readonly category: TErrorCategory
    public readonly id: string
    public readonly retryable: boolean

    constructor(detail: TBaseErrorDetail, options: TErrorOptions = {}) {
        super(detail.message, { cause: options.cause })
        this.category = detail.category
        this.id = detail.id
        this.retryable = detail.retryable
    }
}
