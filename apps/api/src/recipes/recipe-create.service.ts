import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { DRIZZLE_DB } from '../database/database.module.js';
import type { DrizzleDb } from '../database/database.service.js';
import { parseRecipeMetadata, recipeRequestHash } from './recipe-metadata.js';
import type { RecipeUploadRequest } from './recipe-upload.js';
import { RecipeAttempts } from './recipe-attempts.js';
import type { RecipeWriteResult } from './recipe-attempts.js';
import { assertOwnedCategories, orderImages, persistRecipe } from './recipe-persist.js';
import { assertPendingPhotos, pendingPhotoUses, takePendingPhotos } from './pending-photos.js';

@Injectable()
export class RecipeCreateService {
  constructor(@Inject(DRIZZLE_DB) private readonly db: DrizzleDb, private readonly attempts: RecipeAttempts) {}

  async create(request: RecipeUploadRequest): Promise<RecipeWriteResult> {
    const metadata = parseRecipeMetadata(request.recipeJson);
    const userId = request.user!.id;
    const recipeId = randomUUID();
    const pending = pendingPhotoUses(metadata);
    return this.attempts.execute(request, {
      attempt: { id: randomUUID(), userId, idempotencyKey: request.idempotencyKey!, operation: 'create', requestHash: recipeRequestHash(metadata), recipeId },
      // Before the transaction, so a stale category or an unusable Pending photo is refused without writing.
      prepare: async () => {
        await assertOwnedCategories(this.db, userId, metadata.categoryIds);
        await assertPendingPhotos(this.db, userId, pending);
      },
      apply: async (tx) => {
        await persistRecipe(tx, metadata, userId, recipeId, orderImages(await takePendingPhotos(tx, userId, pending)));
        return [];
      },
    });
  }
}
