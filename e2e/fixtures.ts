import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { test as base, expect, type BrowserContext } from '@playwright/test';
import { count, inArray } from '../apps/api/node_modules/drizzle-orm/index.js';
import { drizzle } from '../apps/api/node_modules/drizzle-orm/node-postgres/index.js';
import type { NodePgClient } from '../apps/api/node_modules/drizzle-orm/node-postgres/session.js';
import * as schema from '../apps/api/src/database/schema.js';
import type { DrizzleDb } from '../apps/api/src/database/database.service.js';
import type { apiClient, Inbox, LinkKind, signupUser } from '../apps/api/test/auth-harness.js';
import type { openStorageCleanup } from '../apps/api/test/storage-cleanup.js';
import { getDevDatabaseUrl } from '../apps/api/test/neon-dev.js';
import { seedRecipes } from '../apps/api/src/recipes/seed-recipes.js';
import { loadAuthHarness, loadStorageCleanup } from './load-auth-harness.js';

const requireApi = createRequire(resolve('apps/api/package.json'));
const pg = requireApi('pg') as { Pool: new (options: { connectionString: string; ssl: { rejectUnauthorized: true }; max: number; connectionTimeoutMillis: number }) => NodePgClient & { end: () => Promise<void> } };
const API_URL = 'http://127.0.0.1:4101';
/** The test API server's record of the mail it sent (apps/api/test/dev-server.mjs). */
const MAIL_URL = 'http://127.0.0.1:4102';
export const WEB_URL = 'http://127.0.0.1:4100';
type TestAccount = Awaited<ReturnType<typeof signupUser>> & { tag: string };
type WorkerData = {
  db: DrizzleDb;
  client: ReturnType<typeof apiClient>;
  address: string;
  owner: TestAccount;
  other: TestAccount;
  emails: string[];
  newEmail: () => string;
  newPassword: () => string;
  /** A fresh, empty account signed up from its own client address, so the five-per-hour signup limit is never shared. */
  signupFreshAccount: () => Promise<TestAccount>;
  /** A new Account that has not opened its verification link, signed up from its own client address. */
  signupUnverified: () => Promise<{ email: string; password: string }>;
  /** The tokens of one kind of link mailed to an address, newest first. An email-change link is mailed to the new address. */
  mailedTokens: (kind: LinkKind, to: string) => Promise<string[]>;
  /** The verification links still stored for an address. They hold only a hash of each token, so they serve counts. */
  storedVerificationLinks: (email: string) => Promise<string[]>;
  /** The password reset links still stored for an address. */
  storedResetLinks: (email: string) => Promise<string[]>;
  /** The email-change links still stored for the Account that currently has this address. */
  storedEmailChangeLinks: (email: string) => Promise<string[]>;
  /** How many of these stored objects still answer 200. Keys stay inside the helper's callers; only counts leave. */
  countStoredObjects: (keys: string[]) => Promise<number>;
};

/** Cookie values stay in worker memory and the HttpOnly browser cookie jar. */
export async function addSession(context: BrowserContext, cookie: string) {
  const allowed = new Set(['better-auth.session_token', '__Secure-better-auth.session_token']);
  const cookies = cookie.split(';').map((pair) => {
    const index = pair.indexOf('=');
    return { name: pair.slice(0, index).trim(), value: pair.slice(index + 1).trim() };
  }).filter(({ name }) => allowed.has(name));
  if (cookies.length === 0) throw new Error('Temporary API signup did not issue a session cookie.');
  await context.addCookies(cookies.map((cookie) => ({ ...cookie, url: WEB_URL, httpOnly: true, sameSite: 'Lax', secure: cookie.name.startsWith('__Secure-') })));
}

/**
 * Deletes the stored photos of every recipe and write attempt owned by the temporary users, then the users themselves
 * (cascading recipes, attempts and sessions). Only counts are reported: object keys never leave the helper.
 */
