import { randomBytes } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { and, eq, like } from 'drizzle-orm';
import { authSessionResponseSchema, googleStartResponseSchema } from '@recipe-app/contracts/schemas';
import type { AuthUser } from '@recipe-app/contracts/types';
import { SIGN_IN_METHOD_WRITE_LIMIT } from '../../src/account/account.controller.js';
import { emailChangeIdentifier } from '../../src/auth/auth.email-change.js';
import { GOOGLE_ENDPOINTS } from '../../src/auth/auth.google.js';
import { rateLimitKey } from '../../src/auth/auth.rate-limit.js';
import type { DrizzleDb } from '../../src/database/database.service.js';
import { authAccounts, authRateLimits, authSessions, authVerifications, users } from '../../src/database/schema.js';
import { apiClient, cookiePair, latestToken, removeTestData, signupUser, startApi, storedEmailChangeLinks, TEST_ORIGIN, testAddress, testEmail } from '../auth-harness.js';
import type { RecordingMailTransport } from '../recording-mail.js';
import { STAND_IN_CLIENT, startGoogleStandIn } from '../google-stand-in.js';
import type { GoogleIdentity } from '../google-stand-in.js';

const WEB_CALLBACK = `${TEST_ORIGIN}/api/auth/callback/google`;
const CONNECT_FAILED = { code: 'GOOGLE_CONNECT_FAILED', message: 'Could not connect Google. Try again.' };

type Member = Awaited<ReturnType<typeof signupUser>>;
type Flow = { state: string; cookie: string };

