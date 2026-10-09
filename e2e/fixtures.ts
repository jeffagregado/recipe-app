import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { test as base, expect, type BrowserContext } from '@playwright/test';
import { drizzle } from '../apps/api/node_modules/drizzle-orm/node-postgres/index.js';
import type { NodePgClient } from '../apps/api/node_modules/drizzle-orm/node-postgres/session.js';
import * as schema from '../apps/api/src/database/schema.js';
import type { DrizzleDb } from '../apps/api/src/database/database.service.js';
import type { apiClient, signupUser } from '../apps/api/test/auth-harness.js';
import { getDevDatabaseUrl } from '../apps/api/test/neon-dev.js';
import { seedRecipes } from '../apps/api/src/recipes/seed-recipes.js';
import { loadAuthHarness } from './load-auth-harness.js';

const requireApi = createRequire(resolve('apps/api/package.json'));
const pg = requireApi('pg') as { Pool: new (options: { connectionString: string; ssl: { rejectUnauthorized: true }; max: number; connectionTimeoutMillis: number }) => NodePgClient & { end: () => Promise<void> } };
const API_URL = 'http://127.0.0.1:4101';
export const WEB_URL = 'http://127.0.0.1:4100';
type TestAccount = Awaited<ReturnType<typeof signupUser>> & { tag: string };
type WorkerData = {
  db: DrizzleDb;
  client: ReturnType<typeof apiClient>;
  address: string;
  owner: TestAccount;
  other: TestAccount;
  usernames: string[];
  newUsername: () => string;
  newPassword: () => string;
};

/** Cookie values stay in worker memory and the HttpOnly browser cookie jar. */
async function addSession(context: BrowserContext, cookie: string) {
  const allowed = new Set(['better-auth.session_token', '__Secure-better-auth.session_token']);
  const cookies = cookie.split(';').map((pair) => {
    const index = pair.indexOf('=');
    return { name: pair.slice(0, index).trim(), value: pair.slice(index + 1).trim() };
  }).filter(({ name }) => allowed.has(name));
  if (cookies.length === 0) throw new Error('Temporary API signup did not issue a session cookie.');
  await context.addCookies(cookies.map((cookie) => ({ ...cookie, url: WEB_URL, httpOnly: true, sameSite: 'Lax', secure: cookie.name.startsWith('__Secure-') })));
}

export const authTest = base.extend<Record<never, never>, { workerData: WorkerData }>({
  workerData: [async ({}, use) => {
    const { apiClient, signupUser, insertOwnedRecipes, removeTestData, testAddress, testUsername, testPassword } = await loadAuthHarness();
    let connection: string;
    try { connection = await getDevDatabaseUrl(); } catch { throw new Error('Could not resolve the approved Neon dev target for E2E.'); }
    const pool = new pg.Pool({ connectionString: connection, ssl: { rejectUnauthorized: true }, max: 2, connectionTimeoutMillis: 10_000 });
    const db = drizzle(pool, { schema });
    const address = testAddress();
    const client = apiClient(API_URL, address);
    const usernames: string[] = [];
    const newUsername = () => { const username = testUsername(); usernames.push(username); return username; };
    try {
      const owner = { ...await signupUser(client, newUsername()), tag: `e2e-${randomUUID()}` };
      await insertOwnedRecipes(db, owner.user, owner.tag);
      const other = { ...await signupUser(client, newUsername()), tag: `e2e-${randomUUID()}` };
      await insertOwnedRecipes(db, other.user, other.tag, seedRecipes.slice(0, 25).map((recipe) => ({ ...recipe, title: `Other kitchen: ${recipe.title}` })));
      await use({ db, client, address, owner, other, usernames, newUsername, newPassword: testPassword });
    } finally {
      try { await removeTestData(db, { usernames, addresses: [address] }); }
      catch { throw new Error('Temporary E2E user/counter cleanup failed on the approved dev database.'); }
      finally { await pool.end(); }
    }
  }, { scope: 'worker', timeout: 90_000 }],
  context: async ({ context, workerData }, use) => {
    await context.setExtraHTTPHeaders({ 'X-Forwarded-For': workerData.address });
    await use(context);
  },
});

export const test = authTest.extend({
  context: async ({ context, workerData }, use) => {
    await addSession(context, workerData.owner.cookie);
    await use(context);
  },
});

export { expect };
