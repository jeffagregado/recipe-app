import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { CreateRecipeMetadata } from '@recipe-app/contracts/types';
import { DRIZZLE_DB } from '../database/database.module.js';
import type { DrizzleDb } from '../database/database.service.js';
import { recipeImages, recipeWriteAttempts } from '../database/schema.js';
import { StorageService } from '../storage/storage.service.js';
import { RecipeError, logRecipeFailure, recipeCleanupFailure, recipeUnavailable } from './recipe-errors.js';
import { parseRecipeMetadata, recipeRequestHash, validateRecipeFiles } from './recipe-metadata.js';
import { validateRecipeImage } from './recipe-images.js';
import type { RecipeUploadRequest } from './recipe-upload.js';
import { RECIPE_WRITE_TIMEOUT_MS } from './recipe-upload.js';
import { RecipeWriteHook } from './recipe-write-hook.js';
import { completeRecipeAttempt, persistRecipe } from './recipe-persist.js';
import type { PlannedImage } from './recipe-persist.js';
import { resolveRecipeAttempt } from './recipe-reconcile.js';

export const RECIPE_ATTEMPT_STALE_MS = 2 * RECIPE_WRITE_TIMEOUT_MS;

type CreateResult = { id: string; replay: boolean };
type WriteBudget = { deadline: number; transactionStarted: boolean };
type RecipeWrite = { attemptId: string; userId: string; recipeId: string; metadata: CreateRecipeMetadata; images: PlannedImage[]; deadline: number };
type CreateAttempt = Pick<typeof recipeWriteAttempts.$inferSelect, 'id' | 'userId' | 'idempotencyKey' | 'requestHash' | 'recipeId' | 'objectKeys'>;
type WriteClaim = { owned: boolean };

@Injectable()
export class RecipeCreateService {
  constructor(@Inject(DRIZZLE_DB) private readonly db: DrizzleDb, private readonly storage: StorageService, private readonly hook: RecipeWriteHook) {}

  create(request: RecipeUploadRequest): Promise<CreateResult> {
    const metadata = parseRecipeMetadata(request.body ?? {});
    const files = validateRecipeFiles(metadata, request.files ?? []);
    const budget: WriteBudget = { deadline: request.writeDeadline!, transactionStarted: false };
    const deadline = budget.deadline;
    const checkDeadline = () => { if (Date.now() >= deadline) throw new RecipeError(504, 'TIMEOUT', 'Recipe write timed out. Retry with the same key and payload.'); };
    const work = this.write(request.user!.id, request.idempotencyKey!, metadata, files, checkDeadline, budget);
    request.writeSettled = work;
    return new Promise<CreateResult>((resolve, reject) => {
      const timer = setTimeout(() => reject(new RecipeError(504, 'TIMEOUT', budget.transactionStarted
        ? 'Recipe save outcome is unknown. Retry with the same key and unchanged payload.'
        : 'Recipe write timed out before persistence. Recipe was not saved; cleanup may still be running. Retry with the same key and payload.')), Math.max(1, deadline - Date.now()));
      work.then(resolve, reject).finally(() => clearTimeout(timer));
    });
  }

  private async write(userId: string, key: string, metadata: Parameters<typeof persistRecipe>[1], files: Parameters<typeof validateRecipeFiles>[1], checkDeadline: () => void, budget: WriteBudget): Promise<CreateResult> {
    const recipeId = randomUUID();
    const images = files.map((file, index) => ({ file, id: randomUUID(), key: `recipes/${recipeId}/${randomUUID()}.${validateRecipeImage(file)}`,
      sortOrder: file.fieldname === 'cover' ? 0 : index + (files[0]?.fieldname === 'cover' ? 0 : 1) }));
    const hash = recipeRequestHash(metadata, files);
    const startedKeys: string[] = [];
    const attemptId = randomUUID();
    const claim: WriteClaim = { owned: false };
    try {
      checkDeadline();
      const replay = await this.claimAttempt({ id: attemptId, userId, idempotencyKey: key, requestHash: hash, recipeId,
        objectKeys: images.map((image) => image.key) }, claim, checkDeadline);
      if (replay) return replay;
      for (const image of images) { checkDeadline(); startedKeys.push(image.key); await this.storage.upload(image.key, image.file.buffer, image.file.mimetype); }
      checkDeadline();
      budget.transactionStarted = true;
      await this.commit({ attemptId, userId, recipeId, metadata, images, deadline: budget.deadline }, checkDeadline);
      return { id: recipeId, replay: false };
    } catch (cause) {
      if (claim.owned) {
        const committed = await this.compensate(attemptId, startedKeys, cause, budget.transactionStarted);
        if (committed) return { id: committed, replay: false };
      }
      if (cause instanceof RecipeError) throw cause;
      throw recipeUnavailable('create', cause);
    }
  }

