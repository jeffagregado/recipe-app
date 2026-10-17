import { NestFactory } from '@nestjs/core';
import { eq, inArray, like, or, sql } from 'drizzle-orm';
import { rateLimitKey } from '../src/auth/auth.rate-limit.js';
import type { DrizzleDb } from '../src/database/database.service.js';
import { authRateLimits, ingredients, recipeImages, recipes, users } from '../src/database/schema.js';
import { StorageService } from '../src/storage/storage.service.js';
import { removeDemoTemplate, seedDemoTemplate } from './demo-template.js';
import { cleanupModule } from './storage-cleanup.js';

/**
 * The small Demo template for the demo E2E run, which works from outside the API with a storage client of its own. Object
 * keys never leave this module; callers only see counts.
 */
export async function openDemoTemplate(envFilePath: string) {
  const app = await NestFactory.createApplicationContext(cleanupModule(envFilePath), { logger: false, abortOnError: false });
  const storage = app.get(StorageService);

  /** Seeds the template; its canonical ingredient names start with `name`. */
  const seed = (db: DrizzleDb, name: string) => seedDemoTemplate(db, storage, name);

  /** Deletes the template, its photos and its canonical ingredients. */
  async function remove(db: DrizzleDb, name: string): Promise<void> {
    await removeDemoTemplate(db, storage);
    await db.delete(ingredients).where(like(sql`lower(${ingredients.name})`, `${name.toLowerCase()}%`));
  }

  /** Deletes the Demo accounts a run started, their copied photos and the start counters of the addresses it used. */
  async function removeAccounts(db: DrizzleDb, userIds: string[], addresses: string[]): Promise<{ accounts: number; objects: number; failed: number }> {
    const keys = userIds.length ? (await db.select({ key: recipeImages.objectKey }).from(recipeImages)
      .innerJoin(recipes, eq(recipes.id, recipeImages.recipeId)).where(inArray(recipes.userId, userIds))).map(({ key }) => key) : [];
    let failed = 0;
    for (const key of keys) {
      try { await storage.deleteObject(key); } catch { failed++; }
    }
    if (userIds.length) await db.delete(users).where(inArray(users.id, userIds));
    const counters = [
      ...(addresses.length ? [inArray(authRateLimits.key, addresses.map((address) => rateLimitKey('demo-start:address', address)))] : []),
      ...userIds.map((id) => like(authRateLimits.key, `wrapper:%:user:${id}`)),
    ];
    if (counters.length) await db.delete(authRateLimits).where(or(...counters));
    return { accounts: userIds.length, objects: keys.length, failed };
  }

  return { seed, remove, removeAccounts, close: () => app.close() };
}
