import { defineConfig } from '@playwright/test';
import base from './playwright.config';

type WebServer = Extract<NonNullable<typeof base.webServer>, unknown[]>[number];

/**
 * The live demo site (issue #112): the same servers as playwright.config.ts with DEMO_MODE on, and only the `.demo.ts`
 * journeys. Static pages and the auth redirects are fixed at build time, so build the web app with DEMO_MODE=true first.
 * The demo API refuses to start with a mail key, so a key in the env file is blanked here.
 */
export default defineConfig({
  ...base,
  testMatch: '**/*.demo.ts',
  // One journey of three slow steps (start, save, reset), which took 55 s in all over the local link to Neon.
  timeout: 180_000,
  projects: base.projects?.filter(({ name }) => name === 'chromium'),
  webServer: (base.webServer as WebServer[]).map((server) => ({
    ...server,
    env: { ...server.env, DEMO_MODE: 'true', ...(server.name === 'recipe-api' ? { RESEND_API_KEY: '' } : {}) },
  })),
});
