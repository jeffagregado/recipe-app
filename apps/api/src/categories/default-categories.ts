import type { DrizzleDb } from '../database/database.service.js';
import { categories } from '../database/schema.js';

/** What every new account starts with, in this order. Ordinary categories once created. */
export const DEFAULT_CATEGORY_NAMES = ['Breakfast', 'Lunch', 'Dinner', 'Snacks', 'Desserts'] as const;

export type DefaultCategoryName = (typeof DEFAULT_CATEGORY_NAMES)[number];

export function insertDefaultCategories(db: Pick<DrizzleDb, 'insert'>, userId: string) {
  return db.insert(categories).values(DEFAULT_CATEGORY_NAMES.map((name, sortOrder) => ({ userId, name, sortOrder })))
    .returning({ id: categories.id, name: categories.name });
}
