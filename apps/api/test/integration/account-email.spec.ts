import { randomBytes, randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { and, eq, like } from 'drizzle-orm';
import { authErrorResponseSchema, authSessionResponseSchema, authUserResponseSchema, confirmEmailChangeResponseSchema, googleStartResponseSchema } from '@recipe-app/contracts/schemas';
import { GOOGLE_ENDPOINTS } from '../../src/auth/auth.google.js';
import { rateLimitKey } from '../../src/auth/auth.rate-limit.js';
import type { DrizzleDb } from '../../src/database/database.service.js';
import { authAccounts, authRateLimits, authSessions, authVerifications, users } from '../../src/database/schema.js';
import { apiClient, cookiePair, emailChangeTokens, latestEmailChangeToken, latestResetToken, removeTestData, resetTokens, signupUser, startApi, TEST_ORIGIN, testAddress, testEmail, testPassword } from '../auth-harness.js';
import { STAND_IN_CLIENT, startGoogleStandIn } from '../google-stand-in.js';
import type { RecordingMailTransport } from '../recording-mail.js';

describe('Account email HTTP', () => {
  let app: NestExpressApplication;
  let baseUrl: string;
  let db: DrizzleDb;
  let mail: RecordingMailTransport;
  let google: Awaited<ReturnType<typeof startGoogleStandIn>>;
  const addresses: string[] = [];
  const emails: string[] = [];

  type Client = ReturnType<typeof apiClient>;
  /** Every address a test uses is tracked, the new ones too: cleanup finds an Account by whichever email it ended with. */
  const track = (tracked = testEmail()) => { emails.push(tracked); return tracked; };
  /** Every test calls from its own client address, so one test never spends another's per-client allowance. */
  const newClient = () => apiClient(baseUrl, addresses[addresses.push(testAddress()) - 1]);
  const sessionOf = async (client: Client, cookie: string) => {
    const response = await client.get('/auth/session', { cookie });
    expect(response.status).toBe(200);
    return authSessionResponseSchema.parse(await response.json()).user;
  };
  type GooglePerson = { sub: string; email: string; email_verified: boolean; name: string };
  /** Signs in with Google the way the web does it: start, consent at the stand-in, then the forwarded callback. Answers the session cookie. */
  const googleSignIn = async (client: Client, person: GooglePerson) => {
    const started = await client.post('/auth/google/start', {});
    if (started.status !== 200) throw new Error(`Temporary Google start failed with HTTP ${started.status}.`);
    const state = new URL(googleStartResponseSchema.parse(await started.json()).url).searchParams.get('state') ?? '';
    const finished = await client.post('/auth/google/callback', { code: google.consent(person), state }, { origin: null, cookie: cookiePair(started) });
    if (finished.status !== 204) throw new Error(`Temporary Google sign-in failed with HTTP ${finished.status}.`);
    return cookiePair(finished);
  };
  /** A Google-created Account. It has no password. */
  const signupWithGoogle = async (client: Client) => {
    const email = track();
    const cookie = await googleSignIn(client, { sub: randomBytes(10).toString('hex'), email, email_verified: true, name: 'Temporary Google-only' });
    const [{ id }] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
    return { id, email, cookie };
  };

  type Options = { cookie?: string | null; origin?: string | null; address?: string };
  /** A request the harness client has no verb for; the address defaults to the newest one issued. */
  const send = (method: 'PUT' | 'POST', path: string, body: unknown, { cookie = null, origin = TEST_ORIGIN, address = addresses.at(-1) ?? '' }: Options = {}) => {
    const headers = new Headers({ 'Content-Type': 'application/json', 'X-Forwarded-For': address });
    if (cookie !== null) headers.set('Cookie', cookie);
    if (origin !== null) headers.set('Origin', origin);
    return fetch(`${baseUrl}${path}`, { method, headers, body: JSON.stringify(body) });
  };
  const expectError = async (response: Response, status: number, code: string) => {
    expect(response.status).toBe(status);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.getSetCookie()).toEqual([]);
    const error = authErrorResponseSchema.parse(await response.json());
    expect(error.code).toBe(code);
    return error;
  };

  const changeEmail = (body: unknown, options: Options) => send('POST', '/account/email-change', body, options);
  const linksSentTo = (address: string) => mail.messages.filter(({ to, kind }) => to === address && kind === 'email-change');
  const noticesSentTo = (address: string) => mail.messages.filter(({ to, kind }) => to === address && kind === 'email-change-notice');
  /** Every email-change message, link or notice, mailed to any of these addresses. */
  const changeMailTo = (to: string[]) => mail.messages.filter((message) => to.includes(message.to) && message.kind.startsWith('email-change'));
  const resend = (options: Options, body: unknown = {}) => send('POST', '/account/email-change/resend', body, options);
  const cancel = (options: Options, body: unknown = {}) => send('POST', '/account/email-change/cancel', body, options);
  /** The page behind the mailed link posts the token; a session is optional. */
  const confirm = (body: unknown, options: Options = {}) => send('POST', '/account/email-change/confirm', body, options);
  const confirmed = async (response: Response) => {
    expect(response.status).toBe(200);
    return confirmEmailChangeResponseSchema.parse(await response.json());
  };
  /** A signed-up Account with a change to a fresh address waiting on its link. */
  const pendingChange = async (client: Client) => {
    const owner = await signupUser(client, db, track());
    const newEmail = track();
    const started = await changeEmail({ newEmail, currentPassword: owner.password }, { cookie: owner.cookie });
    if (started.status !== 200) throw new Error(`Temporary email change failed with HTTP ${started.status}.`);
    return { owner, newEmail, token: await latestEmailChangeToken(db, owner.email) };
  };
  const loginStatus = async (client: Client, email: string, password: string) => (await client.post('/auth/login', { email, password })).status;
  /** Test addresses are `t_<hex>@example.invalid`, so every one of them is masked the same way. */
  const MASKED = 't***@example.invalid';

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

  it('with the right password mails one link to the new address and one masked notice to the old, and changes nothing yet', async () => {
    const client = newClient();
    const owner = await signupUser(client, db, track());
    const newEmail = track();
    const before = Date.now();

    // Typed with capitals and spaces, as a person might: the address is stored the way sign-up stores one.
    const response = await changeEmail({ newEmail: ` ${newEmail.toUpperCase()} `, currentPassword: owner.password }, { cookie: owner.cookie });
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.getSetCookie()).toEqual([]);
    const pending = { id: owner.user.id, displayName: 'Temporary verification', email: owner.email, pendingEmail: newEmail, hasPassword: true, google: null };
    expect(authUserResponseSchema.parse(await response.json())).toEqual({ user: pending });

    expect(mail.messages.filter(({ to }) => to === newEmail).map(({ kind }) => kind)).toEqual(['email-change']);
    const [link] = linksSentTo(newEmail);
    expect(link.subject).toBe('Confirm your new email');
    const tokens = await emailChangeTokens(db, owner.email);
    expect(tokens.length).toBe(1);
    // Compared without printing either side: a failure must not put a token or an address in the log.
    expect(link.html.includes(`<a href="${TEST_ORIGIN}/confirm-email-change?token=${tokens[0]}">`)).toBe(true);
    const [stored] = await db.select({ expiresAt: authVerifications.expiresAt }).from(authVerifications)
      .where(and(eq(authVerifications.value, owner.user.id), like(authVerifications.identifier, 'email-change:%')));
    // Valid 24 hours from the request.
    expect(stored.expiresAt.getTime()).toBeGreaterThanOrEqual(before + 24 * 3_600_000);
    expect(stored.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + 24 * 3_600_000);

    const sentToOld = mail.messages.filter(({ to, kind }) => to === owner.email && kind.startsWith('email-change'));
    expect(sentToOld.map(({ kind }) => kind)).toEqual(['email-change-notice']);
    const [notice] = noticesSentTo(owner.email);
    expect(notice.subject).toBe('A change of your email was requested');
    // The old inbox learns that a change was asked for and what to do, but neither the full new address nor the link.
    expect(notice.html.includes(MASKED)).toBe(true);
    expect(notice.html.includes(newEmail)).toBe(false);
    expect(notice.html.includes(tokens[0])).toBe(false);
    expect(notice.html.includes('change your password')).toBe(true);

    // Until the link is confirmed the Account keeps its email: the session says so and only the old address signs in.
    expect(await sessionOf(client, owner.cookie)).toEqual(pending);
    expect(await loginStatus(client, newEmail, owner.password)).toBe(401);
    expect(await loginStatus(client, owner.email, owner.password)).toBe(200);
  }, 60_000);

  it('refuses a wrong current password on its field, mails nobody and records nothing', async () => {
    const client = newClient();
    const owner = await signupUser(client, db, track());
    const other = await signupUser(client, db, track());
    // A free address and a taken one answer alike: without the password nobody learns which addresses are registered.
    for (const newEmail of [track(), other.email]) {
      const error = await expectError(await changeEmail({ newEmail, currentPassword: `${owner.password} ` }, { cookie: owner.cookie }), 400, 'INVALID_CURRENT_PASSWORD');
      expect(error).toEqual({ code: 'INVALID_CURRENT_PASSWORD', message: 'Current password is incorrect.', fieldErrors: { currentPassword: ['Current password is incorrect.'] } });
    }
    expect(changeMailTo(emails.slice(-3)).length).toBe(0);
    expect((await emailChangeTokens(db, owner.email)).length).toBe(0);
    expect(await sessionOf(client, owner.cookie)).toEqual({ id: owner.user.id, displayName: 'Temporary verification', email: owner.email, pendingEmail: null, hasPassword: true, google: null });
  }, 60_000);

  it('refuses an Account without a password with PASSWORD_REQUIRED, whatever password is sent', async () => {
    const client = newClient();
    const googleOnly = await signupWithGoogle(client);
    const newEmail = track();
    const error = await expectError(await changeEmail({ newEmail, currentPassword: testPassword() }, { cookie: googleOnly.cookie }), 409, 'PASSWORD_REQUIRED');
    expect(error).toEqual({ code: 'PASSWORD_REQUIRED', message: 'Set a password before changing your email.' });
    expect(changeMailTo([newEmail, googleOnly.email]).length).toBe(0);
    expect((await emailChangeTokens(db, googleOnly.email)).length).toBe(0);
    expect(await sessionOf(client, googleOnly.cookie)).toEqual({ id: googleOnly.id, displayName: 'Temporary Google-only', email: googleOnly.email, pendingEmail: null, hasPassword: false, google: { email: googleOnly.email } });
  }, 60_000);

  it('rejects the Account\'s own email on the new email field and mails nobody', async () => {
    const client = newClient();
    const owner = await signupUser(client, db, track());
    for (const newEmail of [owner.email, ` ${owner.email.toUpperCase()} `]) {
      const error = await expectError(await changeEmail({ newEmail, currentPassword: owner.password }, { cookie: owner.cookie }), 400, 'VALIDATION_FAILED');
      expect(error.fieldErrors).toEqual({ newEmail: ['This is already your email.'] });
    }
    expect(changeMailTo([owner.email]).length).toBe(0);
    expect((await emailChangeTokens(db, owner.email)).length).toBe(0);
  }, 60_000);

  it('answers EMAIL_ALREADY_EXISTS for an address that belongs to another Account, and mails nobody', async () => {
    const client = newClient();
    const owner = await signupUser(client, db, track());
    const other = await signupUser(client, db, track());
    const error = await expectError(await changeEmail({ newEmail: other.email.toUpperCase(), currentPassword: owner.password }, { cookie: owner.cookie }), 409, 'EMAIL_ALREADY_EXISTS');
    expect(error).toEqual({ code: 'EMAIL_ALREADY_EXISTS', message: 'Email already exists.' });
    expect(changeMailTo([owner.email, other.email]).length).toBe(0);
    expect(await sessionOf(client, owner.cookie)).toEqual({ id: owner.user.id, displayName: 'Temporary verification', email: owner.email, pendingEmail: null, hasPassword: true, google: null });
  }, 60_000);

  it('requires a session and a trusted origin, and applies the strict schema to the change', async () => {
    const client = newClient();
    const owner = await signupUser(client, db, track());
    const valid = { newEmail: track(), currentPassword: owner.password };
    const forged = owner.cookie.replace(/=[^;]+/, `=${randomUUID()}`);
    for (const path of ['/account/email-change', '/account/email-change/resend', '/account/email-change/cancel']) {
      const body = path === '/account/email-change' ? valid : {};
      for (const cookie of [null, forged]) await expectError(await send('POST', path, body, { cookie }), 401, 'UNAUTHENTICATED');
      for (const origin of [null, 'null', 'https://untrusted.example.invalid', `${TEST_ORIGIN}.evil.example.invalid`]) {
        await expectError(await send('POST', path, body, { cookie: owner.cookie, origin }), 403, 'ORIGIN_REJECTED');
      }
    }
    // The email rule belongs to the contract's own tests; here rejected bodies prove each endpoint applies its schema
    // and names the field at fault.
    for (const [path, field, body] of [
      ['/account/email-change', 'newEmail', { ...valid, newEmail: 'not-an-address' }], ['/account/email-change', 'currentPassword', { newEmail: valid.newEmail }],
      ['/account/email-change', 'userId', { ...valid, userId: 'someone-else' }], ['/account/email-change', 'callbackURL', { ...valid, callbackURL: 'https://untrusted.example.invalid' }],
      ['/account/email-change', 'body', [valid]],
      ['/account/email-change/resend', 'newEmail', { newEmail: valid.newEmail }], ['/account/email-change/cancel', 'userId', { userId: 'someone-else' }],
    ] as const) {
      const error = await expectError(await send('POST', path, body, { cookie: owner.cookie }), 400, 'VALIDATION_FAILED');
      expect(Object.getOwnPropertyDescriptor(error.fieldErrors ?? {}, field)?.value, `${path} ${field}`).toHaveLength(1);
    }
    // Better Auth's own route stays closed.
    const native = await fetch(`${baseUrl}/api/auth/change-email`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: TEST_ORIGIN, Cookie: owner.cookie }, body: JSON.stringify({ newEmail: valid.newEmail }) });
    expect(native.status).toBe(404);
    expect(changeMailTo([valid.newEmail, owner.email]).length).toBe(0);
    expect(await sessionOf(client, owner.cookie)).toEqual({ id: owner.user.id, displayName: 'Temporary verification', email: owner.email, pendingEmail: null, hasPassword: true, google: null });
  }, 60_000);

  it('counts current-password guesses together with the Password card, per Account', async () => {
    const client = newClient();
    const owner = await signupUser(client, db, track());
    const newEmail = track();
    // Nine guesses already made in this window: the tenth is still answered, the eleventh is not, on either card.
    await db.insert(authRateLimits).values({ id: randomUUID(), key: rateLimitKey('change-password:user', owner.user.id), count: 9, lastRequest: Date.now() });
    await expectError(await changeEmail({ newEmail, currentPassword: testPassword() }, { cookie: owner.cookie }), 400, 'INVALID_CURRENT_PASSWORD');
    const limited = await changeEmail({ newEmail, currentPassword: owner.password }, { cookie: owner.cookie, address: addresses[addresses.push(testAddress()) - 1] });
    await expectError(limited, 429, 'RATE_LIMITED');
    const retryAfter = Number(limited.headers.get('retry-after'));
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(15 * 60);
    await expectError(await send('PUT', '/account/password', { currentPassword: owner.password, newPassword: testPassword() }, { cookie: owner.cookie }), 429, 'RATE_LIMITED');
    expect(changeMailTo([newEmail, owner.email]).length).toBe(0);
  }, 60_000);

  it('says so when the link cannot be mailed and records nothing, and the next request sends', async () => {
    const client = newClient();
    const owner = await signupUser(client, db, track());
    const newEmail = track();
    const failing = vi.spyOn(mail, 'send').mockRejectedValueOnce(new Error('Test transport failed'));
    try {
      await expectError(await changeEmail({ newEmail, currentPassword: owner.password }, { cookie: owner.cookie }), 503, 'SERVICE_UNAVAILABLE');
      // The link failed, so the old address is not told about a change that is not waiting on anything.
      expect(failing).toHaveBeenCalledOnce();
    } finally { failing.mockRestore(); }
    expect(changeMailTo([newEmail, owner.email]).length).toBe(0);
    expect((await emailChangeTokens(db, owner.email)).length).toBe(0);
    expect((await sessionOf(client, owner.cookie)).pendingEmail).toBe(null);

    expect((await changeEmail({ newEmail, currentPassword: owner.password }, { cookie: owner.cookie })).status).toBe(200);
    expect(linksSentTo(newEmail).length).toBe(1);
    expect((await sessionOf(client, owner.cookie)).pendingEmail).toBe(newEmail);
  }, 60_000);

  it('leaves a pending change and its link as they were when a later link cannot be mailed', async () => {
    const client = newClient();
    const { owner, newEmail, token } = await pendingChange(client);
    const other = track();
    // A change to another address, then a resend: each fails at the transport and must cost the person nothing.
    for (const attempt of [() => changeEmail({ newEmail: other, currentPassword: owner.password }, { cookie: owner.cookie }), () => resend({ cookie: owner.cookie })]) {
      const failing = vi.spyOn(mail, 'send').mockRejectedValueOnce(new Error('Test transport failed'));
      try {
        await expectError(await attempt(), 503, 'SERVICE_UNAVAILABLE');
        expect(failing).toHaveBeenCalledOnce();
      } finally { failing.mockRestore(); }
      expect((await sessionOf(client, owner.cookie)).pendingEmail).toBe(newEmail);
      const tokens = await emailChangeTokens(db, owner.email);
      expect(tokens.length).toBe(1);
      expect(tokens[0] === token).toBe(true);
    }
    expect(changeMailTo([other]).length).toBe(0);
    expect(linksSentTo(newEmail).length).toBe(1);
    // The link mailed before the failures still moves the Account.
    expect(await confirmed(await confirm({ token }, { cookie: owner.cookie }))).toEqual({ signedIn: true });
    expect((await sessionOf(client, owner.cookie)).email).toBe(newEmail);
  }, 60_000);

  it('resends a fresh link to the pending address, retires the older one and sends no second notice', async () => {
    const client = newClient();
    const { owner, newEmail, token: first } = await pendingChange(client);

    const response = await resend({ cookie: owner.cookie });
    expect(response.status).toBe(204);
    expect(await response.text()).toBe('');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.getSetCookie()).toEqual([]);

    const tokens = await emailChangeTokens(db, owner.email);
    expect(tokens.length).toBe(1);
    expect(tokens[0] === first).toBe(false);
    expect(linksSentTo(newEmail).length).toBe(2);
    expect(linksSentTo(newEmail)[1].html.includes(`<a href="${TEST_ORIGIN}/confirm-email-change?token=${tokens[0]}">`)).toBe(true);
    expect(noticesSentTo(owner.email).length).toBe(1);
    expect((await sessionOf(client, owner.cookie)).pendingEmail).toBe(newEmail);

    await expectError(await confirm({ token: first }), 400, 'EMAIL_CHANGE_LINK_INVALID');
    expect((await sessionOf(client, owner.cookie)).email).toBe(owner.email);
    expect(await confirmed(await confirm({ token: tokens[0] }))).toEqual({ signedIn: false });
  }, 60_000);

  it('answers EMAIL_CHANGE_NOT_PENDING to a resend with no change waiting, and mails nobody', async () => {
    const client = newClient();
    const owner = await signupUser(client, db, track());
    const error = await expectError(await resend({ cookie: owner.cookie }), 409, 'EMAIL_CHANGE_NOT_PENDING');
    expect(error).toEqual({ code: 'EMAIL_CHANGE_NOT_PENDING', message: 'No email change is waiting to be confirmed.' });
    expect(changeMailTo([owner.email]).length).toBe(0);
  }, 60_000);

  it('replaces the pending address when a change to a different address starts, and retires the first link', async () => {
    const client = newClient();
    const { owner, newEmail: first, token: firstToken } = await pendingChange(client);
    const second = track();
    const response = await changeEmail({ newEmail: second, currentPassword: owner.password }, { cookie: owner.cookie });
    expect(authUserResponseSchema.parse(await response.json())).toEqual({ user: { id: owner.user.id, displayName: 'Temporary verification', email: owner.email, pendingEmail: second, hasPassword: true, google: null } });
    const tokens = await emailChangeTokens(db, owner.email);
    expect(tokens.length).toBe(1);
    expect(linksSentTo(second).length).toBe(1);

    // The first address's link can no longer move the Account anywhere.
    await expectError(await confirm({ token: firstToken }), 400, 'EMAIL_CHANGE_LINK_INVALID');
    expect(await sessionOf(client, owner.cookie)).toEqual({ id: owner.user.id, displayName: 'Temporary verification', email: owner.email, pendingEmail: second, hasPassword: true, google: null });
    expect(await confirmed(await confirm({ token: tokens[0] }, { cookie: owner.cookie }))).toEqual({ signedIn: true });
    expect(await sessionOf(client, owner.cookie)).toEqual({ id: owner.user.id, displayName: 'Temporary verification', email: second, pendingEmail: null, hasPassword: true, google: null });
    expect(await loginStatus(client, first, owner.password)).toBe(401);
  }, 60_000);

  it('cancels a pending change: the address clears and its link is retired', async () => {
    const client = newClient();
    const { owner, newEmail, token } = await pendingChange(client);
    const unchanged = { id: owner.user.id, displayName: 'Temporary verification', email: owner.email, pendingEmail: null, hasPassword: true, google: null };

    const response = await cancel({ cookie: owner.cookie });
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.getSetCookie()).toEqual([]);
    expect(authUserResponseSchema.parse(await response.json())).toEqual({ user: unchanged });
    expect((await emailChangeTokens(db, owner.email)).length).toBe(0);

    await expectError(await confirm({ token }, { cookie: owner.cookie }), 400, 'EMAIL_CHANGE_LINK_INVALID');
    expect(await sessionOf(client, owner.cookie)).toEqual(unchanged);
    expect(await loginStatus(client, newEmail, owner.password)).toBe(401);
    // Cancelling again, with nothing pending, answers the same.
    const again = await cancel({ cookie: owner.cookie });
    expect(again.status).toBe(200);
    expect(authUserResponseSchema.parse(await again.json())).toEqual({ user: unchanged });
  }, 60_000);

  it('confirm switches the email once, keeps it Verified, keeps the confirming session and signs every other one out', async () => {
    const client = newClient();
    const { owner, newEmail, token } = await pendingChange(client);
    const elsewhere = cookiePair(await client.post('/auth/login', { email: owner.email, password: owner.password }));
    const stranger = await signupUser(client, db, track());
    // A reset link mailed to the old address must not outlive the move away from it.
    expect((await client.post('/auth/forgot-password', { email: owner.email })).status).toBe(204);
    expect((await resetTokens(db, owner.email)).length).toBe(1);
    expect(await db.$count(authSessions, eq(authSessions.userId, owner.user.id))).toBe(2);

    const response = await confirm({ token }, { cookie: owner.cookie });
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    // The session the browser already holds stays as it is: no cookie is issued or replaced.
    expect(response.headers.getSetCookie()).toEqual([]);
    expect(await response.json()).toEqual({ signedIn: true });

    const moved = { id: owner.user.id, displayName: 'Temporary verification', email: newEmail, pendingEmail: null, hasPassword: true, google: null };
    expect(await sessionOf(client, owner.cookie)).toEqual(moved);
    expect((await client.get('/auth/session', { cookie: elsewhere })).status).toBe(401);
    expect(await db.$count(authSessions, eq(authSessions.userId, owner.user.id))).toBe(1);
    expect((await client.get('/auth/session', { cookie: stranger.cookie })).status).toBe(200);
    const [row] = await db.select({ email: users.email, emailVerified: users.emailVerified, pendingEmail: users.pendingEmail }).from(users).where(eq(users.id, owner.user.id));
    expect(row).toEqual({ email: newEmail, emailVerified: true, pendingEmail: null });
    expect((await emailChangeTokens(db, newEmail)).length).toBe(0);
    expect((await resetTokens(db, newEmail)).length).toBe(0);

    // The new address signs in with the same password; the old one is no longer an Account.
    expect(await loginStatus(client, owner.email, owner.password)).toBe(401);
    const login = await client.post('/auth/login', { email: newEmail, password: owner.password });
    expect(login.status).toBe(200);
    expect(authUserResponseSchema.parse(await login.json())).toEqual({ user: moved });

    // Single use: the same token is refused and changes nothing.
    const again = await expectError(await confirm({ token }, { cookie: owner.cookie }), 400, 'EMAIL_CHANGE_LINK_INVALID');
    expect(again).toEqual({ code: 'EMAIL_CHANGE_LINK_INVALID', message: 'This link has expired or was already used.' });
    expect(await sessionOf(client, owner.cookie)).toEqual(moved);
  }, 60_000);

  it.each([
    ['a browser that is not signed in', false],
    ['a browser signed in to another Account', true],
  ])('confirm from %s signs every session of the Account out and leaves the caller alone', async (_case, signedInElsewhere) => {
    const client = newClient();
    const stranger = signedInElsewhere ? await signupUser(client, db, track()) : undefined;
    const { owner, newEmail, token } = await pendingChange(client);
    expect(await confirmed(await confirm({ token }, { cookie: stranger?.cookie ?? null }))).toEqual({ signedIn: false });
    expect((await client.get('/auth/session', { cookie: owner.cookie })).status).toBe(401);
    expect(await db.$count(authSessions, eq(authSessions.userId, owner.user.id))).toBe(0);
    expect(await loginStatus(client, newEmail, owner.password)).toBe(200);
    if (stranger) expect(await sessionOf(client, stranger.cookie)).toEqual({ id: stranger.user.id, displayName: 'Temporary verification', email: stranger.email, pendingEmail: null, hasPassword: true, google: null });
  }, 60_000);

  it('refuses an expired and an unknown token alike, and leaves the change waiting for a fresh link', async () => {
    const client = newClient();
    const { owner, newEmail, token } = await pendingChange(client);
    const pending = { id: owner.user.id, displayName: 'Temporary verification', email: owner.email, pendingEmail: newEmail, hasPassword: true, google: null };
    // One second past its 24 hours.
    await db.update(authVerifications).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(authVerifications.value, owner.user.id));
    const expired = await expectError(await confirm({ token }, { cookie: owner.cookie }), 400, 'EMAIL_CHANGE_LINK_INVALID');
    const unknown = await expectError(await confirm({ token: randomBytes(32).toString('base64url') }, { cookie: owner.cookie }), 400, 'EMAIL_CHANGE_LINK_INVALID');
    expect(expired).toEqual({ code: 'EMAIL_CHANGE_LINK_INVALID', message: 'This link has expired or was already used.' });
    expect(unknown).toEqual(expired);
    expect(await sessionOf(client, owner.cookie)).toEqual(pending);

    // The banner's Resend recovers from an expired link.
    expect((await resend({ cookie: owner.cookie })).status).toBe(204);
    expect(await confirmed(await confirm({ token: await latestEmailChangeToken(db, owner.email) }, { cookie: owner.cookie }))).toEqual({ signedIn: true });
    expect((await sessionOf(client, owner.cookie)).email).toBe(newEmail);
  }, 60_000);

  it('refuses the link when another Account took the address in the meantime, and drops the pending change', async () => {
    const client = newClient();
    const { owner, newEmail, token } = await pendingChange(client);
    // Sign-up does not know about pending changes: the address is free until a link is confirmed.
    const taker = await signupUser(client, db, newEmail);

    await expectError(await confirm({ token }, { cookie: owner.cookie }), 400, 'EMAIL_CHANGE_LINK_INVALID');
    expect(await sessionOf(client, owner.cookie)).toEqual({ id: owner.user.id, displayName: 'Temporary verification', email: owner.email, pendingEmail: null, hasPassword: true, google: null });
    expect((await emailChangeTokens(db, owner.email)).length).toBe(0);
    expect(await sessionOf(client, taker.cookie)).toEqual({ id: taker.user.id, displayName: 'Temporary verification', email: newEmail, pendingEmail: null, hasPassword: true, google: null });
    expect(await loginStatus(client, owner.email, owner.password)).toBe(200);
  }, 60_000);

  it('gives the address to the first of two Accounts that confirm a change to it', async () => {
    const client = newClient();
    const first = await pendingChange(client);
    const owner = await signupUser(client, db, track());
    expect((await changeEmail({ newEmail: first.newEmail, currentPassword: owner.password }, { cookie: owner.cookie })).status).toBe(200);
    const token = await latestEmailChangeToken(db, owner.email);

    const answers = await Promise.all([confirm({ token: first.token }, { cookie: first.owner.cookie }), confirm({ token }, { cookie: owner.cookie })]);
    expect(answers.map(({ status }) => status).sort()).toEqual([200, 400]);
    expect(await db.$count(users, eq(users.email, first.newEmail))).toBe(1);
    const sessions = [await sessionOf(client, first.owner.cookie), await sessionOf(client, owner.cookie)];
    // One moved and the other kept its own email.
    expect(sessions.map(({ email }) => email).sort()).toEqual([answers[0].status === 200 ? owner.email : first.owner.email, first.newEmail].sort());
  }, 60_000);

  it('keeps a Google identity attached after the email changes: it still signs in to the same Account', async () => {
    const client = newClient();
    const owner = await signupUser(client, db, track());
    const person = { sub: randomBytes(10).toString('hex'), email: owner.email, email_verified: true, name: 'Name At Google' };
    await googleSignIn(client, person);
    const newEmail = track();
    expect((await changeEmail({ newEmail, currentPassword: owner.password }, { cookie: owner.cookie })).status).toBe(200);
    expect(await confirmed(await confirm({ token: await latestEmailChangeToken(db, owner.email) }, { cookie: owner.cookie }))).toEqual({ signedIn: true });

    const methods = await db.select({ providerId: authAccounts.providerId, accountId: authAccounts.accountId }).from(authAccounts).where(eq(authAccounts.userId, owner.user.id));
    expect(methods.sort((a, b) => a.providerId.localeCompare(b.providerId))).toEqual([{ providerId: 'credential', accountId: owner.user.id }, { providerId: 'google', accountId: person.sub }]);
    // Google still reports the old address; the identity, not the email, finds the Account.
    const cookie = await googleSignIn(client, person);
    expect(await sessionOf(client, cookie)).toEqual({ id: owner.user.id, displayName: 'Temporary verification', email: newEmail, pendingEmail: null, hasPassword: true, google: { email: person.email } });
    expect(await db.$count(users, eq(users.email, owner.email))).toBe(0);
  }, 60_000);

  it.each([
    ['changing the password', async (client: Client, owner: Awaited<ReturnType<typeof signupUser>>) => {
      expect((await send('PUT', '/account/password', { currentPassword: owner.password, newPassword: testPassword() }, { cookie: owner.cookie })).status).toBe(204);
      return owner.cookie;
    }],
    ['resetting the password', async (client: Client, owner: Awaited<ReturnType<typeof signupUser>>) => {
      expect((await client.post('/auth/forgot-password', { email: owner.email })).status).toBe(204);
      const password = testPassword();
      expect((await client.post('/auth/reset-password', { token: await latestResetToken(db, owner.email), password })).status).toBe(204);
      return cookiePair(await client.post('/auth/login', { email: owner.email, password }));
    }],
  ] as const)('%s cancels a pending change, as the notice to the old address promises', async (_case, secure) => {
    const client = newClient();
    const { owner, newEmail, token } = await pendingChange(client);
    const cookie = await secure(client, owner);
    expect(await sessionOf(client, cookie)).toEqual({ id: owner.user.id, displayName: 'Temporary verification', email: owner.email, pendingEmail: null, hasPassword: true, google: null });
    expect((await emailChangeTokens(db, owner.email)).length).toBe(0);
    await expectError(await confirm({ token }), 400, 'EMAIL_CHANGE_LINK_INVALID');
    expect(await db.$count(users, eq(users.email, newEmail))).toBe(0);
  }, 60_000);

  it('limits links to 3 an hour per target address, counting starts and resends together, and says so', async () => {
    const client = newClient();
    const { owner, newEmail } = await pendingChange(client);
    for (let attempt = 2; attempt <= 3; attempt++) expect((await resend({ cookie: owner.cookie })).status, `link ${attempt}`).toBe(204);
    expect(linksSentTo(newEmail).length).toBe(3);
    const third = await latestEmailChangeToken(db, owner.email);

    // From another client address too: the counter belongs to the address the mail goes to.
    for (const address of [addresses.at(-1), addresses[addresses.push(testAddress()) - 1]]) {
      const limited = await resend({ cookie: owner.cookie, address });
      await expectError(limited, 429, 'RATE_LIMITED');
      const retryAfter = Number(limited.headers.get('retry-after'));
      expect(retryAfter).toBeGreaterThan(0);
      expect(retryAfter).toBeLessThanOrEqual(60 * 60);
    }
    await expectError(await changeEmail({ newEmail, currentPassword: owner.password }, { cookie: owner.cookie }), 429, 'RATE_LIMITED');
    expect(linksSentTo(newEmail).length).toBe(3);
    expect(noticesSentTo(owner.email).length).toBe(1);
    // The refused requests left the third link alone: it is still the newest and it still works.
    expect(await latestEmailChangeToken(db, owner.email) === third).toBe(true);
    expect(await confirmed(await confirm({ token: third }, { cookie: owner.cookie }))).toEqual({ signedIn: true });
  }, 60_000);

  it('limits starts and resends to 10 an hour per client address and leaves other clients free', async () => {
    const client = newClient();
    const { owner, newEmail } = await pendingChange(client);
    const address = addresses.at(-1)!;
    // Ten requests already made from this client in this window.
    await db.update(authRateLimits).set({ count: 10 }).where(eq(authRateLimits.key, rateLimitKey('email-change:address', address)));
    for (const limited of [await resend({ cookie: owner.cookie }), await changeEmail({ newEmail: track(), currentPassword: owner.password }, { cookie: owner.cookie })]) {
      await expectError(limited, 429, 'RATE_LIMITED');
      expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0);
    }
    expect(linksSentTo(newEmail).length).toBe(1);
    expect(changeMailTo([emails.at(-1)!]).length).toBe(0);
    // The per-client refusals did not spend the target address's own allowance.
    expect((await resend({ cookie: owner.cookie, address: addresses[addresses.push(testAddress()) - 1] })).status).toBe(204);
    expect(linksSentTo(newEmail).length).toBe(2);
  }, 60_000);

  it('takes the token from a trusted origin only, with the strict schema, and limits confirms per client address', async () => {
    const client = newClient();
    const { owner, token } = await pendingChange(client);
    for (const origin of [null, 'null', 'https://untrusted.example.invalid', `${TEST_ORIGIN}.evil.example.invalid`]) {
      await expectError(await confirm({ token }, { cookie: owner.cookie, origin }), 403, 'ORIGIN_REJECTED');
    }
    for (const [field, body] of [['token', {}], ['token', { token: 't'.repeat(129) }], ['userId', { token, userId: owner.user.id }], ['newEmail', { token, newEmail: track() }], ['body', [token]]] as const) {
      const error = await expectError(await confirm(body, { cookie: owner.cookie }), 400, 'VALIDATION_FAILED');
      expect(Object.getOwnPropertyDescriptor(error.fieldErrors ?? {}, field)?.value, field).toHaveLength(1);
    }
    // Opening the link is a GET; nothing answers one, so a mail scanner that follows the link changes nothing.
    expect((await client.get(`/account/email-change/confirm?token=${token}`, { cookie: owner.cookie })).status).toBe(404);
    // Thirty attempts already made from this client in this window.
    await db.update(authRateLimits).set({ count: 30 }).where(eq(authRateLimits.key, rateLimitKey('email-change-confirm:address', addresses.at(-1)!)));
    await expectError(await confirm({ token }, { cookie: owner.cookie }), 429, 'RATE_LIMITED');
    // None of the refusals used the link up.
    expect((await sessionOf(client, owner.cookie)).email).toBe(owner.email);
    expect(await confirmed(await confirm({ token }, { cookie: owner.cookie, address: addresses[addresses.push(testAddress()) - 1] }))).toEqual({ signedIn: true });
  }, 60_000);
});
