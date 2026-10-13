import { createHash, randomBytes } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { asc, eq, like } from 'drizzle-orm';
import { authErrorResponseSchema, authSessionResponseSchema, googleStartResponseSchema } from '@recipe-app/contracts/schemas';
import { GOOGLE_ENDPOINTS } from '../../src/auth/auth.google.js';
import { rateLimitKey } from '../../src/auth/auth.rate-limit.js';
import { DEFAULT_CATEGORY_NAMES } from '../../src/categories/default-categories.js';
import type { DrizzleDb } from '../../src/database/database.service.js';
import { authAccounts, authRateLimits, authVerifications, categories, users } from '../../src/database/schema.js';
import { apiClient, cookiePair, removeTestData, signupUser, startApi, TEST_ORIGIN, testAddress, testEmail } from '../auth-harness.js';
import { STAND_IN_CLIENT, startGoogleStandIn } from '../google-stand-in.js';
import type { GoogleIdentity } from '../google-stand-in.js';
import type { RecordingMailTransport } from '../recording-mail.js';

const WEB_CALLBACK = `${TEST_ORIGIN}/api/auth/callback/google`;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const FAILED = { code: 'GOOGLE_SIGN_IN_FAILED', message: 'Google sign-in failed. Try again.' };

describe('Sign in with Google for a new person', () => {
  let app: NestExpressApplication;
  let baseUrl: string;
  let db: DrizzleDb;
  let mail: RecordingMailTransport;
  let client: ReturnType<typeof apiClient>;
  let google: Awaited<ReturnType<typeof startGoogleStandIn>>;
  const addresses = [testAddress()];
  const emails: string[] = [];
  const identity = (overrides: Partial<GoogleIdentity> = {}): GoogleIdentity => {
    const email = testEmail();
    emails.push(overrides.email ?? email);
    return { sub: randomBytes(10).toString('hex'), email, email_verified: true, name: 'Ana Google', ...overrides };
  };
  /** Asks the API for the provider URL, as the web's start action does. */
  const start = async () => {
    const response = await client.post('/auth/google/start', {});
    if (response.status !== 200) throw new Error(`Google start failed with HTTP ${response.status}.`);
    const url = new URL(googleStartResponseSchema.parse(await response.json()).url);
    return { response, url, state: url.searchParams.get('state') ?? '', cookie: cookiePair(response) };
  };
  /** Forwards the callback the way the web route handler does: no browser Origin, only the state cookie. */
  const finish = (flow: { code: string; state: string; cookie?: string }) =>
    client.post('/auth/google/callback', { code: flow.code, state: flow.state }, { origin: null, cookie: flow.cookie });
  const userOf = (email: string) => db.query.users.findFirst({ where: eq(users.email, email), with: { accounts: true, sessions: { columns: { id: true, expiresAt: true } } } });
  const categoryNames = async (userId: string) => (await db.select({ name: categories.name }).from(categories).where(eq(categories.userId, userId)).orderBy(asc(categories.sortOrder))).map(({ name }) => name);
  const expectRefused = async (response: Response, status: number, body: unknown) => {
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual(body);
    expect(response.headers.getSetCookie()).toEqual([]);
  };

  beforeAll(async () => {
    google = await startGoogleStandIn();
    // Process environment overrides the env file: the suite never uses the developer's Google client.
    process.env.GOOGLE_CLIENT_ID = STAND_IN_CLIENT.id;
    process.env.GOOGLE_CLIENT_SECRET = STAND_IN_CLIENT.secret;
    process.env.GOOGLE_REDIRECT_URI = WEB_CALLBACK;
    ({ app, baseUrl, db, mail } = await startApi((builder) => builder.overrideProvider(GOOGLE_ENDPOINTS).useValue(google.endpoints)));
    client = apiClient(baseUrl, addresses[0]);
  }, 60_000);
  afterAll(async () => {
    try {
      if (app) {
        // A flow that was started and never finished leaves its state row behind until it expires.
        await db.delete(authVerifications).where(like(authVerifications.identifier, 'auth-state:%'));
        await removeTestData(db, { emails, addresses });
        await app.close();
      }
    } finally { await google?.close(); }
  });

  it('starts the flow with the web callback, PKCE and a state cookie for the browser', async () => {
    const { response, url, state } = await start();
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(`${url.origin}${url.pathname}`).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(Object.fromEntries([...url.searchParams].filter(([key]) => !['state', 'code_challenge'].includes(key)))).toEqual({
      response_type: 'code', client_id: STAND_IN_CLIENT.id, scope: 'openid email profile', redirect_uri: WEB_CALLBACK, code_challenge_method: 'S256',
    });
    expect(state.length).toBe(32);
    expect(url.searchParams.get('code_challenge')?.length).toBe(43);
    const cookies = response.headers.getSetCookie();
    expect(cookies.length).toBe(1);
    expect(cookies[0].startsWith('better-auth.state=')).toBe(true);
    expect(cookies[0].split('; ').slice(1).sort()).toEqual(['HttpOnly', 'Max-Age=300', 'Path=/', 'SameSite=Lax']);
    // The verifier stays on the server: neither the URL nor the cookie carries it.
    expect(await db.$count(authVerifications, eq(authVerifications.identifier, `auth-state:${state}`))).toBe(1);
  }, 30_000);

  it('creates a Verified Account with the Google display name, Default categories and a seven-day session', async () => {
    const person = identity();
    const flow = await start();
    const code = google.consent(person);
    const response = await finish({ code, ...flow });
    expect(response.status).toBe(204);
    expect(await response.text()).toBe('');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    const cookies = response.headers.getSetCookie();
    expect(cookies.length).toBe(1);
    expect(cookies[0].startsWith('better-auth.session_token=')).toBe(true);
    expect(cookies[0].split('; ').slice(1).sort()).toEqual(['HttpOnly', 'Max-Age=604800', 'Path=/', 'SameSite=Lax']);

    const row = await userOf(person.email);
    expect(row?.name).toBe('Ana Google');
    expect(row?.emailVerified).toBe(true);
    // Only the identity is kept: no password and none of Google's tokens.
    expect(row?.accounts.map(({ providerId, accountId, password, accessToken, refreshToken, idToken }) => ({ providerId, accountId, password, accessToken, refreshToken, idToken })))
      .toEqual([{ providerId: 'google', accountId: person.sub, password: null, accessToken: null, refreshToken: null, idToken: null }]);
    expect(await categoryNames(row!.id)).toEqual([...DEFAULT_CATEGORY_NAMES]);
    expect(row?.sessions.length).toBe(1);
    expect(Math.abs(row!.sessions[0].expiresAt.getTime() - Date.now() - WEEK_MS)).toBeLessThan(5 * 60_000);
    // Google vouches for the address, so no verification link is mailed.
    expect(mail.messages.filter(({ to }) => to === person.email).length).toBe(0);

    const session = await client.get('/auth/session', { cookie: cookiePair(response) });
    expect(session.status).toBe(200);
    expect(authSessionResponseSchema.parse(await session.json()).user).toEqual({ id: row!.id, displayName: 'Ana Google' });

    // Compared without printing either side: a failure must not put the verifier in the log.
    // The exchange named the web callback and proved possession of the verifier behind the challenge Google was shown.
    const exchange = google.exchanges.find((entry) => entry.code === code);
    expect(exchange?.redirectUri).toBe(WEB_CALLBACK);
    expect(createHash('sha256').update(exchange?.codeVerifier ?? '').digest('base64url') === flow.url.searchParams.get('code_challenge')).toBe(true);
  }, 60_000);

  it('refuses a replayed, forged, unaccompanied or mismatched state and sets no cookie', async () => {
    // Replayed: a completed sign-in consumed its state, and a fresh code does not revive it.
    const spent = await start();
    expect((await finish({ code: google.consent(identity()), ...spent })).status).toBe(204);
    await expectRefused(await finish({ ...spent, code: google.consent(identity()) }), 400, FAILED);
    const flow = await start();
    const other = await start();
    const person = identity();
    for (const [label, attempt] of [
      ['forged', { state: randomBytes(16).toString('hex'), cookie: flow.cookie }],
      ['without its cookie', { state: flow.state }],
      ['with another flow\'s cookie', { state: flow.state, cookie: other.cookie }],
    ] as const) {
      const response = await finish({ code: google.consent(person), ...attempt });
      expect(response.status, label).toBe(400);
      expect(await response.json(), label).toEqual(FAILED);
      expect(response.headers.getSetCookie(), label).toEqual([]);
    }
    expect(await db.$count(users, eq(users.email, person.email))).toBe(0);
  }, 60_000);

  it('signs a returning Google person into the same Account without a second set of categories', async () => {
    const person = identity();
    const first = await finish({ code: google.consent(person), ...(await start()) });
    expect(first.status).toBe(204);
    const again = await finish({ code: google.consent({ ...person, name: 'Renamed At Google' }), ...(await start()) });
    expect(again.status).toBe(204);
    expect(await db.$count(users, eq(users.email, person.email))).toBe(1);
    const row = await userOf(person.email);
    expect(row?.name).toBe('Ana Google');
    expect(row?.accounts.length).toBe(1);
    expect(row?.sessions.length).toBe(2);
    expect(await categoryNames(row!.id)).toEqual([...DEFAULT_CATEGORY_NAMES]);
  }, 60_000);

  it('answers a manual sign-up over a Google-created Account with the email conflict and leaves the Account alone', async () => {
    const person = identity();
    expect((await finish({ code: google.consent(person), ...(await start()) })).status).toBe(204);
    const response = await client.post('/auth/signup', { displayName: 'Password Person', email: person.email.toUpperCase(), password: randomBytes(24).toString('base64url') });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ code: 'EMAIL_ALREADY_EXISTS', message: 'Email already exists.' });
    expect(response.headers.getSetCookie()).toEqual([]);
    expect(await db.$count(users, eq(users.email, person.email))).toBe(1);
    const row = await userOf(person.email);
    expect(row?.name).toBe('Ana Google');
    // No password joins the Google identity, and no verification link is stored for an address Google already vouched for.
    expect(row?.accounts.map(({ providerId }) => providerId)).toEqual(['google']);
    expect(await db.$count(authVerifications, eq(authVerifications.value, row!.id))).toBe(0);
  }, 60_000);

  it('refuses an identity whose email Google reports as unverified and creates nothing', async () => {
    const person = identity({ email_verified: false });
    await expectRefused(await finish({ code: google.consent(person), ...(await start()) }), 403, { code: 'GOOGLE_EMAIL_NOT_VERIFIED', message: 'Google has not verified this email address.' });
    expect(await db.$count(users, eq(users.email, person.email))).toBe(0);
    expect(await db.$count(authAccounts, eq(authAccounts.accountId, person.sub))).toBe(0);
  }, 30_000);

  it('refuses a code Google does not exchange', async () => {
    await expectRefused(await finish({ code: 'never-issued', ...(await start()) }), 400, FAILED);
  }, 30_000);

  it.each([
    ['a Verified', true],
    ['an unverified', false],
  ])('refuses an email that matches %s password Account and links nothing', async (_label, verified) => {
    let email: string;
    if (verified) ({ email } = await signupUser(client, db));
    else {
      email = testEmail();
      expect((await client.post('/auth/signup', { displayName: 'Password Person', email, password: randomBytes(24).toString('base64url') })).status).toBe(201);
    }
    emails.push(email);
    const person = identity({ email: email.toUpperCase() });
    await expectRefused(await finish({ code: google.consent(person), ...(await start()) }), 400, FAILED);
    const after = await userOf(email);
    expect(await db.$count(users, eq(users.email, email))).toBe(1);
    expect(after?.accounts.map(({ providerId }) => providerId)).toEqual(['credential']);
    expect(after?.emailVerified).toBe(verified);
    expect(after?.name).toBe(verified ? 'Temporary verification' : 'Password Person');
    // The harness logged the Verified Account in once; the refused Google sign-in added no session to either.
    expect(after?.sessions.length).toBe(verified ? 1 : 0);
    expect(await db.$count(authAccounts, eq(authAccounts.accountId, person.sub))).toBe(0);
    expect(await categoryNames(after!.id)).toEqual([...DEFAULT_CATEGORY_NAMES]);
  }, 60_000);

  it('keeps the native social and callback routes closed, so the wrappers are the only way in', async () => {
    const flow = await start();
    const person = identity();
    const query = `code=${google.consent(person)}&state=${flow.state}`;
    for (const [method, path, body] of [
      ['POST', 'sign-in/social', { provider: 'google', disableRedirect: true }],
      ['GET', `callback/google?${query}`, undefined],
      ['POST', `callback/google?${query}`, {}],
      ['GET', `oauth2/callback/google?${query}`, undefined],
      ['POST', 'link-social', { provider: 'google' }],
    ] as const) {
      const response = await fetch(`${baseUrl}/api/auth/${path}`, {
        method, redirect: 'manual', headers: { 'Content-Type': 'application/json', Origin: TEST_ORIGIN, Cookie: flow.cookie }, body: body && JSON.stringify(body),
      });
      expect(response.status, path.split('?')[0]).toBe(404);
      expect(response.headers.getSetCookie(), path.split('?')[0]).toEqual([]);
    }
    expect(await db.$count(users, eq(users.email, person.email))).toBe(0);
  }, 30_000);

  it('rejects an untrusted origin at start and malformed input at both wrappers', async () => {
    for (const origin of [null, 'https://untrusted.example.invalid']) {
      await expectRefused(await client.post('/auth/google/start', {}, { origin }), 403, { code: 'ORIGIN_REJECTED', message: 'Request origin is not allowed.' });
    }
    expect(authErrorResponseSchema.parse(await (await client.post('/auth/google/start', { callbackURL: 'https://evil.example.invalid' })).json()).code).toBe('VALIDATION_FAILED');
    // The schema tests own the limits; one body proves the wrapper applies the schema, here to a cancelled consent.
    const response = await client.post('/auth/google/callback', { state: 's', error: 'access_denied' }, { origin: null });
    expect(response.status).toBe(400);
    expect(authErrorResponseSchema.parse(await response.json()).code).toBe('VALIDATION_FAILED');
    expect(response.headers.getSetCookie()).toEqual([]);
  }, 30_000);

  it.each([
    ['start', 'google-start:address', 20, '/auth/google/start', {}],
    ['callback', 'google-callback:address', 30, '/auth/google/callback', { code: 'c', state: 's' }],
  ])('throttles %s per client address with Retry-After', async (_label, scope, limit, path, body) => {
    const address = addresses[addresses.push(testAddress()) - 1];
    // The window is spent directly: the counter is the wrapper limiter's own row for this address.
    await db.insert(authRateLimits).values({ id: randomBytes(8).toString('hex'), key: rateLimitKey(scope, address), count: limit, lastRequest: Date.now() });
    const response = await client.post(path, body, { address });
    expect(response.status).toBe(429);
    expect(authErrorResponseSchema.parse(await response.json()).code).toBe('RATE_LIMITED');
    const retryAfter = Number(response.headers.get('retry-after'));
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(15 * 60);
    expect(response.headers.getSetCookie()).toEqual([]);
  }, 30_000);
});
