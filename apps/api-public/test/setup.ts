import { applyD1Migrations } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { beforeAll } from 'vitest'

type TD1Migration = {
    name: string
    queries: string[]
}

const testEnv = env as Env & {
    LOANMS_DEFAULT_MIGRATIONS: TD1Migration[]
    LOANMS_TEST_MIGRATIONS: TD1Migration[]
}

beforeAll(async () => {
    await applyD1Migrations(
        testEnv.LOANMSPUB_D1,
        testEnv.LOANMS_DEFAULT_MIGRATIONS,
    )
    await applyD1Migrations(
        testEnv.LOANMSPUB_D1,
        testEnv.LOANMS_TEST_MIGRATIONS,
        'd1_test_migrations',
    )
})
