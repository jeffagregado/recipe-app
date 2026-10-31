import { ConfigService } from '@nestjs/config';
import { afterEach, describe, expect, it } from 'vitest';
import { DatabaseError, DatabaseService } from '../../src/database/database.service.js';
import { getDevDatabaseUrl } from '../neon-dev.js';

describe('Database startup probe', () => {
  let service: DatabaseService | undefined;
  afterEach(async () => { await service?.onApplicationShutdown(); service = undefined; });

  // On Vercel a pooled client opened at boot carries no request context, so its every release logs a warning (#134).
  it('leaves the pool without clients after a successful probe', async () => {
    service = new DatabaseService(new ConfigService({ DATABASE_URL: await getDevDatabaseUrl() }));

    await service.onModuleInit();

    expect(service.db.$client.totalCount).toBe(0);
  }, 60_000);

  it('fails startup and closes the pool when the probe cannot connect', async () => {
    service = new DatabaseService(new ConfigService({ DATABASE_URL: 'postgresql://probe:probe@127.0.0.1:1/probe' }));

    const startup = service.onModuleInit();

    await expect(startup).rejects.toThrow(new DatabaseError('Database startup SELECT 1 failed. Check DATABASE_URL, Neon availability, TLS, and network access.'));
    expect(service.db.$client.ended).toBe(true);
  });
});
