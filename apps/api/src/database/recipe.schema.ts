import { sql } from 'drizzle-orm';
import { check, foreignKey, index, integer, numeric, pgTable, primaryKey, text, unique, uniqueIndex } from 'drizzle-orm/pg-core';
import { MEASUREMENT_UNITS, RECIPE_LIMITS } from '@recipe-app/contracts/types';
import type { MeasurementUnit } from '@recipe-app/contracts/types';
import { users } from './auth.schema.js';
import { textId, time, timestamps } from './columns.js';

const units = sql.join(MEASUREMENT_UNITS.map((unit) => sql`${sql.raw(`'${unit}'`)}`), sql`, `);

export const recipes = pgTable('recipes', {
  id: textId(),
  userId: text('user_id').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  notes: text('notes'),
  videoUrl: text('video_url'),
  servings: integer('servings'),
  prepTimeMinutes: integer('prep_time_minutes'),
  cookTimeMinutes: integer('cook_time_minutes'),
  sortOrder: integer('sort_order').notNull().default(0),
  ...timestamps(),
}, (t) => [
  primaryKey({ name: 'recipes_pkey', columns: [t.id] }),
  foreignKey({ name: 'recipes_user_id_fkey', columns: [t.userId], foreignColumns: [users.id] }).onDelete('cascade'),
  index('recipes_user_id_idx').on(t.userId),
  index('recipes_sort_order_id_idx').on(t.sortOrder, t.id),
  check('recipes_title_check', sql`length(btrim(${t.title})) BETWEEN 1 AND 200`),
  check('recipes_description_check', sql`length(${t.description}) <= 2000`),
  check('recipes_notes_check', sql`length(${t.notes}) <= 5000`),
  check('recipes_video_url_check', sql`length(${t.videoUrl}) <= 2048`),
  check('recipes_servings_check', sql`${t.servings} > 0`),
  check('recipes_prep_time_check', sql`${t.prepTimeMinutes} >= 0`),
  check('recipes_cook_time_check', sql`${t.cookTimeMinutes} >= 0`),
  check('recipes_sort_order_check', sql`${t.sortOrder} >= 0`),
]);

export const ingredients = pgTable('ingredients', {
  id: textId(), name: text('name').notNull(),
}, (t) => [
  primaryKey({ name: 'ingredients_pkey', columns: [t.id] }),
  uniqueIndex('ingredients_name_key').on(sql`lower(btrim(${t.name}))`),
  check('ingredients_name_check', sql`length(btrim(${t.name})) BETWEEN 1 AND 100`),
]);

export const recipeIngredients = pgTable('recipe_ingredients', {
  id: textId(),
  recipeId: text('recipe_id').notNull(),
  ingredientId: text('ingredient_id').notNull(),
  name: text('name').notNull(),
  quantity: numeric('quantity', { precision: 12, scale: 3 }),
  unit: text('unit').$type<MeasurementUnit>(),
  preparation: text('preparation'),
  note: text('note'),
  sortOrder: integer('sort_order').notNull(),
}, (t) => [
  primaryKey({ name: 'recipe_ingredients_pkey', columns: [t.id] }),
  foreignKey({ name: 'recipe_ingredients_recipe_id_fkey', columns: [t.recipeId], foreignColumns: [recipes.id] }).onDelete('cascade'),
  foreignKey({ name: 'recipe_ingredients_ingredient_id_fkey', columns: [t.ingredientId], foreignColumns: [ingredients.id] }).onDelete('restrict'),
  index('recipe_ingredients_ingredient_id_idx').on(t.ingredientId),
  unique('recipe_ingredients_recipe_order_key').on(t.recipeId, t.sortOrder),
  check('recipe_ingredients_name_check', sql`length(btrim(${t.name})) BETWEEN 1 AND 100`),
  check('recipe_ingredients_quantity_check', sql`${t.quantity} > 0 AND ${t.quantity} <> 'NaN'::numeric`),
  check('recipe_ingredients_unit_check', sql`${t.unit} IN (${units})`),
  check('recipe_ingredients_preparation_check', sql`length(${t.preparation}) <= 200`),
  check('recipe_ingredients_note_check', sql`length(${t.note}) <= 500`),
  check('recipe_ingredients_sort_order_check', sql`${t.sortOrder} >= 0`),
]);

export const recipeInstructions = pgTable('recipe_instructions', {
  id: textId(), recipeId: text('recipe_id').notNull(), stepNumber: integer('step_number').notNull(), description: text('description').notNull(),
  imageId: text('image_id'),
}, (t) => [
  primaryKey({ name: 'recipe_instructions_pkey', columns: [t.id] }),
  foreignKey({ name: 'recipe_instructions_recipe_id_fkey', columns: [t.recipeId], foreignColumns: [recipes.id] }).onDelete('cascade'),
  foreignKey({ name: 'recipe_instructions_image_id_fkey', columns: [t.imageId], foreignColumns: [recipeImages.id] }).onDelete('set null'),
  unique('recipe_instructions_image_id_key').on(t.imageId),
  unique('recipe_instructions_recipe_step_key').on(t.recipeId, t.stepNumber),
  check('recipe_instructions_step_number_check', sql`${t.stepNumber} > 0`),
  check('recipe_instructions_description_check', sql`length(btrim(${t.description})) BETWEEN 1 AND 5000`),
]);