  /** Returns a completed replay, or leaves ownership of a fresh pending row for persistence. */
  private async claimAttempt(attempt: CreateAttempt, claim: WriteClaim, checkDeadline: () => void): Promise<CreateResult | undefined> {
    // A second INSERT follows only confirmed stale-claim removal; unknown INSERT outcomes go straight to compensation.
    for (let round = 0; round < 2; round++) {
      checkDeadline(); claim.owned = true;
      const [inserted] = await this.db.insert(recipeWriteAttempts).values({ ...attempt, operation: 'create', state: 'pending' })
        .onConflictDoNothing({ target: [recipeWriteAttempts.userId, recipeWriteAttempts.idempotencyKey] }).returning({ id: recipeWriteAttempts.id });
      if (inserted) return undefined;
      claim.owned = false;
      const replay = await this.replay(attempt.userId, attempt.idempotencyKey, attempt.requestHash);
      if (replay) return replay;
    }
    throw new RecipeError(409, 'IDEMPOTENCY_IN_PROGRESS', 'Prior attempt changed. Retry with the same key.');
  }

  private async commit({ attemptId, userId, recipeId, metadata, images, deadline }: RecipeWrite, checkDeadline: () => void): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('statement_timeout', ${String(Math.max(1, deadline - Date.now()))}, true)`);
      const [attempt] = await tx.select().from(recipeWriteAttempts).where(eq(recipeWriteAttempts.id, attemptId)).for('update');
      if (!attempt || attempt.state !== 'pending') throw new RecipeError(409, 'IDEMPOTENCY_IN_PROGRESS', 'Recipe attempt was reconciled. Retry with the same key.');
      checkDeadline(); await persistRecipe(tx, metadata, userId, recipeId, images);
      await this.hook.beforeComplete(tx); checkDeadline(); await completeRecipeAttempt(tx, attempt.id);
    });
  }

  private async replay(userId: string, key: string, hash: string): Promise<CreateResult | undefined> {
    const existing = await this.db.query.recipeWriteAttempts.findFirst({ where: and(eq(recipeWriteAttempts.userId, userId), eq(recipeWriteAttempts.idempotencyKey, key)) });
    if (!existing) throw new RecipeError(409, 'IDEMPOTENCY_IN_PROGRESS', 'Prior attempt is settling. Retry with the same key.');
    const resolved = await resolveRecipeAttempt(this.db, this.storage, existing.id, {
      now: new Date(), pendingBefore: new Date(Date.now() - RECIPE_ATTEMPT_STALE_MS), expected: { userId, hash },
    });
    return resolved.recipeId ? { id: resolved.recipeId, replay: true } : undefined;
  }

  /** Called only after the transaction Promise settles; a failed COMMIT acknowledgement does not prove rollback. */
  private async compensate(attemptId: string, startedKeys: string[], cause: unknown, transactionStarted: boolean): Promise<string | undefined> {
    let resolved = false;
    try {
      const result = await resolveRecipeAttempt(this.db, this.storage, attemptId, { now: new Date(), onResolved: () => { resolved = true; } });
      if (result.recipeId) { logRecipeFailure('create', cause); return result.recipeId; }
      if (!result.removed && startedKeys.length) {
        // A takeover removed our fenced row while an upload was still settling. Only our old, unreferenced keys are eligible.
        const references = await this.db.select({ key: recipeImages.objectKey }).from(recipeImages).where(inArray(recipeImages.objectKey, startedKeys));
        if (references.length) throw new Error('Recipe state cannot safely be compensated.');
        for (const key of startedKeys) await this.storage.deleteObject(key);
      }
    } catch (cleanupCause) {
      logRecipeFailure('cleanup', cleanupCause);
      // Keep the pending claim and recorded keys reconcilable when any cleanup operation fails.
      throw recipeCleanupFailure(cause, cleanupCause, !resolved && transactionStarted);
    }
  }
}