describe('Sign-in methods: connect and disconnect Google', () => {
  let app: NestExpressApplication;
  let baseUrl: string;
  let db: DrizzleDb;
  let mail: RecordingMailTransport;
  let client: ReturnType<typeof apiClient>;
  let google: Awaited<ReturnType<typeof startGoogleStandIn>>;
  const addresses: string[] = [];
  const emails: string[] = [];

  const identity = (overrides: Partial<GoogleIdentity> = {}): GoogleIdentity => {
    const email = testEmail();
    emails.push(overrides.email ?? email);
    return { sub: randomBytes(10).toString('hex'), email, email_verified: true, name: 'Ana Google', ...overrides };
  };
  /** A Verified Account with a password and one session. */
  const member = async (): Promise<Member> => {
    const created = await signupUser(client, mail);
    emails.push(created.email);
    return created;
  };
  const flowOf = async (response: Response): Promise<Flow> => {
    if (response.status !== 200) throw new Error(`Google start failed with HTTP ${response.status}.`);
    const url = new URL(googleStartResponseSchema.parse(await response.json()).url);
    return { state: url.searchParams.get('state') ?? '', cookie: cookiePair(response) };
  };
  /** Asks to connect Google the way the Settings action does: from the web origin, with the session cookie. */
  const connect = (cookie?: string, origin: string | null = TEST_ORIGIN, body: unknown = {}) => client.post('/account/google/connect', body, { cookie, origin });
  const signInFlow = async () => flowOf(await client.post('/auth/google/start', {}));
  /** Forwards the callback the way the web route handler does: no browser Origin, the state cookie and any session cookie. */
  const finish = (flow: Flow, person: GoogleIdentity, session?: string) => client.post('/auth/google/callback', { code: google.consent(person), state: flow.state }, {
    origin: null, cookie: [flow.cookie, session].filter(Boolean).join('; '),
  });
  const disconnect = (cookie?: string, origin: string | null = TEST_ORIGIN, body: unknown = {}) => client.post('/account/google/disconnect', body, { cookie, origin });
  const sessionUser = async (cookie: string): Promise<AuthUser> => {
    const response = await client.get('/auth/session', { cookie });
    expect(response.status).toBe(200);
    return authSessionResponseSchema.parse(await response.json()).user;
  };
  /** A person who signed up with Google and so has no password. */
  const googleOnly = async (person = identity()) => {
    const response = await finish(await signInFlow(), person);
    expect(response.status).toBe(204);
    const cookie = cookiePair(response);
    const user = await sessionUser(cookie);
    return { user, cookie, person };
  };
  const accountOf = (email: string) => db.query.users.findFirst({ where: eq(users.email, email), with: { accounts: true } });
  const signInMethods = async (userId: string) => (await db.select({ providerId: authAccounts.providerId, accountId: authAccounts.accountId }).from(authAccounts).where(eq(authAccounts.userId, userId)))
    .sort((a, b) => a.providerId.localeCompare(b.providerId));
  const expectRefused = async (response: Response, status: number, body: unknown) => {
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual(body);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.getSetCookie()).toEqual([]);
  };

  beforeAll(async () => {
    google = await startGoogleStandIn();
    // Process environment overrides the env file: the suite never uses the developer's Google client.
    process.env.GOOGLE_CLIENT_ID = STAND_IN_CLIENT.id;
    process.env.GOOGLE_CLIENT_SECRET = STAND_IN_CLIENT.secret;
    process.env.GOOGLE_REDIRECT_URI = WEB_CALLBACK;
    ({ app, baseUrl, db, mail } = await startApi((builder) => builder.overrideProvider(GOOGLE_ENDPOINTS).useValue(google.endpoints)));
  }, 60_000);
  // Sign-up, start and callback are limited per client address, so each test calls from an address of its own.
  beforeEach(() => { client = apiClient(baseUrl, addresses[addresses.push(testAddress()) - 1]); });
  afterAll(async () => {
    try {
      if (app) {
        await removeTestData(db, { emails, addresses });
        await app.close();
      }
    } finally { await google?.close(); }
  }, 60_000);

  it('reports the Google address of an identity in the public user, and none for an Account without Google', async () => {
    const person = identity({ email: `Mixed.${randomBytes(6).toString('hex')}@Example.INVALID` });
    emails.push(person.email.toLowerCase());
    const created = await googleOnly(person);
    expect(created.user).toEqual({ id: created.user.id, displayName: 'Ana Google', email: person.email.toLowerCase(), pendingEmail: null, hasPassword: false, google: { email: person.email.toLowerCase() } });
    const withPassword = await member();
    expect(withPassword.user).toEqual({ id: withPassword.user.id, displayName: 'Temporary verification', email: withPassword.email, pendingEmail: null, hasPassword: true, google: null });
    expect(await sessionUser(withPassword.cookie)).toEqual({ id: withPassword.user.id, displayName: 'Temporary verification', email: withPassword.email, pendingEmail: null, hasPassword: true, google: null });
  }, 60_000);

  it('shows an identity attached before the address was kept as connected without one, until its next Google sign-in', async () => {
    const created = await googleOnly();
    await db.update(authAccounts).set({ googleEmail: null }).where(eq(authAccounts.accountId, created.person.sub));
    expect(await sessionUser(created.cookie)).toEqual({ id: created.user.id, displayName: 'Ana Google', email: created.person.email, pendingEmail: null, hasPassword: false, google: { email: null } });
    // Google now reports another address for the same identity; the Account's own email stays what it was.
    const moved = testEmail();
    expect((await finish(await signInFlow(), { ...created.person, email: moved })).status).toBe(204);
    expect(await sessionUser(created.cookie)).toEqual({ id: created.user.id, displayName: 'Ana Google', email: created.person.email, pendingEmail: null, hasPassword: false, google: { email: moved } });
    expect((await accountOf(created.person.email))?.id).toBe(created.user.id);
    expect(await db.$count(users, eq(users.email, moved))).toBe(0);
  }, 60_000);

  it('attaches an identity with a differing email to the Account that started the connect, and changes nothing else about it', async () => {
    const owner = await member();
    const person = identity({ name: 'Name At Google' });
    const started = await connect(owner.cookie);
    expect(started.headers.get('cache-control')).toBe('private, no-store');
    const cookies = started.headers.getSetCookie();
    expect(cookies.length).toBe(1);
    expect(cookies[0].startsWith('better-auth.state=')).toBe(true);

    const response = await finish(await flowOf(started), person, owner.cookie);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ connected: true });
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    // The session that asked is the session that stays: a connect issues no cookie.
    expect(response.headers.getSetCookie()).toEqual([]);

    expect(await sessionUser(owner.cookie)).toEqual({ id: owner.user.id, displayName: 'Temporary verification', email: owner.email, pendingEmail: null, hasPassword: true, google: { email: person.email } });
    const after = await accountOf(owner.email);
    expect({ id: after?.id, name: after?.name, email: after?.email, emailVerified: after?.emailVerified })
      .toEqual({ id: owner.user.id, name: 'Temporary verification', email: owner.email, emailVerified: true });
    // Only the identity and its address are kept: none of Google's tokens.
    expect(after?.accounts.filter(({ providerId }) => providerId === 'google').map(({ accountId, googleEmail, accessToken, refreshToken, idToken, scope }) => ({ accountId, googleEmail, accessToken, refreshToken, idToken, scope })))
      .toEqual([{ accountId: person.sub, googleEmail: person.email, accessToken: null, refreshToken: null, idToken: null, scope: null }]);
    expect(await db.$count(users, eq(users.email, person.email))).toBe(0);
    expect(await db.$count(authSessions, eq(authSessions.userId, owner.user.id))).toBe(1);

    // Either Sign-in method now opens this Account: Google by the identity, whatever address it carries.
    const viaGoogle = await finish(await signInFlow(), person);
    expect(viaGoogle.status).toBe(204);
    expect((await sessionUser(cookiePair(viaGoogle))).id).toBe(owner.user.id);
    expect((await client.post('/auth/login', { email: owner.email, password: owner.password })).status).toBe(200);
  }, 90_000);

  it('attaches nothing when the connect callback does not come with the session that started it', async () => {
    const owner = await member();
    const other = await member();
    const secondLogin = await client.post('/auth/login', { email: owner.email, password: owner.password });
    expect(secondLogin.status).toBe(200);
    for (const [label, session] of [
      ['no session', undefined],
      ['another Account\'s session', other.cookie],
      ['another session of the same Account', cookiePair(secondLogin)],
    ] as const) {
      const person = identity();
      const flow = await flowOf(await connect(owner.cookie));
      const exchanged = google.exchanges.length;
      const response = await finish(flow, person, session);
      expect(response.status, label).toBe(400);
      expect(await response.json(), label).toEqual(CONNECT_FAILED);
      expect(response.headers.getSetCookie(), label).toEqual([]);
      // Refused before the exchange, and the flow is spent: the right session cannot finish it afterwards.
      expect(google.exchanges.length - exchanged, label).toBe(0);
      expect((await finish(flow, person, owner.cookie)).status, label).toBe(400);
      expect(await db.$count(authAccounts, eq(authAccounts.accountId, person.sub)), label).toBe(0);
      expect(await db.$count(users, eq(users.email, person.email)), label).toBe(0);
    }
    expect(await signInMethods(owner.user.id)).toEqual([{ providerId: 'credential', accountId: owner.user.id }]);
    expect(await signInMethods(other.user.id)).toEqual([{ providerId: 'credential', accountId: other.user.id }]);
    // A session that has been signed out since the start is no session.
    const flow = await flowOf(await connect(owner.cookie));
    expect((await client.post('/auth/logout', {}, { cookie: owner.cookie })).status).toBe(204);
    await expectRefused(await finish(flow, identity(), owner.cookie), 400, CONNECT_FAILED);
    expect(await signInMethods(owner.user.id)).toEqual([{ providerId: 'credential', accountId: owner.user.id }]);
  }, 120_000);

  it('refuses an identity already attached to another Account with GOOGLE_ALREADY_LINKED and changes neither Account', async () => {
    const holder = await googleOnly();
    const owner = await member();
    await expectRefused(await finish(await flowOf(await connect(owner.cookie)), holder.person, owner.cookie), 409, {
      code: 'GOOGLE_ALREADY_LINKED', message: 'This Google account is already connected to another Account.',
    });
    expect(await signInMethods(owner.user.id)).toEqual([{ providerId: 'credential', accountId: owner.user.id }]);
    expect(await signInMethods(holder.user.id)).toEqual([{ providerId: 'google', accountId: holder.person.sub }]);
    expect(await sessionUser(owner.cookie)).toEqual({ id: owner.user.id, displayName: 'Temporary verification', email: owner.email, pendingEmail: null, hasPassword: true, google: null });
    expect(await sessionUser(holder.cookie)).toEqual({ id: holder.user.id, displayName: 'Ana Google', email: holder.person.email, pendingEmail: null, hasPassword: false, google: { email: holder.person.email } });
  }, 90_000);

  it('refuses to connect an identity whose email Google reports as unverified', async () => {
    const owner = await member();
    const person = identity({ email_verified: false });
    await expectRefused(await finish(await flowOf(await connect(owner.cookie)), person, owner.cookie), 403, {
      code: 'GOOGLE_CONNECT_EMAIL_NOT_VERIFIED', message: 'Google has not verified this email address.',
    });
    expect(await signInMethods(owner.user.id)).toEqual([{ providerId: 'credential', accountId: owner.user.id }]);
    expect(await db.$count(users, eq(users.email, person.email))).toBe(0);
  }, 60_000);

  it('keeps an Account to one Google identity: no second connect starts, and of two flows already started only one attaches', async () => {
    const owner = await member();
    const [first, second] = [identity(), identity()];
    const flows = [await flowOf(await connect(owner.cookie)), await flowOf(await connect(owner.cookie))];
    expect((await finish(flows[0], first, owner.cookie)).status).toBe(200);
    await expectRefused(await finish(flows[1], second, owner.cookie), 400, CONNECT_FAILED);
    expect(await signInMethods(owner.user.id)).toEqual([{ providerId: 'credential', accountId: owner.user.id }, { providerId: 'google', accountId: first.sub }]);
    expect(await sessionUser(owner.cookie)).toEqual({ id: owner.user.id, displayName: 'Temporary verification', email: owner.email, pendingEmail: null, hasPassword: true, google: { email: first.email } });
    await expectRefused(await connect(owner.cookie), 409, { code: 'GOOGLE_ALREADY_LINKED', message: 'Google is already connected to this Account.' });
  }, 90_000);

  it('connects Google to an Account with a pending email change and leaves the change and its link as they were', async () => {
    const owner = await member();
    const newEmail = testEmail();
    emails.push(newEmail);
    expect((await client.post('/account/email-change', { newEmail, currentPassword: owner.password }, { cookie: owner.cookie })).status).toBe(200);
    const link = await latestToken(mail, 'email-change', newEmail);
    const person = identity();

    expect((await finish(await flowOf(await connect(owner.cookie)), person, owner.cookie)).status).toBe(200);
    expect(await sessionUser(owner.cookie)).toEqual({ id: owner.user.id, displayName: 'Temporary verification', email: owner.email, pendingEmail: newEmail, hasPassword: true, google: { email: person.email } });
    // Compared without printing either side: a failure must not put a link in the log.
    const links = await storedEmailChangeLinks(db, owner.email);
    expect(links.length).toBe(1);
    expect(links[0] === emailChangeIdentifier(link)).toBe(true);
    // The link still moves the Account, and Google stays attached with its own address.
    expect((await client.post('/account/email-change/confirm', { token: link }, { cookie: owner.cookie })).status).toBe(200);
    expect(await sessionUser(owner.cookie)).toEqual({ id: owner.user.id, displayName: 'Temporary verification', email: newEmail, pendingEmail: null, hasPassword: true, google: { email: person.email } });
  }, 90_000);

  it('still creates a separate Account when a signed-in person finishes a flow that was started as a sign-in', async () => {
    // The sign-in rule of #48 is unchanged by connect: without a connect start, a session attaches nothing.
    const owner = await member();
    const person = identity();
    const response = await finish(await signInFlow(), person, owner.cookie);
    expect(response.status).toBe(204);
    expect((await sessionUser(cookiePair(response))).id).not.toBe(owner.user.id);
    expect(await signInMethods(owner.user.id)).toEqual([{ providerId: 'credential', accountId: owner.user.id }]);
  }, 60_000);

  it('refuses to disconnect Google from an Account without a password and keeps the identity', async () => {
    const created = await googleOnly();
    await expectRefused(await disconnect(created.cookie), 409, { code: 'PASSWORD_REQUIRED', message: 'Set a password first.' });
    expect(await signInMethods(created.user.id)).toEqual([{ providerId: 'google', accountId: created.person.sub }]);
    expect(await sessionUser(created.cookie)).toEqual({ id: created.user.id, displayName: 'Ana Google', email: created.person.email, pendingEmail: null, hasPassword: false, google: { email: created.person.email } });
  }, 60_000);

  it('disconnects Google from an Account with a password, keeps the session and leaves the password as the way in', async () => {
    const owner = await member();
    const person = identity();
    expect((await finish(await flowOf(await connect(owner.cookie)), person, owner.cookie)).status).toBe(200);

    // Two requests at once end the same way: the identity is gone and the password remains.
    const responses = await Promise.all([disconnect(owner.cookie), disconnect(owner.cookie)]);
    expect(responses.map(({ status }) => status)).toEqual([204, 204]);
    expect(await responses[0].text()).toBe('');
    expect(responses[0].headers.getSetCookie()).toEqual([]);

    expect(await signInMethods(owner.user.id)).toEqual([{ providerId: 'credential', accountId: owner.user.id }]);
    expect(await sessionUser(owner.cookie)).toEqual({ id: owner.user.id, displayName: 'Temporary verification', email: owner.email, pendingEmail: null, hasPassword: true, google: null });
    expect((await client.post('/auth/login', { email: owner.email, password: owner.password })).status).toBe(200);
    // The identity no longer opens this Account: its next sign-in is a new person's, matched by the Google address.
    const again = await finish(await signInFlow(), person);
    expect(again.status).toBe(204);
    expect((await sessionUser(cookiePair(again))).id).not.toBe(owner.user.id);
  }, 90_000);

  it.each([
    ['connect', '/account/google/connect'],
    ['disconnect', '/account/google/disconnect'],
  ])('guards %s: a session, the web origin, an empty body and the per-Account write limit', async (_label, path) => {
    const owner = await member();
    await expectRefused(await client.post(path, {}), 401, { code: 'UNAUTHENTICATED', message: 'Log in to continue.' });
    for (const origin of [null, 'https://untrusted.example.invalid']) {
      await expectRefused(await client.post(path, {}, { cookie: owner.cookie, origin }), 403, { code: 'ORIGIN_REJECTED', message: 'Request origin is not allowed.' });
    }
    // The schema tests own the shape; one body proves the wrapper applies it.
    const malformed = await client.post(path, { callbackURL: 'https://evil.example.invalid' }, { cookie: owner.cookie });
    expect(malformed.status).toBe(400);
    expect((await malformed.json() as { code: string }).code).toBe('VALIDATION_FAILED');
    // The window is spent directly: the counter is the wrapper limiter's own row for this Account.
    const key = rateLimitKey('sign-in-methods:user', owner.user.id);
    await db.delete(authRateLimits).where(eq(authRateLimits.key, key));
    await db.insert(authRateLimits).values({ id: randomBytes(8).toString('hex'), key, count: SIGN_IN_METHOD_WRITE_LIMIT.limit, lastRequest: Date.now() });
    const limited = await client.post(path, {}, { cookie: owner.cookie });
    expect(limited.status).toBe(429);
    expect((await limited.json() as { code: string }).code).toBe('RATE_LIMITED');
    expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0);
    expect(limited.headers.getSetCookie()).toEqual([]);
    expect(await db.$count(authVerifications, and(like(authVerifications.identifier, 'auth-state:%'), like(authVerifications.value, `%${owner.user.id}%`)))).toBe(0);
  }, 90_000);

  it('keeps the native link, unlink and callback routes closed to a signed-in session', async () => {
    const owner = await member();
    const flow = await flowOf(await connect(owner.cookie));
    const person = identity();
    const query = `code=${google.consent(person)}&state=${flow.state}`;
    for (const [method, path, body] of [
      ['POST', 'link-social', { provider: 'google', disableRedirect: true }],
      ['POST', 'unlink-account', { providerId: 'google' }],
      ['GET', 'list-accounts', undefined],
      ['GET', `callback/google?${query}`, undefined],
      ['GET', `oauth2/callback/google?${query}`, undefined],
    ] as const) {
      const response = await fetch(`${baseUrl}/api/auth/${path}`, {
        method, redirect: 'manual', headers: { 'Content-Type': 'application/json', Origin: TEST_ORIGIN, Cookie: `${flow.cookie}; ${owner.cookie}` }, body: body && JSON.stringify(body),
      });
      expect(response.status, path.split('?')[0]).toBe(404);
      expect(response.headers.getSetCookie(), path.split('?')[0]).toEqual([]);
    }
    expect(await signInMethods(owner.user.id)).toEqual([{ providerId: 'credential', accountId: owner.user.id }]);
  }, 60_000);
});