export const categories = pgTable('categories', {
  id: textId(), userId: text('user_id').notNull(), name: text('name').notNull(), sortOrder: integer('sort_order').notNull(),
}, (t) => [
  primaryKey({ name: 'categories_pkey', columns: [t.id] }),
  foreignKey({ name: 'categories_user_id_fkey', columns: [t.userId], foreignColumns: [users.id] }).onDelete('cascade'),
  uniqueIndex('categories_user_name_key').on(t.userId, sql`lower(${t.name})`),
  // One slot per position plus the range check cap every owner at ten categories.
  unique('categories_user_order_key').on(t.userId, t.sortOrder),
  check('categories_name_check', sql`length(btrim(${t.name})) BETWEEN 1 AND ${sql.raw(String(RECIPE_LIMITS.categoryName))}`),
  check('categories_sort_order_check', sql`${t.sortOrder} BETWEEN 0 AND ${sql.raw(String(RECIPE_LIMITS.categoriesPerUser - 1))}`),
]);

export const recipeCategories = pgTable('recipe_categories', {
  recipeId: text('recipe_id').notNull(), categoryId: text('category_id').notNull(), sortOrder: integer('sort_order').notNull(),
}, (t) => [
  primaryKey({ name: 'recipe_categories_pkey', columns: [t.recipeId, t.categoryId] }),
  foreignKey({ name: 'recipe_categories_recipe_id_fkey', columns: [t.recipeId], foreignColumns: [recipes.id] }).onDelete('cascade'),
  foreignKey({ name: 'recipe_categories_category_id_fkey', columns: [t.categoryId], foreignColumns: [categories.id] }).onDelete('cascade'),
  index('recipe_categories_category_id_idx').on(t.categoryId),
  unique('recipe_categories_recipe_order_key').on(t.recipeId, t.sortOrder),
  // Three unique slots plus the composite PK enforce at most three distinct categories.
  check('recipe_categories_sort_order_check', sql`${t.sortOrder} BETWEEN 0 AND 2`),
]);

export const favorites = pgTable('favorites', {
  userId: text('user_id').notNull(), recipeId: text('recipe_id').notNull(), createdAt: time('created_at').defaultNow().notNull(),
}, (t) => [
  primaryKey({ name: 'favorites_pkey', columns: [t.userId, t.recipeId] }),
  foreignKey({ name: 'favorites_user_id_fkey', columns: [t.userId], foreignColumns: [users.id] }).onDelete('cascade'),
  foreignKey({ name: 'favorites_recipe_id_fkey', columns: [t.recipeId], foreignColumns: [recipes.id] }).onDelete('cascade'),
  index('favorites_recipe_id_idx').on(t.recipeId),
]);

export const recipeImages = pgTable('recipe_images', {
  id: textId(), recipeId: text('recipe_id').notNull(), objectKey: text('object_key').notNull(), altText: text('alt_text'), sortOrder: integer('sort_order').notNull(),
}, (t) => [
  primaryKey({ name: 'recipe_images_pkey', columns: [t.id] }),
  foreignKey({ name: 'recipe_images_recipe_id_fkey', columns: [t.recipeId], foreignColumns: [recipes.id] }).onDelete('cascade'),
  unique('recipe_images_object_key_key').on(t.objectKey),
  unique('recipe_images_recipe_order_key').on(t.recipeId, t.sortOrder),
  check('recipe_images_object_key_check', sql`length(btrim(${t.objectKey})) > 0`),
  check('recipe_images_sort_order_check', sql`${t.sortOrder} >= 0`),
]);

export const recipeWriteAttempts = pgTable('recipe_write_attempts', {
  id: textId(),
  userId: text('user_id').notNull(),
  idempotencyKey: text('idempotency_key').notNull(),
  operation: text('operation').$type<'create' | 'update' | 'delete'>().notNull(),
  requestHash: text('request_hash').notNull(),
  // Exists before creation and survives recipe deletion; deliberately no recipe FK.
  recipeId: text('recipe_id').notNull(),
  objectKeys: text('object_keys').array().notNull().default(sql`'{}'::text[]`),
  staleObjectKeys: text('stale_object_keys').array().notNull().default(sql`'{}'::text[]`),
  state: text('state').$type<'pending' | 'completed' | 'cleanup_pending'>().notNull(),
  ...timestamps(),
}, (t) => [
  primaryKey({ name: 'recipe_write_attempts_pkey', columns: [t.id] }),
  foreignKey({ name: 'recipe_write_attempts_user_id_fkey', columns: [t.userId], foreignColumns: [users.id] }).onDelete('cascade'),
  unique('recipe_write_attempts_user_key_key').on(t.userId, t.idempotencyKey),
  index('recipe_write_attempts_state_created_at_idx').on(t.state, t.createdAt),
  check('recipe_write_attempts_idempotency_key_check', sql`length(${t.idempotencyKey}) BETWEEN 1 AND 200`),
  check('recipe_write_attempts_operation_check', sql`${t.operation} IN ('create', 'update', 'delete')`),
  check('recipe_write_attempts_state_check', sql`${t.state} IN ('pending', 'completed', 'cleanup_pending')`),
]);
