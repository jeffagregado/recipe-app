import { Injectable } from '@nestjs/common';
import type { OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { attachDatabasePool } from '@vercel/functions';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import type { Environment } from '../config/environment.js';
import * as schema from './schema.js';

export type DrizzleDb = NodePgDatabase<typeof schema>;

export class DatabaseError extends Error {
  override readonly name = 'DatabaseError';
}

@Injectable()
export class DatabaseService implements OnModuleInit, OnApplicationShutdown {
  readonly db: DrizzleDb & { $client: pg.Pool };
  private readonly connectionConfig: pg.ClientConfig;
  private readonly pool: pg.Pool;
  private closePromise?: Promise<void>;

  // Bootstrap binds this to app.close() before initialization, including HTTP shutdown.
  onPoolError: (error: DatabaseError) => void = (error) => { throw error; };

  constructor(config: ConfigService<Environment, true>) {
    this.connectionConfig = {
      connectionString: config.get('DATABASE_URL', { infer: true }),
      ssl: { rejectUnauthorized: true },
      connectionTimeoutMillis: 10_000,
    };
    this.pool = new pg.Pool({ ...this.connectionConfig, max: 5 });
    // On Vercel, keeps a paused function from holding Neon connections: idle clients close before it pauses (ADR 0005).
    // Elsewhere this does nothing.
    attachDatabasePool(this.pool);
    this.pool.on('error', (cause: Error) => {
      this.onPoolError(new DatabaseError('Database pool connection failed. Check Neon availability and DATABASE_URL; API is shutting down.', { cause }));
    });
    this.db = drizzle(this.pool, { schema });
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.probe();
    } catch (cause) {
      try {
        await this.onApplicationShutdown();
      } catch (cleanupCause) {
        throw new DatabaseError('Database startup probe and pool cleanup failed. Check DATABASE_URL and Neon connectivity.', { cause: new AggregateError([cause, cleanupCause]) });
      }
      throw new DatabaseError('Database startup SELECT 1 failed. Check DATABASE_URL, Neon availability, TLS, and network access.', { cause });
    }
  }

  // Its own client, not the pool's: on Vercel a pooled client opened at boot releases outside every later request,
  // so attachDatabasePool cannot keep a paused function from holding it idle (#134).
  private async probe(): Promise<void> {
    const client = new pg.Client({ ...this.connectionConfig, query_timeout: 10_000 });
    // A socket error also rejects the pending query; without a listener its 'error' event would crash the process.
    client.on('error', () => {});
    try {
      await client.connect();
      await client.query('SELECT 1');
    } finally {
      await client.end();
    }
  }

  async onApplicationShutdown(): Promise<void> {
    this.closePromise ??= this.pool.end().catch((cause: unknown) => {
      throw new DatabaseError('Database pool shutdown failed.', { cause });
    });
    await this.closePromise;
  }
}
