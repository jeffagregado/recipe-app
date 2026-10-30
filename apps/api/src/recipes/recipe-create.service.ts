import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { DRIZZLE_DB } from '../database/database.module.js';
import type { DrizzleDb } from '../database/database.service.js';
import { parseRecipeMetadata, recipeRequestHash, validateRecipeFiles } from './recipe-metadata.js';
import { writeDeadlineCheck } from './recipe-upload.js';
import type { RecipeUploadRequest } from './recipe-upload.js';
import { RecipeAttempts } from './recipe-attempts.js';
import type { RecipeWriteResult } from './recipe-attempts.js';
import { assertOwnedCategories, persistRecipe } from './recipe-persist.js';
import { assertPendingPhotos, pendingPhotoUses, takePendingPhotos } from './pending-photos.js';

@Injectable()
export class RecipeCreateService {
  constructor(@Inject(DRIZZLE_DB) private readonly db: DrizzleDb, private readonly attempts: RecipeAttempts) {}

  async create(request: RecipeUploadRequest): Promise<RecipeWriteResult> {
    const metadata = parseRecipeMetadata(request.body ?? {});
    const photos = await validateRecipeFiles(metadata, request.files ?? [], writeDeadlineCheck(request.writeDeadline!));
    const userId = request.user!.id;
    const recipeId = randomUUID();
    const pending = pendingPhotoUses(metadata);
    const images = photos.map((photo, index) => ({ photo, field: photo.fieldname, id: randomUUID(), key: `recipes/${recipeId}/${randomUUID()}.${photo.extension}`,
      sortOrder: photo.fieldname === 'cover' ? 0 : index + (photos[0]?.fieldname === 'cover' ? 0 : 1) }));
    return this.attempts.execute(request, {
      attempt: { id: randomUUID(), userId, idempotencyKey: request.idempotencyKey!, operation: 'create', requestHash: recipeRequestHash(metadata, photos),
        recipeId, objectKeys: images.map((image) => image.key) },
      uploads: images,
      // Before any upload, so a stale category or an unusable Pending photo never costs a stored photo.
      prepare: async () => {
        await assertOwnedCategories(this.db, userId, metadata.categoryIds);
        await assertPendingPhotos(this.db, userId, pending);
      },
      apply: async (tx) => {
        // Only the cover can name a Pending photo, and the cover is always position 0.
        const covers = (await takePendingPhotos(tx, userId, pending)).map((image) => ({ ...image, sortOrder: 0 }));
        await persistRecipe(tx, metadata, userId, recipeId, [...covers, ...images]);
        return [];
      },
    });
  }
}
