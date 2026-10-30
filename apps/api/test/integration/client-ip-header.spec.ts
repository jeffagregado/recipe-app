import { randomBytes } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { rateLimitKey } from '../../src/auth/auth.rate-limit.js';
import type { DrizzleDb } from '../../src/database/database.service.js';
import { authRateLimits } from '../../src/database/schema.js';
import { removeTestData, startApi, TEST_ORIGIN, testAddress, testEmail, testPassword } from '../auth-harness.js';
import { clientHeaders, TEST_WEB_SECRET } from '../test-web-secret.js';

/** A loopback address of the test's own, so the connecting IP the API falls back to is never shared with another run. */
const loopbackAddress = () => {
  const [a, b, c] = randomBytes(3);
  return `127.${a}.${b}.${(c % 254) + 1}`;
};

/**
 * The web app calls the API with its secret and the user's IP in X-Recipe-Client-IP. Each request here connects from a
 * loopback address of its own, which stands in for whatever connected to the API: the host's proxy or the web function.
 */
describe('Rate limits keyed on the client IP header', () => {
  let app: NestExpressApplication;
  let baseUrl: string;
  let db: DrizzleDb;
  const email = testEmail();
  const addresses: string[] = [];
  const address = () => { const issued = testAddress(); addresses.push(issued); return issued; };
  const connecting = () => { const issued = loopbackAddress(); addresses.push(issued); return issued; };

  const counted = async (key: string) => {
    const [row] = await db.select({ count: authRateLimits.count }).from(authRateLimits).where(eq(authRateLimits.key, key));
    return row?.count ?? 0;
  };
  const attempts = (address: string) => counted(rateLimitKey('login:address', address));
  /** Better Auth's own counter for its one native route, keyed `<address>|<path>`. */
  const healthChecks = (address: string) => counted(`${address}|/ok`);

  const send = (source: string, method: 'GET' | 'POST', path: string, headers: Record<string, string>, body?: string) => new Promise<number>((resolve, reject) => {
    const outgoing = httpRequest(`${baseUrl}${path}`, { method, localAddress: source, headers: { Origin: TEST_ORIGIN, ...headers } }, (response) => {
      response.resume();
      response.on('end', () => resolve(response.statusCode ?? 0));
    });
    outgoing.on('error', reject);
    outgoing.end(body);
  });
  /** A failed login from `source`, so each attempt is counted and no session is created. */
  const loginFrom = (source: string, headers: Record<string, string>) =>
    send(source, 'POST', '/auth/login', { 'Content-Type': 'application/json', ...headers }, JSON.stringify({ email, password: testPassword() }));

  beforeAll(async () => {
    ({ app, baseUrl, db } = await startApi());
  }, 60_000);
  afterAll(async () => {
    if (!app) return;
    try { await removeTestData(db, { emails: [email], addresses }); } finally { await app.close(); }
  });

  it('keys a request carrying the web secret on the IP in its client IP header', async () => {
    const [source, client] = [connecting(), address()];
    expect(await loginFrom(source, clientHeaders(client))).toBe(401);
    expect(await attempts(client)).toBe(1);
    expect(await attempts(source)).toBe(0);
  }, 30_000);

  it('gives two users behind the web app separate buckets', async () => {
    const [webFunction, first, second] = [connecting(), address(), address()];
    for (const client of [first, second, first]) {
      expect(await loginFrom(webFunction, clientHeaders(client))).toBe(401);
    }
    expect(await attempts(first)).toBe(2);
    expect(await attempts(second)).toBe(1);
    expect(await attempts(webFunction)).toBe(0);
  }, 30_000);

  it.each([
    ['no secret', {}],
    ['a wrong secret of the same length', { 'X-Recipe-Web-Secret': 'x'.repeat(TEST_WEB_SECRET.length) }],
    ['a wrong secret of another length', { 'X-Recipe-Web-Secret': 'short' }],
  ])('keys a caller with %s on its connecting IP, whatever client IP it names', async (_name, secret) => {
    const [source, spoofed] = [connecting(), address()];
    expect(await loginFrom(source, { ...secret, 'X-Recipe-Client-IP': spoofed })).toBe(401);
    expect(await attempts(source)).toBe(1);
    expect(await attempts(spoofed)).toBe(0);
  }, 30_000);

  it.each([
    ['no client IP', undefined],
    ['a client IP that is not an IP address', 'not-an-ip'],
    ['a list of addresses', '10.1.2.3, 10.4.5.6'],
  ])('keys a request carrying the web secret with %s on its connecting IP', async (_name, client) => {
    const source = connecting();
    expect(await loginFrom(source, { 'X-Recipe-Web-Secret': TEST_WEB_SECRET, ...(client ? { 'X-Recipe-Client-IP': client } : {}) })).toBe(401);
    expect(await attempts(source)).toBe(1);
  }, 30_000);

  it('keys Better Auth\'s own rate limit on the same client IP, never on an X-Forwarded-For a caller wrote', async () => {
    const [webFunction, client, direct, spoofed] = [connecting(), address(), connecting(), address()];
    expect(await send(webFunction, 'GET', '/api/auth/ok', { ...clientHeaders(client), 'X-Forwarded-For': spoofed })).toBe(200);
    expect(await send(direct, 'GET', '/api/auth/ok', { 'X-Recipe-Client-IP': spoofed, 'X-Forwarded-For': spoofed })).toBe(200);
    expect(await healthChecks(client)).toBe(1);
    expect(await healthChecks(direct)).toBe(1);
    expect(await healthChecks(spoofed)).toBe(0);
    expect(await healthChecks(webFunction)).toBe(0);
  }, 30_000);
});
