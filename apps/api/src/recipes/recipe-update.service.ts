import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Optional } from '@nestjs/common';
import { expectedRecipeUpdateFileFields, updateRecipeMetadataSchema } from '@recipe-app/contracts/schemas';
import { DRIZZLE_DB } from '../database/database.module.js';
import type { DrizzleDb } from '../database/database.service.js';
import { RecipeAttempts } from './recipe-attempts.js';
import type { RecipeWriteResult } from './recipe-attempts.js';
import { matchRecipeFiles, parseRecipeMetadata, recipeRequestHash } from './recipe-metadata.js';
import { assertOwnedCategories } from './recipe-persist.js';
import { applyRecipeUpdate, loadRecipeState, planRecipeUpdate } from './recipe-update.js';
import { writeDeadlineCheck } from './recipe-upload.js';
import type { RecipeUploadRequest } from './recipe-upload.js';
import { DEMO_RECIPE_POLICY } from '../demo/demo-recipe-policy.js';
import type { DemoRecipePolicy } from '../demo/demo-recipe-policy.js';

@Injectable()
export class RecipeUpdateService {
  constructor(@Inject(DRIZZLE_DB) private readonly db: DrizzleDb, private readonly attempts: RecipeAttempts,
    @Optional() @Inject(DEMO_RECIPE_POLICY) private readonly demo?: DemoRecipePolicy) {}

  async update(id: string, request: RecipeUploadRequest): Promise<RecipeWriteResult> {
    this.demo?.refuseUploads(request.files);
    const metadata = parseRecipeMetadata(request.body ?? {}, updateRecipeMetadataSchema);
    const photos = await matchRecipeFiles(expectedRecipeUpdateFileFields(metadata), request.files ?? [], writeDeadlineCheck(request.writeDeadline!));
    const userId = request.user!.id;
    const images = photos.map((photo) => ({ photo, id: randomUUID(), key: `recipes/${id}/${randomUUID()}.${photo.extension}` }));
    return this.attempts.execute(request, {
      attempt: { id: randomUUID(), userId, idempotencyKey: request.idempotencyKey!, operation: 'update', requestHash: recipeRequestHash(metadata, photos, id),
        recipeId: id, objectKeys: images.map((image) => image.key) },
      uploads: images,
      // After the claim, so a replay still answers once its own edit has removed the steps it names; before any upload.
      prepare: async () => {
        const state = await loadRecipeState(this.db, id, userId);
        planRecipeUpdate(state, metadata, images);
        this.demo?.refusePhotoRemoval(state, metadata);
        await assertOwnedCategories(this.db, userId, metadata.categoryIds);
      },
      apply: (tx) => applyRecipeUpdate(tx, { id, userId, metadata, images }),
    });
  }
}