async function removeWorkerData(db: DrizzleDb, emails: string[], addresses: string[]) {
  const { removeTestData } = await loadAuthHarness();
  const { openStorageCleanup: open } = await loadStorageCleanup();
  const ids = emails.length ? (await db.select({ id: schema.users.id }).from(schema.users).where(inArray(schema.users.email, emails))).map(({ id }) => id) : [];
  const cleanup: Awaited<ReturnType<typeof openStorageCleanup>> = await open(resolve('apps/api/.env'));
  let objects = { found: 0, deleted: 0, failed: 0, remaining: 0 };
  try {
    const keys = await cleanup.collectObjectKeys(db, ids);
    const { deleted, failed } = await cleanup.deleteObjects(keys);
    objects = { found: keys.length, deleted, failed, remaining: await cleanup.countRemaining(keys) };
  } finally { await cleanup.close(); }

  const ownedRows = async () => {
    if (!ids.length) return { users: 0, recipes: 0, attempts: 0 };
    const [[users], [recipes], [attempts]] = await Promise.all([
      db.select({ n: count() }).from(schema.users).where(inArray(schema.users.id, ids)),
      db.select({ n: count() }).from(schema.recipes).where(inArray(schema.recipes.userId, ids)),
      db.select({ n: count() }).from(schema.recipeWriteAttempts).where(inArray(schema.recipeWriteAttempts.userId, ids)),
    ]);
    return { users: users.n, recipes: recipes.n, attempts: attempts.n };
  };
  const { recipes } = await ownedRows();
  if (ids.length) await db.delete(schema.authRateLimits).where(inArray(schema.authRateLimits.key, ids.flatMap((id) => [`wrapper:recipe-write:user:${id}`, `wrapper:recipe-favorite:user:${id}`])));
  await removeTestData(db, { emails, addresses });
  const rows = Object.values(await ownedRows()).reduce((total, n) => total + n, 0);
  console.log(`E2E cleanup: users=${ids.length} recipes=${recipes} objects(found=${objects.found} deleted=${objects.deleted} failed=${objects.failed} remaining=${objects.remaining}) rows-remaining=${rows}`);
  if (objects.failed || objects.remaining || rows) throw new Error('Temporary E2E data was not fully removed.');
}

export const authTest = base.extend<Record<never, never>, { workerData: WorkerData }>({
  workerData: [async ({}, use) => {
    const { apiClient, signupUser, insertOwnedRecipes, testAddress, testEmail, testPassword, mailedTokens, storedVerificationLinks, storedResetLinks, storedEmailChangeLinks } = await loadAuthHarness();
    let connection: string;
    try { connection = await getDevDatabaseUrl(); } catch { throw new Error('Could not resolve the approved Neon dev target for E2E.'); }
    const pool = new pg.Pool({ connectionString: connection, ssl: { rejectUnauthorized: true }, max: 2, connectionTimeoutMillis: 10_000 });
    const db = drizzle(pool, { schema });
    const address = testAddress();
    const addresses = [address];
    const client = apiClient(API_URL, address, WEB_URL);
    const emails: string[] = [];
    const inbox: Inbox = { sentTo: async (to) => {
      const response = await fetch(`${MAIL_URL}/?${new URLSearchParams({ to })}`);
      if (!response.ok) throw new Error(`The test server's mail record answered HTTP ${response.status}.`);
      return response.json();
    } };
    const newEmail = () => { const email = testEmail(); emails.push(email); return email; };
    let storage: Awaited<ReturnType<typeof openStorageCleanup>> | undefined;
    const countStoredObjects = async (keys: string[]) => {
      storage ??= await (await loadStorageCleanup()).openStorageCleanup(resolve('apps/api/.env'));
      return storage.countRemaining(keys);
    };
    const signupFreshAccount = async () => {
      const freshAddress = testAddress();
      addresses.push(freshAddress);
      return { ...await signupUser(apiClient(API_URL, freshAddress, WEB_URL), inbox, newEmail()), tag: `e2e-${randomUUID()}` };
    };
    const signupUnverified = async () => {
      const freshAddress = testAddress();
      addresses.push(freshAddress);
      const account = { email: newEmail(), password: testPassword() };
      const response = await apiClient(API_URL, freshAddress, WEB_URL).post('/auth/signup', { displayName: 'Unverified kitchen', ...account });
      if (response.status !== 201) throw new Error(`Temporary signup failed with HTTP ${response.status}.`);
      return account;
    };
    try {
      const owner = { ...await signupUser(client, inbox, newEmail()), tag: `e2e-${randomUUID()}` };
      await insertOwnedRecipes(db, owner.user, owner.tag);
      const other = { ...await signupUser(client, inbox, newEmail()), tag: `e2e-${randomUUID()}` };
      await insertOwnedRecipes(db, other.user, other.tag, seedRecipes.slice(0, 25).map((recipe) => ({ ...recipe, title: `Other kitchen: ${recipe.title}` })));
      await use({
        db, client, address, owner, other, emails, newEmail, newPassword: testPassword, signupFreshAccount, signupUnverified, countStoredObjects,
        mailedTokens: (kind, to) => mailedTokens(inbox, kind, to),
        storedVerificationLinks: (email) => storedVerificationLinks(db, email),
        storedResetLinks: (email) => storedResetLinks(db, email),
        storedEmailChangeLinks: (email) => storedEmailChangeLinks(db, email),
      });
    } finally {
      try { await storage?.close(); await removeWorkerData(db, emails, addresses); }
      catch { throw new Error('Temporary E2E user/counter/storage cleanup failed on the approved dev database.'); }
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

/** Signs in as a brand-new account with no recipes, so counts and lists are exact and nothing leaks into other specs. */
export const creatorTest = authTest.extend<{ creator: TestAccount }>({
  creator: async ({ workerData }, use) => { await use(await workerData.signupFreshAccount()); },
  context: async ({ context, creator }, use) => {
    await addSession(context, creator.cookie);
    await use(context);
  },
});

export { expect };
