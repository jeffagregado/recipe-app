import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';
import { DRIZZLE_DB } from '../database/database.module.js';
import type { DrizzleDb } from '../database/database.service.js';
import { recipeImages, recipeWriteAttempts } from '../database/schema.js';
import { StorageService } from '../storage/storage.service.js';
import { RecipeError, logRecipeFailure, recipeCleanupFailure, recipeUnavailable } from './recipe-errors.js';
import type { RecipeFile } from './recipe-images.js';
import { completeRecipeAttempt } from './recipe-persist.js';
import { resolveRecipeAttempt } from './recipe-reconcile.js';
import type { RecipeUploadRequest } from './recipe-upload.js';
import { RECIPE_WRITE_TIMEOUT_MS } from './recipe-upload.js';
import { RecipeWriteHook, setStatementTimeout } from './recipe-write-hook.js';
import type { RecipeTransaction } from './recipe-write-hook.js';

const RECIPE_ATTEMPT_STALE_MS = 2 * RECIPE_WRITE_TIMEOUT_MS;

export type RecipeWriteResult = { id: string; replay: boolean };
type WriteBudget = { deadline: number; transactionStarted: boolean };
type WriteAttempt = Pick<typeof recipeWriteAttempts.$inferSelect, 'id' | 'userId' | 'idempotencyKey' | 'requestHash' | 'recipeId' | 'objectKeys'>
  & { operation: 'create' | 'update' };
type WriteClaim = { owned: boolean };
/** One idempotent recipe write: the claim to record, the objects to store first, and the rows to change in one transaction. */
export type RecipeWritePlan = {
  attempt: WriteAttempt;
  uploads: { key: string; file: RecipeFile }[];
  /** Runs once the claim is owned and before any upload; throws to reject the write. */
  prepare?: () => Promise<void>;
  /** Returns the keys of stored objects the committed write no longer references. */
  apply: (tx: RecipeTransaction) => Promise<string[]>;
};

/** Claim, upload, commit and compensation shared by the idempotent multipart recipe writes. */
@Injectable()
export class RecipeAttempts {
  constructor(@Inject(DRIZZLE_DB) private readonly db: DrizzleDb, private readonly storage: StorageService, private readonly hook: RecipeWriteHook) {}

  /** Races the write against the request deadline; the write keeps settling behind a timed-out response. */
  execute(request: RecipeUploadRequest, plan: RecipeWritePlan): Promise<RecipeWriteResult> {
    const budget: WriteBudget = { deadline: request.writeDeadline!, transactionStarted: false };
    const deadline = budget.deadline;
    const checkDeadline = () => { if (Date.now() >= deadline) throw new RecipeError(504, 'TIMEOUT', 'Recipe write timed out. Retry with the same key and payload.'); };
    const work = this.write(plan, checkDeadline, budget);
    request.writeSettled = work;
    return new Promise<RecipeWriteResult>((resolve, reject) => {
      const timer = setTimeout(() => reject(new RecipeError(504, 'TIMEOUT', budget.transactionStarted
        ? 'Recipe save outcome is unknown. Retry with the same key and unchanged payload.'
        : 'Recipe write timed out before persistence. Recipe was not saved; cleanup may still be running. Retry with the same key and payload.')), Math.max(1, deadline - Date.now()));
      work.then(resolve, reject).finally(() => clearTimeout(timer));
    });
  }

  /** The rows are already committed; objects that survive this stay recorded for a replay or the reconciliation command. */
  async cleanCommitted(attemptId: string): Promise<void> {
    try { await resolveRecipeAttempt(this.db, this.storage, attemptId, { now: new Date() }); }
    catch (cause) { logRecipeFailure('cleanup', cause); }
  }

  private async write({ attempt, uploads, prepare, apply }: RecipeWritePlan, checkDeadline: () => void, budget: WriteBudget): Promise<RecipeWriteResult> {
    const startedKeys: string[] = [];
    const claim: WriteClaim = { owned: false };
    let stale = false;
    try {
      checkDeadline();
      const replay = await this.claimAttempt(attempt, claim, checkDeadline);
      if (replay) return replay;
      await prepare?.();
      for (const upload of uploads) { checkDeadline(); startedKeys.push(upload.key); await this.storage.upload(upload.key, upload.file.buffer, upload.file.mimetype); }
      checkDeadline();
      budget.transactionStarted = true;
      stale = await this.commit(attempt.id, budget.deadline, checkDeadline, apply);
    } catch (cause) {
      if (claim.owned) {
        const committed = await this.compensate(attempt, startedKeys, cause, budget.transactionStarted);
        if (committed) return { id: committed, replay: false };
      }
      if (cause instanceof RecipeError) throw cause;
      throw recipeUnavailable(attempt.operation, cause);
    }
    if (stale) await this.cleanCommitted(attempt.id);
    return { id: attempt.recipeId, replay: false };
  }

