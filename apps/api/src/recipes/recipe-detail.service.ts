import { Inject, Injectable } from '@nestjs/common';
import { ResilienceService } from '@nestjs/resilience';
import type { ResiliencePolicy } from '@nestjs/resilience';
import { and, eq } from 'drizzle-orm';
import { recipeDetailSchema } from '@recipe-app/contracts/schemas';
import type { RecipeDetail } from '@recipe-app/contracts/types';
import { DRIZZLE_DB } from '../database/database.module.js';
import type { DrizzleDb } from '../database/database.service.js';
import { recipes } from '../database/schema.js';
import { StorageService } from '../storage/storage.service.js';
import { createReadDeadline } from './recipe-read-deadline.js';
import { assertRecipeId, recipeNotFound, recipeUnavailable } from './recipe-errors.js';

@Injectable()
export class RecipeDetailService {
  private readonly policies: { read: ResiliencePolicy; database: ResiliencePolicy };
  constructor(@Inject(DRIZZLE_DB) private readonly db: DrizzleDb, private readonly storage: StorageService, resilience: ResilienceService) {
    this.policies = { read: resilience.preset('recipeRead'), database: resilience.preset('recipeDatabase') };
  }

  findOne(id: string, userId: string): Promise<RecipeDetail> {
    try { assertRecipeId(id); } catch (cause) { return Promise.reject(cause); }
    return this.policies.read.execute(async ({ signal }) => {
      const recipe = await this.policies.database.execute(() => this.db.transaction(async (tx) => {
        const read = createReadDeadline(signal);
        return read(tx, () => tx.query.recipes.findFirst({ where: and(eq(recipes.id, id), eq(recipes.userId, userId)), with: {
          categories: { orderBy: (row, { asc }) => [asc(row.sortOrder)], with: { category: true } },
          ingredients: { orderBy: (row, { asc }) => [asc(row.sortOrder)] },
          instructions: { orderBy: (row, { asc }) => [asc(row.stepNumber)], with: { image: true } },
          images: { where: (row, { eq }) => eq(row.sortOrder, 0), limit: 1 },
          favorites: { where: (row, { eq }) => eq(row.userId, userId), limit: 1 },
        } }));
      }, { isolationLevel: 'repeatable read', accessMode: 'read only' }), { signal, source: 'RecipeDetailService.findOne' });
      signal.throwIfAborted();
      if (!recipe) throw recipeNotFound();
      try {
        const imageUrl = recipe.images[0] ? await this.storage.signedDownloadUrl(recipe.images[0].objectKey) : null;
        const instructions = await Promise.all(recipe.instructions.map(async (step) => ({
          id: step.id, stepNumber: step.stepNumber, description: step.description,
          imageUrl: step.image ? await this.storage.signedDownloadUrl(step.image.objectKey) : null,
        })));
        signal.throwIfAborted();
        return recipeDetailSchema.parse({ id: recipe.id, userId: recipe.userId, title: recipe.title, description: recipe.description,
          notes: recipe.notes, videoUrl: recipe.videoUrl, servings: recipe.servings, prepTimeMinutes: recipe.prepTimeMinutes,
          cookTimeMinutes: recipe.cookTimeMinutes, categories: recipe.categories.map(({ category }) => ({ id: category.id, name: category.name })),
          ingredients: recipe.ingredients.map((row) => ({ ...row, quantity: row.quantity === null ? null : Number(row.quantity) })),
          instructions, imageUrl, isFavorite: recipe.favorites.length > 0, createdAt: recipe.createdAt.toISOString(), updatedAt: recipe.updatedAt.toISOString(),
        });
      } catch (cause) { signal.throwIfAborted(); throw recipeUnavailable('detail', cause); }
    }, { source: 'RecipeDetailService.findOne' });
  }
}
