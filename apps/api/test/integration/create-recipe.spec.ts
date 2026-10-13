import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import sharp from 'sharp';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { apiErrorEnvelopeSchema, categoryListSchema, createRecipeResultSchema, recipeDetailSchema } from '@recipe-app/contracts/schemas';
import type { ApiErrorEnvelope, CreateRecipeMetadata } from '@recipe-app/contracts/types';
import type { DefaultCategoryName } from '../../src/categories/default-categories.js';
import type { DrizzleDb } from '../../src/database/database.service.js';
import { authRateLimits, ingredients, recipeImages, recipeIngredients, recipes, recipeWriteAttempts, users } from '../../src/database/schema.js';
import { StorageService } from '../../src/storage/storage.service.js';
import { RecipeWriteHook } from '../../src/recipes/recipe-write-hook.js';
import { reconcileRecipeWrites } from '../../src/recipes/recipe-reconcile.js';
import { RECIPE_WRITE_LIMIT, RecipeUploadSlots } from '../../src/recipes/recipe-upload.js';
import { RecipeWriteGuard } from '../../src/recipes/recipe-upload.js';
import type { RecipeUploadRequest } from '../../src/recipes/recipe-upload.js';
import { apiClient, removeTestData, signupUser, startApi, TEST_ORIGIN, testAddress, testEmail } from '../auth-harness.js';
import { rawRecipeRequest } from '../recipe-http.js';
import { describePhoto, jpeg as photo, storedPhoto } from '../recipe-photos.js';
import { recipeRequestHash } from '../../src/recipes/recipe-metadata.js';
import { RecipeCreateService } from '../../src/recipes/recipe-create.service.js';

const jpeg = photo(1);
type Photo = { field: string; bytes: Buffer; mime?: string };
const minimal = (name: string): CreateRecipeMetadata => ({
  title: 'Temporary recipe', description: null, categoryIds: [], servings: null, prepTimeMinutes: null,
  cookTimeMinutes: null, videoUrl: null, notes: null,
  ingredients: [{ name, quantity: null, unit: null }], instructions: [{ description: 'Mix.', hasImage: false }],
});

