import type { NestExpressApplication } from '@nestjs/platform-express';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { rateLimitKey } from '../../src/auth/auth.rate-limit.js';
import type { DrizzleDb } from '../../src/database/database.service.js';
import { authRateLimits } from '../../src/database/schema.js';
import { apiClient, removeTestData, startApi, testAddress, testEmail, testPassword } from '../auth-harness.js';

/**
 * The deployed shape: the host's proxy connects to the API and appends the web server's address to X-Forwarded-For,
 * whose first entry is the browser's address as the web server forwarded it. Here the loopback socket stands in for
 * the host's proxy, so two hops put the client one entry left of the simulated web server.
 */
describe('Rate limits behind a trusted proxy hop', () => {
  let app: NestExpressApplication;
  let db: DrizzleDb;
  let client: ReturnType<typeof apiClient>;
  const [first, second, webServer, spoofed] = [testAddress(), testAddress(), testAddress(), testAddress()];
  const email = testEmail();

  const attempts = async (address: string) => {
    const [row] = await db.select({ count: authRateLimits.count }).from(authRateLimits).where(eq(authRateLimits.key, rateLimitKey('login:address', address)));
    return row?.count ?? 0;
  };

  beforeAll(async () => {
    process.env.TRUST_PROXY_HOPS = '2';
    let baseUrl: string;
    ({ app, baseUrl, db } = await startApi());
    client = apiClient(baseUrl, first);
  }, 60_000);
  afterAll(async () => {
    delete process.env.TRUST_PROXY_HOPS;
    if (!app) return;
    try { await removeTestData(db, { emails: [email], addresses: [first, second, webServer, spoofed] }); } finally { await app.close(); }
  });

  it('counts each forwarded client on its own, never on the web server, and ignores an extra hop the client supplied', async () => {
    const password = testPassword();
    for (const chain of [`${first}, ${webServer}`, `${second}, ${webServer}`, `${spoofed}, ${first}, ${webServer}`]) {
      const response = await client.post('/auth/login', { email, password }, { address: chain });
      expect(response.status, chain).toBe(401);
    }
    expect(await attempts(first)).toBe(2);
    expect(await attempts(second)).toBe(1);
    expect(await attempts(webServer)).toBe(0);
    expect(await attempts(spoofed)).toBe(0);
  }, 30_000);
});
