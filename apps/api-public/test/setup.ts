import { applyD1Migrations } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { beforeAll } from 'vitest'

type TD1Migration = {
    name: string
    queries: string[]
}

const testEnv = env as Env & {
    HYPERION_DEFAULT_MIGRATIONS: TD1Migration[]
    HYPERION_TEST_MIGRATIONS: TD1Migration[]
}

beforeAll(async () => {
    await applyD1Migrations(
        testEnv.HYPERIONPUB_D1,
        testEnv.HYPERION_DEFAULT_MIGRATIONS,
    )
    await applyD1Migrations(
        testEnv.HYPERIONPUB_D1,
        testEnv.HYPERION_TEST_MIGRATIONS,
        'd1_test_migrations',
    )
})
