import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { and, eq, inArray, ne, sql } from 'drizzle-orm';
import { createRecipeMetadataSchema } from '@recipe-app/contracts/schemas';
import type { DrizzleDb } from '../database/database.service.js';
import {
  authAccounts, categories, favorites, ingredients, recipeCategories, recipeImages, recipeIngredients, recipeInstructions, recipes, users,
} from '../database/schema.js';
import type { StorageService } from '../storage/storage.service.js';
import { DEMO_TEMPLATE_EMAIL, DEMO_TEMPLATE_ID } from './demo-template.js';
import { DEMO_TEMPLATE_CATEGORIES, DEMO_TEMPLATE_RECIPES, templateMetadata } from './template/demo-template-recipes.js';

type Transaction = Parameters<Parameters<DrizzleDb['transaction']>[0]>[0];
type Reader = Pick<DrizzleDb, 'select'>;

/** The committed Photos, already re-encoded by the app's own photo path (ADR 0002). */
const PHOTO_DIRECTORY = new URL('./template/photos/', import.meta.url);
/** Uploads in flight at once, so a seed beside the test suites stays gentle on storage. */
const UPLOAD_CONCURRENCY = 4;
/** The newest template recipe's creation time; each later one in the list is a day older. */
const NEWEST = Date.UTC(2026, 9, 10, 9);
const DAY_MS = 24 * 60 * 60 * 1000;

/** Each recipe with its fixed id, its creation time and its Photos: the cover, then the one step Photo if it has one. */
const plan = DEMO_TEMPLATE_RECIPES.map((recipe, index) => {
  const id = `demo-template-${recipe.slug}`;
  const stepIndex = recipe.steps.flatMap(({ rows }) => rows).findIndex((step) => typeof step !== 'string');
  const photos = [
    { stepIndex: null, key: `recipes/${id}/cover.webp`, file: `${recipe.slug}-cover.webp` },
    ...(stepIndex === -1 ? [] : [{ stepIndex, key: `recipes/${id}/step.webp`, file: `${recipe.slug}-step.webp` }]),
  ];
  return { id, recipe, photos, createdAt: new Date(NEWEST - index * DAY_MS) };
});
const recipeIds = plan.map(({ id }) => id);
const photoKeys = plan.flatMap(({ photos }) => photos.map(({ key }) => key));

/**
 * Refuses when anyone but the template owns a template recipe id. That also keeps its Photo keys free, since the app stores
 * every Photo under its own recipe's id.
 */
async function checkRecipeIdsFree(db: Reader): Promise<void> {
  const taken = await db.select({ id: recipes.id }).from(recipes).where(and(inArray(recipes.id, recipeIds), ne(recipes.userId, DEMO_TEMPLATE_ID)));
  if (taken.length) throw new Error('Demo template recipe ID collision with another owner. No records changed.');
}

/** Refuses unless the template owner is absent or is the reserved identity without a Sign-in method. */
async function checkOwner(db: Reader): Promise<void> {
  const [owner] = await db.select({ email: users.email }).from(users).where(eq(users.id, DEMO_TEMPLATE_ID));
  const [method] = await db.select({ id: authAccounts.id }).from(authAccounts).where(eq(authAccounts.userId, DEMO_TEMPLATE_ID)).limit(1);
  if ((owner && owner.email !== DEMO_TEMPLATE_EMAIL) || method) {
    throw new Error('Demo template owner collision: the seed needs its reserved owner without a Sign-in method. No records changed.');
  }
}

async function uploadPhotos(storage: StorageService): Promise<void> {
  const queue = plan.flatMap(({ photos }) => photos);
  const worker = async () => {
    for (let photo = queue.shift(); photo; photo = queue.shift()) {
      await storage.upload(photo.key, await readFile(new URL(photo.file, PHOTO_DIRECTORY)), 'image/webp');
    }
  };
  await Promise.all(Array.from({ length: UPLOAD_CONCURRENCY }, worker));
}

/** The shared ingredient catalog's id for each name, case-insensitively, adding the names it lacks. */
async function canonicalIngredients(tx: Transaction, names: string[]): Promise<Map<string, string>> {
  // Sorted like the recipe writes, so a seed and a concurrent save take the shared rows' locks in the same order.
  const unique = [...new Map(names.map((name) => [name.trim().toLowerCase(), name.trim()])).values()]
    .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
  await tx.insert(ingredients).values(unique.map((name) => ({ name }))).onConflictDoNothing();
  const rows = await tx.select().from(ingredients).where(inArray(sql`lower(btrim(${ingredients.name}))`, unique.map((name) => name.toLowerCase())));
  return new Map(rows.map(({ id, name }) => [name.trim().toLowerCase(), id]));
}

/**
 * Replaces the template's Categories, Recipes and Favorites in bulk, with the rows a create through the API would write.
 * Returns the stored keys that no template recipe refers to any more.
 */
