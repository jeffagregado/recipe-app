import { NestFactory } from '@nestjs/core';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { eq, inArray } from 'drizzle-orm';
import { validateEnvironment } from '../src/config/environment.js';
import type { DrizzleDb } from '../src/database/database.service.js';
import { recipeImages, recipes, recipeWriteAttempts } from '../src/database/schema.js';
import { StorageModule } from '../src/storage/storage.module.js';
import { StorageService } from '../src/storage/storage.service.js';

/** Plain function calls: the E2E runner compiles this file without Nest's legacy decorator metadata. */
function cleanupModule(envFilePath: string) {
  class StorageCleanupModule {}
  Module({
    imports: [ConfigModule.forRoot({ isGlobal: true, envFilePath, skipProcessEnv: true, validate: validateEnvironment }), StorageModule],
  })(StorageCleanupModule);
  return StorageCleanupModule;
}

/** Object keys never leave this module; callers only see counts. */
export async function openStorageCleanup(envFilePath: string) {
  const app = await NestFactory.createApplicationContext(cleanupModule(envFilePath), { logger: false, abortOnError: false });
  const storage = app.get(StorageService);

  /** Every stored object a set of users' recipes and write attempts point at (including stale and pending ones). */
  async function collectObjectKeys(db: DrizzleDb, userIds: string[]): Promise<string[]> {
    if (userIds.length === 0) return [];
    const images = await db.select({ key: recipeImages.objectKey }).from(recipeImages)
      .innerJoin(recipes, eq(recipes.id, recipeImages.recipeId))
      .where(inArray(recipes.userId, userIds));
    const attempts = await db.select({ keys: recipeWriteAttempts.objectKeys, stale: recipeWriteAttempts.staleObjectKeys })
      .from(recipeWriteAttempts).where(inArray(recipeWriteAttempts.userId, userIds));
    return [...new Set([...images.map(({ key }) => key), ...attempts.flatMap(({ keys, stale }) => [...keys, ...stale])])];
  }

  async function deleteObjects(keys: string[]): Promise<{ deleted: number; failed: number }> {
    let failed = 0;
    for (const key of keys) {
      try { await storage.deleteObject(key); } catch { failed++; }
    }
    return { deleted: keys.length - failed, failed };
  }

  /** Counts objects that still answer 200; a deleted or never-uploaded key answers 404. */
  async function countRemaining(keys: string[]): Promise<number> {
    let remaining = 0;
    for (const key of keys) {
      try { if ((await fetch(await storage.signedDownloadUrl(key))).status === 200) remaining++; } catch { remaining++; }
    }
    return remaining;
  }

  return { collectObjectKeys, deleteObjects, countRemaining, close: () => app.close() };
}
