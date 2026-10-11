import { BadRequestException, HttpException, Inject, Injectable } from '@nestjs/common';
import { ResilienceError, ResilienceService } from '@nestjs/resilience';
import type { ResiliencePolicy } from '@nestjs/resilience';
import { and, asc, count, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { recipeListResponseSchema } from '@recipe-app/contracts/schemas';
import type { RecipeCounts, RecipeListQuery, RecipeListResponse } from '@recipe-app/contracts/types';
import { DRIZZLE_DB } from '../database/database.module.js';
import { DatabaseError } from '../database/database.service.js';
import type { DrizzleDb } from '../database/database.service.js';
import { StorageService } from '../storage/storage.service.js';
import { favorites, recipeCategories, recipes } from '../database/schema.js';
import { readCategories } from '../categories/categories.service.js';
import { createReadDeadline } from './recipe-read-deadline.js';

@Injectable()
export class RecipesService {
  private readonly readPolicy: ResiliencePolicy;
  private readonly databasePolicy: ResiliencePolicy;

  constructor(@Inject(DRIZZLE_DB) private readonly db: DrizzleDb, private readonly storage: StorageService, resilience: ResilienceService) {
    this.readPolicy = resilience.preset('recipeRead');
    this.databasePolicy = resilience.preset('recipeDatabase');
  }

  findAll(query: RecipeListQuery, userId: string): Promise<RecipeListResponse> {
    // Promise execution holds the bulkhead slot until SQL really settles, even after an HTTP timeout.
    return this.readPolicy.execute(({ signal }) => this.readAll(query, userId, signal), { source: 'RecipesService.findAll' });
  }

  private async readAll(query: RecipeListQuery, userId: string, signal: AbortSignal): Promise<RecipeListResponse> {
    try {
      // EXISTS filters each recipe once, even when it belongs to several categories.
      const category = query.category === undefined ? undefined : sql`exists (
        select 1 from ${recipeCategories} rc where rc.recipe_id = ${recipes.id} and rc.category_id = ${query.category}
      )`;
      // Favorites are per user; the session user's row is the only one that can match.
      const favorite = sql`exists (
        select 1 from ${favorites} f where f.recipe_id = ${recipes.id} and f.user_id = ${userId}
      )`;
      // Escape LIKE metacharacters so searches match literal text, not SQL wildcards.
      const search = query.search === undefined ? undefined : `%${query.search.replace(/[\\%_]/g, '\\$&')}%`;
      const owner = eq(recipes.userId, userId);
      const filter = and(category, query.favorites === undefined ? undefined : favorite, search === undefined ? undefined : or(ilike(recipes.title, search), ilike(recipes.description, search)));
      const where = and(owner, filter);
      const direction = query.order === 'asc' ? asc : desc;
      const { rows, total, counts } = await this.databasePolicy.execute(async () => {
        return this.db.transaction(async (tx) => {
          const read = createReadDeadline(signal);
          const owned = await read(tx, async () => readCategories(tx, userId));
          // An id that is not one of the owner's categories, including another account's, is an invalid query like any other.
          if (query.category !== undefined && !owned.some(({ id }) => id === query.category)) {
            throw new BadRequestException({ message: 'Invalid recipe query. Use one of your own category ids.',
              errors: [{ parameter: 'category', message: 'Unknown category.' }] });
          }
          // One statement for every total: every statement is a network round trip inside the read budget.
          const [{ total, overall, favorited }] = await read(tx, async () => tx.select({
            total: filter === undefined ? count() : sql<number>`count(*) filter (where ${filter})`.mapWith(Number),
            overall: count(),
            favorited: sql<number>`count(*) filter (where ${favorite})`.mapWith(Number),
          }).from(recipes).where(owner));
          const counts: RecipeCounts = { total: overall, favorites: favorited,
            categories: owned.map(({ id, name, recipeCount }) => ({ id, name, total: recipeCount })) };
          const rows = await read(tx, async () => tx.query.recipes.findMany({
            where,
            orderBy: [direction(recipes[query.sortBy]), asc(recipes.sortOrder), asc(recipes.id)],
            limit: query.limit, offset: (query.page - 1) * query.limit,
            with: {
              categories: { orderBy: (category, { asc }) => [asc(category.sortOrder)], with: { category: true } },
              images: { where: (image, { eq }) => eq(image.sortOrder, 0), limit: 1 },
              // Same statement as the page of recipes; only the session user's row can match.
              favorites: { where: (favorite, { eq }) => eq(favorite.userId, userId), limit: 1 },
            },
          }));
          return { rows, total, counts };
        }, { isolationLevel: 'repeatable read', accessMode: 'read only' });
      }, { signal, source: 'RecipesService.findAll' });
      signal.throwIfAborted();
      const summaries = await Promise.all(rows.map(async (recipe) => ({
        id: recipe.id, title: recipe.title, description: recipe.description,
        servings: recipe.servings, prepTimeMinutes: recipe.prepTimeMinutes, cookTimeMinutes: recipe.cookTimeMinutes,
        categories: recipe.categories.map(({ category }) => ({ id: category.id, name: category.name })),
        imageUrl: recipe.images[0] ? await this.storage.signedDownloadUrl(recipe.images[0].objectKey) : null,
        isFavorite: recipe.favorites.length > 0,
        createdAt: recipe.createdAt.toISOString(), updatedAt: recipe.updatedAt.toISOString(),
      })));
      signal.throwIfAborted();
      return recipeListResponseSchema.parse({ data: summaries, counts,
        meta: { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) },
      });
    } catch (cause) {
      if (cause instanceof ResilienceError || cause instanceof HttpException) throw cause;
      throw new DatabaseError('Recipe list read failed. Check database schema, connectivity, and storage configuration.', { cause });
    }
  }
}