describe('Create recipe and private detail HTTP', () => {
  let app: NestExpressApplication;
  let db: DrizzleDb;
  let baseUrl: string;
  let storage: StorageService;
  let owner: Awaited<ReturnType<typeof signupUser>>;
  let other: Awaited<ReturnType<typeof signupUser>>;
  const categories: Record<'owner' | 'other', ReturnType<typeof categoryListSchema.parse>> = { owner: [], other: [] };
  const categoryIds = (names: DefaultCategoryName[], who: 'owner' | 'other' = 'owner'): string[] => names.map((name) => {
    const category = categories[who].find((category) => category.name === name);
    if (!category) throw new Error(`Missing default category: ${name}`);
    return category.id;
  });
  const addresses = [testAddress()];
  const emails = [testEmail(), testEmail()];
  const objectKeys = new Set<string>();
  const canonicalNames = new Set<string>();
  const name = `verification-${randomUUID()}`;
  let uploaded = 0;
  let deleted = 0;
  let savedId: string;

  async function send(metadata: unknown, photos: Photo[] = [], options: { key?: string | null; cookie?: string | null; origin?: string | null } = {}) {
    const { key = randomUUID(), cookie = owner.cookie, origin = TEST_ORIGIN } = options;
    const headers = new Headers();
    if (key !== null) headers.set('Idempotency-Key', key);
    if (cookie !== null) headers.set('Cookie', cookie);
    if (origin !== null) headers.set('Origin', origin);
    const body = new FormData(); body.set('recipe', typeof metadata === 'string' ? metadata : JSON.stringify(metadata));
    for (const photo of photos) body.append(photo.field, new Blob([new Uint8Array(photo.bytes)], { type: photo.mime ?? 'image/jpeg' }), 'client-name.jpg');
    return fetch(`${baseUrl}/recipes`, { method: 'POST', body, headers });
  }
  const error = async (response: Response, status: number, code: string, field?: string) => {
    expect(response.status).toBe(status);
    const raw = await response.json() as ApiErrorEnvelope;
    const body = apiErrorEnvelopeSchema.parse(raw); expect(body.code).toBe(code);
    if (field) expect(Boolean(Object.getOwnPropertyDescriptor(raw.fieldErrors ?? {}, field)?.value?.length), `Missing field error: ${field}`).toBe(true);
  };
  const idOf = async (response: Response, status = 201) => {
    expect(response.status).toBe(status); expect(response.headers.get('cache-control')).toBe('private, no-store');
    return createRecipeResultSchema.parse(await response.json()).id;
  };
  const detail = async (id: string) => {
    const response = await fetch(`${baseUrl}/recipes/${id}`, { headers: { Cookie: owner.cookie } });
    expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toBe('private, no-store');
    return recipeDetailSchema.parse(await response.json());
  };
  /** The signed URL serves a WebP with the dimensions the API stores for the upload; by default those of the shared `jpeg`. */
  async function readable(url: string | null, expected: { format: string; width: number; height: number } = storedPhoto(1)) {
    expect(Boolean(url)).toBe(true);
    let served: { type: string | undefined; bytes: Uint8Array };
    try {
      const response = await fetch(url!); expect(response.status).toBe(200);
      served = { type: response.headers.get('content-type')?.split(';')[0], bytes: new Uint8Array(await response.arrayBuffer()) };
    } catch { throw new Error('Disposable image download failed.'); }
    expect(served.type).toBe('image/webp');
    expect(await describePhoto(served.bytes)).toEqual(expected);
  }

  beforeAll(async () => {
    ({ app, db, baseUrl } = await startApi()); storage = app.get(StorageService);
    const upload = storage.upload.bind(storage);
    vi.spyOn(storage, 'upload').mockImplementation(async (key, bytes, mime) => {
      objectKeys.add(key); uploaded++; return upload(key, bytes, mime);
    });
    const client = apiClient(baseUrl, addresses[0]);
    owner = await signupUser(client, emails[0]); other = await signupUser(client, emails[1]);
    for (const [who, user] of [['owner', owner], ['other', other]] as const) {
      const response = await fetch(`${baseUrl}/categories`, { headers: { Cookie: user.cookie } });
      expect(response.status).toBe(200);
      categories[who] = categoryListSchema.parse(await response.json());
    }
    canonicalNames.add(name.toLowerCase());
  }, 60_000);
  beforeEach(async () => {
    // Each scenario owns a fresh write-rate window. The rate-limit scenario inserts and verifies its real counter explicitly.
    const keys = [owner.user.id, other.user.id].map((id) => `wrapper:recipe-write:user:${id}`);
    await db.delete(authRateLimits).where(inArray(authRateLimits.key, keys));
  });
  afterAll(async () => {
    if (!app) return;
    try {
      for (const key of objectKeys) {
        await storage.deleteObject(key); deleted++;
        try { expect((await fetch(await storage.signedDownloadUrl(key))).status).toBe(404); }
        catch { throw new Error('Disposable storage cleanup verification failed.'); }
      }
      const ids = [owner?.user.id, other?.user.id].filter((id): id is string => Boolean(id));
      if (ids.length) await db.delete(authRateLimits).where(inArray(authRateLimits.key, ids.map((id) => `wrapper:recipe-write:user:${id}`)));
      await removeTestData(db, { emails, addresses });
      for (const canonical of canonicalNames) await db.delete(ingredients).where(sql`lower(btrim(${ingredients.name})) = ${canonical}`);
      expect(await db.$count(users, inArray(users.email, emails))).toBe(0);
      if (ids.length) {
        expect(await db.$count(recipes, inArray(recipes.userId, ids))).toBe(0);
        expect(await db.$count(recipeWriteAttempts, inArray(recipeWriteAttempts.userId, ids))).toBe(0);
      }
      expect(deleted).toBe(objectKeys.size);
      console.log(`Create cleanup verified: users ${ids.length}, objects ${deleted}, upload calls ${uploaded}.`);
    } finally { vi.restoreAllMocks(); await app.close(); }
  }, 60_000);

  it('creates minimal metadata with optional fields null and owner-scoped detail', async () => {
    savedId = await idOf(await send(minimal(name)));
    const value = await detail(savedId);
    expect(value.userId).toBe(owner.user.id); expect(value.categories).toEqual([]);
    for (const field of ['description', 'notes', 'videoUrl', 'imageUrl', 'servings', 'prepTimeMinutes', 'cookTimeMinutes'] as const) expect(value[field] === null).toBe(true);
    expect(value.ingredients[0].quantity).toBeNull(); expect(value.instructions[0].imageUrl === null).toBe(true);
    for (const id of [savedId, randomUUID()]) await error(await fetch(`${baseUrl}/recipes/${id}`, { headers: { Cookie: other.cookie } }), 404, 'NOT_FOUND');
    for (const id of ['bad\u0000id', 'x'.repeat(201)]) await error(await fetch(`${baseUrl}/recipes/${encodeURIComponent(id)}`, { headers: { Cookie: owner.cookie } }), 404, 'NOT_FOUND');
    await error(await fetch(`${baseUrl}/recipes/${savedId}`), 401, 'UNAUTHENTICATED');
  }, 30_000);

  it('round-trips rich metadata, category/snapshot/step order, and real stored images', async () => {
    const metadata: CreateRecipeMetadata = { ...minimal(name), title: 'Rich recipe', categoryIds: categoryIds(['Dinner', 'Breakfast', 'Lunch']),
      description: 'Description', servings: 4, prepTimeMinutes: 0, cookTimeMinutes: 25, notes: 'Notes', videoUrl: 'https://www.youtube.com/watch?v=example',
      ingredients: [{ name: name.toUpperCase(), quantity: 1.125, unit: 'cup' }, { name, quantity: null, unit: null }],
      instructions: [{ description: 'First', hasImage: true }, { description: 'Second', hasImage: false }, { description: 'Third', hasImage: true }] };
    const large = await sharp({ create: { width: 4000, height: 3000, channels: 3, background: { r: 200, g: 120, b: 40 } } }).jpeg().toBuffer();
    const id = await idOf(await send(metadata, [{ field: 'cover', bytes: large }, { field: 'step-0', bytes: jpeg }, { field: 'step-2', bytes: photo(2) }]));
    const value = await detail(id);
    expect(value.categories.map(({ id }) => id)).toEqual(metadata.categoryIds); expect(value.categories.map(({ name }) => name)).toEqual(['Dinner', 'Breakfast', 'Lunch']); expect(value.notes).toBe('Notes'); expect(value.videoUrl).toBe(metadata.videoUrl);
    expect(value.ingredients.map(({ name, quantity, sortOrder }) => ({ name, quantity, sortOrder }))).toEqual([
      { name: name.toUpperCase(), quantity: 1.125, sortOrder: 0 }, { name, quantity: null, sortOrder: 1 }]);
    expect(value.instructions.map(({ description, stepNumber }) => ({ description, stepNumber }))).toEqual([
      { description: 'First', stepNumber: 1 }, { description: 'Second', stepNumber: 2 }, { description: 'Third', stepNumber: 3 }]);
    expect(value.instructions[1].imageUrl === null).toBe(true);
    const stored = await db.query.recipes.findFirst({ where: eq(recipes.id, id), with: {
      categories: { orderBy: (row, { asc }) => asc(row.sortOrder), with: { category: true } },
      images: { orderBy: (row, { asc }) => asc(row.sortOrder) }, instructions: { orderBy: (row, { asc }) => asc(row.stepNumber) },
    } });
    expect(stored?.userId).toBe(owner.user.id); expect(stored?.categories.map(({ category }) => ({ id: category.id, name: category.name }))).toEqual(value.categories);
    expect(stored?.images.map(({ sortOrder }) => sortOrder)).toEqual([0, 1, 2]);
    expect(stored?.instructions.map(({ imageId }) => Boolean(imageId))).toEqual([true, false, true]);
    await readable(value.imageUrl, { format: 'webp', width: 2048, height: 1536 });
    await readable(value.instructions[0].imageUrl); await readable(value.instructions[2].imageUrl, storedPhoto(2));
  }, 60_000);

  it('rejects invalid metadata and injected fields before claiming or uploading', async () => {
    const before = await db.$count(recipes, eq(recipes.userId, owner.user.id)); const calls = uploaded;
    const cases: [unknown, string][] = [
      [{ ...minimal(name), title: 'Title\u0000' }, 'title'], [{ ...minimal(name), description: 'Text\u0000' }, 'description'],
      [{ ...minimal(name), notes: 'Note\u0000' }, 'notes'], [{ ...minimal(name), videoUrl: 'https://example.invalid/\u0000' }, 'videoUrl'],
      [{ ...minimal(name), ingredients: [{ name: 'Name\u0000', quantity: null, unit: null }] }, 'ingredients.0.name'],
      [{ ...minimal(name), instructions: [{ description: 'Step\u0000', hasImage: false }] }, 'instructions.0.description'],
      [{ ...minimal(name), title: ' ' }, 'title'], [{ ...minimal(name), ingredients: [{ name: '', quantity: null, unit: null }] }, 'ingredients.0.name'],
      [{ ...minimal(name), ingredients: [{ name, quantity: -1, unit: 'g' }] }, 'ingredients.0.quantity'],
      [{ ...minimal(name), ingredients: [{ name, quantity: 0.1234, unit: 'g' }] }, 'ingredients.0.quantity'],
      [{ ...minimal(name), ingredients: [{ name, quantity: '1/2', unit: 'g' }] }, 'ingredients.0.quantity'],
      [{ ...minimal(name), ingredients: [{ name, quantity: 1, unit: null }] }, 'ingredients.0.quantity'],
      [{ ...minimal(name), servings: 0 }, 'servings'], [{ ...minimal(name), prepTimeMinutes: 1.5 }, 'prepTimeMinutes'],
      [{ ...minimal(name), categoryIds: categoryIds(['Dinner', 'Lunch', 'Breakfast', 'Snacks']) }, 'categoryIds'],
      [{ ...minimal(name), videoUrl: 'http://example.invalid' }, 'videoUrl'], [{ ...minimal(name), instructions: [{ description: '', hasImage: false }] }, 'instructions.0.description'],
      ['not JSON', 'recipe'], ['x'.repeat(1024 * 1024 + 1), 'recipe'],
      ...['userId', 'id', 'imageUrl', 'objectKey', '__proto__'].map((key): [unknown, string] => [JSON.parse(JSON.stringify(minimal(name)).slice(0, -1) + `,"${key}":"injected"}`), key]),
    ];
    for (const [metadata, field] of cases) {
      const key = randomUUID(); let response: Response;
      try { response = await send(metadata, [{ field: 'cover', bytes: jpeg }], { key }); }
      catch (cause) {
        const nested = cause instanceof Error ? cause.cause : undefined;
        const code = nested instanceof Error && 'code' in nested && typeof nested.code === 'string' && /^[A-Z_]{1,30}$/.test(nested.code) ? nested.code : 'UNKNOWN';
        throw new Error(`Disposable validation transport failed for ${field} (${code}).`);
      }
      await error(response, 400, 'VALIDATION_FAILED', field);
      expect(await db.$count(recipeWriteAttempts, and(eq(recipeWriteAttempts.userId, owner.user.id), eq(recipeWriteAttempts.idempotencyKey, key)))).toBe(0);
    }
    expect(await db.$count(recipes, eq(recipes.userId, owner.user.id))).toBe(before); expect(uploaded).toBe(calls);
  }, 60_000);

  it('bounds declared size before receiving a body and bounds chunked aggregate bytes before upload', async () => {
    const key = randomUUID(); const headers = { Cookie: owner.cookie, Origin: TEST_ORIGIN, 'Idempotency-Key': key,
      'Content-Type': 'multipart/form-data; boundary=verification-boundary' };
    const early = await rawRecipeRequest(`${baseUrl}/recipes`, { ...headers, 'Content-Length': String(128 * 1024 * 1024 + 1) });
    expect(early.status).toBe(413); expect(apiErrorEnvelopeSchema.parse(JSON.parse(early.body)).code).toBe('PAYLOAD_TOO_LARGE');
    const metadata = { ...minimal(name), instructions: Array.from({ length: 26 }, () => ({ description: 'Step', hasImage: true })) };
    const bytes = Buffer.alloc(5 * 1024 * 1024); jpeg.copy(bytes);
    const fields = ['cover', ...metadata.instructions.map((_, i) => `step-${i}`)];
    const calls = uploaded;
    const chunks = (function* () {
      yield Buffer.from(`--verification-boundary\r\nContent-Disposition: form-data; name="recipe"\r\n\r\n${JSON.stringify(metadata)}\r\n`);
      for (const field of fields) {
        yield Buffer.from(`--verification-boundary\r\nContent-Disposition: form-data; name="${field}"; filename="test.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`);
        yield bytes; yield Buffer.from('\r\n');
      }
      yield Buffer.from('--verification-boundary--\r\n');
    })();
    const streamed = await rawRecipeRequest(`${baseUrl}/recipes`, { ...headers, 'Transfer-Encoding': 'chunked' }, chunks);
    expect(streamed.status).toBe(413); expect(apiErrorEnvelopeSchema.parse(JSON.parse(streamed.body)).code).toBe('PAYLOAD_TOO_LARGE');
    expect(uploaded).toBe(calls); expect(await db.$count(recipeWriteAttempts, eq(recipeWriteAttempts.idempotencyKey, key))).toBe(0);
  }, 60_000);

  it('rejects excessive concurrent uploads before parsing and enforces real per-user write counters', async () => {
    const slots = app.get(RecipeUploadSlots); const releases = Array.from({ length: 4 }, (_, i) => slots.acquire(`disposable-slot-${i}`));
    try { await error(await send('malformed'), 503, 'SERVICE_UNAVAILABLE'); } finally { releases.forEach((release) => release()); }
    const key = `wrapper:recipe-write:user:${other.user.id}`;
    await db.insert(authRateLimits).values({ id: randomUUID(), key, count: RECIPE_WRITE_LIMIT, lastRequest: Date.now() })
      .onConflictDoUpdate({ target: authRateLimits.key, set: { count: RECIPE_WRITE_LIMIT, lastRequest: Date.now() } });
    try {
      const response = await send('malformed', [], { cookie: other.cookie });
      await error(response, 429, 'RATE_LIMITED'); expect(Number(response.headers.get('retry-after')) > 0).toBe(true);
    } finally { await db.delete(authRateLimits).where(eq(authRateLimits.key, key)); }
  }, 30_000);

  it('rejects missing, duplicate and unexpected metadata parts without claiming', async () => {
    for (const kind of ['missing', 'duplicate', 'unexpected']) {
      const key = randomUUID(); const body = new FormData();
      if (kind !== 'missing') body.append('recipe', JSON.stringify(minimal(name)));
      if (kind === 'duplicate') body.append('recipe', JSON.stringify(minimal(name)));
      if (kind === 'unexpected') body.append('constructor', 'unexpected');
      body.append('cover', new Blob([new Uint8Array(jpeg)], { type: 'image/jpeg' }), 'test.jpg');
      const response = await fetch(`${baseUrl}/recipes`, { method: 'POST', body, headers: { Cookie: owner.cookie, Origin: TEST_ORIGIN, 'Idempotency-Key': key } });
      await error(response, 400, 'VALIDATION_FAILED'); expect(await db.$count(recipeWriteAttempts, eq(recipeWriteAttempts.idempotencyKey, key))).toBe(0);
    }
  }, 30_000);

  it('validates session, origin and key before parsing malformed multipart files', async () => {
    for (const [options, status, code, field] of [
      [{ cookie: null }, 401, 'UNAUTHENTICATED', undefined], [{ origin: 'https://hostile.example.invalid' }, 403, 'ORIGIN_REJECTED', undefined],
      [{ origin: null }, 403, 'ORIGIN_REJECTED', undefined], [{ key: null }, 400, 'VALIDATION_FAILED', 'idempotencyKey'],
      [{ key: 'not-a-uuid' }, 400, 'VALIDATION_FAILED', 'idempotencyKey'],
    ] as const) {
      const response = await fetch(`${baseUrl}/recipes`, { method: 'POST', body: 'not multipart bytes', headers: {
        'Content-Type': 'multipart/form-data; boundary=broken', ...(options.cookie === null ? {} : { Cookie: owner.cookie }),
        ...(options.origin === null ? {} : { Origin: options.origin ?? TEST_ORIGIN }),
        ...(options.key === null ? {} : { 'Idempotency-Key': options.key ?? randomUUID() }),
      } });
      await error(response, status, code, field);
    }
  }, 30_000);

  it('rejects every non-multipart body as 415 before the global auth JSON parser', async () => {
    for (const body of ['{broken JSON', 'x'.repeat(9 * 1024)]) {
      const response = await fetch(`${baseUrl}/recipes`, { method: 'POST', body, headers: {
        Cookie: owner.cookie, Origin: TEST_ORIGIN, 'Idempotency-Key': randomUUID(), 'Content-Type': 'application/json',
      } });
      await error(response, 415, 'UNSUPPORTED_MEDIA_TYPE');
    }
  }, 30_000);

  it('rejects bad file type, size, bytes and fields without writes', async () => {
    const before = await db.$count(recipes, eq(recipes.userId, owner.user.id)); const calls = uploaded;
    const animation = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0, 97, 99, 84, 76, 0, 0, 0, 0]);
    const cases: [Photo[], number, string, string][] = [
      [[{ field: 'cover', bytes: Buffer.alloc(5 * 1024 * 1024 + 1) }], 413, 'PAYLOAD_TOO_LARGE', 'cover'],
      [[{ field: 'cover', bytes: jpeg, mime: 'image/gif' }], 415, 'UNSUPPORTED_MEDIA_TYPE', 'cover'],
      [[{ field: 'cover', bytes: jpeg, mime: 'image/png' }], 400, 'VALIDATION_FAILED', 'cover'],
      [[{ field: 'cover', bytes: animation, mime: 'image/png' }], 400, 'VALIDATION_FAILED', 'cover'],
      [[{ field: 'cover', bytes: Buffer.alloc(0) }], 400, 'VALIDATION_FAILED', 'cover'],
      [[{ field: 'step-0', bytes: jpeg }], 400, 'VALIDATION_FAILED', 'step-0'],
      [[{ field: 'unknown', bytes: jpeg }], 400, 'VALIDATION_FAILED', 'unknown'],
      [[{ field: 'cover', bytes: jpeg }, { field: 'cover', bytes: jpeg }], 400, 'VALIDATION_FAILED', 'cover'],
    ];
    for (const [photos, status, code, field] of cases) {
      const key = randomUUID(); await error(await send(minimal(name), photos, { key }), status, code, field);
      expect(await db.$count(recipeWriteAttempts, eq(recipeWriteAttempts.idempotencyKey, key))).toBe(0);
    }
    await error(await send({ ...minimal(name), instructions: [{ description: 'Mix', hasImage: true }] }), 400, 'VALIDATION_FAILED', 'step-0');
    await error(await fetch(`${baseUrl}/recipes`, { method: 'POST', body: '{}', headers: { Cookie: owner.cookie, Origin: TEST_ORIGIN, 'Idempotency-Key': randomUUID(), 'Content-Type': 'application/json' } }), 415, 'UNSUPPORTED_MEDIA_TYPE');
    expect(await db.$count(recipes, eq(recipes.userId, owner.user.id))).toBe(before); expect(uploaded).toBe(calls);
  }, 60_000);

  it('replays same normalized payload, rejects changes and permits only one concurrent claim', async () => {
    const key = randomUUID(); const payload = minimal(name);
    const id = await idOf(await send(payload, [], { key }));
    expect(await idOf(await send({ ...payload, title: ` ${payload.title} ` }, [], { key }), 200)).toBe(id);
    await error(await send({ ...payload, title: 'Changed' }, [], { key }), 409, 'IDEMPOTENCY_CONFLICT');
    const duplicate = randomUUID();
    const responses = await Promise.all([send(payload, [], { key: duplicate }), send(payload, [], { key: duplicate })]);
    expect(responses.filter((r) => r.status === 201)).toHaveLength(1);
    for (const response of responses.filter((r) => r.status !== 201)) {
      if (response.status === 409) await error(response, 409, 'IDEMPOTENCY_IN_PROGRESS'); else await idOf(response, 200);
    }
    const row = await db.query.recipeWriteAttempts.findFirst({ where: eq(recipeWriteAttempts.idempotencyKey, duplicate) });
    expect(row?.state).toBe('completed'); expect(await db.$count(recipes, eq(recipes.id, row!.recipeId))).toBe(1);
  }, 30_000);

  it('hashes file bytes and normalizes file arrival order on replay', async () => {
    const key = randomUUID(); const metadata = { ...minimal(name), instructions: [{ description: 'Photo step', hasImage: true }] };
    const photos = [{ field: 'cover', bytes: jpeg }, { field: 'step-0', bytes: jpeg }];
    const id = await idOf(await send(metadata, photos, { key }));
    expect(await idOf(await send(metadata, [...photos].reverse(), { key }), 200)).toBe(id);
    await error(await send(metadata, [{ field: 'cover', bytes: photo(2) }, photos[1]], { key }), 409, 'IDEMPOTENCY_CONFLICT');
  }, 30_000);

  it('upserts one new canonical ingredient for concurrent creates with distinct snapshots', async () => {
    const concurrentName = `verification-${randomUUID()}`; canonicalNames.add(concurrentName.toLowerCase());
    const ids = await Promise.all([send(minimal(concurrentName)), send(minimal(concurrentName.toUpperCase()), [], { cookie: other.cookie })].map(async (promise) => idOf(await promise)));
    const canonical = await db.select({ id: ingredients.id }).from(ingredients).where(sql`lower(btrim(${ingredients.name})) = ${concurrentName.toLowerCase()}`);
    expect(canonical).toHaveLength(1);
    expect(await db.$count(recipeIngredients, and(inArray(recipeIngredients.recipeId, ids), eq(recipeIngredients.ingredientId, canonical[0].id)))).toBe(2);
  }, 30_000);

  it('keeps a step-only image out of the list/detail cover slot', async () => {
    const metadata = { ...minimal(name), instructions: [{ description: 'Step with photo', hasImage: true }] };
    const id = await idOf(await send(metadata, [{ field: 'step-0', bytes: jpeg }]));
    const value = await detail(id); expect(value.imageUrl === null).toBe(true); await readable(value.instructions[0].imageUrl);
    const response = await fetch(`${baseUrl}/recipes`, { headers: { Cookie: owner.cookie } });
    expect(response.status).toBe(200);
    const list = await response.json() as { data: { id: string; imageUrl: string | null }[] };
    expect(list.data.find((recipe) => recipe.id === id)?.imageUrl === null).toBe(true);
  }, 30_000);

  it('rolls back forced transaction failure and removes uploaded objects, then allows same-key retry', async () => {
    const hook = vi.spyOn(app.get(RecipeWriteHook), 'beforeComplete').mockRejectedValueOnce(new Error('Forced transaction failure'));
    const key = randomUUID(); const calls = new Set(objectKeys); const before = await db.$count(recipes, eq(recipes.userId, owner.user.id));
    await error(await send(minimal(name), [{ field: 'cover', bytes: jpeg }], { key }), 503, 'SERVICE_UNAVAILABLE'); hook.mockRestore();
    expect(await db.$count(recipes, eq(recipes.userId, owner.user.id))).toBe(before);
    expect(await db.$count(recipeWriteAttempts, eq(recipeWriteAttempts.idempotencyKey, key))).toBe(0);
    for (const objectKey of [...objectKeys].filter((key) => !calls.has(key))) {
      const url = await storage.signedDownloadUrl(objectKey);
      const response = await fetch(url); expect(response.status).toBe(404);
    }
    await idOf(await send(minimal(name), [{ field: 'cover', bytes: jpeg }], { key }));
  }, 60_000);

  it('waits for confirmed-failure cleanup and admits an immediate same-key retry at full capacity', async () => {
    const releases = Array.from({ length: 3 }, (_, i) => app.get(RecipeUploadSlots).acquire(`disposable-held-${i}`));
    const hook = vi.spyOn(app.get(RecipeWriteHook), 'beforeComplete').mockRejectedValueOnce(new Error('Forced transaction failure'));
    const actualDelete = storage.deleteObject.bind(storage);
    let finish!: () => void; const held = new Promise<void>((resolve) => { finish = resolve; });
    let reached!: () => void; const cleaning = new Promise<void>((resolve) => { reached = resolve; });
    const deletion = vi.spyOn(storage, 'deleteObject').mockImplementationOnce(async (key) => { reached(); await held; await actualDelete(key); });
    const key = randomUUID(); let responded = false;
    const response = send(minimal(name), [{ field: 'cover', bytes: jpeg }], { key });
    void response.then(() => { responded = true; });
    try {
      await cleaning;
      const attempt = await db.query.recipeWriteAttempts.findFirst({ where: eq(recipeWriteAttempts.idempotencyKey, key) });
      expect(await db.$count(recipes, eq(recipes.id, attempt!.recipeId))).toBe(0);
      expect(responded).toBe(false);
      finish(); await error(await response, 503, 'SERVICE_UNAVAILABLE');
      // No database/signing calls or sleep between the confirmed failure and this retry; three other slots remain occupied.
      await idOf(await send(minimal(name), [{ field: 'cover', bytes: jpeg }], { key }));
      expect(await db.$count(recipeWriteAttempts, eq(recipeWriteAttempts.id, attempt!.id))).toBe(0);
      expect((await fetch(await storage.signedDownloadUrl(attempt!.objectKeys[0]))).status).toBe(404);
    } finally { finish(); await response; hook.mockRestore(); deletion.mockRestore(); releases.forEach((release) => release()); }
  }, 60_000);

  it('lets an immediate same-key retry finish a previously failed storage cleanup', async () => {
    const key = randomUUID();
    const hook = vi.spyOn(app.get(RecipeWriteHook), 'beforeComplete').mockRejectedValueOnce(new Error('Forced transaction failure'));
    const deletion = vi.spyOn(storage, 'deleteObject').mockRejectedValueOnce(new Error('Forced cleanup failure'));
    try { await error(await send(minimal(name), [{ field: 'cover', bytes: jpeg }], { key }), 503, 'SERVICE_UNAVAILABLE'); }
    finally { hook.mockRestore(); deletion.mockRestore(); }
    const attempt = await db.query.recipeWriteAttempts.findFirst({ where: eq(recipeWriteAttempts.idempotencyKey, key) });
    expect(attempt?.state).toBe('cleanup_pending');
    await idOf(await send(minimal(name), [{ field: 'cover', bytes: jpeg }], { key }));
    expect(await db.$count(recipeWriteAttempts, eq(recipeWriteAttempts.id, attempt!.id))).toBe(0);
    expect((await fetch(await storage.signedDownloadUrl(attempt!.objectKeys[0]))).status).toBe(404);
  }, 60_000);

  it('cleans an upload with lost acknowledgement and keeps failed deletion reconcilable', async () => {
    const actualUpload = storage.upload.bind(storage);
    const upload = vi.spyOn(storage, 'upload').mockImplementationOnce(async (key, bytes, mime) => {
      await actualUpload(key, bytes, mime); throw new Error('Forced lost upload acknowledgement');
    });
    const firstKey = randomUUID();
    await error(await send(minimal(name), [{ field: 'cover', bytes: jpeg }], { key: firstKey }), 503, 'SERVICE_UNAVAILABLE');
    upload.mockRestore();
    // Restore tracking for subsequent uploads after removing the temporary upload failure seam.
    const trackedUpload = storage.upload.bind(storage);
    vi.spyOn(storage, 'upload').mockImplementation(async (key, bytes, mime) => { objectKeys.add(key); uploaded++; return trackedUpload(key, bytes, mime); });
    expect(await db.$count(recipeWriteAttempts, eq(recipeWriteAttempts.idempotencyKey, firstKey))).toBe(0);
    const hook = vi.spyOn(app.get(RecipeWriteHook), 'beforeComplete').mockRejectedValueOnce(new Error('Forced transaction failure'));
    const deletion = vi.spyOn(storage, 'deleteObject').mockRejectedValueOnce(new Error('Forced delete failure'));
    const key = randomUUID();
    try { await error(await send(minimal(name), [{ field: 'cover', bytes: jpeg }], { key }), 503, 'SERVICE_UNAVAILABLE'); }
    finally { hook.mockRestore(); deletion.mockRestore(); }
    const attempt = await db.query.recipeWriteAttempts.findFirst({ where: eq(recipeWriteAttempts.idempotencyKey, key) });
    expect(attempt?.state).toBe('cleanup_pending'); expect(attempt?.staleObjectKeys.length).toBe(1);
    expect(await db.$count(recipes, eq(recipes.id, attempt!.recipeId))).toBe(0);
    const counts = await reconcileRecipeWrites(db, storage, { now: new Date(), ageMs: 0, attemptIds: [attempt!.id] });
    expect(counts).toEqual({ completed: 0, removed: 1, deletedObjects: 1, failed: 0 });
    await idOf(await send(minimal(name), [{ field: 'cover', bytes: jpeg }], { key }));
  }, 60_000);

  it('resolves a lost COMMIT acknowledgement before deleting committed objects', async () => {
    const transaction = db.transaction.bind(db);
    let finish!: () => void; const held = new Promise<void>((resolve) => { finish = resolve; });
    let resolutionStarted!: () => void; const resolving = new Promise<void>((resolve) => { resolutionStarted = resolve; });
    let committing: Promise<unknown> | undefined; let first = true; let deletedBeforeCommit = false;
    const seam = vi.spyOn(db, 'transaction').mockImplementation(async (...args) => {
      if (!first) { resolutionStarted(); return transaction(...args); }
      first = false;
      let prepared!: () => void; const ready = new Promise<void>((resolve) => { prepared = resolve; });
      committing = transaction(async (tx) => { const value = await args[0](tx); prepared(); await held; return value; }, args[1]);
      await ready; throw new Error('Forced lost acknowledgement while COMMIT is still in flight');
    });
    const deleteObject = storage.deleteObject.bind(storage);
    const deletion = vi.spyOn(storage, 'deleteObject').mockImplementation(async (key) => {
      deletedBeforeCommit = true; resolutionStarted(); return deleteObject(key);
    });
    const key = randomUUID(); let id: string;
    const response = send(minimal(name), [{ field: 'cover', bytes: jpeg }], { key });
    try { await resolving; finish(); await committing; id = await idOf(await response); }
    finally { finish(); await committing; await response; seam.mockRestore(); deletion.mockRestore(); }
    expect(deletedBeforeCommit).toBe(false);
    const value = await detail(id!); await readable(value.imageUrl);
    expect(await idOf(await send(minimal(name), [{ field: 'cover', bytes: jpeg }], { key }), 200)).toBe(id!);
  }, 60_000);

  it('takes over an aged same-hash pending attempt, cleans old objects and fences its old row', async () => {
    const payload = minimal(name); const key = randomUUID(); const attemptId = randomUUID(); const oldRecipeId = randomUUID();
    const objectKey = `verification/${randomUUID()}.jpg`; await storage.upload(objectKey, jpeg, 'image/jpeg');
    await db.insert(recipeWriteAttempts).values({ id: attemptId, userId: owner.user.id, idempotencyKey: key, operation: 'create',
      requestHash: recipeRequestHash(payload, []), recipeId: oldRecipeId, objectKeys: [objectKey], state: 'pending', createdAt: new Date(0), updatedAt: new Date(0) });
    const id = await idOf(await send(payload, [], { key }));
    expect(await db.$count(recipeWriteAttempts, eq(recipeWriteAttempts.id, attemptId))).toBe(0);
    expect(await db.$count(recipes, eq(recipes.id, oldRecipeId))).toBe(0);
    expect((await fetch(await storage.signedDownloadUrl(objectKey))).status).toBe(404);
    expect(await idOf(await send(payload, [], { key }), 200)).toBe(id);
  }, 60_000);

  it('fences a live old writer after takeover and cleans its late upload without deleting the new cover', async () => {
    const payload = minimal(name); const key = randomUUID();
    let finish!: () => void; const held = new Promise<void>((resolve) => { finish = resolve; });
    let reached!: () => void; const uploading = new Promise<void>((resolve) => { reached = resolve; });
    const actualUpload = storage.upload.bind(storage);
    const seam = vi.spyOn(storage, 'upload').mockImplementationOnce(async (...args) => { reached(); await held; return actualUpload(...args); });
    const request = { headers: {}, user: owner.user, idempotencyKey: key, writeDeadline: Date.now() + 30_000,
      body: { recipe: JSON.stringify(payload) }, files: [{ fieldname: 'cover', mimetype: 'image/jpeg', buffer: jpeg }] } as unknown as RecipeUploadRequest;
    const oldWrite = app.get(RecipeCreateService).create(request).then(() => 'committed', (cause: unknown) => {
      return cause instanceof Error && 'getResponse' in cause ? (cause as { getResponse: () => ApiErrorEnvelope }).getResponse().code : 'unexpected';
    });
    let oldAttempt: typeof recipeWriteAttempts.$inferSelect | undefined;
    let id: string;
    try {
      await uploading;
      oldAttempt = await db.query.recipeWriteAttempts.findFirst({ where: eq(recipeWriteAttempts.idempotencyKey, key) });
      await db.update(recipeWriteAttempts).set({ createdAt: new Date(0), updatedAt: new Date(0) }).where(eq(recipeWriteAttempts.id, oldAttempt!.id));
      id = await idOf(await send(payload, [{ field: 'cover', bytes: jpeg }], { key }));
      finish(); expect(await oldWrite).toBe('IDEMPOTENCY_IN_PROGRESS');
    } finally {
      finish(); await oldWrite; await request.writeSettled?.then(() => {}, () => {}); seam.mockRestore();
      const upload = storage.upload.bind(storage);
      vi.spyOn(storage, 'upload').mockImplementation(async (...args) => { objectKeys.add(args[0]); uploaded++; return upload(...args); });
    }
    expect(await db.$count(recipes, eq(recipes.id, oldAttempt!.recipeId))).toBe(0);
    expect(await db.$count(recipeWriteAttempts, eq(recipeWriteAttempts.id, oldAttempt!.id))).toBe(0);
    expect((await fetch(await storage.signedDownloadUrl(oldAttempt!.objectKeys[0]))).status).toBe(404);
    await readable((await detail(id!)).imageUrl);
  }, 60_000);

  it('resolves an aged pending attempt with an existing recipe to a 200 replay', async () => {
    const payload = minimal(name); const key = randomUUID(); const id = await idOf(await send(payload, [], { key }));
    await db.update(recipeWriteAttempts).set({ state: 'pending', createdAt: new Date(0), updatedAt: new Date(0) }).where(eq(recipeWriteAttempts.idempotencyKey, key));
    expect(await idOf(await send(payload, [], { key }), 200)).toBe(id);
    expect((await db.query.recipeWriteAttempts.findFirst({ where: eq(recipeWriteAttempts.idempotencyKey, key) }))?.state).toBe('completed');
  }, 30_000);

  it('keeps a young pending attempt in progress and rejects aged changed hashes', async () => {
    const payload = minimal(name); const key = randomUUID();
    await db.insert(recipeWriteAttempts).values({ userId: owner.user.id, idempotencyKey: key, operation: 'create',
      requestHash: recipeRequestHash(payload, []), recipeId: randomUUID(), state: 'pending' });
    await error(await send(payload, [], { key }), 409, 'IDEMPOTENCY_IN_PROGRESS');
    await db.update(recipeWriteAttempts).set({ createdAt: new Date(0), updatedAt: new Date(0) }).where(eq(recipeWriteAttempts.idempotencyKey, key));
    await error(await send({ ...payload, title: 'Changed' }, [], { key }), 409, 'IDEMPOTENCY_CONFLICT');
  }, 30_000);

  it('continues reconciliation after one storage failure and releases locks during deletes', async () => {
    const ids = [randomUUID(), randomUUID()]; const keys = [`verification/${randomUUID()}.jpg`, `verification/${randomUUID()}.jpg`];
    for (const key of keys) await storage.upload(key, jpeg, 'image/jpeg');
    await db.insert(recipeWriteAttempts).values(ids.map((id, i) => ({ id, userId: owner.user.id, idempotencyKey: randomUUID(), operation: 'create' as const,
      requestHash: 'test', recipeId: randomUUID(), objectKeys: [keys[i]], state: 'pending' as const, createdAt: new Date(0) })));
    const actualDelete = storage.deleteObject.bind(storage); let calls = 0; let lockFree = false;
    const deletion = vi.spyOn(storage, 'deleteObject').mockImplementation(async (key) => {
      calls++;
      lockFree = await db.transaction(async (tx) => {
        const rows = await tx.select({ id: recipeWriteAttempts.id }).from(recipeWriteAttempts).where(inArray(recipeWriteAttempts.id, ids)).for('update', { skipLocked: true });
        return rows.length === 2;
      });
      if (calls === 1) throw new Error('Forced per-attempt storage failure');
      return actualDelete(key);
    });
    let counts: Awaited<ReturnType<typeof reconcileRecipeWrites>>;
    try { counts = await reconcileRecipeWrites(db, storage, { now: new Date(), attemptIds: ids }); }
    finally { deletion.mockRestore(); }
    expect(lockFree).toBe(true); expect(calls).toBe(2);
    expect(counts!).toMatchObject({ failed: 1, removed: 1, deletedObjects: 1 });
    const retried = await reconcileRecipeWrites(db, storage, { now: new Date(), ageMs: 0, attemptIds: ids });
    expect(retried).toMatchObject({ failed: 0, removed: 1, deletedObjects: 1 });
    expect(await db.$count(recipeWriteAttempts, inArray(recipeWriteAttempts.id, ids))).toBe(0);
  }, 60_000);

  it('returns a pre-persistence timeout while holding capacity, then compensates settled work', async () => {
    const guard = app.get(RecipeWriteGuard); const admit = guard.canActivate.bind(guard);
    const admission = vi.spyOn(guard, 'canActivate').mockImplementationOnce(async (context) => {
      const result = await admit(context); context.switchToHttp().getRequest<RecipeUploadRequest>().writeDeadline = Date.now() + 3000; return result;
    });
    let finish!: () => void; const held = new Promise<void>((resolve) => { finish = resolve; });
    const upload = storage.upload.bind(storage);
    const seam = vi.spyOn(storage, 'upload').mockImplementationOnce(async (key, bytes, mime) => { await held; return upload(key, bytes, mime); });
    const key = randomUUID();
    try {
      const response = await send(minimal(name), [{ field: 'cover', bytes: jpeg }], { key });
      await error(response, 504, 'TIMEOUT');
      const attempt = await db.query.recipeWriteAttempts.findFirst({ where: eq(recipeWriteAttempts.idempotencyKey, key) });
      expect(attempt?.state).toBe('pending');
      await error(await send(minimal(name), [{ field: 'cover', bytes: jpeg }], { key }), 409, 'IDEMPOTENCY_IN_PROGRESS');
      const releases = Array.from({ length: 3 }, (_, i) => app.get(RecipeUploadSlots).acquire(`disposable-slot-${i}`));
      try { expect(() => app.get(RecipeUploadSlots).acquire('extra')).toThrow(); } finally { releases.forEach((release) => release()); }
      finish();
      await vi.waitFor(async () => { expect(await db.$count(recipeWriteAttempts, eq(recipeWriteAttempts.idempotencyKey, key))).toBe(0); }, { timeout: 20_000, interval: 250 });
      expect(await db.$count(recipes, eq(recipes.id, attempt!.recipeId))).toBe(0);
    } finally { finish(); admission.mockRestore(); seam.mockRestore(); }
    const original = storage.upload.bind(storage);
    vi.spyOn(storage, 'upload').mockImplementation(async (key, bytes, mime) => { objectKeys.add(key); uploaded++; return original(key, bytes, mime); });
  }, 30_000);

  it('reconciles stale pending and cleanup_pending disposable attempts idempotently', async () => {
    const pendingKey = `verification/${randomUUID()}.jpg`; const staleKey = `verification/${randomUUID()}.jpg`;
    const orphanKey = `verification/${randomUUID()}.jpg`;
    const committedId = await idOf(await send(minimal(name), [{ field: 'cover', bytes: jpeg }]));
    const [cover] = await db.select({ key: recipeImages.objectKey }).from(recipeImages).where(eq(recipeImages.recipeId, committedId));
    await storage.upload(pendingKey, jpeg, 'image/jpeg'); await storage.upload(staleKey, jpeg, 'image/jpeg');
    await storage.upload(orphanKey, jpeg, 'image/jpeg');
    const pendingId = randomUUID(); const cleanupId = randomUUID(); const committedAttemptId = randomUUID();
    await db.insert(recipeWriteAttempts).values([
      { id: pendingId, userId: owner.user.id, idempotencyKey: randomUUID(), operation: 'create', requestHash: 'test', recipeId: randomUUID(), objectKeys: [pendingKey], state: 'pending', createdAt: new Date(0) },
      { id: cleanupId, userId: owner.user.id, idempotencyKey: randomUUID(), operation: 'update', requestHash: 'test', recipeId: savedId, staleObjectKeys: [staleKey], state: 'cleanup_pending' },
      { id: committedAttemptId, userId: owner.user.id, idempotencyKey: randomUUID(), operation: 'create', requestHash: 'test', recipeId: committedId,
        objectKeys: [orphanKey, cover.key], state: 'pending', createdAt: new Date(0) },
    ]);
    const attemptIds = [pendingId, cleanupId, committedAttemptId];
    const counts = await reconcileRecipeWrites(db, storage, { now: new Date(), attemptIds });
    expect(counts).toEqual({ completed: 2, removed: 1, deletedObjects: 3, failed: 0 });
    expect(await db.$count(recipeWriteAttempts, eq(recipeWriteAttempts.id, pendingId))).toBe(0);
    expect((await db.query.recipeWriteAttempts.findFirst({ where: eq(recipeWriteAttempts.id, cleanupId) }))?.state).toBe('completed');
    expect(await reconcileRecipeWrites(db, storage, { now: new Date(), attemptIds })).toEqual({ completed: 0, removed: 0, deletedObjects: 0, failed: 0 });
    for (const key of [pendingKey, staleKey, orphanKey]) expect((await fetch(await storage.signedDownloadUrl(key))).status).toBe(404);
    await readable((await detail(committedId)).imageUrl);
  }, 60_000);
});
