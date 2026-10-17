import type { NestExpressApplication } from '@nestjs/platform-express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startApi, TEST_ORIGIN, testAddress } from '../auth-harness.js';

/** With the switch off the API is the one on master; every other suite runs it that way. */
describe('Live demo API with DEMO_MODE off', () => {
  let app: NestExpressApplication;
  let baseUrl: string;

  beforeAll(async () => {
    process.env.DEMO_MODE = 'false';
    ({ app, baseUrl } = await startApi());
  }, 60_000);
  afterAll(async () => {
    delete process.env.DEMO_MODE;
    await app?.close();
  });

  it('has no Start demo endpoint', async () => {
    const response = await fetch(`${baseUrl}/api/demo/start`, { method: 'POST', headers: { Origin: TEST_ORIGIN, 'X-Forwarded-For': testAddress() } });
    expect(response.status).toBe(404);
    expect(response.headers.getSetCookie()).toEqual([]);
  }, 30_000);
});
