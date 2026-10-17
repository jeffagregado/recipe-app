import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { DrizzleDb } from '../src/database/database.service.js';
import { categories, favorites, ingredients, recipeCategories, recipeImages, recipeIngredients, recipeInstructions, recipes, users } from '../src/database/schema.js';
import { DEMO_TEMPLATE_EMAIL, DEMO_TEMPLATE_ID } from '../src/demo/demo-template.js';
import type { StorageService } from '../src/storage/storage.service.js';
import { jpeg } from './recipe-photos.js';

export type DemoTemplate = Awaited<ReturnType<typeof seedDemoTemplate>>;

/** The stored photos of the Demo template's recipes. */
async function templateObjectKeys(db: DrizzleDb): Promise<string[]> {
  const rows = await db.select({ key: recipeImages.objectKey }).from(recipeImages)
    .innerJoin(recipes, eq(recipes.id, recipeImages.recipeId)).where(eq(recipes.userId, DEMO_TEMPLATE_ID));
  return rows.map(({ key }) => key);
}

/** Deletes the Demo template, its rows cascading, and then its stored photos. */
export async function removeDemoTemplate(db: DrizzleDb, storage: StorageService): Promise<void> {
  const keys = await templateObjectKeys(db);
  await db.delete(users).where(eq(users.id, DEMO_TEMPLATE_ID));
  for (const key of keys) await storage.deleteObject(key);
}

/**
 * A small Demo template in place of the curated one: two recipes, one with a cover and a step photo, named groups, a
 * fractional amount, notes, a video link and times, Categories, and one Favorite. Ingredient names start with `name`.
 */
export async function seedDemoTemplate(db: DrizzleDb, storage: StorageService, name: string) {
  await removeDemoTemplate(db, storage);
  await db.insert(users).values({ id: DEMO_TEMPLATE_ID, name: 'Demo template', email: DEMO_TEMPLATE_EMAIL, emailVerified: true });
  const categoryNames = ['Mains', 'Sweets', 'Quick'];
  const [mains, , quick] = await db.insert(categories)
    .values(categoryNames.map((categoryName, sortOrder) => ({ userId: DEMO_TEMPLATE_ID, name: categoryName, sortOrder }))).returning();
  const [flour, egg, leaf] = await db.insert(ingredients).values(['flour', 'egg', 'leaf'].map((item) => ({ name: `${name} ${item}` }))).returning();
  const pancakes = randomUUID(); const salad = randomUUID();
  await db.insert(recipes).values([
    { id: pancakes, userId: DEMO_TEMPLATE_ID, title: 'Template pancakes', description: 'Fluffy.', notes: 'Rest the batter.',
      videoUrl: 'https://video.example.invalid/pancakes', servings: 4, prepTimeMinutes: 10, cookTimeMinutes: 15, sortOrder: 0,
      createdAt: new Date('2026-10-02T00:00:00Z'), updatedAt: new Date('2026-10-03T00:00:00Z') },
    { id: salad, userId: DEMO_TEMPLATE_ID, title: 'Template salad', description: null, notes: null, videoUrl: null, servings: null,
      prepTimeMinutes: null, cookTimeMinutes: null, sortOrder: 1, createdAt: new Date('2026-10-01T00:00:00Z'), updatedAt: new Date('2026-10-01T00:00:00Z') },
  ]);
  await db.insert(recipeIngredients).values([
    { recipeId: pancakes, ingredientId: flour.id, name: flour.name, quantity: '1.500', unit: 'cup', heading: 'Batter', sortOrder: 0 },
    { recipeId: pancakes, ingredientId: egg.id, name: egg.name, quantity: '2.000', unit: 'tbsp', heading: null, sortOrder: 1 },
    { recipeId: pancakes, ingredientId: leaf.id, name: leaf.name, quantity: '0.250', unit: 'cup', heading: 'Topping', sortOrder: 2 },
    { recipeId: salad, ingredientId: leaf.id, name: leaf.name, quantity: null, unit: null, heading: null, sortOrder: 0 },
  ]);
  const photos = { cover: jpeg(11), step: jpeg(12) };
  const coverKey = `recipes/${pancakes}/${randomUUID()}.jpg`; const stepKey = `recipes/${pancakes}/${randomUUID()}.jpg`;
  await storage.upload(coverKey, photos.cover, 'image/jpeg');
  await storage.upload(stepKey, photos.step, 'image/jpeg');
  const [, stepImage] = await db.insert(recipeImages).values([
    { recipeId: pancakes, objectKey: coverKey, sortOrder: 0 }, { recipeId: pancakes, objectKey: stepKey, sortOrder: 1 },
  ]).returning();
  await db.insert(recipeInstructions).values([
    { recipeId: pancakes, stepNumber: 1, description: 'Whisk.', heading: 'Batter', imageId: stepImage.id },
    { recipeId: pancakes, stepNumber: 2, description: 'Fry.', heading: 'Cook', imageId: null },
    { recipeId: salad, stepNumber: 1, description: 'Toss.', heading: null, imageId: null },
  ]);
  await db.insert(recipeCategories).values([
    { recipeId: pancakes, categoryId: mains.id, sortOrder: 0 }, { recipeId: pancakes, categoryId: quick.id, sortOrder: 1 },
    { recipeId: salad, categoryId: quick.id, sortOrder: 0 },
  ]);
  await db.insert(favorites).values({ userId: DEMO_TEMPLATE_ID, recipeId: pancakes });
  return { recipeIds: { pancakes, salad }, objectKeys: [coverKey, stepKey], photos, categoryNames };
}
