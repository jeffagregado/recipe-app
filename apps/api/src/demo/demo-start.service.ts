import { randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, gt, inArray, like, lte, sql } from 'drizzle-orm';
import type { DemoStartResponse } from '@recipe-app/contracts/types';
import { AUTH } from '../auth/auth.tokens.js';
import type { RecipeAuth } from '../auth/auth.js';
import { logAuthFailure } from '../auth/auth.logger.js';
import { clientAddress } from '../auth/auth.request.js';
import type { AuthRequest } from '../auth/auth.request.js';
import { readPublicUser } from '../auth/auth.user.js';
import { DRIZZLE_DB } from '../database/database.module.js';
import type { DrizzleDb } from '../database/database.service.js';
import { recipeImages, recipes, recipeWriteAttempts, users } from '../database/schema.js';
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
/** The most Demo accounts alive at once. */
export const DEMO_LIVE_LIMIT = 200;
/** The most expired Demo accounts one Start demo deletes. */
export const DEMO_SWEEP_BATCH = 10;
const PHOTO_COPY_CONCURRENCY = 4;

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
      // Nothing the visitor could reach is left: the Account, its rows and session cascade, then every copy is deleted.
      try { await this.db.delete(users).where(eq(users.id, user.id)); } catch (rollbackCause) { logAuthFailure('demo-rollback', rollbackCause); }
      await this.deleteObjects(copies.map(({ target }) => target), 'demo-rollback');
      throw demoUnavailable('demo-start', cause);
    }
  }

  /** Deletes a bounded batch of expired Demo accounts, their rows cascading, and then their stored photos. */
  private async sweep(): Promise<void> {
    const keys = await this.db.transaction(async (tx) => {
      const expired = await tx.select({ id: users.id }).from(users)
        .where(and(demoAccount, lte(users.createdAt, sql`now() - ${lifetime}`)))
        .orderBy(asc(users.createdAt)).limit(DEMO_SWEEP_BATCH).for('update', { skipLocked: true });
      if (!expired.length) return [];
      const ids = expired.map(({ id }) => id);
      const images = await tx.select({ key: recipeImages.objectKey }).from(recipeImages)
        .innerJoin(recipes, eq(recipes.id, recipeImages.recipeId)).where(inArray(recipes.userId, ids));
      const attempts = await tx.select({ keys: recipeWriteAttempts.objectKeys, stale: recipeWriteAttempts.staleObjectKeys })
        .from(recipeWriteAttempts).where(inArray(recipeWriteAttempts.userId, ids));
      await tx.delete(users).where(inArray(users.id, ids));
      return [...new Set([...images.map(({ key }) => key), ...attempts.flatMap(({ keys: written, stale }) => [...written, ...stale])])];
    });
    await this.deleteObjects(keys, 'demo-sweep');
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

  /** Deletes each object once; a failure is logged and leaves the rest to go ahead. */
  private async deleteObjects(keys: string[], operation: string): Promise<void> {
    for (const key of keys) {
      try { await this.storage.deleteObject(key); } catch (cause) { logAuthFailure(operation, cause); }
    }
  }
}
