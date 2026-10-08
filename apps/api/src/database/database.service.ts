import { Injectable } from '@nestjs/common';
import type { OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
  readonly db: DrizzleDb;
  private readonly pool: pg.Pool;
  private closePromise?: Promise<void>;

  // Bootstrap binds this to app.close() before initialization, including HTTP shutdown.
  onPoolError: (error: DatabaseError) => void = (error) => { throw error; };

  constructor(config: ConfigService<Environment, true>) {
    this.pool = new pg.Pool({
      connectionString: config.get('DATABASE_URL', { infer: true }),
      ssl: { rejectUnauthorized: true },
      max: 5,
      connectionTimeoutMillis: 10_000,
    });
    this.pool.on('error', (cause: Error) => {
      this.onPoolError(new DatabaseError('Database pool connection failed. Check Neon availability and DATABASE_URL; API is shutting down.', { cause }));
    });
    this.db = drizzle(this.pool, { schema });
  }

  async onModuleInit(): Promise<void> {
    try {
      const probe: pg.QueryConfig & Pick<pg.ClientConfig, 'query_timeout'> = {
        text: 'SELECT 1', query_timeout: 10_000,
      };
      await this.pool.query(probe);
    } catch (cause) {
      try {
        await this.onApplicationShutdown();
      } catch (cleanupCause) {
        throw new DatabaseError('Database startup probe and pool cleanup failed. Check DATABASE_URL and Neon connectivity.', { cause: new AggregateError([cause, cleanupCause]) });
      }
      throw new DatabaseError('Database startup SELECT 1 failed. Check DATABASE_URL, Neon availability, TLS, and network access.', { cause });
    }
  }

  async onApplicationShutdown(): Promise<void> {
    this.closePromise ??= this.pool.end().catch((cause: unknown) => {
      throw new DatabaseError('Database pool shutdown failed.', { cause });
    });
    await this.closePromise;
  }
}
