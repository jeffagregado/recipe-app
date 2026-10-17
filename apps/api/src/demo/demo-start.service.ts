import { randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, gt, like, lte, sql } from 'drizzle-orm';
import type { DemoStartResponse } from '@recipe-app/contracts/types';
import { AUTH } from '../auth/auth.tokens.js';
import type { RecipeAuth } from '../auth/auth.js';
import { logAuthFailure } from '../auth/auth.logger.js';
import { clientAddress } from '../auth/auth.request.js';
import type { AuthRequest } from '../auth/auth.request.js';
import { readPublicUser } from '../auth/auth.user.js';
import { DRIZZLE_DB } from '../database/database.module.js';
import type { DrizzleDb } from '../database/database.service.js';
import { authSessions, recipeImages, recipes, recipeWriteAttempts, users } from '../database/schema.js';
import { StorageService } from '../storage/storage.service.js';
import { demoBusy, demoUnavailable } from './demo-errors.js';
import { copyDemoTemplate } from './demo-template-copy.js';
import type { PhotoCopy } from './demo-template-copy.js';
import { createDemoSession } from './demo-session.js';

/** A Demo account is an Account whose email is on this reserved domain; it has no Sign-in method. */
export const DEMO_EMAIL_DOMAIN = 'demo.invalid';
export const DEMO_DISPLAY_NAME = 'Demo visitor';
/** A Demo account, and its session, expire this long after the account's creation. */
export const DEMO_LIFETIME_MS = 24 * 60 * 60 * 1000;
/** The most Demo accounts alive at once: unexpired ones only, so an expired account awaiting the sweep takes no slot. */
export const DEMO_LIVE_LIMIT = 200;
/** The most expired Demo accounts one Start demo deletes. */
export const DEMO_SWEEP_BATCH = 10;
const PHOTO_COPY_CONCURRENCY = 4;
const OBJECT_DELETE_CONCURRENCY = 8;

const lifetime = sql.raw(`interval '${DEMO_LIFETIME_MS} milliseconds'`);
const demoAccount = like(users.email, `%@${DEMO_EMAIL_DOMAIN}`);

@Injectable()
export class DemoStartService {
  constructor(@Inject(DRIZZLE_DB) private readonly db: DrizzleDb, private readonly storage: StorageService, @Inject(AUTH) private readonly auth: RecipeAuth) {}

  /** Sweeps, creates a Demo account holding a copy of the template, and signs it in. The caller has counted the attempt. */
  async start(request: AuthRequest): Promise<DemoStartResponse & { cookie: string }> {
    await this.sweep();
    const { user, copies } = await this.createAccount();
    try {
      await this.copyPhotos(copies);
      const expiresAt = new Date(user.createdAt.getTime() + DEMO_LIFETIME_MS);
      const userAgent = request.headers['user-agent'];
      const cookie = await createDemoSession(this.auth, user.id, expiresAt, { ipAddress: clientAddress(request), userAgent: typeof userAgent === 'string' ? userAgent : '' });
      const account = await readPublicUser(this.db, user.id);
      if (!account) throw new Error('Demo account missing after start.');
      return { user: account, expiresAt: expiresAt.toISOString(), cookie };
    } catch (cause) {
      await this.rollback(user.id);
      throw demoUnavailable('demo-start', cause);
    }
  }

  /**
   * Removes a start that failed after its Account was written. When an object cannot be deleted, the Account stays with no
   * session: no one can reach it, it holds one live slot until it expires, and the sweep then retries its objects.
   */
  private async rollback(userId: string): Promise<void> {
    try {
      if (await this.removeAccount(userId, 'demo-rollback')) return;
      await this.db.delete(authSessions).where(eq(authSessions.userId, userId));
    } catch (cause) { logAuthFailure('demo-rollback', cause); }
  }

  /** Removes a bounded batch of expired Demo accounts, oldest first. An Account whose objects cannot all be deleted stays for the next sweep. */
  private async sweep(): Promise<void> {
    const expired = await this.db.select({ id: users.id }).from(users)
      .where(and(demoAccount, lte(users.createdAt, sql`now() - ${lifetime}`)))
      .orderBy(asc(users.createdAt)).limit(DEMO_SWEEP_BATCH);
    for (const { id } of expired) await this.removeAccount(id, 'demo-sweep');
  }

  /**
   * Deletes every object the Account's rows name, then, only when all of them are gone, the Account, its rows cascading.
   * The rows are the only record of the keys, so they outlive any object that could not be deleted. Returns whether the
   * Account is gone. Deleting an object that is already gone succeeds, so a retry repeats safely.
   */
  private async removeAccount(userId: string, operation: string): Promise<boolean> {
    const images = await this.db.select({ key: recipeImages.objectKey }).from(recipeImages)
      .innerJoin(recipes, eq(recipes.id, recipeImages.recipeId)).where(eq(recipes.userId, userId));
    const attempts = await this.db.select({ keys: recipeWriteAttempts.objectKeys, stale: recipeWriteAttempts.staleObjectKeys })
      .from(recipeWriteAttempts).where(eq(recipeWriteAttempts.userId, userId));
    const keys = [...new Set([...images.map(({ key }) => key), ...attempts.flatMap(({ keys: written, stale }) => [...written, ...stale])])];
    if (!await this.deleteObjects(keys, operation)) return false;
    await this.db.delete(users).where(eq(users.id, userId));
    return true;
  }

  /** One transaction: refuses when the demo is full, then writes the Account and its copy of the template. */
  private createAccount(): Promise<{ user: { id: string; createdAt: Date }; copies: PhotoCopy[] }> {
    return this.db.transaction(async (tx) => {
      // Starts take turns here, so two of them cannot both pass the count at the limit.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('recipe-app:demo-start'))`);
      if (await tx.$count(users, and(demoAccount, gt(users.createdAt, sql`now() - ${lifetime}`))) >= DEMO_LIVE_LIMIT) throw demoBusy();
      const [user] = await tx.insert(users).values({ name: DEMO_DISPLAY_NAME, email: `${randomBytes(16).toString('hex')}@${DEMO_EMAIL_DOMAIN}`, emailVerified: true })
        .returning({ id: users.id, createdAt: users.createdAt });
      return { user, copies: await copyDemoTemplate(tx, user.id) };
    });
  }

  /** Copies the template's photos to their new keys, a few at a time. */
  private async copyPhotos(copies: PhotoCopy[]): Promise<void> {
    for (let index = 0; index < copies.length; index += PHOTO_COPY_CONCURRENCY) {
      const batch = copies.slice(index, index + PHOTO_COPY_CONCURRENCY);
      // Every copy in the batch settles first, so none is still writing when a rollback deletes it.
      const failed = (await Promise.allSettled(batch.map(({ source, target }) => this.storage.copyObject(source, target)))).find((result) => result.status === 'rejected');
      if (failed) throw failed.reason;
    }
  }

  /** Tries to delete each object once, a few at a time, and returns whether all are gone. A failure is logged. */
  private async deleteObjects(keys: string[], operation: string): Promise<boolean> {
    let deleted = true;
    for (let index = 0; index < keys.length; index += OBJECT_DELETE_CONCURRENCY) {
      for (const result of await Promise.allSettled(keys.slice(index, index + OBJECT_DELETE_CONCURRENCY).map((key) => this.storage.deleteObject(key)))) {
        if (result.status === 'rejected') { deleted = false; logAuthFailure(operation, result.reason); }
      }
    }
    return deleted;
  }
}
