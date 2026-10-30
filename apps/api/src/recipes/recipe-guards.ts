import { Inject, Injectable } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { unauthenticated } from '../auth/auth.errors.js';
import { AuthRateLimiter, rateLimitKey } from '../auth/auth.rate-limit.js';
import type { AuthRequest } from '../auth/auth.request.js';
import { DRIZZLE_DB } from '../database/database.module.js';
import type { DrizzleDb } from '../database/database.service.js';
import { recipes, recipeWriteAttempts } from '../database/schema.js';
import { assertRecipeId, recipeNotFound, recipeSaveDeleted, recipeUnavailable } from './recipe-errors.js';
import { isCommitted } from './recipe-reconcile.js';
import { consumeRecipeWrite } from './recipe-upload.js';

export const RECIPE_FAVORITE_LIMIT = 120;
const RECIPE_FAVORITE_WINDOW_MS = 10 * 60_000;

function sessionUser(context: ExecutionContext): { id: string } {
  const { user } = context.switchToHttp().getRequest<AuthRequest>();
  if (!user) throw unauthenticated();
  return user;
}

/** Generous for normal toggling; bounds scripted writes per account. */
@Injectable()
export class RecipeFavoriteGuard implements CanActivate {
  constructor(private readonly rateLimiter: AuthRateLimiter) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    await this.rateLimiter.consume(rateLimitKey('recipe-favorite:user', sessionUser(context).id), { limit: RECIPE_FAVORITE_LIMIT, windowMs: RECIPE_FAVORITE_WINDOW_MS });
    return true;
  }
}

/** Deleting shares the per-user budget of the recipe saves. */
@Injectable()
export class RecipeDeleteGuard implements CanActivate {
  constructor(private readonly rateLimiter: AuthRateLimiter) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    await consumeRecipeWrite(this.rateLimiter, sessionUser(context).id);
    return true;
  }
}

/** Answers 404 for a recipe the session user does not own before any request body is read.
 * Once the recipe was deleted, a key whose update of it is on record answers 409 instead, like the replay of a create.
 */
@Injectable()
export class RecipeOwnerGuard implements CanActivate {
  constructor(@Inject(DRIZZLE_DB) private readonly db: DrizzleDb) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const userId = sessionUser(context).id;
    const { params: { id }, headers } = context.switchToHttp().getRequest<AuthRequest & { params: { id: string } }>();
    assertRecipeId(id);
    const key = headers['idempotency-key'];
    let owned: number; let saved = false;
    try {
      owned = await this.db.$count(recipes, and(eq(recipes.id, id), eq(recipes.userId, userId)));
      if (!owned && typeof key === 'string' && key.length <= 200) {
        const attempt = await this.db.query.recipeWriteAttempts.findFirst({ where: and(eq(recipeWriteAttempts.userId, userId),
          eq(recipeWriteAttempts.idempotencyKey, key.toLowerCase()), eq(recipeWriteAttempts.recipeId, id), eq(recipeWriteAttempts.operation, 'update')) });
        saved = Boolean(attempt && isCommitted(attempt, false));
      }
    } catch (cause) { throw recipeUnavailable('update', cause); }
    if (saved) throw recipeSaveDeleted();
    if (!owned) throw recipeNotFound();
    return true;
  }
}
