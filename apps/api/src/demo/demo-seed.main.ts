import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { config } from 'dotenv';
import { validateEnvironment } from '../config/environment.js';
import type { Environment } from '../config/environment.js';
import { DatabaseService } from '../database/database.service.js';
import { StorageService } from '../storage/storage.service.js';
import { runDemoSeed } from './demo-template-seed.js';

/** Writes the Demo template to the database and storage that the API configuration names; see DEMO.md. */
try {
  // Process values win over apps/api/.env, so a run can name another branch without editing the file.
  config({ quiet: true });
  const settings = new ConfigService<Environment, true>(validateEnvironment(process.env));
  const database = new DatabaseService(settings);
  const storage = new StorageService(settings);
  try {
    process.exitCode = await runDemoSeed(database.db, storage, console);
  } finally {
    storage.onApplicationShutdown();
    await database.onApplicationShutdown();
  }
} catch (error) {
  // Configuration errors name keys only, never values.
  console.error(String(error));
  process.exitCode = 1;
}
