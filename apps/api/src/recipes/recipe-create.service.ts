import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { DRIZZLE_DB } from '../database/database.module.js';
import type { DrizzleDb } from '../database/database.service.js';
import { parseRecipeMetadata, recipeRequestHash, validateRecipeFiles } from './recipe-metadata.js';
import type { RecipeUploadRequest } from './recipe-upload.js';
import { RecipeAttempts } from './recipe-attempts.js';
import type { RecipeWriteResult } from './recipe-attempts.js';
import { assertOwnedCategories, persistRecipe } from './recipe-persist.js';

@Injectable()
export class RecipeCreateService {
  constructor(@Inject(DRIZZLE_DB) private readonly db: DrizzleDb, private readonly attempts: RecipeAttempts) {}

  create(request: RecipeUploadRequest): Promise<RecipeWriteResult> {
    const metadata = parseRecipeMetadata(request.body ?? {});
    const photos = validateRecipeFiles(metadata, request.files ?? []);
    const userId = request.user!.id;
    const recipeId = randomUUID();
    const images = photos.map((photo, index) => ({ photo, id: randomUUID(), key: `recipes/${recipeId}/${randomUUID()}.${photo.extension}`,
      sortOrder: photo.fieldname === 'cover' ? 0 : index + (photos[0]?.fieldname === 'cover' ? 0 : 1) }));
    return this.attempts.execute(request, {
      attempt: { id: randomUUID(), userId, idempotencyKey: request.idempotencyKey!, operation: 'create', requestHash: recipeRequestHash(metadata, photos),
        recipeId, objectKeys: images.map((image) => image.key) },
      uploads: images,
      // Before any upload, so a stale category never costs a stored photo.
      prepare: () => assertOwnedCategories(this.db, userId, metadata.categoryIds),
      apply: async (tx) => { await persistRecipe(tx, metadata, userId, recipeId, images); return []; },
    });
  }
}
