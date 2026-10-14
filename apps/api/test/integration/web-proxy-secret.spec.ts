import type { NestExpressApplication } from '@nestjs/platform-express';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WEB_PROXY_SECRET_HEADER } from '../../src/auth/auth.request.js';
import { rateLimitKey } from '../../src/auth/auth.rate-limit.js';
import type { DrizzleDb } from '../../src/database/database.service.js';
import { authRateLimits } from '../../src/database/schema.js';
import { apiClient, removeTestData, startApi, testAddress, testEmail, testPassword } from '../auth-harness.js';

/**
 * The deployed shape as in proxy-hops.spec.ts: the loopback socket stands in for the host's proxy, whose X-Forwarded-For
 * entry on the right is the address that connected to it. Two hops are configured for the web server in front, but only a
 * request carrying the shared secret came through it; any other caller is keyed on the address the host's proxy saw.
 */
describe('Rate limits with a web proxy secret', () => {
  const secret = 's'.repeat(40);
  let app: NestExpressApplication;
  let db: DrizzleDb;
  let client: ReturnType<typeof apiClient>;
  const [browser, webServer, direct, spoofed] = [testAddress(), testAddress(), testAddress(), testAddress()];
  const email = testEmail();

  const attempts = async (address: string) => {
    const [row] = await db.select({ count: authRateLimits.count }).from(authRateLimits).where(eq(authRateLimits.key, rateLimitKey('login:address', address)));
    return row?.count ?? 0;
  };
  const login = (chain: string, headers?: Record<string, string>) => client.post('/auth/login', { email, password: testPassword() }, { address: chain, headers });

  beforeAll(async () => {
    process.env.TRUST_PROXY_HOPS = '2';
    process.env.RECIPE_WEB_PROXY_SECRET = secret;
    let baseUrl: string;
    ({ app, baseUrl, db } = await startApi());
    client = apiClient(baseUrl, browser);
  }, 60_000);
  afterAll(async () => {
    delete process.env.TRUST_PROXY_HOPS;
    delete process.env.RECIPE_WEB_PROXY_SECRET;
    if (!app) return;
    try { await removeTestData(db, { emails: [email], addresses: [browser, webServer, direct, spoofed] }); } finally { await app.close(); }
  });

  it('keys a request carrying the secret on the browser address the web server forwarded', async () => {
    expect((await login(`${browser}, ${webServer}`, { [WEB_PROXY_SECRET_HEADER]: secret })).status).toBe(401);
    expect(await attempts(browser)).toBe(1);
    expect(await attempts(webServer)).toBe(0);
  }, 30_000);

  it.each([
    ['no secret', undefined],
    ['a wrong secret of the same length', { [WEB_PROXY_SECRET_HEADER]: 'x'.repeat(40) }],
    ['a wrong secret of another length', { [WEB_PROXY_SECRET_HEADER]: 'short' }],
  ])('keys a direct caller with %s on its real address, whatever it puts in X-Forwarded-For', async (_name, headers) => {
    const before = await attempts(direct);
    expect((await login(`${spoofed}, ${direct}`, headers)).status).toBe(401);
    expect(await attempts(direct)).toBe(before + 1);
    expect(await attempts(spoofed)).toBe(0);
  }, 30_000);
});
