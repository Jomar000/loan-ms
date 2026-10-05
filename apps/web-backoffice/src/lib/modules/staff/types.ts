import { staff } from '@loanms/validator/backoffice/admin/user'
import type { z } from 'zod'

export type StaffPage = Extract<
    z.output<typeof staff.readManyOutputSchema>,
    { success: true }
>
export type StaffMember = StaffPage['data'][number]
export type StaffRole = z.output<typeof staff.manageableStaffRoleSchema>
