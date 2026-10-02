import { defineConfig } from '@playwright/test'

const isCI = Boolean(process.env.CI)
const localBaseURL = 'http://127.0.0.1:4174'
const externalBaseURL = process.env.PLAYWRIGHT_BASE_URL?.trim()
const baseURL = externalBaseURL || localBaseURL

export default defineConfig({
    forbidOnly: isCI,
    fullyParallel: true,
    retries: isCI ? 2 : 0,
    tsconfig: './tsconfig.json',
    use: {
        baseURL,
        screenshot: 'only-on-failure',
        trace: 'on-first-retry',
    },
    webServer: externalBaseURL
        ? undefined
        : {
              command:
                  'node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 4174 --strictPort',
              name: 'Public preview',
              reuseExistingServer: !isCI,
              timeout: 30_000,
              url: localBaseURL,
          },
    testDir: 'test',
})
