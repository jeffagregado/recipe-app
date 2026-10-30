import { randomUUID } from 'node:crypto';
import type { ServerResponse } from 'node:http';
import { Inject, Injectable } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { namedPendingPhotos } from '@recipe-app/contracts/schemas';
import type { CreateRecipeMetadata, PendingPhoto, UpdateRecipeMetadata } from '@recipe-app/contracts/types';
import { unauthenticated } from '../auth/auth.errors.js';
import { AuthRateLimiter, rateLimitKey } from '../auth/auth.rate-limit.js';
import { DRIZZLE_DB } from '../database/database.module.js';
import type { DrizzleDb } from '../database/database.service.js';
import { pendingPhotos, recipeImages } from '../database/schema.js';
import { runAfterResponse } from '../lifecycle/after-response.js';
import { StorageService } from '../storage/storage.service.js';
import { fieldError, logRecipeFailure, RecipeError, recipeUnavailable } from './recipe-errors.js';
import { prepareRecipePhoto } from './recipe-images.js';
import type { RecipeFile } from './recipe-images.js';
import { checkMultipartHeaders, parsePhotoUpload, PHOTO_UPLOAD, RecipeUploadInterceptor, RecipeUploadSlots, writeDeadlineCheck } from './recipe-upload.js';
import type { RecipeUploadRequest } from './recipe-upload.js';

/** Enough for a recipe's 51 photo slots twice over, with retries; bounds scripted uploads per Account. */
export const PENDING_PHOTO_UPLOAD_LIMIT = 120;
const PENDING_PHOTO_UPLOAD_WINDOW_MS = 10 * 60_000;
/** Pending photos expire 24 hours after upload; database time decides. */
const PENDING_PHOTO_LIFETIME_MS = 24 * 60 * 60_000;
const lifetime = (ms: number) => sql`make_interval(secs => ${ms / 1000})`;
const unexpired = sql`${pendingPhotos.createdAt} > clock_timestamp() - ${lifetime(PENDING_PHOTO_LIFETIME_MS)}`;
const expiredAfter = (ms: number) => sql`${pendingPhotos.createdAt} <= clock_timestamp() - ${lifetime(ms)}`;
/** Expired Pending photos one upload deletes, so the sweep stays quick and needs no cron (ADR 0005). */
const SWEEP_BATCH = 10;
/** Unexpired Pending photos one Account may hold, so one Account cannot fill storage with photos it never saves. */
const PENDING_PHOTOS_PER_ACCOUNT = 60;
const PHOTO_FIELD = PHOTO_UPLOAD.field;
/** Where Pending photos are stored. A save keeps the object where it is, so a saved photo can sit here too. */
const PENDING_PHOTO_PREFIX = 'photos/';
/** How old a stored photo no row names must be before reconciliation deletes it: an upload writes its row just after storing it. */
const ORPHAN_AGE_MS = 24 * 60 * 60_000;
const RECONCILE_BATCH = 100;

const pendingPhotoLimit = () => new RecipeError(409, 'PENDING_PHOTO_LIMIT', 'Too many photos are waiting to be saved. Save the recipe first, or try again tomorrow.');
const heldPendingPhotos = (db: Pick<DrizzleDb, '$count'>, userId: string) => db.$count(pendingPhotos, and(eq(pendingPhotos.userId, userId), unexpired));

/** Rate limit, Pending photo limit, declared size and content type are checked before any of the body is read. */
@Injectable()
export class PendingPhotoUploadGuard implements CanActivate {
  constructor(private readonly rateLimiter: AuthRateLimiter, @Inject(DRIZZLE_DB) private readonly db: DrizzleDb) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RecipeUploadRequest>();
    if (!request.user) throw unauthenticated();
    checkMultipartHeaders(request, PHOTO_UPLOAD);
    await this.rateLimiter.consume(rateLimitKey('recipe-photo:user', request.user.id), { limit: PENDING_PHOTO_UPLOAD_LIMIT, windowMs: PENDING_PHOTO_UPLOAD_WINDOW_MS });
    // Uploads already past this check are counted again when their row is written.
    if (await heldPendingPhotos(this.db, request.user.id) >= PENDING_PHOTOS_PER_ACCOUNT) throw pendingPhotoLimit();
    return true;
  }
}

/** Holds an upload slot while the photo is received and processed. Two per owner, so a photo picked again while the last one is still processing is not refused. */
@Injectable()
export class PendingPhotoUploadInterceptor extends RecipeUploadInterceptor {
  protected override readonly perOwner = 2;
  constructor(slots: RecipeUploadSlots) { super(slots); }
  protected override read(request: RecipeUploadRequest, response: ServerResponse): Promise<void> { return parsePhotoUpload(request, response); }
}

