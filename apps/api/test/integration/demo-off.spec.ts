import type { NestExpressApplication } from '@nestjs/platform-express';
import { like } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DrizzleDb } from '../../src/database/database.service.js';
import { users } from '../../src/database/schema.js';
import { startApi, TEST_ORIGIN, testAddress } from '../auth-harness.js';

/** With the switch off the API is the one on master; every other suite runs it that way. */
describe('Live demo API with DEMO_MODE off', () => {
  let app: NestExpressApplication;
  let db: DrizzleDb;
  let baseUrl: string;

  beforeAll(async () => {
    process.env.DEMO_MODE = 'false';
    ({ app, baseUrl, db } = await startApi());
  }, 60_000);
  afterAll(async () => {
    delete process.env.DEMO_MODE;
    await app?.close();
  });

  it('has no Start demo endpoint', async () => {
    const before = await db.$count(users, like(users.email, '%@demo.invalid'));
    const response = await fetch(`${baseUrl}/api/demo/start`, { method: 'POST', headers: { Origin: TEST_ORIGIN, 'X-Forwarded-For': testAddress() } });
    expect(response.status).toBe(404);
    expect(response.headers.getSetCookie()).toEqual([]);
    expect(await db.$count(users, like(users.email, '%@demo.invalid'))).toBe(before);
  }, 30_000);
});
