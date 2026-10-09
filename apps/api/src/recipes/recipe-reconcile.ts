import { and, eq, getTableColumns, inArray, lt, lte, or, sql } from 'drizzle-orm';
import type { DrizzleDb } from '../database/database.service.js';
import { recipeImages, recipes, recipeWriteAttempts } from '../database/schema.js';
import type { StorageService } from '../storage/storage.service.js';
import { RecipeError, logRecipeFailure } from './recipe-errors.js';
import { setStatementTimeout } from './recipe-write-hook.js';
import type { RecipeTransaction } from './recipe-write-hook.js';

const RECIPE_PENDING_AGE_MS = 24 * 60 * 60_000;
const RECIPE_CLEANUP_SQL_TIMEOUT_MS = 10_000;
type ReconcileOptions = { now: Date; ageMs?: number; attemptIds?: string[] };
type ResolveOptions = {
  now: Date; pendingBefore?: Date; skipLocked?: boolean;
  expected?: { userId: string; hash: string; operation: Attempt['operation'] };
  /** Called once database state is known, with the recipe ID when the attempt's write is committed. */
  onResolved?: (committedRecipeId?: string) => void;
};
type Attempt = typeof recipeWriteAttempts.$inferSelect;
type Resolution = { completed: number; removed: number; deletedObjects: number; recipeId?: string };
const unchanged = (): Resolution => ({ completed: 0, removed: 0, deletedObjects: 0 });

function assertRecipePayload(attempt: Attempt, expected: ResolveOptions['expected']): void {
  if (!expected) return;
  if (attempt.userId !== expected.userId || attempt.requestHash !== expected.hash || attempt.operation !== expected.operation) {
    throw new RecipeError(409, 'IDEMPOTENCY_CONFLICT', 'Idempotency key was used with a different payload.');
  }
}

/** A create is committed once its recipe exists. An update's recipe always exists, so its commit shows in the attempt:
 * completed, or `cleanup_pending` with the replaced objects' keys. A rolled-back update never records stale keys.
 */
function isCommitted(attempt: Attempt, recipeExists: boolean): boolean {
  if (attempt.operation !== 'update') return recipeExists;
  return recipeExists && (attempt.state === 'completed' || (attempt.state === 'cleanup_pending' && attempt.staleObjectKeys.length > 0));
}

/** A replay of a committed update answers at once: objects it replaced are left to the request that committed it
 * or to the reconciliation command.
 */
const answersWithoutCleanup = (attempt: Attempt, replay: boolean) => attempt.state === 'completed' || (replay && attempt.operation === 'update');

/** An update records its new uploads and the objects it replaced separately; whichever no image row references is removable. */
function recordedKeys(attempt: Attempt): string[] {
  if (attempt.operation === 'update') return [...new Set([...attempt.objectKeys, ...attempt.staleObjectKeys])];
  return [...new Set(attempt.state === 'cleanup_pending' ? attempt.staleObjectKeys : attempt.objectKeys)];
}

/** Checks all references before classifying any recorded key as safe to delete. */
async function unreferencedKeys(tx: RecipeTransaction, attempt: Attempt): Promise<string[]> {
  const recorded = recordedKeys(attempt);
  const references = recorded.length ? await tx.select({ key: recipeImages.objectKey }).from(recipeImages).where(inArray(recipeImages.objectKey, recorded)) : [];
  const referenced = new Set(references.map(({ key }) => key));
  return recorded.filter((key) => !referenced.has(key));
}

function canResolve(attempt: Attempt & { cleanupActive: boolean },
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
    await setStatementTimeout(tx, RECIPE_CLEANUP_SQL_TIMEOUT_MS);
    const [attempt] = await tx.select({ ...getTableColumns(recipeWriteAttempts), cleanupActive: sql<boolean>`${recipeWriteAttempts.updatedAt} > clock_timestamp()` })
      .from(recipeWriteAttempts).where(eq(recipeWriteAttempts.id, id)).for('update', skipLocked ? { skipLocked: true } : {});
    if (!attempt) return undefined;
    assertRecipePayload(attempt, expected);
    const recipe = await tx.query.recipes.findFirst({ where: and(eq(recipes.id, attempt.recipeId), eq(recipes.userId, attempt.userId)), columns: { id: true } });
    const recipeId = isCommitted(attempt, Boolean(recipe)) ? attempt.recipeId : undefined;
    // A completed attempt whose recipe was deleted since has no recipe ID and is removed below.
    if (recipeId && answersWithoutCleanup(attempt, Boolean(expected))) return { recipeId, keys: [], claimed: false };
    if (!canResolve(attempt, pendingBefore, skipLocked)) return undefined;
    const keys = await unreferencedKeys(tx, attempt);
    // PostgreSQL owns lease time; millisecond precision round-trips through pg Date values for the final fence.
    // An update's stale keys are its commit marker, so its claim leaves that list as recorded.
    const [claimed] = await tx.update(recipeWriteAttempts).set({ state: 'cleanup_pending', staleObjectKeys: attempt.operation === 'update' ? attempt.staleObjectKeys : keys,
      updatedAt: sql`date_trunc('milliseconds', clock_timestamp()) + interval '60 seconds'` }).where(eq(recipeWriteAttempts.id, id)).returning({ lease: recipeWriteAttempts.updatedAt });
    return { recipeId, keys, claimed: true, lease: claimed.lease };
  });
  onResolved?.(claim?.recipeId);
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
