import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { and, asc, count, eq, inArray } from 'drizzle-orm';
import { categoryListSchema } from '@recipe-app/contracts/schemas';
import { RECIPE_LIMITS } from '@recipe-app/contracts/types';
import type { CategoryWithUsage, SaveCategoryInput } from '@recipe-app/contracts/types';
import { isUniqueViolation } from '../database/unique-violation.js';
import { DRIZZLE_DB } from '../database/database.module.js';
import type { DrizzleDb } from '../database/database.service.js';
import { categories, recipeCategories, users } from '../database/schema.js';
import { RecipeError, fieldError, recipeUnavailable } from '../recipes/recipe-errors.js';
import { RECIPE_MUTATION_SQL_TIMEOUT_MS, setStatementTimeout } from '../recipes/recipe-write-hook.js';

/** The owner's categories in their order, each with the number of recipes it tags. */
export function readCategories(db: Pick<DrizzleDb, 'select'>, userId: string): Promise<CategoryWithUsage[]> {
  return db.select({ id: categories.id, name: categories.name, recipeCount: count(recipeCategories.recipeId) })
    .from(categories).leftJoin(recipeCategories, eq(recipeCategories.categoryId, categories.id))
    .where(eq(categories.userId, userId)).groupBy(categories.id).orderBy(asc(categories.sortOrder));
}

const sameName = (left: string, right: string) => left.toLowerCase() === right.toLowerCase();

/** A unique violation on the per-owner name index. */
const isDuplicateName = (error: unknown) => isUniqueViolation(error, 'categories_user_name_key');

@Injectable()
export class CategoriesService {
  constructor(@Inject(DRIZZLE_DB) private readonly db: DrizzleDb) {}

  async list(userId: string): Promise<CategoryWithUsage[]> {
    try { return categoryListSchema.parse(await readCategories(this.db, userId)); }
    catch (cause) { throw recipeUnavailable('categories', cause); }
  }

  /**
   * One transaction: categories absent from `rows` are deleted (their recipe tags cascade), kept ones are renamed in place
   * and close ranks in their existing order, and rows without an id are appended. The last save wins.
   */
  async replace(userId: string, rows: SaveCategoryInput[]): Promise<CategoryWithUsage[]> {
    try {
      return await this.db.transaction(async (tx) => {
        await setStatementTimeout(tx, RECIPE_MUTATION_SQL_TIMEOUT_MS);
        // Serializes this owner's saves without blocking their recipe writes, which only take a key-share lock on the user.
        await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for('no key update');
        const current = await tx.select({ id: categories.id, name: categories.name, sortOrder: categories.sortOrder })
          .from(categories).where(eq(categories.userId, userId)).orderBy(asc(categories.sortOrder));
        const names = new Map<string, string>();
        rows.forEach((row, index) => {
          if (row.id === undefined) return;
          // A foreign id answers like an unknown one.
          if (!current.some(({ id }) => id === row.id)) throw fieldError(`${index}.id`, 'This category no longer exists.');
          names.set(row.id, row.name);
        });
        const removed = current.filter(({ id }) => !names.has(id));
        if (removed.length) await tx.delete(categories).where(and(eq(categories.userId, userId), inArray(categories.id, removed.map(({ id }) => id))));

        const kept = current.filter(({ id }) => names.has(id)).map((row, sortOrder) => ({ ...row, next: { name: names.get(row.id)!, sortOrder } }));
        // A name another kept row still holds (a swap, or a chain of renames) is not free under the unique index yet,
        // so its holder steps aside first. The placeholder never outlives the transaction.
        const wanted = (holder: typeof kept[number]) => kept.some((row) => row.id !== holder.id && sameName(row.next.name, holder.name));
        for (const row of kept.filter(wanted)) {
          row.name = randomUUID().slice(0, RECIPE_LIMITS.categoryName);
          await tx.update(categories).set({ name: row.name }).where(eq(categories.id, row.id));
        }
        // Ascending order: each row only ever moves down into a position the rows before it have already left.
        for (const row of kept) {
          if (row.name === row.next.name && row.sortOrder === row.next.sortOrder) continue;
          await tx.update(categories).set(row.next).where(eq(categories.id, row.id));
        }
        const added = rows.filter((row) => row.id === undefined);
        if (added.length) await tx.insert(categories).values(added.map(({ name }, index) => ({ userId, name, sortOrder: kept.length + index })));
        return categoryListSchema.parse(await readCategories(tx, userId));
      });
    } catch (cause) {
      if (cause instanceof RecipeError) throw cause;
      // PostgreSQL folds case slightly differently from JavaScript for a few characters; its index has the last word.
      if (isDuplicateName(cause)) throw fieldError('categories', 'Category names must be different from each other.');
      throw recipeUnavailable('categories', cause);
    }
  }
}
