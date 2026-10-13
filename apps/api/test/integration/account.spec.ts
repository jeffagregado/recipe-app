import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { authErrorResponseSchema, authSessionResponseSchema, authUserResponseSchema } from '@recipe-app/contracts/schemas';
import { DISPLAY_NAME_WRITE_LIMIT } from '../../src/account/account.controller.js';
import type { DrizzleDb } from '../../src/database/database.service.js';
import { authRateLimits, users } from '../../src/database/schema.js';
import { apiClient, removeTestData, signupUser, startApi, TEST_ORIGIN, testAddress, testEmail } from '../auth-harness.js';

describe('Account settings HTTP', () => {
  let app: NestExpressApplication;
  let baseUrl: string;
  let db: DrizzleDb;
  let client: ReturnType<typeof apiClient>;
  let owner: Awaited<ReturnType<typeof signupUser>>;
  let other: Awaited<ReturnType<typeof signupUser>>;
  let limitKeys: string[];
  const addresses = [testAddress()];
  const emails = [testEmail(), testEmail()];
  // What sign-up stored, read back once so no test depends on the helper's wording.
  let original: string;

  beforeAll(async () => {
    ({ app, baseUrl, db } = await startApi());
    client = apiClient(baseUrl, addresses[0]);
    owner = await signupUser(client, db, emails[0]);
    other = await signupUser(client, db, emails[1]);
    limitKeys = [owner, other].map(({ user }) => `wrapper:display-name:user:${user.id}`);
    original = await sessionName();
  }, 60_000);
  // Every scenario starts from the name sign-up stored and a fresh write window.
  beforeEach(async () => {
    await db.delete(authRateLimits).where(inArray(authRateLimits.key, limitKeys));
    await db.update(users).set({ name: original }).where(eq(users.id, owner.user.id));
  }, 60_000);
  afterAll(async () => {
    if (!app) return;
    try {
      if (limitKeys) await db.delete(authRateLimits).where(inArray(authRateLimits.key, limitKeys));
      await removeTestData(db, { emails, addresses });
    } finally { await app.close(); }
  }, 60_000);

  type Options = { cookie?: string | null; origin?: string | null };
  function put(body: unknown, { cookie = owner.cookie, origin = TEST_ORIGIN }: Options = {}) {
    const headers = new Headers({ 'Content-Type': 'application/json', 'X-Forwarded-For': addresses[0] });
    if (cookie !== null) headers.set('Cookie', cookie);
    if (origin !== null) headers.set('Origin', origin);
    return fetch(`${baseUrl}/account/display-name`, { method: 'PUT', headers, body: JSON.stringify(body) });
  }
  async function sessionName(cookie = owner.cookie): Promise<string> {
    const response = await client.get('/auth/session', { cookie });
    expect(response.status).toBe(200);
    return authSessionResponseSchema.parse(await response.json()).user.displayName;
  }
  async function expectError(response: Response, status: number, code: string) {
    expect(response.status).toBe(status);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.getSetCookie()).toEqual([]);
    const error = authErrorResponseSchema.parse(await response.json());
    expect(error.code).toBe(code);
    return error;
  }

  it('stores the trimmed name for the signed-in Account only, and the session read reflects it', async () => {
    const response = await put({ displayName: '  Ana María 🍜 ' });
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    // The session stays the one the browser already holds: no cookie is issued or replaced.
    expect(response.headers.getSetCookie()).toEqual([]);
    expect(authUserResponseSchema.parse(await response.json())).toEqual({ user: { id: owner.user.id, displayName: 'Ana María 🍜', email: emails[0], pendingEmail: null, hasPassword: true, google: null } });
    expect(await sessionName()).toBe('Ana María 🍜');
    expect(await sessionName(other.cookie)).toBe(original);
    const [row] = await db.select({ name: users.name, email: users.email, emailVerified: users.emailVerified }).from(users).where(eq(users.id, owner.user.id));
    expect(row).toEqual({ name: 'Ana María 🍜', email: emails[0], emailVerified: true });
  }, 60_000);

  it('answers a save of the stored name the same way', async () => {
    const response = await put({ displayName: original });
    expect(response.status).toBe(200);
    expect(authUserResponseSchema.parse(await response.json())).toEqual({ user: { id: owner.user.id, displayName: original, email: emails[0], pendingEmail: null, hasPassword: true, google: null } });
    expect(await sessionName()).toBe(original);
  }, 60_000);

  it('requires a session', async () => {
    const forged = owner.cookie.replace(/=[^;]+/, `=${randomUUID()}`);
    for (const cookie of [null, forged]) await expectError(await put({ displayName: 'Intruder' }, { cookie }), 401, 'UNAUTHENTICATED');
    expect(await sessionName()).toBe(original);
  }, 60_000);

  it('rejects absent, null and untrusted origins', async () => {
    for (const origin of [null, 'null', 'https://untrusted.example.invalid', `${TEST_ORIGIN}.evil.example.invalid`]) {
      await expectError(await put({ displayName: 'Cross-site' }, { origin }), 403, 'ORIGIN_REJECTED');
    }
    expect(await sessionName()).toBe(original);
  }, 60_000);

  // The name rule belongs to the contract's own tests; here rejected bodies prove the endpoint applies that strict schema
  // and names the field at fault.
  it.each([
    ['a blank name', { displayName: '   ' }, 'displayName'],
    ['an email beside the name', { displayName: 'Ana', email: 'ana@example.invalid' }, 'email'],
    ['another Account id', { displayName: 'Ana', id: 'someone-else' }, 'id'],
    ['a body that is not an object', ['Ana'], 'body'],
  ] as const)('rejects %s with a field error and writes nothing', async (_case, body, field) => {
    const error = await expectError(await put(body), 400, 'VALIDATION_FAILED');
    expect(Object.getOwnPropertyDescriptor(error.fieldErrors ?? {}, field)?.value).toHaveLength(1);
    const [row] = await db.select({ name: users.name, email: users.email }).from(users).where(eq(users.id, owner.user.id));
    expect(row).toEqual({ name: original, email: emails[0] });
  }, 60_000);

  it('throttles saves per Account with Retry-After and leaves other Accounts free', async () => {
    await db.insert(authRateLimits).values({ id: randomUUID(), key: limitKeys[0], count: DISPLAY_NAME_WRITE_LIMIT, lastRequest: Date.now() });
    const limited = await put({ displayName: 'One too many' });
    await expectError(limited, 429, 'RATE_LIMITED');
    expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0);
    expect(await sessionName()).toBe(original);
    expect((await put({ displayName: 'Other kitchen' }, { cookie: other.cookie })).status).toBe(200);
    expect(await sessionName(other.cookie)).toBe('Other kitchen');
  }, 60_000);
});
