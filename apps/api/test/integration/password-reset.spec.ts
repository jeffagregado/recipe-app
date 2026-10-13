import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq, like } from 'drizzle-orm';
import { authErrorResponseSchema } from '@recipe-app/contracts/schemas';
import { resetIdentifier } from '../../src/auth/auth.reset.js';
import type { DrizzleDb } from '../../src/database/database.service.js';
import { authAccounts, authRateLimits, authSessions, authVerifications, users } from '../../src/database/schema.js';
import { apiClient, cookiePair, latestResetToken, removeTestData, resetTokens, signupUser, startApi, TEST_ORIGIN, testAddress, testEmail, testPassword, verificationTokens } from '../auth-harness.js';
import type { RecordingMailTransport } from '../recording-mail.js';

const HOUR_MS = 60 * 60 * 1000;
const INVALID = { code: 'RESET_LINK_INVALID', message: 'This reset link has expired or was already used.' };

describe('Forgot and reset password HTTP', () => {
  let app: NestExpressApplication;
  let baseUrl: string;
  let db: DrizzleDb;
  let mail: RecordingMailTransport;
  const addresses: string[] = [];
  const emails: string[] = [];

  const track = (tracked = testEmail()) => { emails.push(tracked); return tracked; };
  /** Every test calls from its own client address, so one test never spends another's per-client allowance. */
  const newClient = () => apiClient(baseUrl, addresses[addresses.push(testAddress()) - 1]);
  const resetsSentTo = (address: string) => mail.messages.filter(({ to, kind }) => to === address && kind === 'password-reset');
  const errorOf = async (response: Response) => authErrorResponseSchema.parse(await response.json());
  const account = (email: string) => db.query.users.findFirst({ where: eq(users.email, email), columns: { id: true, emailVerified: true } });
  const signupUnverified = async (client: ReturnType<typeof apiClient>, password = testPassword()) => {
    const email = track();
    const response = await client.post('/auth/signup', { displayName: 'Temporary reset', email, password });
    if (response.status !== 201) throw new Error(`Temporary signup failed with HTTP ${response.status}.`);
    return { email, password };
  };
  /** Requests a link and returns its token. The link itself never reaches an assertion message. */
  const requestLink = async (client: ReturnType<typeof apiClient>, email: string) => {
    const response = await client.post('/auth/forgot-password', { email });
    if (response.status !== 204) throw new Error(`Temporary reset request failed with HTTP ${response.status}.`);
    return latestResetToken(db, email);
  };
  const issuedAgo = (token: string, ms: number) => db.update(authVerifications).set({ expiresAt: new Date(Date.now() - ms + HOUR_MS) })
    .where(eq(authVerifications.identifier, resetIdentifier(token)));

  beforeAll(async () => {
    ({ app, baseUrl, db, mail } = await startApi());
  }, 60_000);
  afterAll(async () => {
    if (!app) return;
    try { await removeTestData(db, { emails, addresses }); } finally { await app.close(); }
  });

  it('answers a known and an unknown address alike and mails one one-hour link to the web origin only to the known one', async () => {
    const client = newClient();
    const known = await signupUnverified(client);
    const unknown = track();
    const answers = [];
    for (const target of [known.email, unknown]) {
      const response = await client.post('/auth/forgot-password', { email: ` ${target.toUpperCase()} ` });
      answers.push({ status: response.status, body: await response.text(), type: response.headers.get('content-type'), cache: response.headers.get('cache-control'), cookies: response.headers.getSetCookie() });
    }
    expect(answers[0]).toEqual({ status: 204, body: '', type: null, cache: 'private, no-store', cookies: [] });
    expect(answers[1]).toEqual(answers[0]);
    expect(await db.$count(users, eq(users.email, unknown))).toBe(0);
    expect(resetsSentTo(unknown).length).toBe(0);

    const sent = resetsSentTo(known.email);
    expect(sent.map(({ kind, subject }) => ({ kind, subject }))).toEqual([{ kind: 'password-reset', subject: 'Reset your password' }]);
    const token = await latestResetToken(db, known.email);
    expect(token.length).toBe(43);
    // Compared without printing either side: a failure must not put a token or an address in the log.
    expect(sent[0].html.includes(`<a href="${TEST_ORIGIN}/reset-password?token=${token}">`)).toBe(true);
    // The link opens the web app; the API's own address never reaches a mailbox.
    expect(sent[0].html.includes('127.0.0.1')).toBe(false);
    const [link] = await db.select({ createdAt: authVerifications.createdAt, expiresAt: authVerifications.expiresAt })
      .from(authVerifications).where(eq(authVerifications.identifier, resetIdentifier(token)));
    // The row is stamped by the database and its expiry by the API, so allow for the two clocks.
    expect(Math.abs(link.expiresAt.getTime() - link.createdAt.getTime() - HOUR_MS)).toBeLessThan(5 * 60_000);
    // Asking changes nothing about the Account: the old password is still the password and the email is still unverified.
    expect((await account(known.email))?.emailVerified).toBe(false);
    expect((await verificationTokens(db, known.email)).length).toBe(1);
  }, 60_000);

  it('sets the new password once, signs every session out, creates none and refuses the used and an unknown token', async () => {
    const client = newClient();
    const owner = await signupUser(client, db, track());
    const second = cookiePair(await client.post('/auth/login', { email: owner.email, password: owner.password }));
    expect(await db.$count(authSessions, eq(authSessions.userId, owner.user.id))).toBe(2);
    const token = await requestLink(client, owner.email);
    const password = `  ${testPassword()}  `;

    const unknown = await client.post('/auth/reset-password', { token: `${token.slice(0, -1)}${token.endsWith('A') ? 'B' : 'A'}`, password });
    expect(unknown.status).toBe(400);
    expect(await unknown.json()).toEqual(INVALID);
    expect((await client.get('/auth/session', { cookie: owner.cookie })).status).toBe(200);

    const reset = await client.post('/auth/reset-password', { token, password });
    expect(reset.status).toBe(204);
    expect(await reset.text()).toBe('');
    expect(reset.headers.get('cache-control')).toBe('private, no-store');
    expect(reset.headers.getSetCookie()).toEqual([]);
    for (const cookie of [owner.cookie, second]) expect((await client.get('/auth/session', { cookie })).status).toBe(401);
    expect(await db.$count(authSessions, eq(authSessions.userId, owner.user.id))).toBe(0);
    expect((await resetTokens(db, owner.email)).length).toBe(0);

    // The old password is gone and the new one is never trimmed.
    for (const wrong of [owner.password, password.trim()]) {
      const refused = await client.post('/auth/login', { email: owner.email, password: wrong });
      expect(refused.status).toBe(401);
      expect((await errorOf(refused)).code).toBe('INVALID_CREDENTIALS');
    }
    expect((await client.post('/auth/login', { email: owner.email, password })).status).toBe(200);

    const again = await client.post('/auth/reset-password', { token, password: testPassword() });
    expect(again.status).toBe(400);
    expect(await again.json()).toEqual(INVALID);
    expect((await client.post('/auth/login', { email: owner.email, password })).status).toBe(200);
  }, 60_000);

  it('marks an unverified email Verified, because the link proved control of the inbox', async () => {
    const client = newClient();
    const pending = await signupUnverified(client);
    expect((await errorOf(await client.post('/auth/login', pending))).code).toBe('EMAIL_NOT_VERIFIED');
    const password = testPassword();
    expect((await client.post('/auth/reset-password', { token: await requestLink(client, pending.email), password })).status).toBe(204);
    expect((await account(pending.email))?.emailVerified).toBe(true);
    // The sign-up link has nothing left to prove.
    expect((await verificationTokens(db, pending.email)).length).toBe(0);
    expect((await client.post('/auth/login', { email: pending.email, password })).status).toBe(200);
  }, 60_000);

  it('expires a link one hour after it was issued and lets two simultaneous submissions reset once', async () => {
    const client = newClient();
    const owner = await signupUser(client, db, track());
    const token = await requestLink(client, owner.email);

    await issuedAgo(token, HOUR_MS + 1_000);
    const expired = await client.post('/auth/reset-password', { token, password: testPassword() });
    expect(expired.status).toBe(400);
    expect(await expired.json()).toEqual(INVALID);
    // Nothing changed: the old password and the old session both still work.
    expect((await client.post('/auth/login', { email: owner.email, password: owner.password })).status).toBe(200);
    expect((await client.get('/auth/session', { cookie: owner.cookie })).status).toBe(200);

    // The same link ten minutes younger still works: the refusal above was its age, not the token.
    await issuedAgo(token, HOUR_MS - 10 * 60_000);
    const passwords = [testPassword(), testPassword()];
    const submitted = await Promise.all(passwords.map((password) => client.post('/auth/reset-password', { token, password })));
    expect(submitted.map(({ status }) => status).sort()).toEqual([204, 400]);
    // Exactly the password of the submission that won is the password now.
    const logins = await Promise.all(passwords.map((password) => client.post('/auth/login', { email: owner.email, password })));
    expect(logins.map(({ status }, index) => status === (submitted[index].status === 204 ? 200 : 401))).toEqual([true, true]);
  }, 60_000);

  it('retires every older link when a new one is requested, also for two requests at once', async () => {
    const client = newClient();
    const owner = await signupUser(client, db, track());
    const first = await requestLink(client, owner.email);
    const second = await requestLink(client, owner.email);
    expect(second === first).toBe(false);
    expect((await resetTokens(db, owner.email)).length).toBe(1);
    expect(resetsSentTo(owner.email).length).toBe(2);

    const older = await client.post('/auth/reset-password', { token: first, password: testPassword() });
    expect(older.status).toBe(400);
    expect(await older.json()).toEqual(INVALID);
    expect((await client.post('/auth/login', { email: owner.email, password: owner.password })).status).toBe(200);
    const password = testPassword();
    expect((await client.post('/auth/reset-password', { token: second, password })).status).toBe(204);
    expect((await client.post('/auth/login', { email: owner.email, password })).status).toBe(200);

    const racer = await signupUser(newClient(), db, track());
    const racing = [newClient(), newClient()];
    expect((await Promise.all(racing.map((each) => each.post('/auth/forgot-password', { email: racer.email })))).map(({ status }) => status)).toEqual([204, 204]);
    expect((await resetTokens(db, racer.email)).length).toBe(1);
  }, 90_000);

  it('gives an Account that has no password its first one and keeps its other Sign-in method', async () => {
    const client = newClient();
    const email = track();
    // An Account that has only ever signed in with Google: a verified email, a Google identity and no credential record.
    const [owner] = await db.insert(users).values({ name: 'Temporary Google-only', email, emailVerified: true }).returning({ id: users.id });
    await db.insert(authAccounts).values({ accountId: `test-${randomUUID()}`, providerId: 'google', userId: owner.id });
    const password = testPassword();
    expect((await errorOf(await client.post('/auth/login', { email, password }))).code).toBe('INVALID_CREDENTIALS');

    const token = await requestLink(client, email);
    expect(resetsSentTo(email).length).toBe(1);
    expect((await client.post('/auth/reset-password', { token, password })).status).toBe(204);
    const methods = await db.select({ providerId: authAccounts.providerId, password: authAccounts.password }).from(authAccounts).where(eq(authAccounts.userId, owner.id));
    expect(methods.map(({ providerId }) => providerId).sort()).toEqual(['credential', 'google']);
    // Better Auth owns hashing; the stored credential is never the submitted password.
    expect(methods.some((method) => method.password?.includes(password))).toBe(false);
    const login = await client.post('/auth/login', { email, password });
    expect(login.status).toBe(200);
    expect(await login.json()).toEqual({ user: { id: owner.id, displayName: 'Temporary Google-only' } });
  }, 60_000);

  it('limits requests to 3 an hour per address without a different answer or another mail, and to 10 an hour per client', async () => {
    const known = (await signupUser(newClient(), db, track())).email;
    const unknown = track();
    for (const target of [known, unknown]) {
      const targetClient = newClient();
      // The fourth and fifth are past the limit, the fifth from another client and in another spelling of the address.
      const answers = [];
      for (const [each, address] of [[targetClient, target], [targetClient, target], [targetClient, target], [targetClient, target], [newClient(), ` ${target.toUpperCase()} `]] as const) {
        const response = await each.post('/auth/forgot-password', { email: address });
        answers.push({ status: response.status, body: await response.text(), retryAfter: response.headers.get('retry-after') });
      }
      expect(answers).toEqual(Array.from({ length: 5 }, () => ({ status: 204, body: '', retryAfter: null })));
    }
    expect(resetsSentTo(known).length).toBe(3);
    expect(resetsSentTo(unknown).length).toBe(0);
    // The dropped requests left the third link alone: it is still the newest and it still works.
    const token = await latestResetToken(db, known);
    expect(resetsSentTo(known)[2].html.includes(`/reset-password?token=${token}">`)).toBe(true);
    expect((await newClient().post('/auth/reset-password', { token, password: testPassword() })).status).toBe(204);

    const floodClient = newClient();
    for (let attempt = 1; attempt <= 10; attempt++) {
      expect((await floodClient.post('/auth/forgot-password', { email: track() })).status, `attempt ${attempt}`).toBe(204);
    }
    const blocked = await floodClient.post('/auth/forgot-password', { email: known });
    expect(blocked.status).toBe(429);
    expect((await errorOf(blocked)).code).toBe('RATE_LIMITED');
    const retryAfter = Number(blocked.headers.get('retry-after'));
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(60 * 60);
    // The counter is stored under a digest, never under the address itself.
    expect(await db.$count(authRateLimits, like(authRateLimits.key, `%${known}%`))).toBe(0);
  }, 120_000);

  it('answers the same when the mail cannot be sent, and the next request sends again', async () => {
    const client = newClient();
    const owner = await signupUser(client, db, track());
    const send = vi.spyOn(mail, 'send').mockRejectedValueOnce(new Error('Test transport failed'));
    try {
      const response = await client.post('/auth/forgot-password', { email: owner.email });
      expect(response.status).toBe(204);
      expect(await response.text()).toBe('');
      expect(send).toHaveBeenCalledOnce();
    } finally { send.mockRestore(); }
    expect(resetsSentTo(owner.email).length).toBe(0);
    await requestLink(client, owner.email);
    expect(resetsSentTo(owner.email).length).toBe(1);
  }, 60_000);

  it('rejects other origins, unknown fields and invalid values, and keeps the native reset routes closed', async () => {
    const client = newClient();
    const owner = await signupUser(client, db, track());
    const token = await requestLink(client, owner.email);
    const password = testPassword();
    for (const origin of [null, 'null', 'https://untrusted.example.invalid', `${TEST_ORIGIN}.evil.example.invalid`]) {
      for (const [path, body] of [['/auth/forgot-password', { email: owner.email }], ['/auth/reset-password', { token, password }]] as const) {
        const response = await client.post(path, body, { origin });
        expect(response.status, `${path} ${origin}`).toBe(403);
        expect((await errorOf(response)).code).toBe('ORIGIN_REJECTED');
      }
    }
    for (const [field, body] of [
      ['password', { token, password: 'x'.repeat(11) }], ['password', { token, password: 'x'.repeat(129) }], ['password', { token }],
      ['token', { token: '', password }], ['token', { token: 'x'.repeat(129), password }], ['token', { password }],
      ['email', { token, password, email: owner.email }], ['userId', { token, password, userId: owner.user.id }],
    ] as const) {
      const response = await client.post('/auth/reset-password', body);
      expect(response.status, field).toBe(400);
      expect(await errorOf(response)).toMatchObject({ code: 'VALIDATION_FAILED', fieldErrors: { [field]: [expect.any(String)] } });
    }
    for (const body of [{ email: 'not-an-address' }, {}, { email: owner.email, userId: owner.user.id }]) {
      const response = await client.post('/auth/forgot-password', body);
      expect(response.status).toBe(400);
      expect((await errorOf(response)).code).toBe('VALIDATION_FAILED');
    }
    for (const [path, body] of [['request-password-reset', { email: owner.email }], ['forget-password', { email: owner.email }], ['reset-password', { token, newPassword: password }]] as const) {
      const response = await fetch(`${baseUrl}/api/auth/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: TEST_ORIGIN }, body: JSON.stringify(body) });
      expect(response.status, path).toBe(404);
    }
    expect((await fetch(`${baseUrl}/api/auth/reset-password/${token}?callbackURL=/`)).status).toBe(404);
    // None of the refused requests used the link up or sent anything more.
    expect(resetsSentTo(owner.email).length).toBe(1);
    expect((await client.post('/auth/login', { email: owner.email, password: owner.password })).status).toBe(200);
    expect((await client.post('/auth/reset-password', { token, password })).status).toBe(204);
  }, 90_000);
});
