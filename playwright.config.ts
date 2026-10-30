import { defineConfig, devices } from '@playwright/test';

// TEST_WEB_SECRET in apps/api/test/test-web-secret.ts, which the test callers send. It is written out here because this
// config loads as CommonJS: importing that file here would leave the workers' later imports of it without named exports.
const TEST_WEB_SECRET = 'test-only-web-secret-not-used-anywhere-real';

const webUrl = 'http://127.0.0.1:4100';
const apiUrl = 'http://127.0.0.1:4101';

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  // One worker per core of the CI runner. Trialled in #18 over consecutive green runs: Playwright 5.3 to 6.0 minutes
  // against 9 to 12 on 2 workers. Each worker signs up its own owner from its own address.
  workers: process.env.CI ? 4 : undefined,
  // Browser action steps can contain form values; keep only the value-free list output. The html reporter writes
  // every typed value, passwords included, into its step titles.
  reporter: [['list']],
  outputDir: './test-results',
  // The e2e job is killed at 45 minutes, which would lose the failure screenshots. Playwright stops itself first:
  // it starts about 1.5 minutes into the job and normally runs 5 to 6, so 35 leaves 8 for the upload.
  globalTimeout: process.env.CI ? 35 * 60_000 : undefined,
  // CI runners are in another region from the database, so a login or save can take longer than the default five seconds.
  // The longer waits change how long an assertion may take to become true, not what it asserts.
  timeout: process.env.CI ? 120_000 : 60_000,
  expect: { timeout: process.env.CI ? 15_000 : 5_000 },
  use: {
    baseURL: webUrl,
    // Auth cookies and form credentials must not be written to trace artifacts.
    trace: 'off',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'] } },
    { name: 'mobile-webkit', use: { ...devices['iPhone 13'] } },
  ],
  webServer: [
    {
      name: 'recipe-api',
      command: 'pnpm --filter @recipe/api run test:server',
      url: `${apiUrl}/api/auth/ok`,
      // The server records its mail and serves it on MAIL_READER_PORT: the tests read each link there (e2e/fixtures.ts).
      // Both servers share the test secret, so the API trusts the client IP the web app names and each worker keeps its
      // own rate-limit bucket. The process environment overrides the env files.
      env: { PORT: '4101', MAIL_READER_PORT: '4102', RECIPE_WEB_PROXY_SECRET: TEST_WEB_SECRET },
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      name: 'recipe-web',
      command: 'pnpm --filter @recipe/web exec next start --hostname 127.0.0.1 --port 4100',
      url: `${webUrl}/`,
      env: { RECIPE_API_URL: apiUrl, RECIPE_WEB_PROXY_SECRET: TEST_WEB_SECRET },
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
