import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DRIZZLE_DB } from '../database/database.module.js';
import type { DrizzleDb } from '../database/database.service.js';
import { recipeWriteAttempts } from '../database/schema.js';
import { runAfterResponse } from '../lifecycle/after-response.js';
import { StorageService } from '../storage/storage.service.js';
import { RecipeError, logRecipeFailure, recipeCleanupFailure, recipeUnavailable } from './recipe-errors.js';
import { completeRecipeAttempt } from './recipe-persist.js';
import { RECIPE_CLEANUP_BUDGET_MS, resolveRecipeAttempt } from './recipe-reconcile.js';
import type { RecipeUploadRequest } from './recipe-upload.js';
import { RECIPE_WRITE_TIMEOUT_MS, writeDeadlineCheck } from './recipe-upload.js';
import { RecipeWriteHook, setStatementTimeout } from './recipe-write-hook.js';
import type { RecipeTransaction } from './recipe-write-hook.js';

const RECIPE_ATTEMPT_STALE_MS = 2 * RECIPE_WRITE_TIMEOUT_MS;

export type RecipeWriteResult = { id: string; replay: boolean };
/** `committed` is set as soon as the rows are known to be committed; from then on the write only ever answers with it. */
type WriteBudget = { deadline: number; transactionStarted: boolean; committed?: RecipeWriteResult };
type WriteAttempt = Pick<typeof recipeWriteAttempts.$inferSelect, 'id' | 'userId' | 'idempotencyKey' | 'requestHash' | 'recipeId'>
  & { operation: 'create' | 'update' };
type WriteClaim = { owned: boolean };
/** Post-commit object cleanup gets the cleanup budget or what is left of the request deadline, whichever is smaller. */
const cleanupBudget = (deadline: number) => Math.max(0, Math.min(RECIPE_CLEANUP_BUDGET_MS, deadline - Date.now()));
/** One idempotent recipe write: the claim to record and the rows to change in one transaction. Its photos are already stored as Pending photos. */
export type RecipeWritePlan = {
  attempt: WriteAttempt;
  /** Runs once the claim is owned and before the transaction; throws to reject the write. */
  prepare?: () => Promise<void>;
  /** Returns the keys of stored objects the committed write no longer references. */
  apply: (tx: RecipeTransaction) => Promise<string[]>;
};

/** Claim, commit and compensation shared by the idempotent recipe writes. */
@Injectable()
export class RecipeAttempts {
  constructor(@Inject(DRIZZLE_DB) private readonly db: DrizzleDb, private readonly storage: StorageService, private readonly hook: RecipeWriteHook) {}

  /** Races the write against the request deadline; the write keeps settling behind a timed-out response.
   * A committed write whose object cleanup outlasts the deadline still answers as saved.
   */
  execute(request: RecipeUploadRequest, plan: RecipeWritePlan): Promise<RecipeWriteResult> {
    const budget: WriteBudget = { deadline: request.writeDeadline!, transactionStarted: false };
    const deadline = budget.deadline;
    const checkDeadline = writeDeadlineCheck(deadline);
    const work = this.write(plan, checkDeadline, budget);
    request.writeSettled = work;
    // A write that outlives its deadline settles behind the timed-out response. The returned promise reports its failure.
    runAfterResponse(work, () => undefined);
    return new Promise<RecipeWriteResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (budget.committed) { resolve(budget.committed); return; }
        reject(new RecipeError(504, 'TIMEOUT', budget.transactionStarted
          ? 'Recipe save outcome is unknown. Retry with the same key and unchanged payload.'
          : 'Recipe write timed out before persistence. Recipe was not saved; cleanup may still be running. Retry with the same key and payload.'));
      }, Math.max(1, deadline - Date.now()));
      work.then(resolve, reject).finally(() => clearTimeout(timer));
    });
  }

  /** The rows are already committed, so this never fails and returns within `budgetMs`. Objects that survive it stay recorded
   * for a replay or the reconciliation command; deletions still in flight then settle under the attempt's cleanup lease.
   */
  async cleanCommitted(attemptId: string, budgetMs: number): Promise<void> {
    const stopAt = Date.now() + budgetMs;
    const cleanup = resolveRecipeAttempt(this.db, this.storage, attemptId, { now: new Date(), stopAt: () => stopAt })
      .then(() => undefined, (cause: unknown) => { logRecipeFailure('cleanup', cause); });
    // Deletions still running when the budget ends settle behind the response.
    runAfterResponse(cleanup, () => undefined);
    let timer: NodeJS.Timeout | undefined;
    await Promise.race([cleanup, new Promise<void>((resolve) => { timer = setTimeout(resolve, budgetMs); })]);
    clearTimeout(timer);
  }

  private async write({ attempt, prepare, apply }: RecipeWritePlan, checkDeadline: () => void, budget: WriteBudget): Promise<RecipeWriteResult> {
    const claim: WriteClaim = { owned: false };
    let stale = false;
    try {
      checkDeadline();
      const replay = await this.claimAttempt(attempt, claim, checkDeadline);
      if (replay) return replay;
      await prepare?.();
      checkDeadline();
      budget.transactionStarted = true;
      stale = await this.commit(attempt.id, budget.deadline, checkDeadline, apply);
      budget.committed = { id: attempt.recipeId, replay: false };
    } catch (cause) {
      if (claim.owned) {
        const committed = await this.compensate(attempt, cause, budget);
        if (committed) return { id: committed, replay: false };
      }
      if (cause instanceof RecipeError) throw cause;
      throw recipeUnavailable(attempt.operation, cause);
    }
    if (stale) await this.cleanCommitted(attempt.id, cleanupBudget(budget.deadline));
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
  private async compensate(attempt: WriteAttempt, cause: unknown, budget: WriteBudget): Promise<string | undefined> {
    const outcome: { resolved: boolean; committed?: string } = { resolved: false };
    try {
      const result = await resolveRecipeAttempt(this.db, this.storage, attempt.id, {
        now: new Date(), onResolved: (committed) => {
          outcome.resolved = true; outcome.committed = committed;
          if (committed) budget.committed = { id: committed, replay: false };
        },
        // A rolled-back write waits for its recorded objects to be removed; a committed one only spends the cleanup budget.
        stopAt: (committed) => committed ? Date.now() + cleanupBudget(budget.deadline) : undefined,
      });
      if (result.recipeId) { logRecipeFailure(attempt.operation, cause); return result.recipeId; }
    } catch (cleanupCause) {
      logRecipeFailure('cleanup', cleanupCause);
      // Rows that committed stay committed: only the objects they replaced are left, recorded for reconciliation.
      if (outcome.committed) return outcome.committed;
      // Keep the pending claim and recorded keys reconcilable when any cleanup operation fails.
      throw recipeCleanupFailure(cause, cleanupCause, !outcome.resolved && budget.transactionStarted);
    }
  }
}
