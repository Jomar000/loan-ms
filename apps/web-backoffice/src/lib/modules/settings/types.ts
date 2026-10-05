import type * as loanCalculationValidator from '@loanms/validator/backoffice/loanCalculation'
import type * as settingsValidator from '@loanms/validator/backoffice/settings'
import type { z } from 'zod'

export type FormulaProfile = NonNullable<
    z.output<typeof loanCalculationValidator.formulaProfileOutputSchema>['data']
>
export type FormulaProfileCreateInput = z.output<
    typeof loanCalculationValidator.formulaProfileCreateInputSchema
>
export type FormulaProfileInput = z.output<
    typeof loanCalculationValidator.calculationFormulaProfileInputSchema
>
export type FormulaProfilePreviewInput = z.output<
    typeof loanCalculationValidator.loanCalculationPreviewInputSchema
>
export type FormulaProfilePreview = z.output<
    typeof loanCalculationValidator.loanCalculationPreviewOutputSchema
>['data']

export type SystemSettings = z.output<
    typeof settingsValidator.systemSettingsOutputSchema
>
export type SystemSettingsUpdateInput = z.output<
    typeof settingsValidator.systemSettingsUpdateInputSchema
>
