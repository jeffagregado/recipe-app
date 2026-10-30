import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { expectedRecipeUpdateFileFields, updateRecipeMetadataSchema } from '@recipe-app/contracts/schemas';
import { DRIZZLE_DB } from '../database/database.module.js';
import type { DrizzleDb } from '../database/database.service.js';
import { RecipeAttempts } from './recipe-attempts.js';
import type { RecipeWriteResult } from './recipe-attempts.js';
import { matchRecipeFiles, parseRecipeMetadata, recipeRequestHash } from './recipe-metadata.js';
import { assertOwnedCategories } from './recipe-persist.js';
import { assertPendingPhotos, pendingPhotoUses, takePendingPhotos } from './pending-photos.js';
import { applyRecipeUpdate, loadRecipeState, planRecipeUpdate } from './recipe-update.js';
import { writeDeadlineCheck } from './recipe-upload.js';
import type { RecipeUploadRequest } from './recipe-upload.js';

@Injectable()
export class RecipeUpdateService {
  constructor(@Inject(DRIZZLE_DB) private readonly db: DrizzleDb, private readonly attempts: RecipeAttempts) {}

  async update(id: string, request: RecipeUploadRequest): Promise<RecipeWriteResult> {
    const metadata = parseRecipeMetadata(request.body ?? {}, updateRecipeMetadataSchema);
    const photos = await matchRecipeFiles(expectedRecipeUpdateFileFields(metadata), request.files ?? [], writeDeadlineCheck(request.writeDeadline!));
    const userId = request.user!.id;
    const pending = pendingPhotoUses(metadata);
    const images = photos.map((photo) => ({ photo, field: photo.fieldname, id: randomUUID(), key: `recipes/${id}/${randomUUID()}.${photo.extension}` }));
    return this.attempts.execute(request, {
      attempt: { id: randomUUID(), userId, idempotencyKey: request.idempotencyKey!, operation: 'update', requestHash: recipeRequestHash(metadata, photos, id),
        recipeId: id, objectKeys: images.map((image) => image.key) },
      uploads: images,
      // After the claim, so a replay still answers once its own edit has removed the steps it names; before any upload.
      prepare: async () => {
        planRecipeUpdate(await loadRecipeState(this.db, id, userId), metadata, images);
        await assertOwnedCategories(this.db, userId, metadata.categoryIds);
        await assertPendingPhotos(this.db, userId, pending);
      },
      apply: async (tx) => applyRecipeUpdate(tx, { id, userId, metadata, images: [...await takePendingPhotos(tx, userId, pending), ...images] }),
    });
  }
}