  /** Returns a completed replay, or leaves ownership of a fresh pending row for persistence. */
  private async claimAttempt(attempt: WriteAttempt, claim: WriteClaim, checkDeadline: () => void): Promise<RecipeWriteResult | undefined> {
    // A second INSERT follows only confirmed stale-claim removal; unknown INSERT outcomes go straight to compensation.
    for (let round = 0; round < 2; round++) {
      checkDeadline(); claim.owned = true;
      const [inserted] = await this.db.insert(recipeWriteAttempts).values({ ...attempt, state: 'pending' })
        .onConflictDoNothing({ target: [recipeWriteAttempts.userId, recipeWriteAttempts.idempotencyKey] }).returning({ id: recipeWriteAttempts.id });
      if (inserted) return undefined;
      claim.owned = false;
      const replay = await this.replay(attempt);
      if (replay) return replay;
    }
    throw new RecipeError(409, 'IDEMPOTENCY_IN_PROGRESS', 'Prior attempt changed. Retry with the same key.');
  }

  /** Returns whether the committed write left replaced objects to delete. */
  private commit(attemptId: string, deadline: number, checkDeadline: () => void, apply: RecipeWritePlan['apply']): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      await setStatementTimeout(tx, deadline - Date.now());
      const [attempt] = await tx.select().from(recipeWriteAttempts).where(eq(recipeWriteAttempts.id, attemptId)).for('update');
      if (!attempt || attempt.state !== 'pending') throw new RecipeError(409, 'IDEMPOTENCY_IN_PROGRESS', 'Recipe attempt was reconciled. Retry with the same key.');
      checkDeadline(); const staleObjectKeys = await apply(tx);
      await this.hook.beforeComplete(tx); checkDeadline(); await completeRecipeAttempt(tx, attempt.id, staleObjectKeys);
      return staleObjectKeys.length > 0;
    });
  }

  private async replay({ userId, idempotencyKey, requestHash, operation }: WriteAttempt): Promise<RecipeWriteResult | undefined> {
    const existing = await this.db.query.recipeWriteAttempts.findFirst({ where: and(eq(recipeWriteAttempts.userId, userId), eq(recipeWriteAttempts.idempotencyKey, idempotencyKey)) });
    if (!existing) throw new RecipeError(409, 'IDEMPOTENCY_IN_PROGRESS', 'Prior attempt is settling. Retry with the same key.');
    const resolved = await resolveRecipeAttempt(this.db, this.storage, existing.id, {
      now: new Date(), pendingBefore: new Date(Date.now() - RECIPE_ATTEMPT_STALE_MS), expected: { userId, hash: requestHash, operation },
    });
    return resolved.recipeId ? { id: resolved.recipeId, replay: true } : undefined;
  }

  /** Called only after the transaction Promise settles; a failed COMMIT acknowledgement does not prove rollback. */
  private async compensate(attempt: WriteAttempt, startedKeys: string[], cause: unknown, transactionStarted: boolean): Promise<string | undefined> {
    const outcome: { resolved: boolean; committed?: string } = { resolved: false };
    try {
      const result = await resolveRecipeAttempt(this.db, this.storage, attempt.id, {
        now: new Date(), onResolved: (committed) => { outcome.resolved = true; outcome.committed = committed; },
      });
      if (result.recipeId) { logRecipeFailure(attempt.operation, cause); return result.recipeId; }
      if (!result.removed && startedKeys.length) {
        // A takeover removed our fenced row while an upload was still settling. Only our old, unreferenced keys are eligible.
        const references = await this.db.select({ key: recipeImages.objectKey }).from(recipeImages).where(inArray(recipeImages.objectKey, startedKeys));
        if (references.length) throw new Error('Recipe state cannot safely be compensated.');
        for (const key of startedKeys) await this.storage.deleteObject(key);
      }
    } catch (cleanupCause) {
      logRecipeFailure('cleanup', cleanupCause);
      // Rows that committed stay committed: only the objects they replaced are left, recorded for reconciliation.
      if (outcome.committed) return outcome.committed;
      // Keep the pending claim and recorded keys reconcilable when any cleanup operation fails.
      throw recipeCleanupFailure(cause, cleanupCause, !outcome.resolved && transactionStarted);
    }
  }
}
