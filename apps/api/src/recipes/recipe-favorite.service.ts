import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DRIZZLE_DB } from '../database/database.module.js';
import type { DrizzleDb } from '../database/database.service.js';
import { favorites, recipes } from '../database/schema.js';
import { RecipeError, assertRecipeId, recipeNotFound, recipeUnavailable } from './recipe-errors.js';
import { RECIPE_MUTATION_SQL_TIMEOUT_MS, setStatementTimeout } from './recipe-write-hook.js';

@Injectable()
export class RecipeFavoriteService {
  constructor(@Inject(DRIZZLE_DB) private readonly db: DrizzleDb) {}

  /** Idempotent either way; only a recipe the user owns can be marked. */
  async set(id: string, userId: string, favorite: boolean): Promise<void> {
    assertRecipeId(id);
    try {
      await this.db.transaction(async (tx) => {
        await setStatementTimeout(tx, RECIPE_MUTATION_SQL_TIMEOUT_MS);
        // The key-share lock keeps a concurrent delete from removing the recipe between this check and the write.
        const [recipe] = await tx.select({ id: recipes.id }).from(recipes).where(and(eq(recipes.id, id), eq(recipes.userId, userId))).for('key share');
        if (!recipe) throw recipeNotFound();
        if (favorite) await tx.insert(favorites).values({ userId, recipeId: id }).onConflictDoNothing();
        else await tx.delete(favorites).where(and(eq(favorites.userId, userId), eq(favorites.recipeId, id)));
      });
    } catch (cause) {
      if (cause instanceof RecipeError) throw cause;
      throw recipeUnavailable('favorite', cause);
    }
  }
}
