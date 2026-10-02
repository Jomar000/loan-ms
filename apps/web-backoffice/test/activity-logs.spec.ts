import { expect, test, type Page } from '@playwright/test'

const EVENT_ID = '019fc1a5-caf8-76f1-8f19-e873e77f86ec'
const LOGGED_AT = '2026-09-03T08:30:00.000Z'

test('owner filters activity and opens formatted detail by keyboard', async ({
    page,
}) => {
    await mockBackofficeApi(page, 'owner')
    await page.goto('/app/owner/activity-logs')

    for (const label of [
        'All Activity',
        'Account & Profile',
        'Storage & Notifications',
        'Access & Security',
    ]) {
        await expect(page.getByText(label, { exact: true })).toBeVisible()
    }
    await expect(page).toHaveURL(/dateFrom=/)
    await expect(page.getByLabel('Date from')).toHaveValue(/T00:00$/)
    await expect(page.getByLabel('Date to')).toHaveValue(/T23:59$/)
    await expect(
        page.getByRole('columnheader', { name: 'Date and time' }),
    ).toBeVisible()
    await expect(
        page.getByRole('columnheader', { name: 'Activity' }),
    ).toBeVisible()
    await expect(
        page.getByRole('columnheader', { name: 'Actor' }),
    ).toBeVisible()
    await expect(
        page.getByRole('columnheader', { name: 'Event ID' }),
    ).toHaveCount(0)
    await expect(
        page.getByRole('columnheader', { name: 'Affected records' }),
    ).toHaveCount(0)
    await expect(page.getByLabel('Date from')).toHaveCSS('min-width', '288px')
    await expect(page.getByLabel('Date to')).toHaveCSS('min-width', '288px')
    await expect(page.getByLabel('IP address filter')).toHaveCount(0)

    const row = page
        .getByRole('row')
        .filter({ hasText: 'User profile updated' })
    await expect(row.getByText('User profile updated')).toHaveCSS(
        'font-weight',
        '600',
    )
    await expect(row.getByText('update', { exact: true })).toHaveCSS(
        'font-size',
        '12px',
    )
    await expect(row.getByText('Owner', { exact: true })).toBeVisible()
    await expect(row.getByText('User', { exact: true })).toHaveCount(0)
    await expect(row.locator('[data-slot="badge"]')).toHaveCount(0)
    await row.focus()
    await row.press('Enter')
    const sheet = page.getByRole('dialog', { name: 'Activity details' })
    await expect(sheet).toBeVisible()
    await expect(sheet.getByText(EVENT_ID)).toBeVisible()
    await expect(sheet.getByText('Before')).toBeVisible()
    await expect(
        sheet.getByText('Updated', { exact: true }).last(),
    ).toBeVisible()
    await expect(sheet.getByText('Snapshot not recorded.')).toBeVisible()

    await sheet.getByRole('button', { name: 'Close' }).click()
    await page.getByText('Storage & Notifications', { exact: true }).click()
    await expect(page).toHaveURL(/group=storageNotifications/)
    await expect(page.getByText('No activity found')).toBeVisible()
})

test('admin restores Activity Logs state from the URL', async ({ page }) => {
    const api = await mockBackofficeApi(page, 'admin')
    await page.goto(
        '/app/admin/activity-logs?group=accountProfile&searchFilter=192.0.2.10&sortOrder=asc&page=2&pageSize=50&filter=components:is:user.profile',
    )

    await expect(
        page.getByRole('button', { name: /Account & Profile/ }),
    ).toHaveAttribute('aria-pressed', 'true')
    await expect(
        page.getByPlaceholder(
            'Search activity, actor, event ID, record, or IP',
        ),
    ).toHaveValue('192.0.2.10')
    await expect(page.getByLabel('Sort order')).toHaveValue('asc')
    await expect(page.getByLabel('Rows per page')).toHaveValue('50')
    await expect
        .poll(() => api.readManyInputs.at(-1))
        .toMatchObject({
            filters: {
                components: { include: ['user.profile'] },
                group: 'accountProfile',
                searchFilter: '192.0.2.10',
            },
            limit: 50,
            offset: 50,
            sortOrder: 'asc',
        })
})

