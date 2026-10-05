import * as loanCalculationValidator from '@loanms/validator/backoffice/loanCalculation'
import * as settingsValidator from '@loanms/validator/backoffice/settings'

import { settingsClient } from '$lib/clients'
import type {
    FormulaProfile,
    FormulaProfileCreateInput,
    FormulaProfilePreview,
    FormulaProfilePreviewInput,
    SystemSettings,
    SystemSettingsUpdateInput,
} from './types'

export async function fetchFormulaProfiles(
    options: {
        isActive?: boolean
    } = {},
): Promise<FormulaProfile[]> {
    const input =
        loanCalculationValidator.formulaProfileReadManyInputSchema.parse({
            filters: options,
            limit: 100,
            offset: 0,
            sortOrder: 'desc',
        })
    const responseJson = await (
        await settingsClient.formulaProfile.readMany.$query({ json: input })
    ).json()
    if (!responseJson.success) throw new Error(responseJson.error.message)
    const parsed =
        loanCalculationValidator.formulaProfileReadManyOutputSchema.parse(
            responseJson,
        )
    if (!parsed.success) throw new Error(parsed.error.message)
    return parsed.data
}

export async function createFormulaProfile(
    input: FormulaProfileCreateInput,
): Promise<FormulaProfile> {
    const parsed =
        loanCalculationValidator.formulaProfileCreateInputSchema.parse(input)
    const responseJson = await (
        await settingsClient.formulaProfile.create.$post({ json: parsed })
    ).json()
    if (!responseJson.success) throw new Error(responseJson.error.message)
    const output =
        loanCalculationValidator.formulaProfileOutputSchema.parse(responseJson)
    if (!output.success) throw new Error(output.error.message)
    return output.data
}

export async function createFormulaProfileVersion(
    publicId: string,
    input: FormulaProfileCreateInput,
): Promise<FormulaProfile> {
    const param = loanCalculationValidator.formulaProfileReadInputSchema.parse({
        publicId,
    })
    const json =
        loanCalculationValidator.formulaProfileVersionInputSchema.parse(input)
    const responseJson = await (
        await settingsClient.formulaProfile[':publicId'].version.$post({
            json,
            param,
        })
    ).json()
    if (!responseJson.success) throw new Error(responseJson.error.message)
    const output =
        loanCalculationValidator.formulaProfileOutputSchema.parse(responseJson)
    if (!output.success) throw new Error(output.error.message)
    return output.data
}

export async function activateFormulaProfile(
    publicId: string,
    isDefault: boolean,
): Promise<FormulaProfile> {
    const param = loanCalculationValidator.formulaProfileReadInputSchema.parse({
        publicId,
    })
    const json =
        loanCalculationValidator.formulaProfileActivateInputSchema.parse({
            isDefault,
        })
    const responseJson = await (
        await settingsClient.formulaProfile[':publicId'].activate.$post({
            json,
            param,
        })
    ).json()
    if (!responseJson.success) throw new Error(responseJson.error.message)
    const output =
        loanCalculationValidator.formulaProfileOutputSchema.parse(responseJson)
    if (!output.success) throw new Error(output.error.message)
    return output.data
}

export async function retireFormulaProfile(
    publicId: string,
): Promise<FormulaProfile> {
    const param = loanCalculationValidator.formulaProfileReadInputSchema.parse({
        publicId,
    })
    const responseJson = await (
        await settingsClient.formulaProfile[':publicId'].retire.$post({ param })
    ).json()
    if (!responseJson.success) throw new Error(responseJson.error.message)
    const output =
        loanCalculationValidator.formulaProfileOutputSchema.parse(responseJson)
    if (!output.success) throw new Error(output.error.message)
    return output.data
}

export async function previewFormulaProfile(
    input: FormulaProfilePreviewInput,
): Promise<FormulaProfilePreview> {
    const json =
        loanCalculationValidator.loanCalculationPreviewInputSchema.parse(input)
    const responseJson = await (
        await settingsClient.formulaProfile.preview.$post({ json })
    ).json()
    if (!responseJson.success) throw new Error(responseJson.error.message)
    return loanCalculationValidator.loanCalculationPreviewOutputSchema.parse(
        responseJson,
    ).data
}

export async function fetchSystemSettings(): Promise<SystemSettings> {
    const responseJson = await (await settingsClient.current.$get()).json()
    if (!responseJson.success) throw new Error(responseJson.error.message)
    return settingsValidator.systemSettingsOutputSchema.parse(responseJson.data)
}

export async function updateSystemSettings(
    request: SystemSettingsUpdateInput,
): Promise<SystemSettings> {
    const input =
        settingsValidator.systemSettingsUpdateInputSchema.parse(request)
    const responseJson = await (
        await settingsClient.update.$post({ json: input })
    ).json()
    if (!responseJson.success) throw new Error(responseJson.error.message)
    return settingsValidator.systemSettingsOutputSchema.parse(responseJson.data)
}
