import { createHash } from 'node:crypto';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { recipeSummarySchema } from '@recipe-app/contracts/schemas';
import { RECIPE_CATEGORIES } from '@recipe-app/contracts/types';
import type { RecipeSummary } from '@recipe-app/contracts/types';
import type { DrizzleDb } from './database.service.js';
import { categories, ingredients, recipeCategories, recipeIngredients, recipeInstructions, recipes, users } from './schema.js';
import { sampleRecipes } from '../recipes/sample-recipes.js';
import { sampleDetails } from '../recipes/sample-details.js';

export const DEMO_AUTHOR_ID = 'seed-demo-author';
type Transaction = Parameters<Parameters<DrizzleDb['transaction']>[0]>[0];
const seedDate = new Date('2026-10-05T00:00:00Z');
const ingredientId = (name: string) => `seed-ingredient-${createHash('sha256').update(name.toLowerCase()).digest('hex').slice(0, 24)}`;

function detailsFor(id: string) {
  const details = sampleDetails[id];
  if (!details) throw new Error(`Missing recipe seed details: ${id}.`);
  return details;
}

function requireId<K>(ids: Map<K, string>, name: K): string {
  const id = ids.get(name);
  if (!id) throw new Error(`Seed catalog collision: ${String(name)}.`);
  return id;
}

async function checkOwner(tx: Transaction, samples: RecipeSummary[]): Promise<void> {
  await tx.insert(users).values({ id: DEMO_AUTHOR_ID, name: 'Alex Sample', email: 'alex.sample@example.invalid', createdAt: seedDate, updatedAt: seedDate }).onConflictDoNothing();
  const author = await tx.query.users.findFirst({ where: eq(users.id, DEMO_AUTHOR_ID), with: { accounts: { columns: { id: true } } } });
  if (!author || author.email !== 'alex.sample@example.invalid' || author.accounts.length > 0) {
    throw new Error('Demo author collision: seed requires its reserved fictional identity without login accounts.');
  }
  const existing = await tx.select({ id: recipes.id }).from(recipes).where(and(inArray(recipes.id, samples.map(({ id }) => id)), sql`${recipes.userId} <> ${DEMO_AUTHOR_ID}`));
  if (existing.length > 0) throw new Error('Recipe seed ID collision with a non-seed owner. No records changed.');
}

async function seedCatalog(tx: Transaction, samples: RecipeSummary[]) {
  await tx.insert(categories).values(RECIPE_CATEGORIES.map((name) => ({ id: `seed-category-${name.toLowerCase()}`, name }))).onConflictDoNothing();
  const categoryRows = await tx.select().from(categories);
  const names = [...new Set(samples.flatMap(({ id }) => detailsFor(id).ingredients.map(([name]) => name)))];
  await tx.insert(ingredients).values(names.map((name) => ({ id: ingredientId(name), name }))).onConflictDoNothing();
  const ingredientRows = await tx.select().from(ingredients).where(inArray(sql`lower(btrim(${ingredients.name}))`, names));
  return {
    categoryIds: new Map(categoryRows.map(({ id, name }) => [name, id])),
    ingredientIds: new Map(ingredientRows.map(({ id, name }) => [name.trim().toLowerCase(), id])),
  };
}

async function seedRecipes(tx: Transaction, samples: RecipeSummary[]): Promise<void> {
  const rows = samples.map((sample, sortOrder) => ({
    id: sample.id, userId: DEMO_AUTHOR_ID, title: sample.title, description: sample.description,
    servings: sample.servings, prepTimeMinutes: sample.prepTimeMinutes, cookTimeMinutes: sample.cookTimeMinutes,
    sortOrder, createdAt: new Date(sample.createdAt), updatedAt: new Date(sample.updatedAt),
  }));
  const saved = await tx.insert(recipes).values(rows).onConflictDoUpdate({ target: recipes.id, set: {
    title: sql`excluded.title`, description: sql`excluded.description`, servings: sql`excluded.servings`,
    prepTimeMinutes: sql`excluded.prep_time_minutes`, cookTimeMinutes: sql`excluded.cook_time_minutes`,
    sortOrder: sql`excluded.sort_order`, createdAt: sql`excluded.created_at`, updatedAt: sql`excluded.updated_at`,
  }, setWhere: eq(recipes.userId, DEMO_AUTHOR_ID) }).returning({ id: recipes.id });
  if (saved.length !== rows.length) throw new Error('Recipe seed owner changed during seed. No records changed.');
}

async function seedContent(tx: Transaction, samples: RecipeSummary[], catalog: Awaited<ReturnType<typeof seedCatalog>>): Promise<void> {
  const items = samples.flatMap(({ id }) => detailsFor(id).ingredients.map(([name, quantity, unit, preparation], sortOrder) => ({
    id: `${id}-ingredient-${sortOrder}`, recipeId: id, ingredientId: requireId(catalog.ingredientIds, name),
    name, quantity: quantity.toFixed(3), unit, preparation: preparation ?? null, note: null, sortOrder,
  })));
  const savedIngredients = await tx.insert(recipeIngredients).values(items).onConflictDoUpdate({ target: recipeIngredients.id, set: {
    ingredientId: sql`excluded.ingredient_id`, name: sql`excluded.name`, quantity: sql`excluded.quantity`, unit: sql`excluded.unit`,
    preparation: sql`excluded.preparation`, note: sql`excluded.note`, sortOrder: sql`excluded.sort_order`,
  }, setWhere: sql`${recipeIngredients.recipeId} = excluded.recipe_id` }).returning({ id: recipeIngredients.id });
  if (savedIngredients.length !== items.length) throw new Error('Recipe ingredient seed ID collision. No records changed.');
  const steps = samples.flatMap(({ id }) => detailsFor(id).instructions.map((description, index) => ({ id: `${id}-step-${index + 1}`, recipeId: id, stepNumber: index + 1, description })));
  const savedSteps = await tx.insert(recipeInstructions).values(steps).onConflictDoUpdate({ target: recipeInstructions.id, set: { stepNumber: sql`excluded.step_number`, description: sql`excluded.description` }, setWhere: sql`${recipeInstructions.recipeId} = excluded.recipe_id` }).returning({ id: recipeInstructions.id });
  if (savedSteps.length !== steps.length) throw new Error('Recipe instruction seed ID collision. No records changed.');
  const joins = samples.flatMap((sample) => sample.categories.map((name, sortOrder) => ({ recipeId: sample.id, categoryId: requireId(catalog.categoryIds, name), sortOrder })));
  await tx.insert(recipeCategories).values(joins).onConflictDoUpdate({ target: [recipeCategories.recipeId, recipeCategories.categoryId], set: { sortOrder: sql`excluded.sort_order` } });
}

/** Explicit, transactional seed; collisions with non-seed recipe owners fail rather than overwrite. */
export async function seedDatabase(db: DrizzleDb): Promise<void> {
  const samples = recipeSummarySchema.array().parse(sampleRecipes);
  await db.transaction(async (tx) => {
    await checkOwner(tx, samples);
    const catalog = await seedCatalog(tx, samples);
    await seedRecipes(tx, samples);
    await seedContent(tx, samples, catalog);
  });
}
