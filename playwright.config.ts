import { defineConfig, devices } from '@playwright/test';

const webUrl = 'http://127.0.0.1:4100';
const apiUrl = 'http://127.0.0.1:4101';

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  workers: process.env.CI ? 4 : undefined,
  // Browser action steps can contain form values; keep only the value-free list output. The html reporter writes
  // every typed value, passwords included, into its step titles.
  reporter: [['list']],
  outputDir: './test-results',
  // The e2e job is killed at 45 minutes, which would lose the failure screenshots. Playwright stops itself first:
  // it starts about 1.5 minutes into the job and normally runs 10 to 12, so 35 leaves 8 for the upload and the
  // Neon branch deletion.
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
      env: { PORT: '4101' },
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      name: 'recipe-web',
      command: 'pnpm --filter @recipe/web exec next start --hostname 127.0.0.1 --port 4100',
      url: `${webUrl}/`,
      env: { RECIPE_API_URL: apiUrl },
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
