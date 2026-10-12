import { randomUUID } from 'node:crypto';
import { Logger } from '@nestjs/common';
import { expect, vi } from 'vitest';
import { asc, eq, inArray, like, sql } from 'drizzle-orm';
import { apiErrorEnvelopeSchema, categoryListSchema, createRecipeResultSchema, recipeDetailSchema, recipeListResponseSchema } from '@recipe-app/contracts/schemas';
import type { DefaultCategoryName } from '../src/categories/default-categories.js';
import type { ApiErrorEnvelope, CreateRecipeMetadata } from '@recipe-app/contracts/types';
import { authRateLimits, favorites, ingredients, recipeImages, recipes, recipeWriteAttempts, users } from '../src/database/schema.js';
import { StorageService } from '../src/storage/storage.service.js';
import { apiClient, removeTestData, signupUser, startApi, TEST_ORIGIN, testAddress, testUsername } from './auth-harness.js';

import { describePhoto } from './recipe-photos.js';

export { jpeg, storedPhoto } from './recipe-photos.js';
/**
 * Extra allowance for wall-clock bounds in CI, where the runner is an ocean away from the database and object storage.
 * The bounds still prove a response did not wait for cleanup that the test holds open indefinitely.
 */
export const CI_LATENCY_MS = process.env.CI ? 15_000 : 0;
export type Photo = { field: string; bytes: Buffer; mime?: string };
type CallOptions = { cookie?: string | null; origin?: string | null };
type SendOptions = CallOptions & { method?: 'POST' | 'PATCH'; key?: string | null };
export type RecipeSuite = Awaited<ReturnType<typeof openRecipeSuite>>;

export const minimalRecipe = (name: string): CreateRecipeMetadata => ({
  title: 'Temporary recipe', description: null, categoryIds: [], servings: null, prepTimeMinutes: null,
  cookTimeMinutes: null, videoUrl: null, notes: null,
  ingredients: [{ name, quantity: null, unit: null }], instructions: [{ description: 'Mix.', hasImage: false }],
});

