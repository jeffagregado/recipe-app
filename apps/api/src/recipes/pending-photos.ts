import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { RECIPE_LIMITS } from '@recipe-app/contracts/types';
import { namedPendingPhotos } from '@recipe-app/contracts/schemas';
import type { CreateRecipeMetadata, PendingPhoto, UpdateRecipeMetadata } from '@recipe-app/contracts/types';
import { unauthenticated } from '../auth/auth.errors.js';
import { AuthRateLimiter, rateLimitKey } from '../auth/auth.rate-limit.js';
import { DRIZZLE_DB } from '../database/database.module.js';
import type { DrizzleDb } from '../database/database.service.js';
import { pendingPhotos } from '../database/schema.js';
import { StorageService } from '../storage/storage.service.js';
import { fieldError, logRecipeFailure, recipeUnavailable } from './recipe-errors.js';
import { prepareRecipePhoto } from './recipe-images.js';
import type { RecipeFile } from './recipe-images.js';
import { checkMultipartHeaders, RecipeUploadInterceptor, RecipeUploadSlots, writeDeadlineCheck } from './recipe-upload.js';
import type { RecipeUploadRequest, UploadShape } from './recipe-upload.js';

/** Enough for a recipe's 51 photo slots twice over, with retries; bounds scripted uploads per Account. */
export const PENDING_PHOTO_UPLOAD_LIMIT = 120;
const PENDING_PHOTO_UPLOAD_WINDOW_MS = 10 * 60_000;
const PHOTO_FIELD = 'photo';

/** One photo per request, so every upload stays under Vercel's 4.5 MB request limit (ADR 0005). */
const PHOTO_UPLOAD: UploadShape = {
  requestBytes: RECIPE_LIMITS.photoRequestBytes, tooLarge: 'Request exceeds one photo.', files: 1, fileField: /^photo$/, field: PHOTO_FIELD,
};

/** Rate limit, declared size and content type are checked before any of the body is read. */
@Injectable()
export class PendingPhotoUploadGuard implements CanActivate {
  constructor(private readonly rateLimiter: AuthRateLimiter) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RecipeUploadRequest>();
    if (!request.user) throw unauthenticated();
    checkMultipartHeaders(request, PHOTO_UPLOAD);
    await this.rateLimiter.consume(rateLimitKey('recipe-photo:user', request.user.id), { limit: PENDING_PHOTO_UPLOAD_LIMIT, windowMs: PENDING_PHOTO_UPLOAD_WINDOW_MS });
    return true;
  }
}

/** Holds an upload slot while the photo is received and processed. Two per owner, so a photo picked again while the last one is still processing is not refused. */
@Injectable()
export class PendingPhotoUploadInterceptor extends RecipeUploadInterceptor {
  protected override readonly shape = PHOTO_UPLOAD;
  protected override readonly perOwner = 2;
  constructor(slots: RecipeUploadSlots) { super(slots); }
}

@Injectable()
export class PendingPhotoService {
  constructor(@Inject(DRIZZLE_DB) private readonly db: DrizzleDb, private readonly storage: StorageService) {}

  /** Checks and re-encodes the photo as every stored photo is (ADR 0002), stores it and records it as a Pending photo of `userId`. */
  async upload(userId: string, files: RecipeFile[], deadline: number): Promise<PendingPhoto> {
    const [file] = files;
    if (files.length !== 1 || file.fieldname !== PHOTO_FIELD) throw fieldError(PHOTO_FIELD, 'Attach one photo.');
    const photo = await prepareRecipePhoto(file);
    writeDeadlineCheck(deadline)();
    const id = randomUUID();
    const key = `photos/${id}.${photo.extension}`;
    try { await this.storage.upload(key, photo.buffer, photo.contentType); }
    catch (cause) {
      // Nothing names the object, so a partly written one is removed straight away.
      await this.storage.deleteObject(key).catch((cleanupCause: unknown) => { logRecipeFailure('cleanup', cleanupCause); });
      throw recipeUnavailable('photo', cause);
    }
    // A failed insert keeps the object: the row may still have committed, and deleting under it would leave a Pending photo
    // with no photo. An object no row names is left for the Pending photo cleanup.
    try { await this.db.insert(pendingPhotos).values({ id, userId, objectKey: key }); }
    catch (cause) { throw recipeUnavailable('photo', cause); }
    return { id };
  }
}

/** A photo slot a save fills with a Pending photo: the slot's field name and the Pending photo's id. */
export type PendingPhotoUse = { field: string; id: string };

/** The slots of a save that name Pending photos, by their multipart field names: `cover` and `step-<index>`. */
export function pendingPhotoUses(metadata: CreateRecipeMetadata | UpdateRecipeMetadata): PendingPhotoUse[] {
  return namedPendingPhotos(metadata).map(({ field, pendingPhotoId }) => ({ field, id: pendingPhotoId }));
}

/** Pending photos expire 24 hours after upload; database time decides. */
const unexpired = sql`${pendingPhotos.createdAt} > clock_timestamp() - interval '24 hours'`;

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
