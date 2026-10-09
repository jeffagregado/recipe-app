import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DRIZZLE_DB } from '../database/database.module.js';
import type { DrizzleDb } from '../database/database.service.js';
import { recipeImages, recipes, recipeWriteAttempts } from '../database/schema.js';
import { RecipeAttempts } from './recipe-attempts.js';
import { RecipeError, assertRecipeId, recipeNotFound, recipeUnavailable } from './recipe-errors.js';
import { RECIPE_MUTATION_SQL_TIMEOUT_MS, setStatementTimeout } from './recipe-write-hook.js';

@Injectable()
export class RecipeDeleteService {
  constructor(@Inject(DRIZZLE_DB) private readonly db: DrizzleDb, private readonly attempts: RecipeAttempts) {}

  /** The recipe is gone once the transaction commits; stored objects that outlive it stay recorded for reconciliation. */
  async remove(id: string, userId: string): Promise<void> {
    assertRecipeId(id);
    const attemptId = randomUUID();
    let recorded: boolean;
    try {
      recorded = await this.db.transaction(async (tx) => {
        await setStatementTimeout(tx, RECIPE_MUTATION_SQL_TIMEOUT_MS);
        const [recipe] = await tx.select({ id: recipes.id }).from(recipes).where(and(eq(recipes.id, id), eq(recipes.userId, userId))).for('update');
        if (!recipe) throw recipeNotFound();
        const images = await tx.select({ key: recipeImages.objectKey }).from(recipeImages).where(eq(recipeImages.recipeId, id));
        // Finished writes of this recipe have nothing left to replay. Unfinished ones keep their rows for their own cleanup.
        await tx.delete(recipeWriteAttempts).where(and(eq(recipeWriteAttempts.recipeId, id), eq(recipeWriteAttempts.userId, userId), eq(recipeWriteAttempts.state, 'completed')));
        // The key is server-generated and never a client UUID, so no request can claim or replay this row.
        if (images.length) await tx.insert(recipeWriteAttempts).values({ id: attemptId, userId, idempotencyKey: `delete:${attemptId}`, operation: 'delete',
          requestHash: 'delete', recipeId: id, staleObjectKeys: images.map(({ key }) => key), state: 'cleanup_pending' });
        // Ingredients, steps, category joins, favorites and image rows cascade; canonical ingredients are shared and stay.
        await tx.delete(recipes).where(eq(recipes.id, id));
        return images.length > 0;
      });
    } catch (cause) {
      if (cause instanceof RecipeError) throw cause;
      throw recipeUnavailable('delete', cause);
    }
    if (recorded) await this.attempts.cleanCommitted(attemptId);
  }
}
