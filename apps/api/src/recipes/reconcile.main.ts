import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module.js';
import { DatabaseService } from '../database/database.service.js';
import { StorageService } from '../storage/storage.service.js';
import { logRecipeFailure } from './recipe-errors.js';
import { reconcileRecipeWrites } from './recipe-reconcile.js';

try {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false, abortOnError: false });
  try {
    const counts = await reconcileRecipeWrites(app.get(DatabaseService).db, app.get(StorageService), { now: new Date() });
    console.log(`Recipe reconciliation complete: ${counts.completed} completed, ${counts.removed} removed, ${counts.deletedObjects} objects deleted, ${counts.failed} failed.`);
    if (counts.failed) process.exitCode = 1;
  } finally { await app.close(); }
} catch (cause) { logRecipeFailure('reconcile', cause); process.exitCode = 1; }