/** Two temporary users on the dev API plus helpers that never surface cookies or signed URLs, and object keys only in `recordCleanup`. */
export async function openRecipeSuite() {
  const { app, db, baseUrl } = await startApi();
  const storage = app.get(StorageService);
  const addresses = [testAddress()]; const usernames = [testUsername(), testUsername()];
  /** Prefix of every ingredient name a scenario invents, so canonical rows can be removed afterwards. */
  const name = `verification-${randomUUID()}`;
  const objectKeys = new Set<string>();
  const actualUpload = storage.upload.bind(storage); const actualDelete = storage.deleteObject.bind(storage);
  // One permanent tracking spy: scenarios stack one-shot failures on it instead of restoring it.
  const upload = vi.spyOn(storage, 'upload').mockImplementation(async (key, bytes, mime) => { objectKeys.add(key); return actualUpload(key, bytes, mime); });
  let owner: Awaited<ReturnType<typeof signupUser>>; let other: Awaited<ReturnType<typeof signupUser>>;
  const categories: Record<'owner' | 'other', ReturnType<typeof categoryListSchema.parse>> = { owner: [], other: [] };
  try {
    const client = apiClient(baseUrl, addresses[0]);
    owner = await signupUser(client, usernames[0]); other = await signupUser(client, usernames[1]);
    for (const [who, user] of [['owner', owner], ['other', other]] as const) {
      const response = await fetch(`${baseUrl}/categories`, { headers: { Cookie: user.cookie } });
      expect(response.status).toBe(200);
      categories[who] = categoryListSchema.parse(await response.json());
    }
  } catch (cause) { await removeTestData(db, { usernames, addresses }); await app.close(); throw cause; }
  const userIds = [owner.user.id, other.user.id];
  const limitKeys = userIds.flatMap((id) => [`wrapper:recipe-write:user:${id}`, `wrapper:recipe-favorite:user:${id}`, `wrapper:category-write:user:${id}`]);
  const categoryIds = (names: DefaultCategoryName[], who: 'owner' | 'other' = 'owner'): string[] => names.map((name) => {
    const category = categories[who].find((category) => category.name === name);
    if (!category) throw new Error(`Missing default category: ${name}`);
    return category.id;
  });

  const headers = ({ cookie = owner.cookie, origin = TEST_ORIGIN }: CallOptions, key?: string | null) => {
    const values = new Headers();
    if (key) values.set('Idempotency-Key', key);
    if (cookie !== null) values.set('Cookie', cookie);
    if (origin !== null) values.set('Origin', origin);
    return values;
  };
  /** Multipart recipe write: POST /recipes by default, PATCH /recipes/:id for updates. */
  function send(path: string, metadata: unknown, photos: Photo[] = [], { method = 'POST', key = randomUUID(), ...options }: SendOptions = {}) {
    const body = new FormData(); body.set('recipe', typeof metadata === 'string' ? metadata : JSON.stringify(metadata));
    for (const photo of photos) body.append(photo.field, new Blob([new Uint8Array(photo.bytes)], { type: photo.mime ?? 'image/jpeg' }), 'client-name.jpg');
    return fetch(`${baseUrl}${path}`, { method, body, headers: headers(options, key) });
  }
  const call = (method: 'GET' | 'PUT' | 'DELETE', path: string, options: CallOptions = {}) => fetch(`${baseUrl}${path}`, { method, headers: headers(options) });

  async function expectError(response: Response, status: number, code: string, field?: string) {
    expect(response.status).toBe(status); expect(response.headers.get('cache-control')).toBe('private, no-store');
    const raw = await response.json() as ApiErrorEnvelope;
    expect(apiErrorEnvelopeSchema.parse(raw).code).toBe(code);
    if (field) expect(Boolean(Object.getOwnPropertyDescriptor(raw.fieldErrors ?? {}, field)?.value?.length), `Missing field error: ${field}`).toBe(true);
  }
  async function expectEmpty(response: Response) {
    expect(response.status).toBe(204); expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(await response.text()).toBe('');
  }
  async function savedId(response: Response, status: number) {
    expect(response.status).toBe(status); expect(response.headers.get('cache-control')).toBe('private, no-store');
    return createRecipeResultSchema.parse(await response.json()).id;
  }
  async function detail(id: string, cookie = owner.cookie) {
    const response = await call('GET', `/recipes/${id}`, { cookie });
    expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toBe('private, no-store');
    return recipeDetailSchema.parse(await response.json());
  }
  async function list(query = '', cookie = owner.cookie) {
    const response = await call('GET', `/recipes${query}`, { cookie });
    expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toBe('private, no-store');
    return recipeListResponseSchema.parse(await response.json());
  }
  /** True while the object still answers 200. */
  async function stored(key: string): Promise<boolean> {
    try { return (await fetch(await storage.signedDownloadUrl(key))).status === 200; }
    catch { throw new Error('Disposable storage probe failed.'); }
  }
  /** The format and dimensions of the photo a signed URL serves, to compare with `storedPhoto(marker)`; null when there is none. */
  async function photoAt(url: string | null): Promise<Awaited<ReturnType<typeof describePhoto>> | null> {
    if (url === null) return null;
    let bytes: Uint8Array;
    try {
      const response = await fetch(url);
      if (response.status !== 200) return null;
      bytes = new Uint8Array(await response.arrayBuffer());
    } catch { throw new Error('Disposable image download failed.'); }
    return describePhoto(bytes);
  }
  const imageRows = (recipeId: string) => db.select().from(recipeImages).where(eq(recipeImages.recipeId, recipeId)).orderBy(asc(recipeImages.sortOrder));
  /** Each scenario owns fresh write and favorite windows; rate-limit scenarios set their counters explicitly. */
  const resetLimits = async () => { await db.delete(authRateLimits).where(inArray(authRateLimits.key, limitKeys)); };
  async function fillLimit(scope: 'recipe-write' | 'recipe-favorite', userId: string, limit: number) {
    const key = `wrapper:${scope}:user:${userId}`;
    await db.insert(authRateLimits).values({ id: randomUUID(), key, count: limit, lastRequest: Date.now() })
      .onConflictDoUpdate({ target: authRateLimits.key, set: { count: limit, lastRequest: Date.now() } });
  }
  /** Objects uploaded since `before` that no image row points at and that still exist. */
  async function orphans(before: ReadonlySet<string>): Promise<number> {
    const created = [...objectKeys].filter((key) => !before.has(key));
    if (!created.length) return 0;
    const referenced = new Set((await db.select({ key: recipeImages.objectKey }).from(recipeImages).where(inArray(recipeImages.objectKey, created))).map(({ key }) => key));
    let count = 0;
    for (const key of created) if (!referenced.has(key) && await stored(key)) count++;
    return count;
  }

  /** Until `stop`, records each object deletion and each line `logRecipeFailure` writes, as milliseconds since the call. The test
   * API runs with logging off, so nothing else keeps them. Object keys, and for an error its names, codes and HTTP status; never
   * its message.
   */
  function recordCleanup() {
    const started = Date.now(); const events: string[] = []; const running = new Set<string>();
    const errorChain = (start: unknown) => {
      const parts: string[] = []; const seen = new Set<Error>();
      for (let error = start; error instanceof Error && !seen.has(error); error = error.cause) {
        seen.add(error);
        const code = 'code' in error && typeof error.code === 'string' && /^[A-Z0-9_]{1,40}$/.test(error.code) ? ` ${error.code}` : '';
        const status = '$metadata' in error ? ` HTTP ${(error.$metadata as { httpStatusCode?: number } | undefined)?.httpStatusCode ?? 'none'}` : '';
        parts.push(`${/^[A-Za-z][A-Za-z0-9]{0,63}$/.test(error.name) ? error.name : 'Error'}${code}${status}`);
      }
      return parts.join(' <- ') || 'unknown';
    };
    const deletion = vi.spyOn(storage, 'deleteObject').mockImplementation(async (key) => {
      const at = Date.now(); running.add(key);
      try { await actualDelete(key); events.push(`+${at - started} ms delete ${key}: done in ${Date.now() - at} ms`); }
      catch (cause) { events.push(`+${at - started} ms delete ${key}: failed in ${Date.now() - at} ms, ${errorChain(cause)}`); throw cause; }
      finally { running.delete(key); }
    });
    // Only logRecipeFailure's lines are kept: static labels, a local correlation id, class names and SQLSTATEs.
    const logged = vi.spyOn(Logger.prototype, 'error').mockImplementation((message: unknown) => {
      if (typeof message === 'string' && /^Recipe \w+ failed \(/.test(message)) events.push(`+${Date.now() - started} ms logged: ${message}`);
    });
    const stop = () => {
      for (const key of running) events.push(`+${Date.now() - started} ms delete ${key}: still running`);
      deletion.mockRestore(); logged.mockRestore();
    };
    return { events, stop };
  }

  /** Every stage runs even when an earlier one threw, so one failure cannot strand the rest; the first failure is rethrown at the end. */
  async function cleanup() {
    const failures: unknown[] = [];
    const stage = async (run: () => Promise<unknown>) => { try { await run(); } catch (cause) { failures.push(cause); } };
    let deleted = 0;
    for (const key of objectKeys) await stage(async () => {
      await storage.deleteObject(key); deleted++;
      if (await stored(key)) throw new Error('Disposable storage cleanup verification failed.');
    });
    await stage(() => db.delete(authRateLimits).where(inArray(authRateLimits.key, limitKeys)));
    await stage(() => removeTestData(db, { usernames, addresses }));
    await stage(() => db.delete(ingredients).where(like(sql`lower(${ingredients.name})`, `${name}%`)));
    await stage(async () => {
      expect(await db.$count(users, inArray(users.username, usernames))).toBe(0);
      expect(await db.$count(recipes, inArray(recipes.userId, userIds))).toBe(0);
      expect(await db.$count(recipeWriteAttempts, inArray(recipeWriteAttempts.userId, userIds))).toBe(0);
      expect(await db.$count(favorites, inArray(favorites.userId, userIds))).toBe(0);
      expect(await db.$count(ingredients, like(sql`lower(${ingredients.name})`, `${name}%`))).toBe(0);
    });
    if (failures.length) throw failures[0];
    console.log(`Recipe suite cleanup verified: users ${userIds.length}, objects ${deleted}.`);
  }
  async function close() {
    try { await cleanup(); } finally { vi.restoreAllMocks(); await app.close(); }
  }

  return { app, db, baseUrl, storage, name, owner, other, categories, categoryIds, upload, send, call, expectError, expectEmpty, savedId, detail, list, stored, photoAt,
    imageRows, resetLimits, fillLimit, orphans, recordCleanup, uploadedKeys: () => new Set(objectKeys), cleanup, close };
}
