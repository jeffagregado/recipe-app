import { Inject, Injectable } from '@nestjs/common';
import { asc } from 'drizzle-orm';
import { recipeSummarySchema } from '@recipe-app/contracts/schemas';
import type { RecipeSummary } from '@recipe-app/contracts/types';
import { DRIZZLE_DB } from '../database/database.module.js';
import { DatabaseError } from '../database/database.service.js';
import type { DrizzleDb } from '../database/database.service.js';
import { StorageService } from '../storage/storage.service.js';
import { recipes } from '../database/schema.js';

@Injectable()
export class RecipesService {
  constructor(@Inject(DRIZZLE_DB) private readonly db: DrizzleDb, private readonly storage: StorageService) {}

  async findAll(): Promise<RecipeSummary[]> {
    try {
      // One relational SQL query resolves categories and cover references without N+1 reads.
      const rows = await this.db.query.recipes.findMany({
        orderBy: [asc(recipes.sortOrder), asc(recipes.id)],
        with: {
          categories: { orderBy: (category, { asc }) => [asc(category.sortOrder)], with: { category: true } },
          images: { orderBy: (image, { asc }) => [asc(image.sortOrder)], limit: 1 },
        },
      });
      const summaries = await Promise.all(rows.map(async (recipe) => ({
        id: recipe.id, title: recipe.title, description: recipe.description,
        servings: recipe.servings, prepTimeMinutes: recipe.prepTimeMinutes, cookTimeMinutes: recipe.cookTimeMinutes,
        categories: recipe.categories.map(({ category }) => category.name),
        imageUrl: recipe.images[0] ? await this.storage.signedDownloadUrl(recipe.images[0].objectKey) : null,
        createdAt: recipe.createdAt.toISOString(), updatedAt: recipe.updatedAt.toISOString(),
      })));
      return recipeSummarySchema.array().parse(summaries);
    } catch (cause) {
      throw new DatabaseError('Recipe list read failed. Check database schema, connectivity, and storage configuration.', { cause });
    }
  }
}
