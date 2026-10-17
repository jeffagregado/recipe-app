import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { config } from 'dotenv';
import { DrizzleQueryError } from 'drizzle-orm';
import { validateEnvironment } from '../config/environment.js';
import type { Environment } from '../config/environment.js';
import { DatabaseService } from '../database/database.service.js';
import { StorageService } from '../storage/storage.service.js';
import { writeDemoTemplate } from './demo-template-seed.js';

/** Writes the Demo template to the database and storage that the API configuration names; see DEMO.md. */
async function seed(): Promise<void> {
  // Process values win over apps/api/.env, so a run can name another branch without editing the file.
  config({ quiet: true });
  const settings = new ConfigService<Environment, true>(validateEnvironment(process.env));
  const database = new DatabaseService(settings);
  const storage = new StorageService(settings);
  try {
    const { recipes, photos } = await writeDemoTemplate(database.db, storage);
    console.log(`Demo template seed complete: ${recipes} recipes and ${photos} photos.`);
  } finally {
    storage.onApplicationShutdown();
    await database.onApplicationShutdown();
  }
}

try {
  await seed();
} catch (error) {
  // A failed query's message can quote its parameters, so it reports only the PostgreSQL error code.
  console.error(error instanceof DrizzleQueryError ? `Demo template seed write failed (code ${String(Object(error.cause).code)}).` : String(error));
  process.exitCode = 1;
}