async function replaceContent(tx: Transaction): Promise<string[]> {
  await tx.insert(users).values({ id: DEMO_TEMPLATE_ID, name: 'Demo template', email: DEMO_TEMPLATE_EMAIL, emailVerified: true }).onConflictDoNothing();
  await checkOwner(tx);
  await checkRecipeIdsFree(tx);
  const previous = await tx.select({ key: recipeImages.objectKey }).from(recipeImages).innerJoin(recipes, eq(recipes.id, recipeImages.recipeId))
    .where(eq(recipes.userId, DEMO_TEMPLATE_ID));
  // Recipes first: their Category links, ingredients, steps, Photo rows and Favorites cascade with them.
  await tx.delete(recipes).where(eq(recipes.userId, DEMO_TEMPLATE_ID));
  await tx.delete(categories).where(eq(categories.userId, DEMO_TEMPLATE_ID));
  const categoryRows = await tx.insert(categories)
    .values(DEMO_TEMPLATE_CATEGORIES.map((name, sortOrder) => ({ userId: DEMO_TEMPLATE_ID, name, sortOrder }))).returning();
  const categoryIds = new Map(categoryRows.map(({ id, name }) => [name, id]));

  const written = plan.map((entry) => ({
    ...entry,
    metadata: createRecipeMetadataSchema.parse(templateMetadata(entry.recipe, (name) => categoryIds.get(name)!)),
    images: entry.photos.map((photo, sortOrder) => ({ ...photo, imageId: randomUUID(), sortOrder })),
  }));
  const catalog = await canonicalIngredients(tx, written.flatMap(({ metadata }) => metadata.ingredients.map(({ name }) => name)));

  await tx.insert(recipes).values(written.map(({ id, metadata, createdAt }) => ({
    id, userId: DEMO_TEMPLATE_ID, title: metadata.title, description: metadata.description, notes: metadata.notes, videoUrl: metadata.videoUrl,
    servings: metadata.servings, prepTimeMinutes: metadata.prepTimeMinutes, cookTimeMinutes: metadata.cookTimeMinutes, createdAt, updatedAt: createdAt,
  })));
  await tx.insert(recipeIngredients).values(written.flatMap(({ id, metadata }) => metadata.ingredients.map((row, sortOrder) => ({
    recipeId: id, ingredientId: catalog.get(row.name.trim().toLowerCase())!, name: row.name,
    quantity: row.quantity === null ? null : String(row.quantity), unit: row.unit, preparation: null, note: null, heading: row.heading ?? null, sortOrder,
  }))));
  await tx.insert(recipeImages).values(written.flatMap(({ id, images }) => images.map(({ imageId, key, sortOrder }) => ({
    id: imageId, recipeId: id, objectKey: key, sortOrder,
  }))));
  await tx.insert(recipeInstructions).values(written.flatMap(({ id, metadata, images }) => metadata.instructions.map((step, index) => ({
    recipeId: id, stepNumber: index + 1, description: step.description, heading: step.heading ?? null,
    imageId: images.find(({ stepIndex }) => stepIndex === index)?.imageId ?? null,
  }))));
  await tx.insert(recipeCategories).values(written.flatMap(({ id, metadata }) => metadata.categoryIds.map((categoryId, sortOrder) => ({
    recipeId: id, categoryId, sortOrder,
  }))));
  await tx.insert(favorites).values(written.filter(({ recipe }) => recipe.favorite).map(({ id, createdAt }) => ({
    userId: DEMO_TEMPLATE_ID, recipeId: id, createdAt,
  })));
  return previous.map(({ key }) => key).filter((key) => !photoKeys.includes(key));
}

/**
 * Writes the Demo template that Start demo copies: its owner, Categories, 15 Recipes, Favorites and Photos. Running it again
 * converges on the same template. It refuses, before any upload or write, when the owner or a recipe id belongs to anyone
 * else. Photos are uploaded first under fixed keys, so the rows never point at a missing object; the photos of content it
 * replaced are deleted once the new rows are committed, and any that fail are reported.
 */
export async function writeDemoTemplate(db: DrizzleDb, storage: StorageService): Promise<{ recipes: number; photos: number }> {
  await checkOwner(db);
  await checkRecipeIdsFree(db);
  await uploadPhotos(storage);
  const replaced = await db.transaction(replaceContent);
  // The rows no longer name these keys, so a rerun cannot find them: try each one, then report what is left.
  const failed = (await Promise.allSettled(replaced.map((key) => storage.deleteObject(key)))).filter(({ status }) => status === 'rejected');
  if (failed.length) throw new Error(`Demo template written, but ${failed.length} replaced photo(s) could not be deleted from storage.`);
  return { recipes: plan.length, photos: photoKeys.length };
}
