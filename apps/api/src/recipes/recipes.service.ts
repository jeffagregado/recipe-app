import { Inject, Injectable } from '@nestjs/common';
import { ResilienceError, ResilienceService } from '@nestjs/resilience';
import type { ResiliencePolicy } from '@nestjs/resilience';
import { and, asc, count, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { recipeListResponseSchema } from '@recipe-app/contracts/schemas';
import type { RecipeCounts, RecipeListQuery, RecipeListResponse } from '@recipe-app/contracts/types';
import { DRIZZLE_DB } from '../database/database.module.js';
import { DatabaseError } from '../database/database.service.js';
import type { DrizzleDb } from '../database/database.service.js';
import { StorageService } from '../storage/storage.service.js';
import { categories, recipeCategories, recipes } from '../database/schema.js';
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
        select 1 from ${recipeCategories} rc join ${categories} c on c.id = rc.category_id
        where rc.recipe_id = ${recipes.id} and c.name = ${query.category}
      )`;
      // Escape LIKE metacharacters so searches match literal text, not SQL wildcards.
      const search = query.search === undefined ? undefined : `%${query.search.replace(/[\\%_]/g, '\\$&')}%`;
      const owner = eq(recipes.userId, userId);
      const where = and(owner, category, search === undefined ? undefined : or(ilike(recipes.title, search), ilike(recipes.description, search)));
      const direction = query.order === 'asc' ? asc : desc;
      const { rows, total, counts } = await this.databasePolicy.execute(async () => {
        return this.db.transaction(async (tx) => {
          const read = createReadDeadline(signal);
          const total = await read(tx, () => tx.$count(recipes, where));
          const overall = await read(tx, () => tx.$count(recipes, owner));
          const categoryTotals = await read(tx, async () => tx.select({ name: categories.name, total: count(recipes.id) })
            .from(categories).leftJoin(recipeCategories, eq(categories.id, recipeCategories.categoryId))
            .leftJoin(recipes, and(eq(recipes.id, recipeCategories.recipeId), owner)).groupBy(categories.name));
          const counts: RecipeCounts = { total: overall, categories: { Breakfast: 0, Lunch: 0, Dinner: 0, Snacks: 0, Desserts: 0 } };
          for (const category of categoryTotals) counts.categories[category.name] = category.total;
          const rows = await read(tx, async () => tx.query.recipes.findMany({
            where,
            orderBy: [direction(recipes[query.sortBy]), asc(recipes.sortOrder), asc(recipes.id)],
            limit: query.limit, offset: (query.page - 1) * query.limit,
            with: {
              categories: { orderBy: (category, { asc }) => [asc(category.sortOrder)], with: { category: true } },
              images: { where: (image, { eq }) => eq(image.sortOrder, 0), limit: 1 },
            },
          }));
          return { rows, total, counts };
        }, { isolationLevel: 'repeatable read', accessMode: 'read only' });
      }, { signal, source: 'RecipesService.findAll' });
      signal.throwIfAborted();
      const summaries = await Promise.all(rows.map(async (recipe) => ({
        id: recipe.id, title: recipe.title, description: recipe.description,
        servings: recipe.servings, prepTimeMinutes: recipe.prepTimeMinutes, cookTimeMinutes: recipe.cookTimeMinutes,
        categories: recipe.categories.map(({ category }) => category.name),
        imageUrl: recipe.images[0] ? await this.storage.signedDownloadUrl(recipe.images[0].objectKey) : null,
        createdAt: recipe.createdAt.toISOString(), updatedAt: recipe.updatedAt.toISOString(),
      })));
      signal.throwIfAborted();
      return recipeListResponseSchema.parse({ data: summaries, counts,
        meta: { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) },
      });
    } catch (cause) {
      if (cause instanceof ResilienceError) throw cause;
      throw new DatabaseError('Recipe list read failed. Check database schema, connectivity, and storage configuration.', { cause });
    }
  }
}
