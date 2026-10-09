import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { and, eq, sql } from 'drizzle-orm';
import type { CreateRecipeMetadata } from '@recipe-app/contracts/types';
import { favorites, ingredients, recipeCategories, recipeImages, recipeIngredients, recipeInstructions, recipes, recipeWriteAttempts } from '../../src/database/schema.js';
import { RECIPE_FAVORITE_LIMIT } from '../../src/recipes/recipe-guards.js';
import { reconcileRecipeWrites } from '../../src/recipes/recipe-reconcile.js';
import { RECIPE_WRITE_LIMIT } from '../../src/recipes/recipe-upload.js';
import { jpeg, minimalRecipe, openRecipeSuite } from '../recipe-suite.js';
import type { Photo, RecipeSuite } from '../recipe-suite.js';

describe('Recipe favorites and delete HTTP', () => {
  let s: RecipeSuite;
  beforeAll(async () => { s = await openRecipeSuite(); }, 60_000);
  beforeEach(() => s.resetLimits());
  afterAll(() => s?.close(), 60_000);

  const create = async (metadata: CreateRecipeMetadata = minimalRecipe(s.name), photos: Photo[] = [], cookie = s.owner.cookie) =>
    s.savedId(await s.send('/recipes', metadata, photos, { cookie }), 201);
  const favorite = (method: 'PUT' | 'DELETE', id: string, options?: Parameters<RecipeSuite['call']>[2]) =>
    s.call(method, `/recipes/${encodeURIComponent(id)}/favorite`, options);
  const remove = (id: string, options?: Parameters<RecipeSuite['call']>[2]) => s.call('DELETE', `/recipes/${encodeURIComponent(id)}`, options);
  /** Favorite state as the owner's list and detail report it. */
  const flags = async (id: string) => [(await s.detail(id)).isFavorite, (await s.list()).data.find((recipe) => recipe.id === id)?.isFavorite];
  const favoriteRows = (id: string) => s.db.$count(favorites, eq(favorites.recipeId, id));
  const rowCounts = (id: string) => Promise.all([
    s.db.$count(recipes, eq(recipes.id, id)), s.db.$count(recipeIngredients, eq(recipeIngredients.recipeId, id)),
    s.db.$count(recipeInstructions, eq(recipeInstructions.recipeId, id)), s.db.$count(recipeCategories, eq(recipeCategories.recipeId, id)),
    s.db.$count(recipeImages, eq(recipeImages.recipeId, id)), favoriteRows(id),
  ]);
  const rich = (): CreateRecipeMetadata => ({ ...minimalRecipe(s.name), categories: ['Dinner', 'Lunch'],
    ingredients: [{ name: `${s.name} flour`, quantity: 1.5, unit: 'cup' }, { name: `${s.name} salt`, quantity: null, unit: null }],
    instructions: [{ description: 'First', hasImage: true }, { description: 'Second', hasImage: false }] });
  const richPhotos = [{ field: 'cover', bytes: jpeg(1) }, { field: 'step-0', bytes: jpeg(2) }];
  const objectKeysOf = async (id: string) => (await s.imageRows(id)).map(({ objectKey }) => objectKey);

  it('reports favorites as false by default and toggles them idempotently in list and detail', async () => {
    const id = await create();
    expect(await flags(id)).toEqual([false, false]);
    await s.expectEmpty(await favorite('PUT', id)); expect(await flags(id)).toEqual([true, true]);
    await s.expectEmpty(await favorite('PUT', id)); expect(await favoriteRows(id)).toBe(1);
    await s.expectEmpty(await favorite('DELETE', id)); expect(await flags(id)).toEqual([false, false]);
    await s.expectEmpty(await favorite('DELETE', id)); expect(await favoriteRows(id)).toBe(0);
  }, 60_000);

  it('answers 404 for another owner and unknown ids, and keeps favorites per user', async () => {
    const id = await create();
    for (const method of ['PUT', 'DELETE'] as const) {
      await s.expectError(await favorite(method, id, { cookie: s.other.cookie }), 404, 'NOT_FOUND');
      for (const unknown of [randomUUID(), 'bad\u0000id', 'x'.repeat(201)]) await s.expectError(await favorite(method, unknown), 404, 'NOT_FOUND');
    }
    expect(await favoriteRows(id)).toBe(0);
    // Recipes are owner-only, so another user's row can only exist out of band; it must still never leak or be removed.
    await s.db.insert(favorites).values({ userId: s.other.user.id, recipeId: id });
    expect(await flags(id)).toEqual([false, false]);
    await s.expectEmpty(await favorite('PUT', id)); expect(await flags(id)).toEqual([true, true]); expect(await favoriteRows(id)).toBe(2);
    await s.expectEmpty(await favorite('DELETE', id)); expect(await flags(id)).toEqual([false, false]);
    expect(await s.db.$count(favorites, and(eq(favorites.recipeId, id), eq(favorites.userId, s.other.user.id)))).toBe(1);
  }, 60_000);

  it('rejects unauthenticated, hostile-origin and rate-limited favorite writes without writing', async () => {
    const id = await create();
    for (const method of ['PUT', 'DELETE'] as const) {
      await s.expectError(await favorite(method, id, { cookie: null }), 401, 'UNAUTHENTICATED');
      await s.expectError(await favorite(method, id, { origin: 'https://hostile.example.invalid' }), 403, 'ORIGIN_REJECTED');
      await s.expectError(await favorite(method, id, { origin: null }), 403, 'ORIGIN_REJECTED');
    }
    await s.fillLimit('recipe-favorite', s.owner.user.id, RECIPE_FAVORITE_LIMIT);
    const limited = await favorite('PUT', id);
    await s.expectError(limited, 429, 'RATE_LIMITED'); expect(Number(limited.headers.get('retry-after')) > 0).toBe(true);
    expect(await favoriteRows(id)).toBe(0);
  }, 60_000);

  it('leaves list paging, totals and counts unchanged when a recipe is favorited', async () => {
    const ids = [await create({ ...minimalRecipe(s.name), categories: ['Dinner'] }, [], s.other.cookie),await create(undefined, [], s.other.cookie), await create(undefined, [], s.other.cookie)];
    const pages = async () => Promise.all([1, 2, 3, 4].map((page) => s.list(`?limit=1&page=${page}`, s.other.cookie)));
    const before = await pages();
    await s.expectEmpty(await favorite('PUT', ids[1], { cookie: s.other.cookie }));
    const after = await pages();
    expect(after.map(({ meta, counts }) => ({ meta, counts }))).toEqual(before.map(({ meta, counts }) => ({ meta, counts })));
    expect(after[0].meta).toMatchObject({ total: 3, totalPages: 3 }); expect(after[0].counts.total).toBe(3); expect(after[3].data).toEqual([]);
    expect(after.flatMap(({ data }) => data.map(({ id }) => id))).toEqual(before.flatMap(({ data }) => data.map(({ id }) => id)));
    expect(after.flatMap(({ data }) => data).filter(({ isFavorite }) => isFavorite).map(({ id }) => id)).toEqual([ids[1]]);
    expect((await s.list('?search=Temporary&category=Dinner&sortBy=title&order=asc', s.other.cookie)).data.map(({ id }) => id)).toEqual([ids[0]]);
  }, 60_000);

  it('deletes the recipe, its child rows, favorites, attempts and stored objects, and keeps canonical ingredients', async () => {
    const id = await create(rich(), richPhotos); const keys = await objectKeysOf(id);
    await s.expectEmpty(await favorite('PUT', id));
    expect(await rowCounts(id)).toEqual([1, 2, 2, 2, 2, 1]);
    for (const key of keys) expect(await s.stored(key)).toBe(true);
    await s.expectEmpty(await remove(id));
    expect(await rowCounts(id)).toEqual([0, 0, 0, 0, 0, 0]);
    for (const key of keys) expect(await s.stored(key)).toBe(false);
    expect(await s.db.$count(recipeWriteAttempts, eq(recipeWriteAttempts.recipeId, id))).toBe(0);
    expect(await s.db.$count(ingredients, sql`lower(${ingredients.name}) in (${`${s.name} flour`}, ${`${s.name} salt`})`)).toBe(2);
    await s.expectError(await remove(id), 404, 'NOT_FOUND');
    await s.expectError(await s.call('GET', `/recipes/${id}`), 404, 'NOT_FOUND');
    expect((await s.list()).data.some((recipe) => recipe.id === id)).toBe(false);
  }, 60_000);

  it('deletes nothing for another owner, unknown ids, missing sessions, hostile origins or an exhausted write limit', async () => {
    const id = await create(rich(), richPhotos); const keys = await objectKeysOf(id);
    await s.expectError(await remove(id, { cookie: s.other.cookie }), 404, 'NOT_FOUND');
    for (const unknown of [randomUUID(), 'bad\u0000id', 'x'.repeat(201)]) await s.expectError(await remove(unknown), 404, 'NOT_FOUND');
    await s.expectError(await remove(id, { cookie: null }), 401, 'UNAUTHENTICATED');
    await s.expectError(await remove(id, { origin: 'https://hostile.example.invalid' }), 403, 'ORIGIN_REJECTED');
    await s.expectError(await remove(id, { origin: null }), 403, 'ORIGIN_REJECTED');
    await s.fillLimit('recipe-write', s.owner.user.id, RECIPE_WRITE_LIMIT);
    const limited = await remove(id);
    await s.expectError(limited, 429, 'RATE_LIMITED'); expect(Number(limited.headers.get('retry-after')) > 0).toBe(true);
    expect(await rowCounts(id)).toEqual([1, 2, 2, 2, 2, 0]);
    for (const key of keys) expect(await s.stored(key)).toBe(true);
  }, 60_000);

  it('still answers 204 when object deletion fails and leaves the objects to reconciliation', async () => {
    const id = await create(rich(), richPhotos); const keys = await objectKeysOf(id);
    const deletion = vi.spyOn(s.storage, 'deleteObject').mockRejectedValueOnce(new Error('Forced storage deletion failure'));
    try { await s.expectEmpty(await remove(id)); } finally { deletion.mockRestore(); }
    expect(await rowCounts(id)).toEqual([0, 0, 0, 0, 0, 0]);
    const attempts = await s.db.select().from(recipeWriteAttempts).where(eq(recipeWriteAttempts.recipeId, id));
    expect(attempts.map(({ operation, state, staleObjectKeys }) => [operation, state, staleObjectKeys.length])).toEqual([['delete', 'cleanup_pending', 2]]);
    expect((await Promise.all(keys.map((key) => s.stored(key)))).some(Boolean)).toBe(true);
    const attemptIds = attempts.map((attempt) => attempt.id);
    expect(await reconcileRecipeWrites(s.db, s.storage, { now: new Date(), attemptIds })).toEqual({ completed: 0, removed: 1, deletedObjects: 2, failed: 0 });
    for (const key of keys) expect(await s.stored(key)).toBe(false);
    expect(await s.db.$count(recipeWriteAttempts, eq(recipeWriteAttempts.recipeId, id))).toBe(0);
    expect(await reconcileRecipeWrites(s.db, s.storage, { now: new Date(), attemptIds })).toEqual({ completed: 0, removed: 0, deletedObjects: 0, failed: 0 });
  }, 60_000);
});