/**
 * Which expired Pending photos a sweep may delete: `objectKeys` limits it to those photos. Only with them may `lifetimeMs`
 * replace the 24 hours, so a shorter lifetime never reaches another Account's photos.
 */
export type PendingPhotoSweepScope = { objectKeys?: string[]; lifetimeMs?: never } | { objectKeys: string[]; lifetimeMs: number };

/**
 * Upload extension point: each upload sweeps every Account's expired Pending photos (ADR 0005). Tests replace it to sweep only
 * their own photos, which no other process on a shared Neon branch counts as expired.
 */
@Injectable()
export class PendingPhotoSweep {
  scope(): PendingPhotoSweepScope { return {}; }
}

@Injectable()
export class PendingPhotoService {
  constructor(@Inject(DRIZZLE_DB) private readonly db: DrizzleDb, private readonly storage: StorageService, private readonly sweep: PendingPhotoSweep) {}

  /** Checks and re-encodes the photo as every stored photo is (ADR 0002), stores it and records it as a Pending photo of `userId`. */
  async upload(userId: string, files: RecipeFile[], deadline: number): Promise<PendingPhoto> {
    const [file] = files;
    if (files.length !== 1 || file.fieldname !== PHOTO_FIELD) throw fieldError(PHOTO_FIELD, 'Attach one photo.');
    const photo = await prepareRecipePhoto(file);
    writeDeadlineCheck(deadline)();
    const id = randomUUID();
    const key = `${PENDING_PHOTO_PREFIX}${id}.${photo.extension}`;
    try { await this.storage.upload(key, photo.buffer, photo.contentType); }
    catch (cause) {
      // Nothing names the object, so a partly written one is removed straight away.
      await this.storage.deleteObject(key).catch((cleanupCause: unknown) => { logRecipeFailure('cleanup', cleanupCause); });
      throw recipeUnavailable('photo', cause);
    }
    // A failed insert keeps the object: the row may still have committed, and deleting under it would leave a Pending photo
    // with no photo. An object no row names is left for `recipes:reconcile`.
    let recorded: boolean;
    try { recorded = await this.record(userId, id, key); }
    catch (cause) { throw recipeUnavailable('photo', cause); }
    if (!recorded) {
      await deleteStoredPhotos(this.storage, [key]);
      throw pendingPhotoLimit();
    }
    // Started after the row is written and never awaited: the sweep neither slows nor fails the upload.
    runAfterResponse(sweepExpiredPendingPhotos(this.db, this.storage, this.sweep.scope()), (cause) => { logRecipeFailure('cleanup', cause); });
    return { id };
  }

