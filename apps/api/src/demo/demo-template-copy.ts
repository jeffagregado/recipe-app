import { randomUUID } from 'node:crypto';
import { posix } from 'node:path';
import { and, asc, eq, inArray } from 'drizzle-orm';
import type { DrizzleDb } from '../database/database.service.js';
import { categories, favorites, recipeCategories, recipeImages, recipeIngredients, recipeInstructions, recipes } from '../database/schema.js';
import { DEMO_TEMPLATE_ID } from './demo-template.js';

type Transaction = Parameters<Parameters<DrizzleDb['transaction']>[0]>[0];

/** A template photo and the new key its copy is stored under. */
export type PhotoCopy = { source: string; target: string };

/**
 * Copies the Demo template's Categories, Recipes (ingredients, steps, Category links, photo rows) and Favorites to `userId`
 * under new ids, keeping every other value, order and timestamp. Each photo row gets a new key under its new recipe; the
 * objects themselves are copied by the caller, so deleting a copy never touches the template's objects. Canonical
 * ingredients are shared, as for every recipe.
 */
export async function copyDemoTemplate(tx: Transaction, userId: string): Promise<PhotoCopy[]> {
  const categoryRows = await tx.select().from(categories).where(eq(categories.userId, DEMO_TEMPLATE_ID)).orderBy(asc(categories.sortOrder));
  const recipeRows = await tx.select().from(recipes).where(eq(recipes.userId, DEMO_TEMPLATE_ID)).orderBy(asc(recipes.sortOrder));
  const categoryIds = new Map(categoryRows.map(({ id }) => [id, randomUUID()]));
  const recipeIds = new Map(recipeRows.map(({ id }) => [id, randomUUID()]));
  if (categoryRows.length) await tx.insert(categories).values(categoryRows.map((row) => ({ ...row, id: categoryIds.get(row.id)!, userId })));
  if (!recipeRows.length) return [];

  const sources = [...recipeIds.keys()];
  const [imageRows, stepRows, ingredientRows, tagRows, favoriteRows] = await Promise.all([
    tx.select().from(recipeImages).where(inArray(recipeImages.recipeId, sources)),
    tx.select().from(recipeInstructions).where(inArray(recipeInstructions.recipeId, sources)),
    tx.select().from(recipeIngredients).where(inArray(recipeIngredients.recipeId, sources)),
    tx.select().from(recipeCategories).where(inArray(recipeCategories.recipeId, sources)),
    tx.select().from(favorites).where(and(eq(favorites.userId, DEMO_TEMPLATE_ID), inArray(favorites.recipeId, sources))),
  ]);
  const imageIds = new Map(imageRows.map(({ id }) => [id, randomUUID()]));
  const copies = imageRows.map((row) => ({ row, target: `recipes/${recipeIds.get(row.recipeId)}/${randomUUID()}${posix.extname(row.objectKey)}` }));

  await tx.insert(recipes).values(recipeRows.map((row) => ({ ...row, id: recipeIds.get(row.id)!, userId })));
  if (copies.length) await tx.insert(recipeImages).values(copies.map(({ row, target }) => ({ ...row, id: imageIds.get(row.id)!, recipeId: recipeIds.get(row.recipeId)!, objectKey: target })));
  if (stepRows.length) await tx.insert(recipeInstructions).values(stepRows.map((row) => ({
    ...row, id: randomUUID(), recipeId: recipeIds.get(row.recipeId)!, imageId: row.imageId === null ? null : imageIds.get(row.imageId)!,
  })));
  if (ingredientRows.length) await tx.insert(recipeIngredients).values(ingredientRows.map((row) => ({ ...row, id: randomUUID(), recipeId: recipeIds.get(row.recipeId)! })));
  if (tagRows.length) await tx.insert(recipeCategories).values(tagRows.map((row) => ({ ...row, recipeId: recipeIds.get(row.recipeId)!, categoryId: categoryIds.get(row.categoryId)! })));
  if (favoriteRows.length) await tx.insert(favorites).values(favoriteRows.map((row) => ({ ...row, userId, recipeId: recipeIds.get(row.recipeId)! })));
  return copies.map(({ row, target }) => ({ source: row.objectKey, target }));
}
