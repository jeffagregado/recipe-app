import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { test as base, expect, type Page } from '@playwright/test';
import { eq } from '../apps/api/node_modules/drizzle-orm/index.js';
import { drizzle } from '../apps/api/node_modules/drizzle-orm/node-postgres/index.js';
import type { NodePgClient } from '../apps/api/node_modules/drizzle-orm/node-postgres/session.js';
import * as schema from '../apps/api/src/database/schema.js';
import type { DrizzleDb } from '../apps/api/src/database/database.service.js';
import type { openDemoTemplate } from '../apps/api/test/demo-template-storage.js';
import { getDevDatabaseUrl } from '../apps/api/test/neon-dev.js';
import { field, recipeCards, waitHydrated } from './create-recipe-helpers.js';
import { WEB_URL } from './fixtures.js';
import { loadAuthHarness, loadDemoTemplate } from './load-auth-harness.js';

/**
 * The demo site end to end (issue #114), run by playwright.demo.config.ts against servers with DEMO_MODE on. It seeds the
 * small test Demo template; CI runs it after the integration suite, whose busy test briefly fills every live demo slot.
 */

const requireApi = createRequire(resolve('apps/api/package.json'));
const pg = requireApi('pg') as { Pool: new (options: { connectionString: string; ssl: { rejectUnauthorized: true }; max: number; connectionTimeoutMillis: number }) => NodePgClient & { end: () => Promise<void> } };

type Demo = {
  db: DrizzleDb;
  address: string;
  /** The Demo account the browser is signed in to. It is deleted after the run. */
  accountId: (page: Page) => Promise<string>;
};

const test = base.extend<Record<never, never>, { demo: Demo }>({
  demo: [async ({}, use) => {
    const { testAddress } = await loadAuthHarness();
    const { openDemoTemplate: open } = await loadDemoTemplate();
    const pool = new pg.Pool({ connectionString: await getDevDatabaseUrl(), ssl: { rejectUnauthorized: true }, max: 2, connectionTimeoutMillis: 10_000 });
    const db = drizzle(pool, { schema });
    const template: Awaited<ReturnType<typeof openDemoTemplate>> = await open(resolve('apps/api/.env'));
    const name = `e2e-demo-${randomUUID()}`;
    const address = testAddress();
    const started = new Set<string>();
    try {
      await template.seed(db, name);
      await use({
        db, address,
        accountId: async (page) => {
          const response = await page.request.get('/backend/auth/session');
          expect(response.status()).toBe(200);
          const { user } = await response.json() as { user: { id: string } };
          started.add(user.id);
          return user.id;
        },
      });
    } finally {
      try {
        const removed = await template.removeAccounts(db, [...started], [address]);
        await template.remove(db, name);
        console.log(`Demo E2E cleanup: accounts=${removed.accounts} objects=${removed.objects} failed=${removed.failed}`);
        if (removed.failed) throw new Error('Copied demo photos were not all deleted.');
      } finally {
        await template.close();
        await pool.end();
      }
    }
  // The shared fixtures' limits (e2e/fixtures.ts), which also open a pool and seed rows before the first test.
  }, { scope: 'worker', timeout: 90_000 }],
  context: async ({ context, demo }, use) => {
    await context.setExtraHTTPHeaders({ 'X-Forwarded-For': demo.address });
    await use(context);
  },
});

const card = (page: Page, title: string) => recipeCards(page).filter({ has: page.getByRole('heading', { name: title, exact: true }) });
const banner = (page: Page) => page.getByRole('region', { name: 'Demo' });
/**
 * Start demo copies the Demo template in one transaction and each of its photos in storage; a reset also signs out and
 * reloads the page. Measured over the local link to Neon: start 5.5 to 11 s, save 7 s, reset 28 s. CI runners are in
 * another region from Neon too, so these steps wait longer than the default.
 */
const DEMO_WRITE_MS = 60_000;
const AUTH_PAGES = ['/auth/login', '/check-email', '/verify-email', '/verify-email/invalid', '/forgot-password', '/reset-password', '/confirm-email-change'];

async function expectTemplateRecipes(page: Page) {
  await expect(page).toHaveURL(`${WEB_URL}/recipes`);
  await expect(banner(page)).toContainText('You are using the Recapp demo.');
  await expect(card(page, 'Template pancakes')).toBeVisible();
  await expect(card(page, 'Template salad')).toBeVisible();
  await expect(recipeCards(page)).toHaveCount(2);
}

test('a visitor starts a demo, edits a sample recipe and resets into a fresh account', async ({ page, demo }) => {
  for (const path of AUTH_PAGES) {
    await page.goto(path);
    await expect(page, `${path} leads to the start page`).toHaveURL(`${WEB_URL}/`);
  }
  await expect(page.getByRole('heading', { level: 1, name: 'Try Recapp' })).toBeVisible();
  const start = page.getByRole('button', { name: 'Start demo' });
  await waitHydrated(start);
  await start.click();
  await expect(page).toHaveURL(`${WEB_URL}/recipes`, { timeout: DEMO_WRITE_MS });
  await expectTemplateRecipes(page);
  const first = await demo.accountId(page);

  await card(page, 'Template salad').getByRole('link', { name: 'Template salad' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Template salad' })).toBeVisible();
  await page.getByRole('button', { name: 'More options for Template salad' }).click();
  await page.getByRole('menuitem', { name: 'Edit recipe' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Edit Recipe' })).toBeVisible();
  await waitHydrated(page.getByRole('form', { name: 'Edit Recipe' }));
  await field.title(page).fill('My demo salad');
  await page.getByRole('button', { name: 'Save Changes' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'My demo salad' })).toBeVisible({ timeout: DEMO_WRITE_MS });

  await page.getByRole('link', { name: 'Back to Recipes' }).click();
  await expect(card(page, 'My demo salad')).toBeVisible();
  const reset = banner(page).getByRole('button', { name: 'Reset demo' });
  await waitHydrated(reset);
  await reset.click();
  await page.getByRole('alertdialog', { name: 'Reset the demo?' }).getByRole('button', { name: 'Reset demo' }).click();
  // The renamed salad exists only in the old account, so its original title marks the fresh one.
  await expect(card(page, 'Template salad')).toBeVisible({ timeout: DEMO_WRITE_MS });
  await expectTemplateRecipes(page);
  await expect(card(page, 'My demo salad')).toHaveCount(0);
  const second = await demo.accountId(page);
  expect(second).not.toBe(first);

  // An expired Demo account's session is refused like any other, which leads back to the start page.
  await demo.db.delete(schema.authSessions).where(eq(schema.authSessions.userId, second));
  await page.goto('/recipes');
  await expect(page).toHaveURL(`${WEB_URL}/`);
  await expect(page.getByRole('button', { name: 'Start demo' })).toBeVisible();
});