  /** Writes the row unless the Account already holds its limit. One upload per Account counts and writes at a time. */
  private record(userId: string, id: string, objectKey: string): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`pending-photos:${userId}`}, 0))`);
      if (await heldPendingPhotos(tx, userId) >= PENDING_PHOTOS_PER_ACCOUNT) return false;
      await tx.insert(pendingPhotos).values({ id, userId, objectKey });
      return true;
    });
  }

  /** Deletes `userId`'s Pending photo `id`, if there is one. A save that already used it took the row, so its photo stays. */
  async delete(userId: string, id: string): Promise<void> {
    if (!z.uuid().safeParse(id).success) return;
    const removed = await this.db.delete(pendingPhotos).where(and(eq(pendingPhotos.id, id), eq(pendingPhotos.userId, userId)))
      .returning({ objectKey: pendingPhotos.objectKey });
    await deleteStoredPhotos(this.storage, removed.map(({ objectKey }) => objectKey));
  }
}

/**
 * Deletes up to `limit` expired Pending photos of any Account, oldest first: their rows, then their photos. A save holding a row
 * is skipped, and a row is gone before its photo, so a save can never take a Pending photo whose photo is being deleted.
 * `scope` may narrow the sweep, as `PendingPhotoSweepScope` describes.
 */
async function sweepExpiredPendingPhotos(db: DrizzleDb, storage: Pick<StorageService, 'deleteObject'>,
  { limit = SWEEP_BATCH, objectKeys, lifetimeMs = PENDING_PHOTO_LIFETIME_MS }: PendingPhotoSweepScope & { limit?: number } = {}): Promise<{ expired: number; failed: number }> {
  const oldest = db.select({ id: pendingPhotos.id }).from(pendingPhotos)
    .where(and(expiredAfter(lifetimeMs), objectKeys ? inArray(pendingPhotos.objectKey, objectKeys) : undefined))
    .orderBy(asc(pendingPhotos.createdAt)).limit(limit).for('update', { skipLocked: true });
  const removed = await db.delete(pendingPhotos).where(inArray(pendingPhotos.id, oldest)).returning({ objectKey: pendingPhotos.objectKey });
  const deleted = await deleteStoredPhotos(storage, removed.map(({ objectKey }) => objectKey));
  return { expired: removed.length, failed: removed.length - deleted };
}

type ReconcileOptions = { now: Date; ageMs?: number } & PendingPhotoSweepScope;

/**
 * The `recipes:reconcile` backstop for what the upload sweep misses: every expired Pending photo, then each photo stored under
 * the Pending photo prefix at least `ageMs` before `now` that neither a Pending photo nor a recipe image names. `objectKeys`
 * limits both to those photos, and `lifetimeMs` replaces the 24 hours for those Pending photos.
 */
export async function reconcilePendingPhotos(db: DrizzleDb, storage: Pick<StorageService, 'deleteObject' | 'listObjects'>,
  { now, ageMs = ORPHAN_AGE_MS, ...scope }: ReconcileOptions): Promise<{ expired: number; orphans: number; failed: number }> {
  const { objectKeys } = scope;
  if (!Number.isFinite(now.getTime()) || ageMs < 0 || !Number.isFinite(ageMs)) throw new RangeError('Invalid reconciliation age or date.');
  const counts = { expired: 0, orphans: 0, failed: 0 };
  if (objectKeys?.length === 0) return counts;
  for (let batch; !batch || batch.expired === RECONCILE_BATCH;) {
    batch = await sweepExpiredPendingPhotos(db, storage, { ...scope, limit: RECONCILE_BATCH });
    counts.expired += batch.expired - batch.failed; counts.failed += batch.failed;
  }
  const storedBefore = now.getTime() - ageMs;
  for await (const page of storage.listObjects(PENDING_PHOTO_PREFIX)) {
    const candidates = page.filter(({ key, lastModified }) => lastModified.getTime() <= storedBefore && (!objectKeys || objectKeys.includes(key))).map(({ key }) => key);
    if (!candidates.length) continue;
    const named = new Set([
      ...(await db.select({ key: pendingPhotos.objectKey }).from(pendingPhotos).where(inArray(pendingPhotos.objectKey, candidates))),
      ...(await db.select({ key: recipeImages.objectKey }).from(recipeImages).where(inArray(recipeImages.objectKey, candidates))),
    ].map(({ key }) => key));
    const orphans = candidates.filter((key) => !named.has(key));
    const deleted = await deleteStoredPhotos(storage, orphans);
    counts.orphans += deleted; counts.failed += orphans.length - deleted;
  }
  return counts;
}

/** Deletes the photos of Pending photo rows already removed. A failure leaves an object no row names, for `recipes:reconcile`. */
async function deleteStoredPhotos(storage: Pick<StorageService, 'deleteObject'>, keys: string[]): Promise<number> {
  let deleted = 0;
  for (const key of keys) {
    try { await storage.deleteObject(key); deleted++; }
    catch (cause) { logRecipeFailure('cleanup', cause); }
  }
  return deleted;
}

/** A photo slot a save fills with a Pending photo: the slot's field name and the Pending photo's id. */
export type PendingPhotoUse = { field: string; id: string };

/** The slots of a save that name Pending photos, by their slot names: `cover` and `step-<index>`. */
export function pendingPhotoUses(metadata: CreateRecipeMetadata | UpdateRecipeMetadata): PendingPhotoUse[] {
  return namedPendingPhotos(metadata).map(({ field, pendingPhotoId }) => ({ field, id: pendingPhotoId }));
}


/** Returns each used Pending photo's object key. Another Account's, an expired, an unknown and an already saved one are refused alike. */
export async function assertPendingPhotos(db: Pick<DrizzleDb, 'select'>, userId: string, uses: PendingPhotoUse[], lock = false): Promise<Map<string, string>> {
  if (!uses.length) return new Map();
  const owned = db.select({ id: pendingPhotos.id, objectKey: pendingPhotos.objectKey }).from(pendingPhotos)
    .where(and(eq(pendingPhotos.userId, userId), inArray(pendingPhotos.id, uses.map(({ id }) => id)), unexpired));
  const keys = new Map((await (lock ? owned.for('update') : owned)).map(({ id, objectKey }) => [id, objectKey]));
  const missing = uses.find(({ id }) => !keys.has(id));
  if (missing) throw fieldError(missing.field, 'This photo is no longer available. Choose it again.');
  return keys;
}

/** Inside the save's transaction: the used Pending photos stop being pending and come back as images for their slots.
 * Each keeps its stored object, so a save that rolls back leaves the Pending photo as it was for a retry.
 */
export async function takePendingPhotos(tx: Pick<DrizzleDb, 'select' | 'delete'>, userId: string, uses: PendingPhotoUse[]): Promise<{ field: string; id: string; key: string }[]> {
  if (!uses.length) return [];
  const keys = await assertPendingPhotos(tx, userId, uses, true);
  await tx.delete(pendingPhotos).where(inArray(pendingPhotos.id, [...keys.keys()]));
  return uses.map(({ field, id }) => ({ field, id: randomUUID(), key: keys.get(id)! }));
}
