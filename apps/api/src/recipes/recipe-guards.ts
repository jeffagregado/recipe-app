import { Inject, Injectable } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { unauthenticated } from '../auth/auth.errors.js';
import { AuthRateLimiter, rateLimitKey } from '../auth/auth.rate-limit.js';
import type { AuthRequest } from '../auth/auth.request.js';
import { DRIZZLE_DB } from '../database/database.module.js';
import type { DrizzleDb } from '../database/database.service.js';
import { recipes } from '../database/schema.js';
import { assertRecipeId, recipeNotFound, recipeUnavailable } from './recipe-errors.js';
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

/** Deleting shares the per-user budget of the multipart recipe writes. */
@Injectable()
export class RecipeDeleteGuard implements CanActivate {
  constructor(private readonly rateLimiter: AuthRateLimiter) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    await consumeRecipeWrite(this.rateLimiter, sessionUser(context).id);
    return true;
  }
}

/** Answers 404 for a recipe the session user does not own before any request body is read. */
@Injectable()
export class RecipeOwnerGuard implements CanActivate {
  constructor(@Inject(DRIZZLE_DB) private readonly db: DrizzleDb) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const userId = sessionUser(context).id;
    const { id } = context.switchToHttp().getRequest<{ params: { id: string } }>().params;
    assertRecipeId(id);
    let owned: number;
    try { owned = await this.db.$count(recipes, and(eq(recipes.id, id), eq(recipes.userId, userId))); }
    catch (cause) { throw recipeUnavailable('update', cause); }
    if (!owned) throw recipeNotFound();
    return true;
  }
}
