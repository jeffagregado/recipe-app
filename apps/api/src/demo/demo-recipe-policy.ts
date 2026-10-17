import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { UpdateRecipeMetadata } from '@recipe-app/contracts/types';
import { DRIZZLE_DB } from '../database/database.module.js';
import type { DrizzleDb } from '../database/database.service.js';
import { recipes } from '../database/schema.js';
import { RecipeError } from '../recipes/recipe-errors.js';
import type { loadRecipeState } from '../recipes/recipe-update.js';

/** The recipe services' optional dependency: provided only by the demo module, so it is absent with `DEMO_MODE` off. */
export const DEMO_RECIPE_POLICY = Symbol('DEMO_RECIPE_POLICY');

/** The most recipes a Demo account may hold. */
export const DEMO_RECIPE_LIMIT = 30;

/** The demo's recipe write rules: no photo goes in or out, and an account's recipes are capped. Deleting a recipe stays allowed. */
@Injectable()
export class DemoRecipePolicy {
  constructor(@Inject(DRIZZLE_DB) private readonly db: DrizzleDb) {}

  refuseUploads(files: readonly unknown[] | undefined): void {
    if (files?.length) throw new RecipeError(403, 'DEMO_UPLOADS_DISABLED', 'Photo uploads are off in the demo.');
  }

  /**
   * Refuses an update that takes away the cover or the photo of a step it keeps. A step dropped from the recipe takes its
   * photo with it, as deleting the recipe does.
   */
  refusePhotoRemoval(state: Awaited<ReturnType<typeof loadRecipeState>>, metadata: UpdateRecipeMetadata): void {
    const hasCover = state.images.some((image) => image.sortOrder === 0);
    const photos = new Map(state.instructions.map((step) => [step.id, step.imageId]));
    const removesStepPhoto = metadata.instructions.some((step) => step.id !== null && photos.get(step.id) && step.image !== 'keep');
    if ((hasCover && metadata.cover !== 'keep') || removesStepPhoto) {
      throw new RecipeError(403, 'DEMO_PHOTO_REMOVAL_DISABLED', 'Photos cannot be removed in the demo.');
    }
  }

  async assertRoomForRecipe(userId: string): Promise<void> {
    if (await this.db.$count(recipes, eq(recipes.userId, userId)) >= DEMO_RECIPE_LIMIT) {
      throw new RecipeError(403, 'DEMO_RECIPE_LIMIT', `A demo account holds at most ${DEMO_RECIPE_LIMIT} recipes. Delete one to add another.`);
    }
  }
}
