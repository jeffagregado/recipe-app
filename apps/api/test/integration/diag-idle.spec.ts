// [DIAG-10] temporary: which storage calls fail when they reuse a connection the server is closing after 60 s idle, and how?
import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { StorageService } from '../../src/storage/storage.service.js';
import { startApi } from '../auth-harness.js';
import { jpeg } from '../recipe-suite.js';

describe('[DIAG-10] idle storage connection', () => {
  let app: Awaited<ReturnType<typeof startApi>>['app'];
  beforeAll(async () => { ({ app } = await startApi()); }, 60_000);
  afterAll(() => app?.close(), 60_000);

  const reason = (start: unknown) => {
    const parts: string[] = [];
    for (let error = start, depth = 0; error instanceof Error && depth < 6; error = error.cause, depth++) {
      const status = '$metadata' in error ? ` HTTP ${(error.$metadata as { httpStatusCode?: number } | undefined)?.httpStatusCode ?? 'none'}` : '';
      parts.push(`${error.name}${'code' in error && typeof error.code === 'string' ? ` ${error.code}` : ''}${status}`);
    }
    return parts.join(' <- ');
  };

  it('deletes and uploads over connections left idle', async () => {
    const from = Number(process.env.DIAG_10_IDLE_FROM ?? 59_500); const step = Number(process.env.DIAG_10_IDLE_STEP ?? 10); const count = Number(process.env.DIAG_10_IDLE_COUNT ?? 60);
    const config = app.get(ConfigService);
    // One storage client per probe, so each probe owns exactly one connection. Odd probes upload, even ones delete.
    const results = await Promise.all(Array.from({ length: count }, async (_, index) => {
      const storage = new StorageService(config); const idle = from + index * step; const key = `verification/diag-${randomUUID()}.jpg`; const call = index % 2 ? 'upload' : 'delete';
      try {
        const opened = Date.now(); await storage.deleteObject(`verification/diag-${randomUUID()}.jpg`); const roundTrip = Date.now() - opened;
        await new Promise((resolve) => setTimeout(resolve, idle));
        const at = Date.now();
        try {
          if (call === 'upload') await storage.upload(key, jpeg(1), 'image/jpeg'); else await storage.deleteObject(key);
          return `idle ${idle} ms ${call}: done in ${Date.now() - at} ms (first call ${roundTrip} ms)`;
        } catch (cause) { return `idle ${idle} ms ${call}: FAILED in ${Date.now() - at} ms, ${reason(cause)} (first call ${roundTrip} ms)`; }
        finally { if (call === 'upload') await storage.deleteObject(key).catch(() => storage.deleteObject(key)); }
      } finally { storage.onApplicationShutdown(); }
    }));
    console.log(`[DIAG-10] idle sweep\n${results.join('\n')}`);
    expect(results).toHaveLength(count);
  }, 120_000);
});
