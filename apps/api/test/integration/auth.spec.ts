import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { eq, like } from 'drizzle-orm';
import { authErrorResponseSchema, categoryListSchema, authSessionResponseSchema, recipeListResponseSchema } from '@recipe-app/contracts/schemas';
import { DEFAULT_CATEGORY_NAMES } from '../../src/categories/default-categories.js';
import { createAuth } from '../../src/auth/auth.js';
import { AuthRateLimiter, rateLimitKey } from '../../src/auth/auth.rate-limit.js';
import { validateEnvironment } from '../../src/config/environment.js';
import type { DrizzleDb } from '../../src/database/database.service.js';
import { authAccounts, authRateLimits, authSessions, recipeImages, recipes, users } from '../../src/database/schema.js';
import { seedRecipes } from '../../src/recipes/seed-recipes.js';
import { apiClient, cookiePair, insertOwnedRecipes, ownedId, removeTestData, signupUser, startApi, TEST_ORIGIN, testAddress, testPassword, testUsername } from '../auth-harness.js';

describe('Wrapper authentication and owner-only recipe HTTP', () => {
  let app: NestExpressApplication;
  let baseUrl: string;
  let db: DrizzleDb;
  let client: ReturnType<typeof apiClient>;
  const addresses = [testAddress()];
  const usernames: string[] = [];
  const username = testUsername();
  const password = `  ${testPassword()}  `;
  let cookie = '';

  const track = (name = testUsername()) => { usernames.push(name); return name; };
  const errorOf = async (response: Response) => authErrorResponseSchema.parse(await response.json());

  beforeAll(async () => {
    ({ app, baseUrl, db } = await startApi());
    client = apiClient(baseUrl, addresses[0]);
    usernames.push(username);
  }, 60_000);
  afterAll(async () => {
    if (!app) return;
    try { await removeTestData(db, { usernames, addresses }); } finally { await app.close(); }
  });

  it('keeps auth health with exact credentialed CORS and closes every other native route', async () => {
    const response = await fetch(`${baseUrl}/api/auth/ok`, { headers: { Origin: TEST_ORIGIN } });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(response.headers.get('access-control-allow-origin')).toBe(TEST_ORIGIN);
    expect(response.headers.get('access-control-allow-credentials')).toBe('true');
    const rejected = await fetch(`${baseUrl}/api/auth/ok`, { headers: { Origin: 'https://untrusted.example.invalid' } });
    expect(rejected.headers.get('access-control-allow-origin')).toBeNull();
    // The harness configures exactly TEST_ORIGIN: built-in local origins and other ports are not trusted.
    for (const origin of ['http://127.0.0.1:4100', 'http://127.0.0.1:3000']) {
      const other = await fetch(`${baseUrl}/api/auth/ok`, { headers: { Origin: origin } });
      expect(other.headers.get('access-control-allow-origin'), origin).toBeNull();
    }
    const email = `verify-${randomUUID()}@example.invalid`;
    for (const [path, body] of [
      ['sign-up/email', { name: 'Temporary verification', email, password }],
      ['sign-in/email', { email, password }],
      ['sign-in/username', { username, password }],
      ['is-username-available', { username }],
      ['update-user', { name: 'Changed' }],
      ['change-email', { newEmail: email }],
      ['sign-out', {}],
    ] as const) {
      const native = await fetch(`${baseUrl}/api/auth/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: TEST_ORIGIN }, body: JSON.stringify(body) });
      expect(native.status, path).toBe(404);
      expect(native.headers.getSetCookie(), path).toEqual([]);
    }
    expect((await fetch(`${baseUrl}/api/auth/get-session`)).status).toBe(404);
    expect(await db.$count(users, eq(users.email, email))).toBe(0);
  });

  it('signs up with a generated hidden email, safe DTO and cookie, persisted session, then logs out', async () => {
    const response = await client.post('/auth/signup', { displayName: '  Temporary verification  ', username: `  ${username.toUpperCase()} `, password });
    expect(response.status).toBe(201);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    const body = await response.json() as { user: { id: string } };
    expect(body).toEqual({ user: { id: expect.stringMatching(/^[0-9a-f-]{36}$/), displayName: 'Temporary verification', username } });
    const cookies = response.headers.getSetCookie();
    expect(cookies).toHaveLength(1);
    expect(cookies[0]).toMatch(/^better-auth\.session_token=[^;]+; Max-Age=604800; Path=\/; HttpOnly; SameSite=Lax$/i);
    cookie = cookiePair(response);
    const row = await db.query.users.findFirst({ where: eq(users.id, body.user.id), with: { accounts: { columns: { providerId: true, password: true } }, sessions: { columns: { id: true, expiresAt: true } } } });
    expect(row?.email === `${username}@accounts.invalid`).toBe(true);
    expect(row?.emailVerified).toBe(false);
    expect(row?.username).toBe(username);
    expect(row?.accounts.map(({ providerId }) => providerId)).toEqual(['credential']);
    // Better Auth owns hashing; the stored credential is never the submitted password.
    expect(row?.accounts[0].password?.includes(password.trim())).toBe(false);
    expect(row?.sessions).toHaveLength(1);

    const session = await client.get('/auth/session', { cookie });
    expect(session.status).toBe(200);
    expect(session.headers.get('cache-control')).toBe('private, no-store');
    expect(session.headers.getSetCookie()).toEqual([]);
    const data = authSessionResponseSchema.parse(await session.json());
    expect(data.user).toEqual(body.user);
    const remaining = Date.parse(data.expiresAt) - Date.now();
    expect(remaining).toBeGreaterThan(6.9 * 86_400_000);
    expect(remaining).toBeLessThanOrEqual(7 * 86_400_000);

    const logout = await client.post('/auth/logout', {}, { cookie });
    expect(logout.status).toBe(204);
    expect(logout.headers.getSetCookie().some((value) => /^better-auth\.session_token=;.*Max-Age=0/i.test(value))).toBe(true);
    expect(await db.$count(authSessions, eq(authSessions.userId, body.user.id))).toBe(0);
    const after = await client.get('/auth/session', { cookie });
    expect(after.status).toBe(401);
    expect((await errorOf(after)).code).toBe('UNAUTHENTICATED');
    // Repeated logout and logout without any cookie are safe.
    expect((await client.post('/auth/logout', {}, { cookie })).status).toBe(204);
    expect((await client.post('/auth/logout', {})).status).toBe(204);
  }, 30_000);

  it('rejects caller-supplied email, unknown fields and invalid values with field errors', async () => {
    const valid = { displayName: 'Temporary verification', username: track(), password: testPassword() };
    for (const extra of ['email', 'userId', 'role', 'token']) {
      const response = await client.post('/auth/signup', { ...valid, [extra]: 'value@example.invalid' });
      expect(response.status, extra).toBe(400);
      expect(await errorOf(response)).toMatchObject({ code: 'VALIDATION_FAILED', fieldErrors: { [extra]: [expect.any(String)] } });
    }
    for (const [field, value] of [
      ['password', 'short'], ['password', 'x'.repeat(129)],
      ['username', 'ab'], ['username', '.abc'], ['username', 'abc.'], ['username', 'a..b'], ['username', 'no spaces'],
      ['displayName', '   '], ['displayName', 'Ana\u0000'], ['displayName', 'x'.repeat(101)],
    ] as const) {
      const response = await client.post('/auth/signup', { ...valid, [field]: value });
      expect(response.status, `${field}=${value}`).toBe(400);
      expect((await errorOf(response)).fieldErrors?.[field]?.length).toBeGreaterThan(0);
    }
    expect((await client.post('/auth/login', { username, password, email: 'value@example.invalid' })).status).toBe(400);
    expect((await client.post('/auth/logout', { token: 'x' })).status).toBe(400);
    expect(await db.$count(users, eq(users.username, valid.username))).toBe(0);
  }, 30_000);

  it('gives wrong and unknown credentials one response, logs in case-insensitively and never trims passwords', async () => {
    const wrong = await client.post('/auth/login', { username, password: testPassword() });
    const unknown = await client.post('/auth/login', { username: testUsername(), password: testPassword() });
    const trimmed = await client.post('/auth/login', { username, password: password.trim() });
    for (const response of [wrong, unknown, trimmed]) {
      expect(response.status).toBe(401);
      expect(response.headers.getSetCookie()).toEqual([]);
      expect(await response.json()).toEqual({ code: 'INVALID_CREDENTIALS', message: 'Invalid username or password' });
    }
    const signedIn = await client.post('/auth/login', { username: ` ${username.toUpperCase()} `, password });
    expect(signedIn.status).toBe(200);
    const body = await signedIn.json() as Record<string, unknown>;
    expect(Object.keys(body)).toEqual(['user']);
    expect(body.user).toEqual({ id: expect.any(String), displayName: 'Temporary verification', username });
    expect(signedIn.headers.getSetCookie()).toHaveLength(1);
    const fresh = cookiePair(signedIn);
    expect(fresh).not.toBe(cookie);
    // The token revoked by the earlier logout stays rejected while the fresh one works.
    expect((await client.get('/auth/session', { cookie })).status).toBe(401);
    expect((await client.get('/auth/session', { cookie: fresh })).status).toBe(200);
    cookie = fresh;
  }, 30_000);

  it('rejects forged, expired and revoked session tokens', async () => {
    const [name, value] = cookie.split('=');
    const forged = `${name}=${value.slice(0, -4)}${value.endsWith('AAAA') ? 'BBBB' : 'AAAA'}`;
    expect((await client.get('/auth/session', { cookie: forged })).status).toBe(401);
    expect((await client.get('/recipes', { cookie: forged })).status).toBe(401);
    expect((await client.get('/auth/session', { cookie: `${name}=${randomUUID()}` })).status).toBe(401);
    const owner = await db.query.users.findFirst({ where: eq(users.username, username), columns: { id: true } });
    if (!owner) throw new Error('Temporary auth verification user missing.');
    await db.update(authSessions).set({ expiresAt: new Date(Date.now() - 1_000) }).where(eq(authSessions.userId, owner.id));
    expect((await client.get('/auth/session', { cookie })).status).toBe(401);
    expect((await client.get('/recipes', { cookie })).status).toBe(401);
    const login = await client.post('/auth/login', { username, password });
    cookie = cookiePair(login);
    expect((await client.get('/recipes', { cookie })).status).toBe(200);
    await db.delete(authSessions).where(eq(authSessions.userId, owner.id));
    expect((await client.get('/recipes', { cookie })).status).toBe(401);
    cookie = cookiePair(await client.post('/auth/login', { username, password }));
  }, 30_000);

  it('never creates duplicate accounts for sequential or concurrent signups', async () => {
    const taken = await client.post('/auth/signup', { displayName: 'Other', username: username.toUpperCase(), password: testPassword() });
    expect(taken.status).toBe(409);
    expect(await taken.json()).toEqual({ code: 'USERNAME_UNAVAILABLE', message: 'Username is unavailable.' });
    expect(taken.headers.getSetCookie()).toEqual([]);
    // The original password still works: a duplicate attempt never overwrites credentials.
    expect((await client.post('/auth/login', { username, password })).status).toBe(200);

    const racer = track();
    const racing = apiClient(baseUrl, addresses[addresses.push(testAddress()) - 1]);
    const responses = await Promise.all([racer, racer.toUpperCase(), ` ${racer} `, racer, racer].map((value) =>
      racing.post('/auth/signup', { displayName: 'Racer', username: value, password: testPassword() })));
    const statuses = responses.map(({ status }) => status).sort();
    expect(statuses).toEqual([201, 409, 409, 409, 409]);
    const rows = await db.query.users.findMany({ where: eq(users.username, racer), columns: { id: true } });
    expect(rows).toHaveLength(1);
    expect(await db.$count(authAccounts, eq(authAccounts.userId, rows[0].id))).toBe(1);
  }, 60_000);

  it('rejects absent, null and untrusted origins on every mutation', async () => {
    const body = { displayName: 'Temporary verification', username: track(), password: testPassword() };
    for (const origin of [null, 'null', 'https://untrusted.example.invalid', `${TEST_ORIGIN}.evil.example.invalid`, 'http://127.0.0.1:4100', 'http://127.0.0.1:3000']) {
      for (const [path, payload] of [['/auth/signup', body], ['/auth/login', { username, password }], ['/auth/logout', {}]] as const) {
        const response = await client.post(path, payload, { origin, cookie });
        expect(response.status, `${path} ${origin}`).toBe(403);
        expect((await errorOf(response)).code).toBe('ORIGIN_REJECTED');
        expect(response.headers.getSetCookie()).toEqual([]);
      }
    }
    expect(await db.$count(users, eq(users.username, body.username))).toBe(0);
    expect((await client.get('/auth/session', { cookie })).status).toBe(200);
  }, 30_000);

  it('caps JSON bodies at 8 KiB and rejects malformed JSON', async () => {
    const oversized = await client.post('/auth/signup', { displayName: 'x'.repeat(9 * 1024), username: track(), password: testPassword() });
    expect(oversized.status).toBe(413);
    expect((await errorOf(oversized)).code).toBe('PAYLOAD_TOO_LARGE');
    const malformed = await fetch(`${baseUrl}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: TEST_ORIGIN, 'X-Forwarded-For': addresses[0] }, body: '{"username":' });
    expect(malformed.status).toBe(400);
    expect((await errorOf(malformed)).code).toBe('VALIDATION_FAILED');
  });

  it('throttles login per username and signup per address with Retry-After', async () => {
    const victim = track();
    const loginClient = apiClient(baseUrl, addresses[addresses.push(testAddress()) - 1]);
    for (let attempt = 1; attempt <= 10; attempt++) {
      expect((await loginClient.post('/auth/login', { username: victim, password: testPassword() })).status, `attempt ${attempt}`).toBe(401);
    }
    const limited = await loginClient.post('/auth/login', { username: victim.toUpperCase(), password: testPassword() });
    expect(limited.status).toBe(429);
    expect((await errorOf(limited)).code).toBe('RATE_LIMITED');
    const retryAfter = Number(limited.headers.get('retry-after'));
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(15 * 60);
    // Another username from the same address is unaffected.
    expect((await loginClient.post('/auth/login', { username, password })).status).toBe(200);

    const signupClient = apiClient(baseUrl, addresses[addresses.push(testAddress()) - 1]);
    for (let attempt = 1; attempt <= 5; attempt++) {
      expect((await signupClient.post('/auth/signup', { displayName: 'Other', username, password: testPassword() })).status, `attempt ${attempt}`).toBe(409);
    }
    const blocked = await signupClient.post('/auth/signup', { displayName: 'Other', username: track(), password: testPassword() });
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get('retry-after'))).toBeLessThanOrEqual(60 * 60);
    expect(await db.$count(users, eq(users.username, usernames.at(-1)!))).toBe(0);
  }, 60_000);

  it('counts wrapper attempts atomically in the database and resets expired windows', async () => {
    const limiter = app.get(AuthRateLimiter);
    const scope = `verify:${randomUUID()}`;
    try {
      const outcomes = await Promise.allSettled(Array.from({ length: 12 }, () => limiter.consume(rateLimitKey(scope, 'atomic'), { limit: 5, windowMs: 60_000 })));
      expect(outcomes.filter(({ status }) => status === 'fulfilled')).toHaveLength(5);
      const [row] = await db.select({ count: authRateLimits.count }).from(authRateLimits).where(eq(authRateLimits.key, rateLimitKey(scope, 'atomic')));
      expect(row.count).toBe(12);
      const key = rateLimitKey(scope, 'window');
      // Remote DB round trips can exceed 200 ms; expire the persisted window explicitly.
      await limiter.consume(key, { limit: 1, windowMs: 60_000 });
      await expect(limiter.consume(key, { limit: 1, windowMs: 60_000 })).rejects.toMatchObject({ status: 429 });
      await db.update(authRateLimits).set({ lastRequest: Date.now() - 60_001 }).where(eq(authRateLimits.key, key));
      await expect(limiter.consume(key, { limit: 1, windowMs: 60_000 })).resolves.toBeUndefined();
    } finally { await db.delete(authRateLimits).where(like(authRateLimits.key, `wrapper:${scope}%`)); }
  }, 30_000);

  it('sets Secure prefixed cookies when the base URL or every trusted origin uses HTTPS, and not for HTTP-only trust', async () => {
    const config = app.get<ConfigService>(ConfigService);
    const issued = async (baseUrl: string, origins: string[]) => {
      const auth = createAuth(db, { BETTER_AUTH_SECRET: config.getOrThrow<string>('BETTER_AUTH_SECRET'), BETTER_AUTH_URL: baseUrl, AUTH_TRUSTED_ORIGINS: origins });
      const { headers } = await auth.api.signInUsername({ body: { username, password }, headers: new Headers(), returnHeaders: true });
      return headers.getSetCookie();
    };
    const secure = (value: string) => /^__Secure-better-auth\.session_token=/.test(value) && /; Secure/i.test(value) && /HttpOnly/i.test(value) && /SameSite=Lax/i.test(value);
    expect((await issued('https://auth.example.invalid', [TEST_ORIGIN])).some(secure)).toBe(true);
    // An internal HTTP API URL behind a public HTTPS site still issues the Secure cookie.
    expect((await issued('http://api.internal.invalid:3001', ['https://app.example.invalid'])).some(secure)).toBe(true);
    const plain = await issued('http://api.internal.invalid:3001', ['https://app.example.invalid', TEST_ORIGIN]);
    expect(plain.some((value) => /^better-auth\.session_token=/.test(value) && !/; Secure/i.test(value))).toBe(true);
  }, 30_000);

  it('requires a session for recipes and scopes rows, totals, counts and search to the owner', async () => {
    const anonymous = await fetch(`${baseUrl}/recipes`);
    expect(anonymous.status).toBe(401);
    expect(anonymous.headers.get('cache-control')).toBe('private, no-store');
    expect(await anonymous.json()).toEqual({ code: 'UNAUTHENTICATED', message: 'Log in to continue.' });

    const list = async (token: string, query = '') => {
      const response = await client.get(`/recipes${query}`, { cookie: token });
      expect(response.status).toBe(200);
      expect(response.headers.get('cache-control')).toBe('private, no-store');
      return recipeListResponseSchema.parse(await response.json());
    };
    const categoriesFor = async (token: string) => {
      const response = await client.get('/categories', { cookie: token });
      expect(response.status).toBe(200);
      const categories = categoryListSchema.parse(await response.json());
      expect(categories.map(({ name }) => name)).toEqual(DEFAULT_CATEGORY_NAMES);
      return categories.map((category, index) => ({ ...category, name: DEFAULT_CATEGORY_NAMES[index] }));
    };
    const categoriesA = await categoriesFor(cookie);
    // A new account starts empty: seed fixtures stay with the demo owner.
    const empty = await list(cookie);
    expect(empty.data).toEqual([]);
    expect(empty.meta).toMatchObject({ total: 0, totalPages: 0 });
    expect(empty.counts).toEqual({ total: 0, favorites: 0, categories: categoriesA.map(({ id, name }) => ({ id, name, total: 0 })) });

    const first = await db.query.users.findFirst({ where: eq(users.username, username), columns: { id: true } });
    const other = await signupUser(apiClient(baseUrl, addresses[addresses.push(testAddress()) - 1]), track());
    const categoriesB = await categoriesFor(other.cookie);
    if (!first) throw new Error('Temporary auth verification user missing.');
    const tagA = `verify-a-${randomUUID()}`, tagB = `verify-b-${randomUUID()}`;
    const mine = seedRecipes.slice(0, 7), theirs = seedRecipes.slice(5, 30);
    await insertOwnedRecipes(db, first, tagA, mine);
    await insertOwnedRecipes(db, other.user, tagB, theirs);
    const countsFor = (samples: typeof seedRecipes, categories: typeof categoriesA) => categories
      .map(({ id, name }) => ({ id, name, total: samples.filter((recipe) => recipe.categories.includes(name)).length }));

    const a = await list(cookie);
    expect(a.meta.total).toBe(mine.length);
    expect(a.counts).toEqual({ total: mine.length, favorites: 0, categories: countsFor(mine, categoriesA) });
    expect(a.data.map(({ id }) => id).sort()).toEqual(mine.map(({ id }) => ownedId(tagA, id)).sort());
    const b = await list(other.cookie, '?limit=20');
    expect(b.meta.total).toBe(theirs.length);
    expect(b.counts).toEqual({ total: theirs.length, favorites: 0, categories: countsFor(theirs, categoriesB) });
    for (const [result, samples, tag] of [[a, mine, tagA], [b, theirs, tagB]] as const) {
      for (const recipe of result.data) {
        const fixture = samples.find((sample) => ownedId(tag, sample.id) === recipe.id);
        expect(recipe.categories.map(({ name }) => name)).toEqual(fixture?.categories);
      }
    }
    expect(b.data.every(({ id }) => id.startsWith(tagB))).toBe(true);
    // The same search and category return only each owner's matches, including shared seed titles.
    const shared = seedRecipes[5];
    const word = encodeURIComponent(shared.title);
    expect((await list(cookie, `?search=${word}`)).data.map(({ id }) => id)).toEqual([ownedId(tagA, shared.id)]);
    expect((await list(other.cookie, `?search=${word}`)).data.map(({ id }) => id)).toEqual([ownedId(tagB, shared.id)]);
    const onlyTheirs = encodeURIComponent(seedRecipes[29].title);
    expect((await list(cookie, `?search=${onlyTheirs}`)).meta.total).toBe(0);
    expect(a.counts.categories.map(({ name }) => name)).toEqual(DEFAULT_CATEGORY_NAMES);
    expect(b.counts.categories.map(({ name }) => name)).toEqual(DEFAULT_CATEGORY_NAMES);
    for (const category of categoriesA) {
      const filtered = await list(cookie, `?category=${category.id}`);
      expect(filtered.meta.total).toBe(countsFor(mine, categoriesA).find(({ id }) => id === category.id)?.total);
      expect(filtered.counts.total).toBe(mine.length);
    }
    for (const query of ['category=', 'category=a&category=b', `category=${randomUUID()}`, `category=${categoriesB[0].id}`]) {
      const response = await client.get(`/recipes?${query}`, { cookie });
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ errors: expect.arrayContaining([expect.objectContaining({ parameter: 'category' })]) });
    }
    // Request-supplied owner identifiers are rejected rather than honored.
    expect((await client.get(`/recipes?userId=${other.user.id}`, { cookie })).status).toBe(400);

    // Images are signed only for recipes that passed the owner predicate.
    const probeId = ownedId(tagA, mine[0].id);
    await db.insert(recipeImages).values({ recipeId: probeId, objectKey: probeId, sortOrder: 0 });
    const withCover = (await list(cookie)).data.find(({ id }) => id === probeId);
    // Validate the signing projection without fetching an absent object or printing the signed URL.
    expect(withCover?.imageUrl !== null).toBe(true);
    expect(new URL(withCover?.imageUrl ?? 'https://invalid.example').searchParams.has('X-Amz-Signature')).toBe(true);
    expect((await list(other.cookie, '?limit=20')).data.some(({ id }) => id === probeId)).toBe(false);
    expect(await db.$count(recipes, eq(recipes.userId, first.id))).toBe(mine.length);
  }, 60_000);

  it('fails missing or invalid auth settings with key-only errors', () => {
    const config = app.get<ConfigService>(ConfigService);
    const keys = ['DATABASE_URL', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_ENDPOINT_URL_S3', 'AWS_REGION', 'S3_BUCKET', 'PORT', 'BETTER_AUTH_SECRET', 'BETTER_AUTH_URL'];
    const input: Record<string, unknown> = Object.fromEntries(keys.map((key) => [key, config.get<unknown>(key)]));
    for (const [key, value] of [['BETTER_AUTH_SECRET', undefined], ['BETTER_AUTH_SECRET', 'short'], ['BETTER_AUTH_URL', undefined], ['BETTER_AUTH_URL', 'invalid'], ['AUTH_TRUSTED_ORIGINS', 'https://app.example.invalid/path']] as const) {
      let message = '';
      try { validateEnvironment({ ...input, [key]: value }); } catch (error) { message = error instanceof Error ? error.message : 'unknown'; }
      expect(message.includes(key)).toBe(true);
      expect(message.includes('short')).toBe(false);
      expect(message.startsWith('Invalid API configuration:')).toBe(true);
    }
  });
});
