import { and, eq, getTableColumns, inArray, lt, lte, or, sql } from 'drizzle-orm';
import type { DrizzleDb } from '../database/database.service.js';
import { recipeImages, recipes, recipeWriteAttempts } from '../database/schema.js';
import type { StorageService } from '../storage/storage.service.js';
import { RecipeError, logRecipeFailure } from './recipe-errors.js';

const RECIPE_PENDING_AGE_MS = 24 * 60 * 60_000;
const RECIPE_CLEANUP_SQL_TIMEOUT_MS = 10_000;
type ReconcileOptions = { now: Date; ageMs?: number; attemptIds?: string[] };
type ResolveOptions = {
  now: Date; pendingBefore?: Date; skipLocked?: boolean;
  expected?: { userId: string; hash: string };
  onResolved?: () => void;
};
type Resolution = { completed: number; removed: number; deletedObjects: number; recipeId?: string };
const unchanged = (): Resolution => ({ completed: 0, removed: 0, deletedObjects: 0 });

function assertRecipePayload(attempt: typeof recipeWriteAttempts.$inferSelect, expected: ResolveOptions['expected']): void {
  if (!expected) return;
  if (attempt.userId !== expected.userId || attempt.requestHash !== expected.hash || attempt.operation !== 'create') {
    throw new RecipeError(409, 'IDEMPOTENCY_CONFLICT', 'Idempotency key was used with a different payload.');
  }
}

function canResolve(attempt: typeof recipeWriteAttempts.$inferSelect & { cleanupActive: boolean },
  pendingBefore: Date | undefined, skipLocked: boolean): boolean {
  const writing = attempt.state === 'pending' && pendingBefore && attempt.createdAt >= pendingBefore;
  const cleaning = attempt.state === 'cleanup_pending' && attempt.cleanupActive;
  if (!writing && !cleaning) return true;
  if (skipLocked) return false;
  throw new RecipeError(409, 'IDEMPOTENCY_IN_PROGRESS', 'Recipe save or cleanup is still in progress. Retry with the same key.');
}

/** Locks wait for uncertain COMMITs, then persist a cleanup lease which fences the old writer.
 * Storage runs outside transactions. Finalization compares the lease so late cleanup cannot remove a newer claim.
 */
export async function resolveRecipeAttempt(db: DrizzleDb, storage: Pick<StorageService, 'deleteObject'>, id: string,
  { pendingBefore, expected, skipLocked = false, onResolved }: ResolveOptions): Promise<Resolution> {
  const claim = await db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('statement_timeout', ${String(RECIPE_CLEANUP_SQL_TIMEOUT_MS)}, true)`);
    const [attempt] = await tx.select({ ...getTableColumns(recipeWriteAttempts), cleanupActive: sql<boolean>`${recipeWriteAttempts.updatedAt} > clock_timestamp()` })
      .from(recipeWriteAttempts).where(eq(recipeWriteAttempts.id, id)).for('update', skipLocked ? { skipLocked: true } : {});
    if (!attempt) return undefined;
    assertRecipePayload(attempt, expected);
    if (!canResolve(attempt, pendingBefore, skipLocked)) return undefined;
    const recipe = await tx.query.recipes.findFirst({ where: and(eq(recipes.id, attempt.recipeId), eq(recipes.userId, attempt.userId)), columns: { id: true } });
    if (attempt.state === 'completed') {
      if (!recipe) throw new Error('Completed recipe attempt has no recipe.');
      return { recipeId: recipe.id, keys: [], claimed: false };
    }
    // Check all references before classifying any recorded key as safe to delete.
    const recorded = [...new Set(attempt.state === 'cleanup_pending' ? attempt.staleObjectKeys : attempt.objectKeys)];
    const references = recorded.length ? await tx.select({ key: recipeImages.objectKey }).from(recipeImages).where(inArray(recipeImages.objectKey, recorded)) : [];
    const referenced = new Set(references.map(({ key }) => key));
    const keys = recorded.filter((key) => !referenced.has(key));
    // PostgreSQL owns lease time; millisecond precision round-trips through pg Date values for the final fence.
    const [claimed] = await tx.update(recipeWriteAttempts).set({ state: 'cleanup_pending', staleObjectKeys: keys,
      updatedAt: sql`date_trunc('milliseconds', clock_timestamp()) + interval '60 seconds'` }).where(eq(recipeWriteAttempts.id, id)).returning({ lease: recipeWriteAttempts.updatedAt });
    return { recipeId: recipe?.id, keys, claimed: true, lease: claimed.lease };
  });
  onResolved?.();
  if (!claim) return unchanged();
  if (!claim.claimed) return { ...unchanged(), recipeId: claim.recipeId };
  const fence = and(eq(recipeWriteAttempts.id, id), eq(recipeWriteAttempts.state, 'cleanup_pending'), eq(recipeWriteAttempts.updatedAt, claim.lease!));
  let deletedObjects = 0;
  try {
    for (const key of claim.keys) { await storage.deleteObject(key); deletedObjects++; }
    const rows = claim.recipeId
      ? await db.update(recipeWriteAttempts).set({ state: 'completed', staleObjectKeys: [], updatedAt: new Date() }).where(fence).returning({ id: recipeWriteAttempts.id })
      : await db.delete(recipeWriteAttempts).where(fence).returning({ id: recipeWriteAttempts.id });
    if (!rows.length) throw new RecipeError(409, 'IDEMPOTENCY_IN_PROGRESS', 'Cleanup claim changed. Retry with the same key.');
    return { completed: claim.recipeId ? 1 : 0, removed: claim.recipeId ? 0 : 1, deletedObjects, recipeId: claim.recipeId };
  } catch (cause) {
    // Keep keys for idempotent retry; make confirmed failed cleanup immediately retryable.
    try { await db.update(recipeWriteAttempts).set({ updatedAt: sql`date_trunc('milliseconds', clock_timestamp())` }).where(fence); }
    catch (releaseCause) { throw new AggregateError([cause, releaseCause], 'Recipe cleanup and lease release failed.'); }
    throw cause;
  }
}

/** Per-attempt failures are counted and logged safely; remaining candidates still run. */
export async function reconcileRecipeWrites(db: DrizzleDb, storage: Pick<StorageService, 'deleteObject'>, { now, ageMs = RECIPE_PENDING_AGE_MS, attemptIds }: ReconcileOptions) {
  if (!Number.isFinite(now.getTime()) || ageMs < 0 || !Number.isFinite(ageMs)) throw new RangeError('Invalid reconciliation age or date.');
  const counts = { completed: 0, removed: 0, deletedObjects: 0, failed: 0 };
  if (attemptIds?.length === 0) return counts;
  const pendingBefore = new Date(now.getTime() - ageMs);
  const eligible = or(and(eq(recipeWriteAttempts.state, 'pending'), lt(recipeWriteAttempts.createdAt, pendingBefore)),
    and(eq(recipeWriteAttempts.state, 'cleanup_pending'), lte(recipeWriteAttempts.updatedAt, sql`clock_timestamp()`)));
  const candidates = await db.select({ id: recipeWriteAttempts.id }).from(recipeWriteAttempts)
    .where(and(eligible, attemptIds ? inArray(recipeWriteAttempts.id, attemptIds) : undefined));
  for (const candidate of candidates) {
    try {
      const result = await resolveRecipeAttempt(db, storage, candidate.id, { now, pendingBefore, skipLocked: true });
      counts.completed += result.completed; counts.removed += result.removed; counts.deletedObjects += result.deletedObjects;
    } catch (cause) { counts.failed++; logRecipeFailure('reconcile', cause); }
  }
  return counts;
}
