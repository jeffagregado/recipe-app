import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { StorageService } from '../../src/storage/storage.service.js';
import { startApi } from '../auth-harness.js';

describe('Storage connections', () => {
  let app: Awaited<ReturnType<typeof startApi>>['app'];
  beforeAll(async () => { ({ app } = await startApi()); }, 60_000);
  afterAll(() => app?.close(), 60_000);

  // The storage server closes a connection 60 s after its last request (measured: 59,995 ms). A request written to a pooled
  // connection during the last round trip before that is reset, and the storage client makes one attempt per call.
  it('still deletes after being idle for as long as the storage server keeps a connection open', async () => {
    const config = app.get(ConfigService);
    // One client per idle time, so each owns one connection; 10 ms steps land inside a window one round trip wide.
    const idleTimes = Array.from({ length: 56 }, (_, index) => 59_500 + index * 10);
    const outcomes = await Promise.all(idleTimes.map(async (idle) => {
      const storage = new StorageService(config);
      try {
        await storage.deleteObject(`verification/${randomUUID()}.jpg`);
        await new Promise((resolve) => setTimeout(resolve, idle));
        return await storage.deleteObject(`verification/${randomUUID()}.jpg`).then(() => 'deleted', () => `failed after ${idle} ms idle`);
      } finally { storage.onApplicationShutdown(); }
    }));
    expect(outcomes.filter((outcome) => outcome !== 'deleted')).toEqual([]);
    // 90 s: the test is its 60 s of idle time; it took 61.4 s at 55 ms a round trip.
  }, 90_000);
});
