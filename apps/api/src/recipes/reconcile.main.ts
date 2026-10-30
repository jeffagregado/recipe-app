import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module.js';
import { DatabaseService } from '../database/database.service.js';
import { StorageService } from '../storage/storage.service.js';
import { logRecipeFailure } from './recipe-errors.js';
import { reconcilePendingPhotos } from './pending-photos.js';
import { reconcileRecipeWrites } from './recipe-reconcile.js';

try {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false, abortOnError: false });
  try {
    const [db, storage] = [app.get(DatabaseService).db, app.get(StorageService)];
    const counts = await reconcileRecipeWrites(db, storage, { now: new Date() });
    console.log(`Recipe reconciliation complete: ${counts.completed} completed, ${counts.removed} removed, ${counts.deletedObjects} objects deleted, ${counts.failed} failed.`);
    const photos = await reconcilePendingPhotos(db, storage, { now: new Date() });
    console.log(`Pending photo reconciliation complete: ${photos.expired} expired deleted, ${photos.orphans} unnamed photos deleted, ${photos.failed} failed.`);
    if (counts.failed || photos.failed) process.exitCode = 1;
  } finally { await app.close(); }
} catch (cause) { logRecipeFailure('reconcile', cause); process.exitCode = 1; }
