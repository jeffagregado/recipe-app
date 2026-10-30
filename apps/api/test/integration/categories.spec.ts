import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { categoryListSchema } from '@recipe-app/contracts/schemas';
import type { CategoryWithUsage, SaveCategoryInput } from '@recipe-app/contracts/types';
import { authRateLimits, categories, recipeCategories, recipes, users } from '../../src/database/schema.js';
import { CATEGORY_WRITE_LIMIT } from '../../src/categories/category-write.guard.js';
import { DEFAULT_CATEGORY_NAMES } from '../../src/categories/default-categories.js';
import { TEST_ORIGIN } from '../auth-harness.js';
import { jpeg, minimalRecipe, openRecipeSuite } from '../recipe-suite.js';
import type { RecipeSuite } from '../recipe-suite.js';

describe('Categories HTTP', () => {
  let s: RecipeSuite;
  let limitKeys: string[];
  beforeAll(async () => {
    s = await openRecipeSuite();
    limitKeys = [s.owner, s.other].map(({ user }) => `wrapper:category-write:user:${user.id}`);
  }, 60_000);
  // Every scenario starts from the five defaults, no recipes and a fresh write window.
  beforeEach(async () => {
    await s.resetLimits();
    await s.db.delete(authRateLimits).where(inArray(authRateLimits.key, limitKeys));
    await s.db.delete(recipes).where(inArray(recipes.userId, [s.owner.user.id, s.other.user.id]));
    const current = await read();
    if (current.map(({ name }) => name).join() !== DEFAULT_CATEGORY_NAMES.join()) {
      await s.db.delete(categories).where(eq(categories.userId, s.owner.user.id));
      await s.db.insert(categories).values(DEFAULT_CATEGORY_NAMES.map((name, sortOrder) => ({ userId: s.owner.user.id, name, sortOrder })));
    }
  }, 60_000);
  afterAll(async () => {
    if (!s) return;
    try { await s.db.delete(authRateLimits).where(inArray(authRateLimits.key, limitKeys)); } finally { await s.close(); }
  }, 60_000);

  type Options = { cookie?: string | null; origin?: string | null };
  async function read(cookie = s.owner.cookie): Promise<CategoryWithUsage[]> {
    const response = await s.call('GET', '/categories', { cookie });
    expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toBe('private, no-store');
    return categoryListSchema.parse(await response.json());
  }
  function put(body: unknown, { cookie = s.owner.cookie, origin = TEST_ORIGIN }: Options = {}) {
    const headers = new Headers({ 'Content-Type': 'application/json' });
    if (cookie !== null) headers.set('Cookie', cookie);
    if (origin !== null) headers.set('Origin', origin);
    return fetch(`${s.baseUrl}/categories`, { method: 'PUT', headers, body: JSON.stringify(body) });
  }
  async function save(body: SaveCategoryInput[], options?: Options): Promise<CategoryWithUsage[]> {
    const response = await put(body, options);
    expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toBe('private, no-store');
    return categoryListSchema.parse(await response.json());
  }
  const named = (list: CategoryWithUsage[], name: string) => list.find((category) => category.name === name)!;
  const rows = (list: CategoryWithUsage[]): SaveCategoryInput[] => list.map(({ id, name }) => ({ id, name }));
  const names = (list: { name: string }[]) => list.map(({ name }) => name);
  const createTagged = async (tags: string[], cookie = s.owner.cookie) =>
    s.savedId(await s.send('/recipes', { ...minimalRecipe(s.name), categoryIds: tags }, { cookie }), 201);

  it('gives every new account its own five defaults in order, unused', async () => {
    const [mine, theirs] = [await read(), await read(s.other.cookie)];
    for (const list of [mine, theirs]) expect(list.map(({ name, recipeCount }) => [name, recipeCount])).toEqual(DEFAULT_CATEGORY_NAMES.map((name) => [name, 0]));
    expect(mine.map(({ id }) => id).filter((id) => theirs.some((other) => other.id === id))).toEqual([]);
    expect(await s.db.$count(categories, eq(categories.userId, s.owner.user.id))).toBe(5);
  }, 60_000);

  it('requires a session to read, and a session plus a trusted origin to save', async () => {
    await s.expectError(await s.call('GET', '/categories', { cookie: null }), 401, 'UNAUTHENTICATED');
    const body = rows(await read());
    await s.expectError(await put(body, { cookie: null }), 401, 'UNAUTHENTICATED');
    for (const origin of [null, 'https://evil.example']) expect((await put([], { origin })).status).toBe(403);
    expect(names(await read())).toEqual([...DEFAULT_CATEGORY_NAMES]);
  }, 60_000);

  it('renames, adds and deletes in one save, keeps ids, and untags recipes of the deleted category only', async () => {
    const before = await read();
    const [lunch, dinner, snacks] = ['Lunch', 'Dinner', 'Snacks'].map((name) => named(before, name));
    const recipeId = await createTagged([dinner.id, snacks.id, lunch.id]);
    const untouched = await s.detail(recipeId);
    expect((await read()).map(({ name, recipeCount }) => [name, recipeCount])).toEqual([['Breakfast', 0], ['Lunch', 1], ['Dinner', 1], ['Snacks', 1], ['Desserts', 0]]);

    const saved = await save([...rows(before).filter(({ id }) => id !== snacks.id).map((row) => row.id === lunch.id ? { ...row, name: '  Late   lunch ' } : row), { name: 'Soup' }]);
    expect(saved.map(({ name, recipeCount }) => [name, recipeCount])).toEqual([['Breakfast', 0], ['Late lunch', 1], ['Dinner', 1], ['Desserts', 0], ['Soup', 0]]);
    expect(saved.slice(0, 4).map(({ id }) => id)).toEqual(before.filter(({ id }) => id !== snacks.id).map(({ id }) => id));
    expect(await read()).toEqual(saved);
    expect((await s.db.select({ sortOrder: categories.sortOrder }).from(categories).where(eq(categories.userId, s.owner.user.id))).map(({ sortOrder }) => sortOrder).sort()).toEqual([0, 1, 2, 3, 4]);

    // The recipe keeps its other tags in order under the new name and is otherwise untouched.
    const after = await s.detail(recipeId);
    expect(after.categories).toEqual([{ id: dinner.id, name: 'Dinner' }, { id: lunch.id, name: 'Late lunch' }]);
    expect({ ...after, categories: [] }).toEqual({ ...untouched, categories: [] });
    expect((await s.list()).data.find(({ id }) => id === recipeId)?.categories).toEqual(after.categories);
    expect(await s.db.$count(recipeCategories, eq(recipeCategories.categoryId, snacks.id))).toBe(0);
    expect(names(await read(s.other.cookie))).toEqual([...DEFAULT_CATEGORY_NAMES]);
  }, 60_000);

  it('swaps two names, changes only the case of one, and reuses a deleted name in the same save', async () => {
    const before = await read();
    const body = rows(before).map((row) => row.name === 'Lunch' ? { ...row, name: 'Dinner' } : row.name === 'Dinner' ? { ...row, name: 'Lunch' }
      : row.name === 'Breakfast' ? { ...row, name: 'BREAKFAST' } : row).filter((row) => row.name !== 'Snacks');
    const saved = await save([...body, { name: 'snacks' }]);
    expect(names(saved)).toEqual(['BREAKFAST', 'Dinner', 'Lunch', 'Desserts', 'snacks']);
    expect(named(saved, 'Dinner').id).toBe(named(before, 'Lunch').id);
    expect(named(saved, 'snacks').id).not.toBe(named(before, 'Snacks').id);
  }, 60_000);

  it('allows deleting every category and never recreates the defaults', async () => {
    const recipeId = await createTagged([named(await read(), 'Dinner').id]);
    expect(await save([])).toEqual([]);
    expect(await read()).toEqual([]);
    expect((await s.detail(recipeId)).categories).toEqual([]);
    expect((await s.list()).counts.categories).toEqual([]);
    await createTagged([]);
    expect(await read()).toEqual([]);
  }, 60_000);

  it('accepts ten categories and rejects an eleventh, writing nothing', async () => {
    const extra = Array.from({ length: 5 }, (_, index) => ({ name: `Extra ${index}` }));
    const full = await save([...rows(await read()), ...extra]);
    expect(full).toHaveLength(10);
    await s.expectError(await put([...rows(full), { name: 'Eleventh' }]), 400, 'VALIDATION_FAILED', 'categories');
    expect(await read()).toEqual(full);
  }, 60_000);

  // Name and set rules belong to the contract's own tests; here one rejected body proves the endpoint applies that schema.
  it('rejects unknown and foreign ids and a duplicate name with row errors, writing nothing', async () => {
    const before = await read();
    const body = rows(before);
    const foreign = (await read(s.other.cookie))[0];
    const cases: [unknown, string][] = [
      [[...body, { id: randomUUID(), name: 'Ghost' }], '5.id'],
      [[...body, { id: foreign.id, name: 'Stolen' }], '5.id'],
      [[...body, { name: ' dinner ' }], '5.name'],
      [[{ ...body[0], userId: s.other.user.id }], '0'],
    ];
    for (const [input, field] of cases) await s.expectError(await put(input), 400, 'VALIDATION_FAILED', field);
    expect(await read()).toEqual(before);
    // A foreign id never renames or removes the other owner's category.
    expect(await read(s.other.cookie)).toContainEqual(foreign);
  }, 60_000);

  it('answers a stale id with 400 after another save removed that category', async () => {
    const stale = rows(await read());
    await save(stale.filter(({ name }) => name !== 'Snacks'));
    await s.expectError(await put(stale), 400, 'VALIDATION_FAILED', '3.id');
    expect(names(await read())).toEqual(['Breakfast', 'Lunch', 'Dinner', 'Desserts']);
  }, 60_000);

  it('serializes concurrent saves so the last one wins as a whole', async () => {
    const body = rows(await read());
    const results = await Promise.all(['First', 'Second', 'Third'].map((name) => save([...body, { name }])));
    const final = await read();
    expect(final).toHaveLength(6);
    expect(results.map((result) => JSON.stringify(result))).toContain(JSON.stringify(final));
  }, 60_000);

  it('rejects another owner\'s category on recipe create and update, storing nothing', async () => {
    const mine = named(await read(), 'Dinner');
    const foreign = (await read(s.other.cookie))[0];
    const pendingPhotoId = await s.pendingPhoto(jpeg());
    await s.expectError(await s.send('/recipes', { ...minimalRecipe(s.name), categoryIds: [mine.id, foreign.id], instructions: [{ description: 'Mix.', image: { pendingPhotoId } }] }),
      400, 'VALIDATION_FAILED', 'categories');
    expect((await s.list()).counts.total).toBe(0);
    // The refused save took nothing: its photo is still a Pending photo.
    expect((await s.pendingRow(pendingPhotoId))?.id).toBe(pendingPhotoId);

    const recipeId = await createTagged([mine.id]);
    const value = await s.detail(recipeId);
    const update = { title: value.title, description: null, servings: null, prepTimeMinutes: null, cookTimeMinutes: null, videoUrl: null, notes: null,
      ingredients: [{ name: s.name, quantity: null, unit: null }], cover: 'keep', instructions: value.instructions.map(({ id, description }) => ({ id, description, image: 'keep' })) };
    for (const categoryIds of [[foreign.id], [mine.id, randomUUID()]]) {
      await s.expectError(await s.send(`/recipes/${recipeId}`, { ...update, categoryIds }, { method: 'PATCH' }), 400, 'VALIDATION_FAILED', 'categories');
    }
    expect((await s.detail(recipeId)).categories).toEqual([{ id: mine.id, name: 'Dinner' }]);
    expect((await read(s.other.cookie))[0].recipeCount).toBe(0);
  }, 60_000);

  it('rejects a recipe save that names a category deleted meanwhile', async () => {
    const snacks = named(await read(), 'Snacks');
    await save(rows(await read()).filter(({ id }) => id !== snacks.id));
    await s.expectError(await s.send('/recipes', { ...minimalRecipe(s.name), categoryIds: [snacks.id] }), 400, 'VALIDATION_FAILED', 'categories');
    expect((await s.list()).counts.total).toBe(0);
  }, 60_000);

  it('limits saves per account and removes an account\'s categories with it', async () => {
    await s.db.insert(authRateLimits).values({ id: randomUUID(), key: limitKeys[0], count: CATEGORY_WRITE_LIMIT, lastRequest: Date.now() });
    const limited = await put(rows(await read()));
    expect(limited.status).toBe(429); expect(limited.headers.get('retry-after')).toMatch(/^\d+$/);
    expect((await put(rows(await read(s.other.cookie)), { cookie: s.other.cookie })).status).toBe(200);
    // Categories belong to their owner: no row survives the account.
    const id = `verify-category-owner-${randomUUID()}`;
    await s.db.insert(users).values({ id, name: 'Temporary verification', email: `${id}@example.invalid`, createdAt: new Date(), updatedAt: new Date() });
    await s.db.insert(categories).values({ userId: id, name: 'Soup', sortOrder: 0 });
    await s.db.delete(users).where(eq(users.id, id));
    expect(await s.db.$count(categories, eq(categories.userId, id))).toBe(0);
  }, 60_000);
});
