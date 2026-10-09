import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { parseRecipeMetadata, recipeRequestHash, validateRecipeFiles } from './recipe-metadata.js';
import { validateRecipeImage } from './recipe-images.js';
import type { RecipeUploadRequest } from './recipe-upload.js';
import { RecipeAttempts } from './recipe-attempts.js';
import type { RecipeWriteResult } from './recipe-attempts.js';
import { persistRecipe } from './recipe-persist.js';

@Injectable()
export class RecipeCreateService {
  constructor(private readonly attempts: RecipeAttempts) {}

  create(request: RecipeUploadRequest): Promise<RecipeWriteResult> {
    const metadata = parseRecipeMetadata(request.body ?? {});
    const files = validateRecipeFiles(metadata, request.files ?? []);
    const userId = request.user!.id;
    const recipeId = randomUUID();
    const images = files.map((file, index) => ({ file, id: randomUUID(), key: `recipes/${recipeId}/${randomUUID()}.${validateRecipeImage(file)}`,
      sortOrder: file.fieldname === 'cover' ? 0 : index + (files[0]?.fieldname === 'cover' ? 0 : 1) }));
    return this.attempts.execute(request, {
      attempt: { id: randomUUID(), userId, idempotencyKey: request.idempotencyKey!, operation: 'create', requestHash: recipeRequestHash(metadata, files),
        recipeId, objectKeys: images.map((image) => image.key) },
      uploads: images,
      apply: async (tx) => { await persistRecipe(tx, metadata, userId, recipeId, images); return []; },
    });
  }
}
