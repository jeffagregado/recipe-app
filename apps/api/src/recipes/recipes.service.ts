import { Inject, Injectable } from '@nestjs/common';
import { asc, count, desc, eq, sql } from 'drizzle-orm';
import { recipeListResponseSchema } from '@recipe-app/contracts/schemas';
import type { RecipeCounts, RecipeListQuery, RecipeListResponse } from '@recipe-app/contracts/types';
import { DRIZZLE_DB } from '../database/database.module.js';
import { DatabaseError } from '../database/database.service.js';
import type { DrizzleDb } from '../database/database.service.js';
import { StorageService } from '../storage/storage.service.js';
import { categories, recipeCategories, recipes } from '../database/schema.js';

@Injectable()
export class RecipesService {
  constructor(@Inject(DRIZZLE_DB) private readonly db: DrizzleDb, private readonly storage: StorageService) {}

  async findAll(query: RecipeListQuery): Promise<RecipeListResponse> {
    try {
      // EXISTS filters each recipe once, even when it belongs to several categories.
      const where = query.category === undefined ? undefined : sql`exists (
        select 1 from ${recipeCategories} rc join ${categories} c on c.id = rc.category_id
        where rc.recipe_id = ${recipes.id} and c.name = ${query.category}
      )`;
      const direction = query.order === 'asc' ? asc : desc;
      const { rows, total, counts } = await this.db.transaction(async (tx) => {
        const total = await tx.$count(recipes, where);
        const overall = await tx.$count(recipes);
        const categoryTotals = await tx.select({ name: categories.name, total: count(recipeCategories.recipeId) })
          .from(categories).leftJoin(recipeCategories, eq(categories.id, recipeCategories.categoryId)).groupBy(categories.name);
        const counts: RecipeCounts = { total: overall, categories: { Breakfast: 0, Lunch: 0, Dinner: 0, Snacks: 0, Desserts: 0 } };
        for (const category of categoryTotals) counts.categories[category.name] = category.total;
        const rows = await tx.query.recipes.findMany({
          where,
          orderBy: [direction(recipes[query.sortBy]), asc(recipes.sortOrder), asc(recipes.id)],
          limit: query.limit, offset: (query.page - 1) * query.limit,
          with: {
            categories: { orderBy: (category, { asc }) => [asc(category.sortOrder)], with: { category: true } },
            images: { orderBy: (image, { asc }) => [asc(image.sortOrder)], limit: 1 },
          },
        });
        return { rows, total, counts };
      }, { isolationLevel: 'repeatable read', accessMode: 'read only' });
      const summaries = await Promise.all(rows.map(async (recipe) => ({
        id: recipe.id, title: recipe.title, description: recipe.description,
        servings: recipe.servings, prepTimeMinutes: recipe.prepTimeMinutes, cookTimeMinutes: recipe.cookTimeMinutes,
        categories: recipe.categories.map(({ category }) => category.name),
        imageUrl: recipe.images[0] ? await this.storage.signedDownloadUrl(recipe.images[0].objectKey) : null,
        createdAt: recipe.createdAt.toISOString(), updatedAt: recipe.updatedAt.toISOString(),
      })));
      return recipeListResponseSchema.parse({ data: summaries, counts,
        meta: { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) },
      });
    } catch (cause) {
      throw new DatabaseError('Recipe list read failed. Check database schema, connectivity, and storage configuration.', { cause });
    }
  }
}
