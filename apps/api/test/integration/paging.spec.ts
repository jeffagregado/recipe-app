import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, inArray, sql, TransactionRollbackError } from 'drizzle-orm';
import { ResilienceTimeoutError } from '@nestjs/resilience';
import { categoryListSchema, recipeListResponseSchema } from '@recipe-app/contracts/schemas';
import { RECIPE_SORT_FIELDS } from '@recipe-app/contracts/types';
import type { AuthUser, CategoryWithUsage, RecipeListQuery, RecipeSummary } from '@recipe-app/contracts/types';
import { DEFAULT_CATEGORY_NAMES } from '../../src/categories/default-categories.js';
import type { DefaultCategoryName } from '../../src/categories/default-categories.js';
import { DatabaseService } from '../../src/database/database.service.js';
import { favorites, recipes } from '../../src/database/schema.js';
import { seedRecipes } from '../../src/recipes/seed-recipes.js';
import { createReadDeadline } from '../../src/recipes/recipe-read-deadline.js';
import { apiClient, insertOwnedRecipes, ownedId, removeTestData, signupUser, startApi, testAddress, testUsername } from '../auth-harness.js';

describe('Owner-scoped SQL recipe pagination', () => {
  let app: NestExpressApplication;
  let baseUrl: string;
  let user: AuthUser;
  let cookie: string;
  let categories: Array<CategoryWithUsage & { name: DefaultCategoryName }>;
  let other: Awaited<ReturnType<typeof signupUser>>;
  let otherCategories: CategoryWithUsage[];
  async function fetchCategories(cookie: string) {
    const response = await fetch(`${baseUrl}/categories`, { headers: { Cookie: cookie } });
    expect(response.status).toBe(200);
    return categoryListSchema.parse(await response.json());
  }
  function categoryId(name: DefaultCategoryName) {
    const category = categories.find((category) => category.name === name);
    if (!category) throw new Error(`Missing default category: ${name}`);
    return category.id;
  }
  const address = testAddress();
  const username = testUsername();
  const otherUsername = testUsername();
  const tag = `verify-paging-${randomUUID()}`;
  beforeAll(async () => {
    const started = await startApi();
    app = started.app;
    baseUrl = started.baseUrl;
    ({ user, cookie } = await signupUser(apiClient(baseUrl, address), username));
    const fetched = await fetchCategories(cookie);
    expect(fetched.map(({ name }) => name)).toEqual(DEFAULT_CATEGORY_NAMES);
    categories = fetched.map((category, index) => ({ ...category, name: DEFAULT_CATEGORY_NAMES[index] }));
    other = await signupUser(apiClient(baseUrl, address), otherUsername);
    otherCategories = await fetchCategories(other.cookie);
    await insertOwnedRecipes(started.db, user, tag);
  }, 60_000);
  afterAll(async () => {
    if (!app) return;
    try { await removeTestData(app.get(DatabaseService).db, { usernames: [username, otherUsername], addresses: [address] }); }
    finally { await app.close(); }
  });

  async function list(params: Partial<RecipeListQuery> = {}) {
    const query = new URLSearchParams(Object.entries(params).map(([key, value]) => [key, String(value)]));
    const response = await fetch(`${baseUrl}/recipes?${query}`, { headers: { Cookie: cookie } });
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    return recipeListResponseSchema.parse(await response.json());
  }

  function ordered(sortBy: RecipeListQuery['sortBy'], order: RecipeListQuery['order'], source = seedRecipes) {
    return source.map((recipe) => ({ recipe, position: seedRecipes.findIndex(({ id }) => id === recipe.id) }))
      .sort((a, b) => {
        const left = sortBy === 'title' ? a.recipe.title : Date.parse(a.recipe[sortBy]);
        const right = sortBy === 'title' ? b.recipe.title : Date.parse(b.recipe[sortBy]);
        const comparison = left < right ? -1 : left > right ? 1 : 0;
        return comparison * (order === 'asc' ? 1 : -1) || a.position - b.position;
      }).map(({ recipe }) => ownedId(tag, recipe.id));
  }

  it('returns five disjoint 20-item pages, default newest order, full counts and an empty terminal page', async () => {
    const pages = await Promise.all([1, 2, 3, 4, 5].map((page) => list({ page })));
    for (const [index, page] of pages.entries()) {
      expect(page.data).toHaveLength(20);
      expect(page.meta).toEqual({ page: index + 1, limit: 20, total: 100, totalPages: 5 });
      expect(page.counts.total).toBe(100);
      expect(page.counts.categories.map(({ name }) => name)).toEqual(DEFAULT_CATEGORY_NAMES);
      for (const category of categories) expect(page.counts.categories.find(({ id }) => id === category.id)?.total).toBe(seedRecipes.filter((recipe) => recipe.categories.includes(category.name)).length);
      for (const recipe of page.data) {
        const fixture = seedRecipes.find((sample) => ownedId(tag, sample.id) === recipe.id);
        expect(recipe.categories.map(({ name }) => name)).toEqual(fixture?.categories);
      }
    }
    const ids = pages.flatMap((page) => page.data.map(({ id }) => id));
    expect(new Set(ids).size).toBe(100);
    expect(ids).toEqual(ordered('createdAt', 'desc'));
    expect((await list({ page: 6 })).data).toEqual([]);
    expect((await list({ page: 1, limit: 3 })).data).toHaveLength(3);
  }, 30_000);

  it('filters before counting and paginating without duplicating multi-category recipes', async () => {
    for (const category of categories) {
      const expected = seedRecipes.filter((recipe) => recipe.categories.includes(category.name));
      const first = await list({ category: category.id });
      const records: RecipeSummary[] = [...first.data];
      for (let page = 2; page <= first.meta.totalPages; page++) records.push(...(await list({ category: category.id, page })).data);
      expect(first.meta.total).toBe(expected.length);
      expect(first.counts.total).toBe(100);
      expect(first.counts.categories.find(({ id }) => id === category.id)?.total).toBe(expected.length);
      expect(records.every((recipe) => recipe.categories.some(({ id, name }) => id === category.id && name === category.name))).toBe(true);
      expect(records.map(({ id }) => id)).toEqual(ordered('createdAt', 'desc', expected));
      expect(new Set(records.map(({ id }) => id)).size).toBe(expected.length);
      expect((await list({ category: category.id, page: first.meta.totalPages + 1 })).data).toEqual([]);
    }
  }, 60_000);

  it('searches title and description case-insensitively before filtering, sorting and paging', async () => {
    for (const category of [undefined, categories.find(({ name }) => name === 'Breakfast')]) {
      const expected = seedRecipes.filter((recipe) => (!category || recipe.categories.includes(category.name)) &&
        `${recipe.title} ${recipe.description ?? ''}`.toLowerCase().includes('oat'));
      expect(expected.length).toBeGreaterThan(1);
      const first = await list({ search: '  OaT  ', ...(category ? { category: category.id } : {}), sortBy: 'title', order: 'asc', limit: 2 });
      const pages = [first];
      for (let page = 2; page <= first.meta.totalPages; page++) pages.push(await list({ search: 'oat', ...(category ? { category: category.id } : {}), sortBy: 'title', order: 'asc', limit: 2, page }));
      expect(first.meta.total).toBe(expected.length);
      expect(first.counts.total).toBe(100);
      expect(pages.flatMap(({ data }) => data.map(({ id }) => id))).toEqual(ordered('title', 'asc', expected));
      expect((await list({ search: 'oat', ...(category ? { category: category.id } : {}), limit: 2, page: first.meta.totalPages + 1 })).data).toEqual([]);
    }
    const description = await list({ search: 'softened apple' });
    expect(description.data.map(({ id }) => id)).toEqual([ownedId(tag, 'apple-cinnamon-porridge')]);
    expect((await list({ search: 'no-matching-recipe-12345' })).meta).toMatchObject({ total: 0, totalPages: 0 });
    expect((await list({ search: '   ' })).meta.total).toBe(100);
  }, 60_000);

  it('lists only favorites of the session user before counting, searching, sorting and paging', async () => {
    const db = app.get(DatabaseService).db;
    const picked = seedRecipes.filter((_, index) => index % 4 === 0);
    const empty = await list({ favorites: true });
    expect(empty.data).toEqual([]);
    expect(empty.meta).toMatchObject({ total: 0, totalPages: 0 });
    expect(empty.counts).toMatchObject({ total: 100, favorites: 0 });
    try {
      await db.insert(favorites).values(picked.map((recipe) => ({ userId: user.id, recipeId: ownedId(tag, recipe.id) })));
      // Recipes are owner-only, so another user's row can only exist out of band; it must never widen this list.
      await db.insert(favorites).values({ userId: other.user.id, recipeId: ownedId(tag, seedRecipes[1].id) });
      const first = await list({ favorites: true, limit: 10 });
      const pages = [first];
      for (let page = 2; page <= first.meta.totalPages; page++) pages.push(await list({ favorites: true, limit: 10, page }));
      const records = pages.flatMap(({ data }) => data);
      expect(first.meta).toMatchObject({ total: picked.length, totalPages: Math.ceil(picked.length / 10) });
      expect(first.counts).toMatchObject({ total: 100, favorites: picked.length });
      expect(records.map(({ id }) => id)).toEqual(ordered('createdAt', 'desc', picked));
      expect(records.every((recipe) => recipe.isFavorite)).toBe(true);
      const narrowed = picked.filter((recipe) => recipe.categories.includes('Breakfast') && `${recipe.title} ${recipe.description ?? ''}`.toLowerCase().includes('oat'));
      expect(narrowed.length).toBeGreaterThan(0);
      expect(narrowed.length).toBeLessThan(picked.length);
      const combined = await list({ favorites: true, category: categoryId('Breakfast'), search: 'oat', sortBy: 'title', order: 'asc' });
      expect(combined.data.map(({ id }) => id)).toEqual(ordered('title', 'asc', narrowed));
      expect(combined.meta.total).toBe(narrowed.length);
      // Like the other counts, the favorites total ignores the active filters.
      expect(combined.counts.favorites).toBe(picked.length);
      expect((await list({ category: categoryId('Breakfast') })).counts.favorites).toBe(picked.length);
    } finally { await db.delete(favorites).where(eq(favorites.userId, user.id)); }
  }, 60_000);

  it('treats search wildcard characters and quotes as literal text', async () => {
    const db = app.get(DatabaseService).db;
    const id = `verify-search-${randomUUID()}`;
    const title = "Search 100%_\\ literal ' recipe";
    try {
      await db.insert(recipes).values({ id, userId: user.id, title, sortOrder: 100 });
      for (const search of ['%', '_', '\\', "100%_\\ literal '"]) {
        const result = await list({ search });
        expect(result.data.map((recipe) => recipe.id)).toEqual([id]);
        expect(result.meta.total).toBe(1);
      }
      expect((await list({ search: "' OR 1=1 --" })).data).toEqual([]);
    } finally { await db.delete(recipes).where(inArray(recipes.id, [id])); }
  }, 30_000);

  it('rejects repeated and oversized search parameters', async () => {
    for (const query of ['search=oat&search=rice', `search=${'a'.repeat(201)}`]) {
      const response = await fetch(`${baseUrl}/recipes?${query}`, { headers: { Cookie: cookie } });
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ errors: expect.arrayContaining([expect.objectContaining({ parameter: 'search' })]) });
    }
  });

  it('honors every sorting direction with stable sortOrder ties across pages', async () => {
    for (const sortBy of RECIPE_SORT_FIELDS) for (const order of ['asc', 'desc'] as const) {
      const pages = await Promise.all([1, 2, 3, 4, 5].map((page) => list({ page, sortBy, order })));
      expect(pages.flatMap((page) => page.data.map(({ id }) => id))).toEqual(ordered(sortBy, order));
    }
  }, 60_000);

  it('rejects malformed supported parameters with actionable HTTP 400 errors', async () => {
    for (const query of ['page=0', 'page=-1', 'page=1.5', 'page=no', 'page=', 'page=1&page=2', 'limit=0', 'limit=21', 'limit=', `category=${randomUUID()}`, 'category=', 'category=a&category=b', `category=${otherCategories[0].id}`, 'favorites=false', 'favorites=true&favorites=true', 'sortBy=no', 'sortBy=', 'order=no', 'order=', 'order=ASC']) {
      const response = await fetch(`${baseUrl}/recipes?${query}`, { headers: { Cookie: cookie } });
      expect(response.status, query).toBe(400);
      const payload: unknown = await response.json();
      expect(payload).toMatchObject({
        message: expect.stringContaining('Invalid recipe query'),
        errors: expect.arrayContaining([expect.objectContaining({ parameter: query.startsWith('category=') ? 'category' : expect.stringMatching(/\S+/), message: expect.any(String) })]),
      });
    }
  }, 30_000);

  it('uses ID to break equal primary sort and sortOrder ties across page boundaries', async () => {
    const db = app.get(DatabaseService).db;
    const token = randomUUID();
    const ids = [`verify-tie-a-${token}`, `verify-tie-b-${token}`];
    try {
      await db.insert(recipes).values(ids.toReversed().map((id) => ({ id, userId: user.id, title: 'AAAA API tie', sortOrder: 100,
        createdAt: new Date('2000-01-01T00:00:00Z'), updatedAt: new Date('2000-01-01T00:00:00Z'),
      })));
      for (const sortBy of RECIPE_SORT_FIELDS) {
        const first = await list({ page: 1, limit: 1, sortBy, order: 'asc' });
        const second = await list({ page: 2, limit: 1, sortBy, order: 'asc' });
        expect([first.data[0].id, second.data[0].id]).toEqual(ids);
      }
    } finally { await db.delete(recipes).where(inArray(recipes.id, ids)); }
  }, 30_000);

  it('cancels slow SQL, retains its cause and resets transaction-local deadlines', async () => {
    const db = app.get(DatabaseService).db;
    const signal = new AbortController().signal;
    let before: Record<string, unknown>[] = [];
    await db.transaction(async (tx) => {
      before = (await tx.execute(sql`show statement_timeout`)).rows;
      await expect(createReadDeadline(signal)(tx, async () => tx.execute(sql`select pg_sleep(4)`)))
        .rejects.toMatchObject({ name: 'ResilienceTimeoutError', code: 'TIMEOUT', cause: { cause: { code: '57014' } } });
      // A cancelled statement aborts the transaction; roll it back without masking that outcome.
      tx.rollback();
    }).catch((error: unknown) => {
      if (!(error instanceof TransactionRollbackError)) throw error;
    });
    expect((await db.execute(sql`show statement_timeout`)).rows).toEqual(before);
    expect((await list()).data).toHaveLength(20);
  }, 15_000);

  it('does not start SQL after its caller has already timed out', async () => {
    const controller = new AbortController();
    const reason = new ResilienceTimeoutError(4_000, 'recipeRead');
    controller.abort(reason);
    await app.get(DatabaseService).db.transaction(async (tx) => {
      await expect(createReadDeadline(controller.signal)(tx, async () => tx.execute(sql`select pg_sleep(4)`))).rejects.toBe(reason);
      expect(await tx.execute(sql`select 1 as ready`)).toMatchObject({ rows: [{ ready: 1 }] });
    }, { accessMode: 'read only' });
  }, 15_000);

  it('stops subsequent statements when the cumulative read budget expires', async () => {
    const db = app.get(DatabaseService).db;
    const read = createReadDeadline(new AbortController().signal);
    await db.transaction(async (tx) => {
      await expect(async () => {
        for (let query = 0; query < 6; query++) await read(tx, async () => tx.execute(sql`select pg_sleep(0.6)`));
      }).rejects.toMatchObject({ code: 'TIMEOUT', timeoutMs: 3_000 });
      await expect(read(tx, async () => tx.execute(sql`select 1 / 0`))).rejects.toMatchObject({ code: 'TIMEOUT' });
      expect(await tx.execute(sql`select 1 as ready`)).toMatchObject({ rows: [{ ready: 1 }] });
    }, { accessMode: 'read only' });
  }, 15_000);
});
