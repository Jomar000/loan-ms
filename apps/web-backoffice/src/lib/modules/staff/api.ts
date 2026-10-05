import { staff } from '@loanms/validator/backoffice/admin/user'

import { adminClient } from '$lib/clients'
import type { StaffMember, StaffPage, StaffRole } from './types'

export async function fetchStaff(request: {
    limit: number
    offset: number
}): Promise<StaffPage> {
    const input = staff.readManyInputSchema.parse({
        ...request,
        sortOrder: 'asc',
    })
    const responseJson = await (
        await adminClient.user.staff.readMany.$query({
            json: input,
        })
    ).json()
    if (!responseJson.success) throw new Error(responseJson.error.message)
    return responseJson
}

export async function updateStaffAccess(input: {
    isLocked: boolean
    userPublicId: string
}): Promise<StaffMember> {
    const request = staff.updateAccessInputSchema.parse(input)
    const responseJson = await (
        await adminClient.user.staff.access.$post({ json: request })
    ).json()
    if (!responseJson.success) throw new Error(responseJson.error.message)
    return responseJson.data
}

export async function updateStaffRole(input: {
    role: StaffRole
    userPublicId: string
}): Promise<StaffMember> {
    const request = staff.updateRoleInputSchema.parse(input)
    const responseJson = await (
        await adminClient.user.staff.role.$post({ json: request })
    ).json()
    if (!responseJson.success) throw new Error(responseJson.error.message)
    return responseJson.data
}
