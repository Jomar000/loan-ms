import { BaseError, type TErrorOptions } from './baseError.js'
import type {
    TErrorDefinition,
    TPublicCode,
    TPublicStatus,
} from './publicCodes.js'

export class AppError extends BaseError {
    public override readonly name = 'AppError'
    public readonly code: TPublicCode
    public readonly definition: TErrorDefinition
    public readonly status: TPublicStatus

    constructor(definition: TErrorDefinition, options: TErrorOptions = {}) {
        super(definition, options)
        this.code = definition.code
        this.definition = definition
        this.status = definition.status
    }
}
