import { randomUUID } from 'node:crypto';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { CreateRecipeMetadata } from '@recipe-app/contracts/types';
import type { DrizzleDb } from '../database/database.service.js';
import { categories, ingredients, recipeCategories, recipeImages, recipeIngredients, recipeInstructions, recipes, recipeWriteAttempts } from '../database/schema.js';
import type { RecipeTransaction } from './recipe-write-hook.js';
import { fieldError } from './recipe-errors.js';

/** An image row to insert: `field` is its slot, `cover` or `step-<index>`. */
export type PlannedImage = { field: string; id: string; key: string; sortOrder: number };

const slotPosition = (field: string) => (field === 'cover' ? -1 : Number(field.slice('step-'.length)));
/** Cover first, then step photos in step order, whether they arrived as files or as Pending photos. */
export const bySlot = (a: { field: string }, b: { field: string }) => slotPosition(a.field) - slotPosition(b.field);

/** A new recipe's images in slot order: the cover at 0, then step photos from 1. */
export function orderImages<T extends Omit<PlannedImage, 'sortOrder'>>(images: T[]): (T & { sortOrder: number })[] {
  const sorted = images.toSorted(bySlot);
  const first = sorted[0]?.field === 'cover' ? 0 : 1;
  return sorted.map((image, index) => ({ ...image, sortOrder: first + index }));
}

export async function persistRecipe(tx: RecipeTransaction, metadata: CreateRecipeMetadata, userId: string, recipeId: string, images: PlannedImage[]): Promise<void> {
  await tx.insert(recipes).values({ id: recipeId, userId, title: metadata.title, description: metadata.description,
    notes: metadata.notes, videoUrl: metadata.videoUrl, servings: metadata.servings,
    prepTimeMinutes: metadata.prepTimeMinutes, cookTimeMinutes: metadata.cookTimeMinutes });
  await insertRecipeIngredients(tx, recipeId, metadata.ingredients);
  if (images.length) await tx.insert(recipeImages).values(images.map((image) => ({
    id: image.id, recipeId, objectKey: image.key, sortOrder: image.sortOrder,
  })));
  await tx.insert(recipeInstructions).values(metadata.instructions.map((step, index) => ({
    id: randomUUID(), recipeId, stepNumber: index + 1, description: step.description, heading: step.heading ?? null,
    imageId: images.find((image) => image.field === `step-${index}`)?.id ?? null,
  })));
  await insertRecipeCategories(tx, recipeId, userId, metadata.categoryIds);
}

/** Upserts canonical ingredients case-insensitively, then stores the recipe's own ordered snapshots. */
export async function insertRecipeIngredients(tx: RecipeTransaction, recipeId: string, rows: CreateRecipeMetadata['ingredients']): Promise<void> {
  // Sort canonical writes consistently to avoid deadlocks when requests share several ingredients in different row orders.
  const canonical = new Map<string, string>();
  const names = [...new Map(rows.map((row) => [row.name.toLowerCase(), row.name])).entries()].sort(([a], [b]) => a.localeCompare(b));
  for (const [name, spelling] of names) {
    // Drizzle's typed conflict target accepts columns only; PostgreSQL must infer the existing expression index.
    const { rows: [row] } = await tx.execute<{ id: string }>(sql`
      insert into ${ingredients} (name) values (${spelling})
      on conflict (lower(btrim(name))) do update set name = ${ingredients.name}
      returning ${ingredients.id}
    `);
    canonical.set(name, row.id);
  }
  await tx.insert(recipeIngredients).values(rows.map((row, sortOrder) => ({
    recipeId, ingredientId: canonical.get(row.name.toLowerCase())!, name: row.name,
    quantity: row.quantity === null ? null : String(row.quantity), unit: row.unit, preparation: null, note: null, heading: row.heading ?? null, sortOrder,
  })));
}

/** Rejects an id that is not one of the owner's categories: unknown, deleted since the form loaded, or another account's. */
export async function assertOwnedCategories(db: Pick<DrizzleDb, 'select'>, userId: string, ids: string[], lock = false): Promise<void> {
  if (!ids.length) return;
  const owned = db.select({ id: categories.id }).from(categories).where(and(eq(categories.userId, userId), inArray(categories.id, ids)));
  // The key-share lock keeps a concurrent category delete from removing a row between this check and the tag insert.
  if ((await (lock ? owned.for('key share') : owned)).length !== ids.length) throw fieldError('categories', 'A category was removed. Reload the page to see the current list.');
}

export async function insertRecipeCategories(tx: RecipeTransaction, recipeId: string, userId: string, ids: string[]): Promise<void> {
  if (!ids.length) return;
  await assertOwnedCategories(tx, userId, ids, true);
  await tx.insert(recipeCategories).values(ids.map((categoryId, sortOrder) => ({ recipeId, categoryId, sortOrder })));
}

/** Objects the committed write replaced stay recorded as `cleanup_pending` until they are deleted from storage. */
export async function completeRecipeAttempt(tx: RecipeTransaction, attemptId: string, staleObjectKeys: string[] = []): Promise<void> {
  await tx.update(recipeWriteAttempts).set(staleObjectKeys.length
    // PostgreSQL's clock, so the cleanup lease reads as free to the resolver straight away.
    ? { state: 'cleanup_pending', staleObjectKeys, updatedAt: sql`date_trunc('milliseconds', clock_timestamp())` }
    : { state: 'completed', updatedAt: new Date() }).where(eq(recipeWriteAttempts.id, attemptId));
}
