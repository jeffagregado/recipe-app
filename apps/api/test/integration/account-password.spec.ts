import { randomBytes, randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { authErrorResponseSchema, authSessionResponseSchema, authUserResponseSchema, googleStartResponseSchema } from '@recipe-app/contracts/schemas';
import { GOOGLE_ENDPOINTS } from '../../src/auth/auth.google.js';
import { rateLimitKey } from '../../src/auth/auth.rate-limit.js';
import { resetIdentifier } from '../../src/auth/auth.reset.js';
import type { DrizzleDb } from '../../src/database/database.service.js';
import { authRateLimits, authSessions, users } from '../../src/database/schema.js';
import { apiClient, cookiePair, latestToken, removeTestData, signupUser, startApi, storedResetLinks, TEST_ORIGIN, testAddress, testEmail, testPassword } from '../auth-harness.js';
import { STAND_IN_CLIENT, startGoogleStandIn } from '../google-stand-in.js';
import type { RecordingMailTransport } from '../recording-mail.js';

describe('Account password HTTP', () => {
  let app: NestExpressApplication;
  let baseUrl: string;
  let db: DrizzleDb;
  let mail: RecordingMailTransport;
  let google: Awaited<ReturnType<typeof startGoogleStandIn>>;
  const addresses: string[] = [];
  const emails: string[] = [];

  type Client = ReturnType<typeof apiClient>;
  const track = (tracked = testEmail()) => { emails.push(tracked); return tracked; };
  /** Every test calls from its own client address, so one test never spends another's per-client allowance. */
  const newClient = () => apiClient(baseUrl, addresses[addresses.push(testAddress()) - 1]);
  const sessionOf = async (client: Client, cookie: string) => {
    const response = await client.get('/auth/session', { cookie });
    expect(response.status).toBe(200);
    return authSessionResponseSchema.parse(await response.json()).user;
  };
  /** A Google-created Account, made the way the web does it: start, consent at the stand-in, then the forwarded callback. It has no password. */
  const signupWithGoogle = async (client: Client) => {
    const email = track();
    const started = await client.post('/auth/google/start', {});
    if (started.status !== 200) throw new Error(`Temporary Google start failed with HTTP ${started.status}.`);
    const state = new URL(googleStartResponseSchema.parse(await started.json()).url).searchParams.get('state') ?? '';
    const code = google.consent({ sub: randomBytes(10).toString('hex'), email, email_verified: true, name: 'Temporary Google-only' });
    const finished = await client.post('/auth/google/callback', { code, state }, { origin: null, cookie: cookiePair(started) });
    if (finished.status !== 204) throw new Error(`Temporary Google sign-in failed with HTTP ${finished.status}.`);
    const [{ id }] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
    return { id, email, cookie: cookiePair(finished) };
  };

  type Options = { cookie?: string | null; origin?: string | null; address?: string };
  /** A request the harness client has no verb for; the address defaults to the newest one issued. */
  const send = (method: 'PUT' | 'POST', path: string, body: unknown, { cookie = null, origin = TEST_ORIGIN, address = addresses.at(-1) ?? '' }: Options = {}) => {
    const headers = new Headers({ 'Content-Type': 'application/json', 'X-Forwarded-For': address });
    if (cookie !== null) headers.set('Cookie', cookie);
    if (origin !== null) headers.set('Origin', origin);
    return fetch(`${baseUrl}${path}`, { method, headers, body: JSON.stringify(body) });
  };
  const changePassword = (body: unknown, options: Options) => send('PUT', '/account/password', body, options);
  const requestSetPassword = (options: Options, body: unknown = {}) => send('POST', '/account/password/set-link', body, options);
  const resetsSentTo = (address: string) => mail.messages.filter(({ to, kind }) => to === address && kind === 'password-reset');
  const expectError = async (response: Response, status: number, code: string) => {
    expect(response.status).toBe(status);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.getSetCookie()).toEqual([]);
    const error = authErrorResponseSchema.parse(await response.json());
    expect(error.code).toBe(code);
    return error;
  };
  const sessionStatus = async (client: Client, cookie: string) => (await client.get('/auth/session', { cookie })).status;
  const loginStatus = async (client: Client, email: string, password: string) => (await client.post('/auth/login', { email, password })).status;
  /** A signed-up Account with a second session, as if signed in on another device. */
  const ownerWithTwoSessions = async (client: Client) => {
    const owner = await signupUser(client, mail, track());
    const elsewhere = cookiePair(await client.post('/auth/login', { email: owner.email, password: owner.password }));
    expect(await db.$count(authSessions, eq(authSessions.userId, owner.user.id))).toBe(2);
    return { ...owner, elsewhere };
  };

  beforeAll(async () => {
    google = await startGoogleStandIn();
    // Process environment overrides the env file: the suite never uses the developer's Google client.
    process.env.GOOGLE_CLIENT_ID = STAND_IN_CLIENT.id;
    process.env.GOOGLE_CLIENT_SECRET = STAND_IN_CLIENT.secret;
    process.env.GOOGLE_REDIRECT_URI = `${TEST_ORIGIN}/api/auth/callback/google`;
    ({ app, baseUrl, db, mail } = await startApi((builder) => builder.overrideProvider(GOOGLE_ENDPOINTS).useValue(google.endpoints)));
  }, 60_000);
  afterAll(async () => {
    try {
      if (!app) return;
      try { await removeTestData(db, { emails, addresses }); } finally { await app.close(); }
    } finally { await google?.close(); }
  }, 60_000);

  it('reports whether a password is set wherever the public user is returned', async () => {
    const client = newClient();
    const owner = await signupUser(client, mail, track());
    expect(owner.user).toEqual({ id: owner.user.id, displayName: 'Temporary verification', email: owner.email, pendingEmail: null, hasPassword: true, google: null });
    expect(await sessionOf(client, owner.cookie)).toEqual({ id: owner.user.id, displayName: 'Temporary verification', email: owner.email, pendingEmail: null, hasPassword: true, google: null });

    const googleOnly = await signupWithGoogle(client);
    expect(await sessionOf(client, googleOnly.cookie)).toEqual({ id: googleOnly.id, displayName: 'Temporary Google-only', email: googleOnly.email, pendingEmail: null, hasPassword: false, google: { email: googleOnly.email } });
    // A rename answers with the same shape, so the page never loses the field between reads.
    const renamed = await send('PUT', '/account/display-name', { displayName: 'Ana Google' }, { cookie: googleOnly.cookie });
    expect(renamed.status).toBe(200);
    expect(authUserResponseSchema.parse(await renamed.json())).toEqual({ user: { id: googleOnly.id, displayName: 'Ana Google', email: googleOnly.email, pendingEmail: null, hasPassword: false, google: { email: googleOnly.email } } });
  }, 60_000);

  it('changes the password with the current one, signs every other session out and keeps this one', async () => {
    const client = newClient();
    const owner = await ownerWithTwoSessions(client);
    const stranger = await signupUser(client, mail, track());
    // A reset link asked for before the change must not outlive it.
    expect((await client.post('/auth/forgot-password', { email: owner.email })).status).toBe(204);
    expect((await storedResetLinks(db, owner.email)).length).toBe(1);
    const newPassword = `  ${testPassword()}  `;

    const response = await changePassword({ currentPassword: owner.password, newPassword }, { cookie: owner.cookie });
    expect(response.status).toBe(204);
    expect(await response.text()).toBe('');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    // The session the browser already holds stays as it is: no cookie is issued or replaced.
    expect(response.headers.getSetCookie()).toEqual([]);

    expect(await sessionStatus(client, owner.cookie)).toBe(200);
    expect(await sessionStatus(client, owner.elsewhere)).toBe(401);
    expect(await db.$count(authSessions, eq(authSessions.userId, owner.user.id))).toBe(1);
    expect(await sessionStatus(client, stranger.cookie)).toBe(200);
    expect((await storedResetLinks(db, owner.email)).length).toBe(0);
    // The old password is gone and the new one is never trimmed.
    for (const wrong of [owner.password, newPassword.trim()]) expect(await loginStatus(client, owner.email, wrong)).toBe(401);
    expect(await loginStatus(client, owner.email, newPassword)).toBe(200);
    expect(await loginStatus(client, stranger.email, stranger.password)).toBe(200);
    expect(await sessionOf(client, owner.cookie)).toEqual({ id: owner.user.id, displayName: 'Temporary verification', email: owner.email, pendingEmail: null, hasPassword: true, google: null });
  }, 60_000);

  it('refuses a wrong current password on its field and changes nothing', async () => {
    const client = newClient();
    const owner = await ownerWithTwoSessions(client);
    const newPassword = testPassword();
    // The new password is not the current one, and neither is the current one with a space added.
    for (const currentPassword of [newPassword, `${owner.password} `]) {
      const error = await expectError(await changePassword({ currentPassword, newPassword }, { cookie: owner.cookie }), 400, 'INVALID_CURRENT_PASSWORD');
      expect(error.fieldErrors).toEqual({ currentPassword: ['Current password is incorrect.'] });
    }
    for (const cookie of [owner.cookie, owner.elsewhere]) expect(await sessionStatus(client, cookie)).toBe(200);
    expect(await loginStatus(client, owner.email, newPassword)).toBe(401);
    expect(await loginStatus(client, owner.email, owner.password)).toBe(200);
  }, 60_000);

  it('gives an Account without a password the same refusal, and no password', async () => {
    const client = newClient();
    const googleOnly = await signupWithGoogle(client);
    const newPassword = testPassword();
    await expectError(await changePassword({ currentPassword: newPassword, newPassword }, { cookie: googleOnly.cookie }), 400, 'INVALID_CURRENT_PASSWORD');
    expect(await sessionOf(client, googleOnly.cookie)).toEqual({ id: googleOnly.id, displayName: 'Temporary Google-only', email: googleOnly.email, pendingEmail: null, hasPassword: false, google: { email: googleOnly.email } });
    expect(await loginStatus(client, googleOnly.email, newPassword)).toBe(401);
  }, 60_000);

  it('requires a session and a trusted origin, and applies the strict schema to the change', async () => {
    const client = newClient();
    const owner = await signupUser(client, mail, track());
    const valid = { currentPassword: owner.password, newPassword: testPassword() };
    const forged = owner.cookie.replace(/=[^;]+/, `=${randomUUID()}`);
    for (const cookie of [null, forged]) await expectError(await changePassword(valid, { cookie }), 401, 'UNAUTHENTICATED');
    for (const origin of [null, 'null', 'https://untrusted.example.invalid', `${TEST_ORIGIN}.evil.example.invalid`]) {
      await expectError(await changePassword(valid, { cookie: owner.cookie, origin }), 403, 'ORIGIN_REJECTED');
    }
    // The password rule belongs to the contract's own tests; here rejected bodies prove the endpoint applies that schema
    // and names the field at fault.
    for (const [field, body] of [
      ['newPassword', { ...valid, newPassword: 'x'.repeat(11) }], ['currentPassword', { newPassword: valid.newPassword }],
      ['userId', { ...valid, userId: 'someone-else' }], ['revokeOtherSessions', { ...valid, revokeOtherSessions: false }], ['body', [valid]],
    ] as const) {
      const error = await expectError(await changePassword(body, { cookie: owner.cookie }), 400, 'VALIDATION_FAILED');
      expect(Object.getOwnPropertyDescriptor(error.fieldErrors ?? {}, field)?.value, field).toHaveLength(1);
    }
    // Better Auth's own route stays closed.
    const native = await fetch(`${baseUrl}/api/auth/change-password`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: TEST_ORIGIN, Cookie: owner.cookie }, body: JSON.stringify({ ...valid, revokeOtherSessions: true }) });
    expect(native.status).toBe(404);
    expect(await loginStatus(client, owner.email, valid.newPassword)).toBe(401);
    expect(await loginStatus(client, owner.email, owner.password)).toBe(200);
  }, 60_000);

  it('throttles attempts per Account at the login limit, right password or wrong, and leaves other Accounts free', async () => {
    const client = newClient();
    const owner = await signupUser(client, mail, track());
    const other = await signupUser(client, mail, track());
    const newPassword = testPassword();
    // Nine attempts already made in this window: the tenth is still answered, the eleventh is not.
    await db.insert(authRateLimits).values({ id: randomUUID(), key: rateLimitKey('change-password:user', owner.user.id), count: 9, lastRequest: Date.now() });
    await expectError(await changePassword({ currentPassword: newPassword, newPassword }, { cookie: owner.cookie }), 400, 'INVALID_CURRENT_PASSWORD');
    // From another client address too: the counter belongs to the Account.
    const limited = await changePassword({ currentPassword: owner.password, newPassword }, { cookie: owner.cookie, address: addresses[addresses.push(testAddress()) - 1] });
    await expectError(limited, 429, 'RATE_LIMITED');
    const retryAfter = Number(limited.headers.get('retry-after'));
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(15 * 60);
    expect(await loginStatus(client, owner.email, owner.password)).toBe(200);
    expect((await changePassword({ currentPassword: other.password, newPassword }, { cookie: other.cookie })).status).toBe(204);
  }, 60_000);

  it('mails a Google-created Account the reset link to its own address, and the link gives it a password', async () => {
    const client = newClient();
    const googleOnly = await signupWithGoogle(client);
    const response = await requestSetPassword({ cookie: googleOnly.cookie });
    expect(response.status).toBe(204);
    expect(await response.text()).toBe('');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.getSetCookie()).toEqual([]);

    // The reset flow's own mail, to the Account's address and nobody else's.
    expect(mail.messages.filter(({ kind }) => kind === 'password-reset').map(({ to }) => to).filter((to) => to === googleOnly.email).length).toBe(1);
    const [sent] = resetsSentTo(googleOnly.email);
    expect(sent.subject).toBe('Reset your password');
    const token = await latestToken(mail, 'password-reset', googleOnly.email);
    // Compared without printing either side: a failure must not put a token or an address in the log.
    expect(sent.html.includes(`<a href="${TEST_ORIGIN}/reset-password?token=${token}">`)).toBe(true);
    // Asking changes nothing about the Account: it is still signed in and still has no password.
    expect(await sessionOf(client, googleOnly.cookie)).toEqual({ id: googleOnly.id, displayName: 'Temporary Google-only', email: googleOnly.email, pendingEmail: null, hasPassword: false, google: { email: googleOnly.email } });

    const password = testPassword();
    expect((await client.post('/auth/reset-password', { token, password })).status).toBe(204);
    // Using the link ends every session, as any reset does; signing in again shows the password as set.
    expect(await sessionStatus(client, googleOnly.cookie)).toBe(401);
    const login = await client.post('/auth/login', { email: googleOnly.email, password });
    expect(login.status).toBe(200);
    expect(await sessionOf(client, cookiePair(login))).toEqual({ id: googleOnly.id, displayName: 'Temporary Google-only', email: googleOnly.email, pendingEmail: null, hasPassword: true, google: { email: googleOnly.email } });
  }, 60_000);

  it('says so when the mail cannot be sent, and the next request sends', async () => {
    const client = newClient();
    const googleOnly = await signupWithGoogle(client);
    const failing = vi.spyOn(mail, 'send').mockRejectedValueOnce(new Error('Test transport failed'));
    try {
      // The Account knows its own address, so nothing is hidden by answering the failure.
      await expectError(await requestSetPassword({ cookie: googleOnly.cookie }), 503, 'SERVICE_UNAVAILABLE');
      expect(failing).toHaveBeenCalledOnce();
    } finally { failing.mockRestore(); }
    expect(resetsSentTo(googleOnly.email).length).toBe(0);
    expect((await requestSetPassword({ cookie: googleOnly.cookie })).status).toBe(204);
    expect(resetsSentTo(googleOnly.email).length).toBe(1);
  }, 60_000);

  it('refuses the link to an Account that has a password, and mails nothing', async () => {
    const client = newClient();
    const owner = await signupUser(client, mail, track());
    const error = await expectError(await requestSetPassword({ cookie: owner.cookie }), 409, 'PASSWORD_ALREADY_SET');
    expect(error).toEqual({ code: 'PASSWORD_ALREADY_SET', message: 'This Account already has a password.' });
    expect(resetsSentTo(owner.email).length).toBe(0);
    expect((await storedResetLinks(db, owner.email)).length).toBe(0);
  }, 60_000);

  it('requires a session and a trusted origin, takes no input and mails nothing when refused', async () => {
    const client = newClient();
    const googleOnly = await signupWithGoogle(client);
    const forged = googleOnly.cookie.replace(/=[^;]+/, `=${randomUUID()}`);
    for (const cookie of [null, forged]) await expectError(await requestSetPassword({ cookie }), 401, 'UNAUTHENTICATED');
    for (const origin of [null, 'null', 'https://untrusted.example.invalid', `${TEST_ORIGIN}.evil.example.invalid`]) {
      await expectError(await requestSetPassword({ cookie: googleOnly.cookie, origin }), 403, 'ORIGIN_REJECTED');
    }
    // Nobody chooses where the link goes or whose it is.
    for (const [field, body] of [['email', { email: track() }], ['userId', { userId: 'someone-else' }], ['body', []]] as const) {
      const error = await expectError(await requestSetPassword({ cookie: googleOnly.cookie }, body), 400, 'VALIDATION_FAILED');
      expect(Object.getOwnPropertyDescriptor(error.fieldErrors ?? {}, field)?.value, field).toHaveLength(1);
    }
    expect(mail.messages.filter(({ to }) => emails.slice(-2).includes(to)).length).toBe(0);
    expect((await storedResetLinks(db, googleOnly.email)).length).toBe(0);
  }, 60_000);

  it('limits links to 3 an hour per address, counted together with forgot-password, and says so', async () => {
    const client = newClient();
    const googleOnly = await signupWithGoogle(client);
    // Two asked for from the login page and one from Settings: the address has had its three.
    for (let attempt = 1; attempt <= 2; attempt++) expect((await client.post('/auth/forgot-password', { email: googleOnly.email })).status).toBe(204);
    expect((await requestSetPassword({ cookie: googleOnly.cookie })).status).toBe(204);
    expect(resetsSentTo(googleOnly.email).length).toBe(3);
    const third = await latestToken(mail, 'password-reset', googleOnly.email);

    // From another client address too: the counter belongs to the address the mail goes to.
    for (const address of [addresses.at(-1), addresses[addresses.push(testAddress()) - 1]]) {
      const limited = await requestSetPassword({ cookie: googleOnly.cookie, address });
      await expectError(limited, 429, 'RATE_LIMITED');
      const retryAfter = Number(limited.headers.get('retry-after'));
      expect(retryAfter).toBeGreaterThan(0);
      expect(retryAfter).toBeLessThanOrEqual(60 * 60);
    }
    // Forgot-password shares the counter and stays silent past it.
    expect((await client.post('/auth/forgot-password', { email: googleOnly.email })).status).toBe(204);
    expect(resetsSentTo(googleOnly.email).length).toBe(3);
    // The refused requests left the third link alone: it is still the newest and it still works.
    expect((await storedResetLinks(db, googleOnly.email)).join() === resetIdentifier(third)).toBe(true);
    expect((await client.post('/auth/reset-password', { token: third, password: testPassword() })).status).toBe(204);
  }, 60_000);

  it('limits links to 10 an hour per client address and leaves other clients free', async () => {
    const client = newClient();
    const googleOnly = await signupWithGoogle(client);
    const address = addresses.at(-1)!;
    // Ten requests already made from this client in this window.
    await db.insert(authRateLimits).values({ id: randomUUID(), key: rateLimitKey('set-password:address', address), count: 10, lastRequest: Date.now() });
    const limited = await requestSetPassword({ cookie: googleOnly.cookie });
    await expectError(limited, 429, 'RATE_LIMITED');
    expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0);
    expect(resetsSentTo(googleOnly.email).length).toBe(0);
    // The per-client refusal did not spend the address's own allowance.
    expect((await requestSetPassword({ cookie: googleOnly.cookie, address: addresses[addresses.push(testAddress()) - 1] })).status).toBe(204);
    expect(resetsSentTo(googleOnly.email).length).toBe(1);
  }, 60_000);
});
