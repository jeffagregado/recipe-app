import { defineConfig, devices } from '@playwright/test';

const webUrl = 'http://127.0.0.1:4100';
const apiUrl = 'http://127.0.0.1:4101';

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  workers: process.env.CI ? 2 : undefined,
  reporter: [['list'], ['html', { open: 'never' }]],
  outputDir: './test-results',
  timeout: 60_000,
  use: {
    baseURL: webUrl,
    trace: 'retain-on-failure',
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
      url: `${apiUrl}/recipes`,
      env: { PORT: '4101' },
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      name: 'recipe-web',
      command: 'pnpm --filter @recipe/web exec next start --hostname 127.0.0.1 --port 4100',
      url: `${webUrl}/recipes`,
      env: { RECIPE_API_URL: apiUrl },
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