test('shows loading and terminal error states with retry', async ({ page }) => {
    const api = await mockBackofficeApi(page, 'owner', {
        listMode: 'delayed',
    })
    await page.goto('/app/owner/activity-logs')

    await expect(page.getByLabel('Refreshing')).toBeVisible()
    api.releaseList()
    await expect(page.getByText('User profile updated')).toBeVisible()

    await page.unrouteAll({ behavior: 'wait' })
    await mockBackofficeApi(page, 'owner', { listMode: 'error' })
    await page.reload()
    await expect(page.getByText('Unable to load activity')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible()
})

test('distinguishes unavailable summary counts from an empty summary', async ({
    page,
}) => {
    await mockBackofficeApi(page, 'owner', { summaryFails: true })
    await page.goto('/app/owner/activity-logs')

    await expect(
        page.getByText('Activity summary is unavailable.'),
    ).toBeVisible()
    await expect(
        page.getByRole('button', { name: 'Retry summary' }),
    ).toBeVisible()
})

test('keeps stale rows visible when a filtered refresh fails', async ({
    page,
}) => {
    await mockBackofficeApi(page, 'owner', { storageFails: true })
    await page.goto('/app/owner/activity-logs')
    await expect(page.getByText('User profile updated')).toBeVisible()

    await page.getByText('Storage & Notifications', { exact: true }).click()

    await expect(
        page.getByText(
            'Latest refresh failed. Previously loaded events are still shown.',
        ),
    ).toBeVisible()
    await expect(page.getByText('User profile updated')).toBeVisible()
})

test('keeps primary columns visible on a narrow screen and moves metadata into detail', async ({
    page,
}) => {
    await page.setViewportSize({ width: 600, height: 900 })
    await mockBackofficeApi(page, 'owner')
    await page.goto('/app/owner/activity-logs')

    await expect(
        page.getByRole('columnheader', { name: 'Date and time' }),
    ).toBeVisible()
    await expect(
        page.getByRole('columnheader', { name: 'Activity' }),
    ).toBeVisible()
    await expect(
        page.getByRole('columnheader', { name: 'Actor' }),
    ).toBeVisible()
    await expect(
        page.getByRole('columnheader', { name: 'Module' }),
    ).toBeHidden()
    await expect(
        page.getByRole('columnheader', { name: 'Event ID' }),
    ).toHaveCount(0)
    await expect(
        page.getByRole('columnheader', { name: 'Source / IP' }),
    ).toBeHidden()

    await page
        .getByRole('row')
        .filter({ hasText: 'User profile updated' })
        .click()
    const sheet = page.getByRole('dialog', { name: 'Activity details' })
    await expect(sheet.getByText('User · Profile')).toBeVisible()
    await expect(sheet.getByText('owner@example.com')).toBeVisible()
    await expect(sheet.getByText(/User session · 192\.0\.2\.1/)).toBeVisible()
    await expect(sheet.getByText('Playwright')).toBeVisible()
})

test('member navigation does not expose Activity Logs', async ({ page }) => {
    await mockBackofficeApi(page, 'member')
    await page.goto('/app/member/dashboard')

    await expect(page.getByRole('link', { name: 'Activity Logs' })).toHaveCount(
        0,
    )
})

async function mockBackofficeApi(
    page: Page,
    role: 'admin' | 'member' | 'owner',
    options: {
        storageFails?: boolean
        listMode?: 'delayed' | 'error' | 'success'
        summaryFails?: boolean
    } = {},
) {
    const currentEpochSeconds = Math.floor(Date.now() / 1_000)
    const readManyInputs: unknown[] = []
    let releaseListRequest: () => void = () => undefined
    const listGate = new Promise<void>((resolve) => {
        releaseListRequest = resolve
    })
    await page.route('http://localhost:8080/api/**', async (route) => {
        const request = route.request()
        const pathname = new URL(request.url()).pathname

        if (pathname === '/api/heartbeat') {
            await route.fulfill({ status: 200, json: { status: 'up' } })
            return
        }
        if (pathname === '/api/auth/session') {
            await route.fulfill({
                status: 200,
                json: {
                    success: true,
                    data: {
                        avatar: '',
                        email: `${role}@example.com`,
                        expiresAt: currentEpochSeconds + 3_600,
                        name: `Test ${role}`,
                        organizationName: 'Test Organization',
                        organizationSlug: 'test-organization',
                        refreshAt: currentEpochSeconds + 1_800,
                        userRoles: [role],
                    },
                },
            })
            return
        }
        if (pathname === '/api/auditTrail/summary') {
            if (options.summaryFails) {
                await route.fulfill({
                    status: 500,
                    json: {
                        success: false,
                        error: { message: 'Activity summary failed.' },
                    },
                })
                return
            }
            await route.fulfill({
                status: 200,
                json: {
                    success: true,
                    data: {
                        accessSecurity: 1,
                        all: 2,
                        accountProfile: 1,
                        storageNotifications: 0,
                    },
                },
            })
            return
        }
        if (pathname === '/api/auditTrail/readMany') {
            const input = request.postDataJSON() as {
                filters?: { group?: string }
            }
            readManyInputs.push(input)
            if (options.listMode === 'delayed') await listGate
            if (
                options.listMode === 'error' ||
                (options.storageFails &&
                    input.filters?.group === 'storageNotifications')
            ) {
                await route.fulfill({
                    status: 500,
                    json: {
                        success: false,
                        error: { message: 'Activity retrieval failed.' },
                    },
                })
                return
            }
            const data =
                input.filters?.group === 'storageNotifications'
                    ? []
                    : [
                          {
                              action: 'update',
                              actor: {
                                  displayName: 'Test Owner',
                                  identifier: 'owner@example.com',
                                  role: 'owner',
                                  type: 'user',
                              },
                              component: 'user.profile',
                              description: 'User profile updated',
                              ipAddress: '192.0.2.1',
                              loggedAt: LOGGED_AT,
                              publicId: EVENT_ID,
                              records: [
                                  {
                                      code: 'USR-00000001',
                                      entityType: 'user_profile',
                                      id: 'profile-public-id',
                                      label: 'Updated',
                                  },
                              ],
                              sourceChannel: 'User session',
                          },
                      ]
            await route.fulfill({
                status: 200,
                json: {
                    success: true,
                    count: data.length,
                    data,
                    limit: 25,
                    offset: 0,
                },
            })
            return
        }
        if (pathname === `/api/auditTrail/${EVENT_ID}`) {
            await route.fulfill({
                status: 200,
                json: {
                    success: true,
                    data: {
                        action: 'update',
                        actor: {
                            displayName: 'Test Owner',
                            identifier: 'owner@example.com',
                            role: 'owner',
                            type: 'user',
                        },
                        component: 'user.profile',
                        description: 'User profile updated',
                        ipAddress: '192.0.2.1',
                        loggedAt: LOGGED_AT,
                        publicId: EVENT_ID,
                        records: [
                            {
                                changes: [
                                    {
                                        after: 'Updated',
                                        before: 'Before',
                                        field: 'firstName',
                                        label: 'First Name',
                                    },
                                ],
                                code: 'USR-00000001',
                                entityType: 'user_profile',
                                id: 'profile-public-id',
                                label: 'Updated',
                                snapshot: [],
                                snapshotRecorded: true,
                            },
                            {
                                changes: [],
                                code: null,
                                entityType: 'user_address',
                                id: 'legacy-address-id',
                                label: null,
                                snapshot: [],
                                snapshotRecorded: false,
                            },
                        ],
                        sourceChannel: 'User session',
                        userAgent: 'Playwright',
                    },
                },
            })
            return
        }

        await route.fulfill({
            status: 404,
            json: { success: false, error: { message: 'Not mocked.' } },
        })
    })

    return {
        readManyInputs,
        releaseList: releaseListRequest,
    }
}

// =============================================================================
// END OF BASE TEMPLATE TESTS - FORK-SPECIFIC TESTS MUST BE ADDED BELOW
// =============================================================================
