import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { config } from 'dotenv';
import { DrizzleQueryError } from 'drizzle-orm';
import { validateDatabaseUrl } from '../config/environment.js';
import { DatabaseService } from './database.service.js';
import { seedDatabase } from './seed.js';

async function seed(): Promise<void> {
  config({ quiet: true });
  const database = new DatabaseService(new ConfigService({ DATABASE_URL: validateDatabaseUrl(process.env.DATABASE_URL) }));
  try {
    await seedDatabase(database.db);
    console.log('Recipe seed complete: 20 samples, five categories, fictional author without login credentials.');
  } finally {
    await database.onApplicationShutdown();
  }
}

try {
  await seed();
} catch (error) {
  // Driver errors may contain query parameters; report root codes without exposing them.
  let cause: unknown = error;
  while (cause instanceof Error && cause.cause) cause = cause.cause;
  const code = typeof cause === 'object' && cause !== null && 'code' in cause ? String(cause.code) : 'no driver code';
  const message = error instanceof DrizzleQueryError ? 'Database seed write failed.' : error instanceof Error ? error.message : 'Seed failed.';
  console.error(`${message} (${code}) Check database constraints, seed ID collisions, and connectivity.`);
  process.exitCode = 1;
}
