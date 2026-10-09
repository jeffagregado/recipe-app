import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import type { CreateRecipeMetadata, RecipeCategory } from '@recipe-app/contracts/types';
import { categories, ingredients, recipeCategories, recipeImages, recipeIngredients, recipeInstructions, recipes, recipeWriteAttempts } from '../database/schema.js';
import type { RecipeTransaction } from './recipe-write-hook.js';
import type { RecipeFile } from './recipe-images.js';
import { RecipeError } from './recipe-errors.js';

export type PlannedImage = { file: RecipeFile; id: string; key: string; sortOrder: number };

export async function persistRecipe(tx: RecipeTransaction, metadata: CreateRecipeMetadata, userId: string, recipeId: string, images: PlannedImage[]): Promise<void> {
  await tx.insert(recipes).values({ id: recipeId, userId, title: metadata.title, description: metadata.description,
    notes: metadata.notes, videoUrl: metadata.videoUrl, servings: metadata.servings,
    prepTimeMinutes: metadata.prepTimeMinutes, cookTimeMinutes: metadata.cookTimeMinutes });
  await insertRecipeIngredients(tx, recipeId, metadata.ingredients);
  if (images.length) await tx.insert(recipeImages).values(images.map((image) => ({
    id: image.id, recipeId, objectKey: image.key, sortOrder: image.sortOrder,
  })));
  await tx.insert(recipeInstructions).values(metadata.instructions.map((step, index) => ({
    id: randomUUID(), recipeId, stepNumber: index + 1, description: step.description,
    imageId: images.find((image) => image.file.fieldname === `step-${index}`)?.id ?? null,
  })));
  await insertRecipeCategories(tx, recipeId, metadata.categories);
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
    quantity: row.quantity === null ? null : String(row.quantity), unit: row.unit, preparation: null, note: null, sortOrder,
  })));
}

export async function insertRecipeCategories(tx: RecipeTransaction, recipeId: string, names: RecipeCategory[]): Promise<void> {
  if (!names.length) return;
  const catalog = await tx.select().from(categories);
  const joins = names.map((name, sortOrder) => {
    const category = catalog.find((row) => row.name === name);
    if (!category) throw new RecipeError(503, 'SERVICE_UNAVAILABLE', 'Recipe category catalog is incomplete. Contact support.');
    return { recipeId, categoryId: category.id, sortOrder };
  });
  await tx.insert(recipeCategories).values(joins);
}

/** Objects the committed write replaced stay recorded as `cleanup_pending` until they are deleted from storage. */
export async function completeRecipeAttempt(tx: RecipeTransaction, attemptId: string, staleObjectKeys: string[] = []): Promise<void> {
  await tx.update(recipeWriteAttempts).set(staleObjectKeys.length
    // PostgreSQL's clock, so the cleanup lease reads as free to the resolver straight away.
    ? { state: 'cleanup_pending', staleObjectKeys, updatedAt: sql`date_trunc('milliseconds', clock_timestamp())` }
    : { state: 'completed', updatedAt: new Date() }).where(eq(recipeWriteAttempts.id, attemptId));
}
