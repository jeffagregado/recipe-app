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

  /**
   * Deletes the Demo accounts a run started, as the sweep does: their copied photos first, then the rows of each account
   * whose photos are all gone, then the start counters of the addresses it used. An account whose photo delete failed
   * keeps its rows, so its keys stay on record, and the first storage error is rethrown once the rest is done.
   */
  async function removeAccounts(db: DrizzleDb, userIds: string[], addresses: string[]): Promise<{ accounts: number; objects: number }> {
    const photos = userIds.length ? await db.select({ userId: recipes.userId, key: recipeImages.objectKey }).from(recipeImages)
      .innerJoin(recipes, eq(recipes.id, recipeImages.recipeId)).where(inArray(recipes.userId, userIds)) : [];
    const kept = new Set<string>();
    let failure: { error: unknown } | undefined;
    for (const { userId, key } of photos) {
      try { await storage.deleteObject(key); } catch (error) { kept.add(userId); failure ??= { error }; }
    }
    const removed = userIds.filter((id) => !kept.has(id));
    if (removed.length) await db.delete(users).where(inArray(users.id, removed));
    const counters = [
      ...(addresses.length ? [inArray(authRateLimits.key, addresses.map((address) => rateLimitKey('demo-start:address', address)))] : []),
      ...removed.map((id) => like(authRateLimits.key, `wrapper:%:user:${id}`)),
    ];
    if (counters.length) await db.delete(authRateLimits).where(or(...counters));
    if (failure) throw failure.error;
    return { accounts: removed.length, objects: photos.length };
  }

  return { seed, remove, removeAccounts, close: () => app.close() };
}
