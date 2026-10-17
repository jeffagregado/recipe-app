import { randomUUID } from 'node:crypto';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { UpdateRecipeMetadata } from '@recipe-app/contracts/types';
import type { DrizzleDb } from '../database/database.service.js';
import { recipeCategories, recipeImages, recipeIngredients, recipeInstructions, recipes } from '../database/schema.js';
import { fieldError, recipeNotFound } from './recipe-errors.js';
import { insertRecipeCategories, insertRecipeIngredients } from './recipe-persist.js';
import type { PlannedImage } from './recipe-persist.js';
import type { RecipeTransaction } from './recipe-write-hook.js';

/** A stored upload awaiting its place; an update decides sort orders only once it holds the recipe lock. */
export type UploadedImage = Omit<PlannedImage, 'sortOrder'>;
type StoredImage = Pick<typeof recipeImages.$inferSelect, 'id' | 'objectKey' | 'sortOrder'>;
export type RecipeState = { instructions: Pick<typeof recipeInstructions.$inferSelect, 'id' | 'imageId'>[]; images: StoredImage[] };
export type RecipeUpdate = { id: string; userId: string; metadata: UpdateRecipeMetadata; images: UploadedImage[] };

/** The owner's instructions and images; 404 when the recipe is not theirs. `lock` holds the recipe row until commit. */
export async function loadRecipeState(db: Pick<DrizzleDb, 'select'>, id: string, userId: string, lock = false): Promise<RecipeState> {
  const owned = db.select({ id: recipes.id }).from(recipes).where(and(eq(recipes.id, id), eq(recipes.userId, userId)));
  const [recipe] = await (lock ? owned.for('update') : owned);
  if (!recipe) throw recipeNotFound();
  const instructions = await db.select({ id: recipeInstructions.id, imageId: recipeInstructions.imageId }).from(recipeInstructions).where(eq(recipeInstructions.recipeId, id));
  const images = await db.select({ id: recipeImages.id, objectKey: recipeImages.objectKey, sortOrder: recipeImages.sortOrder }).from(recipeImages).where(eq(recipeImages.recipeId, id));
  return { instructions, images };
}

/** Resolves every image slot against the stored recipe. A kept photo follows its instruction to the new position;
 * a replaced or removed cover, and the photo of every edited or dropped instruction that is not kept, becomes stale.
 */
export function planRecipeUpdate(state: RecipeState, metadata: UpdateRecipeMetadata, uploads: UploadedImage[]) {
  const photos = new Map(state.instructions.map((step) => [step.id, step.imageId]));
  metadata.instructions.forEach((step, index) => {
    if (step.id !== null && !photos.has(step.id)) throw fieldError(`instructions.${index}.id`, 'Step does not belong to this recipe.');
  });
  const uploaded = (field: string) => uploads.find((image) => image.photo.fieldname === field);
  const stepImageIds = metadata.instructions.map((step, index) => {
    if (step.image === 'replace') return uploaded(`step-${index}`)?.id ?? null;
    return step.image === 'keep' && step.id !== null ? photos.get(step.id) ?? null : null;
  });
  const kept = new Set(stepImageIds); const linked = new Set(photos.values());
  // The cover is the image at position 0; images that neither slot kind owns are left alone.
  const stale = state.images.filter((image) => image.sortOrder === 0 ? metadata.cover !== 'keep' : linked.has(image.id) && !kept.has(image.id));
  let sortOrder = Math.max(0, ...state.images.filter((image) => !stale.includes(image)).map((image) => image.sortOrder));
  const added = uploads.map((image) => ({ id: image.id, objectKey: image.key, sortOrder: image.photo.fieldname === 'cover' ? 0 : ++sortOrder }));
  return { stepImageIds, stale, added };
}

/** Replaces the recipe's rows under its row lock and returns the object keys the new rows no longer reference. */
export async function applyRecipeUpdate(tx: RecipeTransaction, { id, userId, metadata, images }: RecipeUpdate): Promise<string[]> {
  const plan = planRecipeUpdate(await loadRecipeState(tx, id, userId, true), metadata, images);
  // Instructions go first: they hold the unique image links and step numbers the new rows reuse.
  await tx.delete(recipeInstructions).where(eq(recipeInstructions.recipeId, id));
  if (plan.stale.length) await tx.delete(recipeImages).where(inArray(recipeImages.id, plan.stale.map((image) => image.id)));
  if (plan.added.length) await tx.insert(recipeImages).values(plan.added.map((image) => ({ ...image, recipeId: id })));
  await tx.insert(recipeInstructions).values(metadata.instructions.map((step, index) => ({
    id: step.id ?? randomUUID(), recipeId: id, stepNumber: index + 1, description: step.description, heading: step.heading ?? null, imageId: plan.stepImageIds[index],
  })));
  await tx.delete(recipeIngredients).where(eq(recipeIngredients.recipeId, id));
  await insertRecipeIngredients(tx, id, metadata.ingredients);
  await tx.delete(recipeCategories).where(eq(recipeCategories.recipeId, id));
  await insertRecipeCategories(tx, id, userId, metadata.categoryIds);
  // PostgreSQL's clock at this statement, so serialized updates always move updated_at forward.
  await tx.update(recipes).set({ title: metadata.title, description: metadata.description, notes: metadata.notes, videoUrl: metadata.videoUrl,
    servings: metadata.servings, prepTimeMinutes: metadata.prepTimeMinutes, cookTimeMinutes: metadata.cookTimeMinutes,
    updatedAt: sql`clock_timestamp()` }).where(eq(recipes.id, id));
  return plan.stale.map((image) => image.objectKey);
}
