import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { updateRecipeMetadataSchema } from '@recipe-app/contracts/schemas';
import type { CreateRecipeMetadata, RecipeDetail, UpdateRecipeMetadata } from '@recipe-app/contracts/types';
import { recipes, recipeWriteAttempts } from '../../src/database/schema.js';
import { RECIPE_CLEANUP_BUDGET_MS, reconcileRecipeWrites } from '../../src/recipes/recipe-reconcile.js';
import { RecipeUpdateService } from '../../src/recipes/recipe-update.service.js';
import { recipeRequestHash } from '../../src/recipes/recipe-metadata.js';
import { RECIPE_WRITE_LIMIT, RecipeWriteGuard } from '../../src/recipes/recipe-upload.js';
import type { RecipeUploadRequest } from '../../src/recipes/recipe-upload.js';
import { RecipeWriteHook } from '../../src/recipes/recipe-write-hook.js';
import { TEST_ORIGIN } from '../auth-harness.js';
import { CI_LATENCY_MS, jpeg, minimalRecipe, openRecipeSuite } from '../recipe-suite.js';
import type { Photo, RecipeSuite } from '../recipe-suite.js';

describe('Update recipe HTTP', () => {
  let s: RecipeSuite;
  beforeAll(async () => { s = await openRecipeSuite(); }, 60_000);
  beforeEach(() => s.resetLimits());
  afterAll(() => s?.close(), 60_000);

  const base = (): CreateRecipeMetadata => ({ title: 'Base recipe', description: 'Old description', categories: ['Dinner', 'Lunch'],
    servings: 2, prepTimeMinutes: 5, cookTimeMinutes: 10, videoUrl: 'https://www.youtube.com/watch?v=old', notes: 'Old notes',
    ingredients: [{ name: `${s.name} flour`, quantity: 1, unit: 'cup' }, { name: `${s.name} salt`, quantity: null, unit: null }],
    instructions: ['A', 'B', 'C', 'D'].map((description, index) => ({ description, hasImage: index < 3 })) });
  const basePhotos = [{ field: 'cover', bytes: jpeg(10) }, { field: 'step-0', bytes: jpeg(11) }, { field: 'step-1', bytes: jpeg(12) }, { field: 'step-2', bytes: jpeg(13) }];
  /** Cover plus photos on steps A, B and C; step D has none. */
  async function seed() {
    const id = await s.savedId(await s.send('/recipes', base(), basePhotos), 201);
    return { id, value: await s.detail(id), rows: await s.imageRows(id) };
  }
  /** The edit form's starting point: every field as saved and every image slot kept. */
  const unchanged = (value: RecipeDetail): UpdateRecipeMetadata => ({ title: value.title, description: value.description, categories: value.categories,
    servings: value.servings, prepTimeMinutes: value.prepTimeMinutes, cookTimeMinutes: value.cookTimeMinutes, videoUrl: value.videoUrl, notes: value.notes,
    ingredients: value.ingredients.map(({ name, quantity, unit }) => ({ name, quantity, unit })), cover: 'keep',
    instructions: value.instructions.map(({ id, description }) => ({ id, description, image: 'keep' })) });
  const patch = (id: string, metadata: unknown, photos: Photo[] = [], options: Parameters<RecipeSuite['send']>[3] = {}) =>
    s.send(`/recipes/${encodeURIComponent(id)}`, metadata, photos, { ...options, method: 'PATCH' });
  /** Everything a failed update must leave alone, without signed URLs. */
  async function snapshot(id: string) {
    const value = await s.detail(id);
    return JSON.stringify({ ...value, imageUrl: Boolean(value.imageUrl), instructions: value.instructions.map((step) => ({ ...step, imageUrl: Boolean(step.imageUrl) })), rows: await s.imageRows(id) });
  }
  const same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);
  const attemptFor = (key: string) => s.db.query.recipeWriteAttempts.findFirst({ where: eq(recipeWriteAttempts.idempotencyKey, key) });
  const attemptCount = (key: string) => s.db.$count(recipeWriteAttempts, eq(recipeWriteAttempts.idempotencyKey, key));
  const serviceRequest = (metadata: UpdateRecipeMetadata, photos: Photo[], key = randomUUID()) => ({ headers: {}, user: s.owner.user, idempotencyKey: key,
    writeDeadline: Date.now() + 30_000, body: { recipe: JSON.stringify(metadata) },
    files: photos.map((photo) => ({ fieldname: photo.field, mimetype: 'image/jpeg', buffer: photo.bytes })) }) as unknown as RecipeUploadRequest;

  it('updates every scalar field, category order and ingredients while keeping photos, favorite state and created_at', async () => {
    const { id, value, rows } = await seed(); const calls = s.upload.mock.calls.length;
    await s.expectEmpty(await s.call('PUT', `/recipes/${id}/favorite`));
    const metadata: UpdateRecipeMetadata = { ...unchanged(value), title: '  Updated recipe ', description: 'New description', categories: ['Lunch', 'Breakfast', 'Dinner'],
      servings: 6, prepTimeMinutes: 0, cookTimeMinutes: 45, videoUrl: 'https://vimeo.com/123456', notes: null,
      ingredients: [{ name: `${s.name} SUGAR`, quantity: 0.125, unit: 'tsp' }, { name: `${s.name} pepper`, quantity: null, unit: null }, { name: `${s.name} flour`, quantity: 2.5, unit: 'cup' }] };
    expect(await s.savedId(await patch(id, metadata), 200)).toBe(id);
    const updated = await s.detail(id);
    expect(updated).toMatchObject({ title: 'Updated recipe', description: 'New description', categories: ['Lunch', 'Breakfast', 'Dinner'], servings: 6,
      prepTimeMinutes: 0, cookTimeMinutes: 45, videoUrl: 'https://vimeo.com/123456', notes: null, isFavorite: true, userId: s.owner.user.id, createdAt: value.createdAt });
    expect(updated.ingredients.map(({ name, quantity, unit, sortOrder }) => ({ name, quantity, unit, sortOrder }))).toEqual([
      { name: `${s.name} SUGAR`, quantity: 0.125, unit: 'tsp', sortOrder: 0 }, { name: `${s.name} pepper`, quantity: null, unit: null, sortOrder: 1 },
      { name: `${s.name} flour`, quantity: 2.5, unit: 'cup', sortOrder: 2 }]);
    expect(Date.parse(updated.updatedAt) > Date.parse(value.updatedAt)).toBe(true);
    expect(updated.instructions.map(({ id, stepNumber, description }) => ({ id, stepNumber, description })))
      .toEqual(value.instructions.map(({ id, stepNumber, description }) => ({ id, stepNumber, description })));
    // Kept images are the same rows and objects, and nothing was uploaded again.
    expect(same(await s.imageRows(id), rows)).toBe(true); expect(s.upload.mock.calls.length).toBe(calls);
    expect((await s.bytesAt(updated.imageUrl))?.equals(jpeg(10))).toBe(true);
    expect((await s.bytesAt(updated.instructions[1].imageUrl))?.equals(jpeg(12))).toBe(true);
    expect((await s.list()).data.find((recipe) => recipe.id === id)).toMatchObject({ title: 'Updated recipe', isFavorite: true });
  }, 60_000);

  it('moves kept photos with their steps, replaces the cover, and cleans replaced, removed and deleted-step photos', async () => {
    const { id, value, rows } = await seed(); const calls = s.upload.mock.calls.length; const before = s.uploadedKeys();
    const [a, b, c, d] = value.instructions; const key = randomUUID();
    const imageOf = async (stepId: string) => (await s.db.query.recipeInstructions.findFirst({ where: (row, { eq }) => eq(row.id, stepId) }))?.imageId;
    const photoIds = { a: await imageOf(a.id), b: await imageOf(b.id), c: await imageOf(c.id) };
    const keyOf = (imageId?: string | null) => rows.find((row) => row.id === imageId)!.objectKey;
    const metadata: UpdateRecipeMetadata = { ...unchanged(value), cover: 'replace', instructions: [
      { id: c.id, description: 'C moved first', image: 'keep' }, { id: null, description: 'New step', image: 'replace' },
      { id: a.id, description: 'A without photo', image: 'remove' }, { id: d.id, description: 'D', image: 'keep' }, { id: null, description: 'Plain new step', image: 'remove' }] };
    expect(await s.savedId(await patch(id, metadata, [{ field: 'step-1', bytes: jpeg(21) }, { field: 'cover', bytes: jpeg(20) }], { key }), 200)).toBe(id);
    const updated = await s.detail(id);
    expect(updated.instructions.map(({ stepNumber, description }) => [stepNumber, description])).toEqual([
      [1, 'C moved first'], [2, 'New step'], [3, 'A without photo'], [4, 'D'], [5, 'Plain new step']]);
    expect([updated.instructions[0].id, updated.instructions[2].id, updated.instructions[3].id]).toEqual([c.id, a.id, d.id]);
    expect((await s.bytesAt(updated.imageUrl))?.equals(jpeg(20))).toBe(true);
    expect((await s.bytesAt(updated.instructions[0].imageUrl))?.equals(jpeg(13))).toBe(true);
    expect((await s.bytesAt(updated.instructions[1].imageUrl))?.equals(jpeg(21))).toBe(true);
    expect(updated.instructions.slice(2).map((step) => step.imageUrl === null)).toEqual([true, true, true]);
    const after = await s.imageRows(id);
    // The kept photo is the same row and object; only the two replacements were uploaded.
    expect(same(after.find((row) => row.id === photoIds.c), rows.find((row) => row.id === photoIds.c))).toBe(true);
    expect(await imageOf(c.id)).toBe(photoIds.c); expect(s.upload.mock.calls.length).toBe(calls + 2);
    expect(after.map(({ sortOrder }) => sortOrder)).toEqual([0, ...after.slice(1).map(({ sortOrder }) => sortOrder)]);
    expect(after).toHaveLength(3); expect(new Set(after.map(({ sortOrder }) => sortOrder)).size).toBe(3); expect(after.slice(1).every(({ sortOrder }) => sortOrder >= 1)).toBe(true);
    for (const stale of [rows[0].objectKey, keyOf(photoIds.a), keyOf(photoIds.b)]) expect(await s.stored(stale)).toBe(false);
    expect(await s.stored(keyOf(photoIds.c))).toBe(true); expect(await s.orphans(before)).toBe(0);
    const attempt = await attemptFor(key);
    expect([attempt?.operation, attempt?.state, attempt?.staleObjectKeys.length]).toEqual(['update', 'completed', 0]);
    // Removing the cover and keeping a slot that has no photo both leave no image behind.
    const second = await s.detail(id);
    expect(await s.savedId(await patch(id, { ...unchanged(second), cover: 'remove' }), 200)).toBe(id);
    const cleared = await s.detail(id);
    expect(cleared.imageUrl === null).toBe(true); expect(await s.stored(after[0].objectKey)).toBe(false);
    expect(cleared.instructions.map((step) => step.imageUrl !== null)).toEqual([true, true, false, false, false]);
    expect(await s.savedId(await patch(id, unchanged(cleared)), 200)).toBe(id);
    expect((await s.detail(id)).imageUrl === null).toBe(true); expect(await s.imageRows(id)).toHaveLength(2);
  }, 90_000);

  it('rejects invalid updates with the recipe unchanged, no claim left and nothing uploaded', async () => {
    const { id, value } = await seed(); const foreign = await seed();
    const before = await snapshot(id); const calls = s.upload.mock.calls.length;
    const valid = unchanged(value); const [first, ...rest] = valid.instructions;
    const cover = [{ field: 'cover', bytes: jpeg(30) }];
    const injected = (key: string) => JSON.parse(JSON.stringify(valid).slice(0, -1) + `,"${key}":"injected"}`) as unknown;
    const cases: [unknown, Photo[], number, string, string][] = [
      [{ ...valid, title: ' ' }, [], 400, 'VALIDATION_FAILED', 'title'],
      [{ ...valid, categories: ['Dinner', 'Lunch', 'Breakfast', 'Snacks'] }, [], 400, 'VALIDATION_FAILED', 'categories'],
      [{ ...valid, ingredients: [{ name: `${s.name} flour`, quantity: 0.1234, unit: 'g' }] }, [], 400, 'VALIDATION_FAILED', 'ingredients.0.quantity'],
      [{ ...valid, instructions: [{ id: null, description: 'New', image: 'keep' }, ...rest] }, [], 400, 'VALIDATION_FAILED', 'instructions.0.image'],
      [{ ...valid, instructions: [first, { ...rest[0], id: foreign.value.instructions[0].id }, ...rest.slice(1)] }, [], 400, 'VALIDATION_FAILED', 'instructions.1.id'],
      [{ ...valid, cover: 'replace', instructions: [{ ...first, id: randomUUID() }, ...rest] }, cover, 400, 'VALIDATION_FAILED', 'instructions.0.id'],
      [{ ...valid, instructions: [first, first, ...rest] }, [], 400, 'VALIDATION_FAILED', 'instructions'],
      [{ ...valid, instructions: [{ description: 'Create shape', hasImage: false }] }, [], 400, 'VALIDATION_FAILED', 'instructions.0.hasImage'],
      [valid, cover, 400, 'VALIDATION_FAILED', 'cover'],
      [valid, [{ field: 'step-0', bytes: jpeg(30) }], 400, 'VALIDATION_FAILED', 'step-0'],
      [{ ...valid, cover: 'replace' }, [], 400, 'VALIDATION_FAILED', 'cover'],
      [{ ...valid, instructions: [{ ...first, image: 'replace' }, ...rest] }, cover, 400, 'VALIDATION_FAILED', 'cover'],
      [{ ...valid, cover: 'replace' }, [{ field: 'cover', bytes: Buffer.alloc(5 * 1024 * 1024 + 1) }], 413, 'PAYLOAD_TOO_LARGE', 'cover'],
      [{ ...valid, cover: 'replace' }, [{ field: 'cover', bytes: jpeg(30), mime: 'image/gif' }], 415, 'UNSUPPORTED_MEDIA_TYPE', 'cover'],
      [{ ...valid, cover: 'replace' }, [{ field: 'cover', bytes: jpeg(30), mime: 'image/png' }], 400, 'VALIDATION_FAILED', 'cover'],
      [{ ...valid, instructions: [{ ...first, imageId: 'injected' }, ...rest] }, [], 400, 'VALIDATION_FAILED', 'instructions.0.imageId'],
      ['not JSON', [], 400, 'VALIDATION_FAILED', 'recipe'],
      ...['userId', 'id', 'imageUrl', 'objectKey', 'isFavorite', '__proto__'].map((key): [unknown, Photo[], number, string, string] => [injected(key), [], 400, 'VALIDATION_FAILED', key]),
    ];
    for (const [metadata, photos, status, code, field] of cases) {
      const key = randomUUID();
      await s.expectError(await patch(id, metadata, photos, { key }), status, code, field);
      expect(await attemptCount(key), `Attempt left for ${field}`).toBe(0);
    }
    for (const [options, status, code, field] of [
      [{ cookie: null }, 401, 'UNAUTHENTICATED', undefined], [{ origin: 'https://hostile.example.invalid' }, 403, 'ORIGIN_REJECTED', undefined],
      [{ origin: null }, 403, 'ORIGIN_REJECTED', undefined], [{ key: null }, 400, 'VALIDATION_FAILED', 'idempotencyKey'],
      [{ key: 'not-a-uuid' }, 400, 'VALIDATION_FAILED', 'idempotencyKey'],
    ] as const) await s.expectError(await patch(id, { ...valid, title: 'Rejected' }, [], options), status, code, field);
    expect(await snapshot(id) === before).toBe(true); expect(s.upload.mock.calls.length).toBe(calls);
  }, 120_000);

  it('answers 404 before validation or upload for another owner and unknown ids', async () => {
    const { id, value } = await seed(); const before = await snapshot(id); const calls = s.upload.mock.calls.length;
    const replace = { ...unchanged(value), title: 'Hijacked', cover: 'replace' }; const cover = [{ field: 'cover', bytes: jpeg(40) }];
    await s.expectError(await patch(id, replace, cover, { cookie: s.other.cookie }), 404, 'NOT_FOUND');
    await s.expectError(await patch(id, 'not JSON', [], { cookie: s.other.cookie }), 404, 'NOT_FOUND');
    for (const unknown of [randomUUID(), 'bad\u0000id', 'x'.repeat(201)]) await s.expectError(await patch(unknown, replace, cover), 404, 'NOT_FOUND');
    expect(await snapshot(id) === before).toBe(true); expect(s.upload.mock.calls.length).toBe(calls);
  }, 60_000);

  it('rolls back a forced transaction failure, removes the new uploads and allows a same-key retry', async () => {
    const { id, value, rows } = await seed(); const before = await snapshot(id); const uploaded = s.uploadedKeys(); const key = randomUUID();
    const metadata: UpdateRecipeMetadata = { ...unchanged(value), title: 'Rolled back', cover: 'replace', categories: ['Snacks'],
      ingredients: [{ name: `${s.name} butter`, quantity: 3, unit: 'tbsp' }],
      instructions: [{ id: value.instructions[1].id, description: 'Only step', image: 'replace' }] };
    const photos = [{ field: 'cover', bytes: jpeg(50) }, { field: 'step-0', bytes: jpeg(51) }];
    const hook = vi.spyOn(s.app.get(RecipeWriteHook), 'beforeComplete').mockRejectedValueOnce(new Error('Forced transaction failure'));
    try { await s.expectError(await patch(id, metadata, photos, { key }), 503, 'SERVICE_UNAVAILABLE'); } finally { hook.mockRestore(); }
    expect(await snapshot(id) === before).toBe(true); expect(await attemptCount(key)).toBe(0);
    expect([...s.uploadedKeys()].filter((object) => !uploaded.has(object))).toHaveLength(2); expect(await s.orphans(uploaded)).toBe(0);
    for (const row of rows) expect(await s.stored(row.objectKey)).toBe(true);
    expect(await s.savedId(await patch(id, metadata, photos, { key }), 200)).toBe(id);
    const updated = await s.detail(id);
    expect(updated.title).toBe('Rolled back'); expect((await s.bytesAt(updated.imageUrl))?.equals(jpeg(50))).toBe(true);
    expect((await s.bytesAt(updated.instructions[0].imageUrl))?.equals(jpeg(51))).toBe(true);
    for (const row of rows) expect(await s.stored(row.objectKey)).toBe(false);
    expect(await s.orphans(uploaded)).toBe(0);
  }, 90_000);

  it('replays the same key once, and rejects a changed payload, another recipe or another operation under that key', async () => {
    const { id, value, rows } = await seed(); const sibling = await seed(); const key = randomUUID();
    const metadata: UpdateRecipeMetadata = { ...unchanged(value), title: 'Replayed', cover: 'replace', instructions: unchanged(value).instructions.slice(0, 2) };
    const photos = [{ field: 'cover', bytes: jpeg(60) }];
    expect(await s.savedId(await patch(id, metadata, photos, { key }), 200)).toBe(id);
    const applied = await snapshot(id); const calls = s.upload.mock.calls.length;
    // The dropped steps no longer exist, yet the replay still answers 200 without applying anything.
    expect(await s.savedId(await patch(id, { ...metadata, title: ' Replayed ' }, photos, { key }), 200)).toBe(id);
    expect(await snapshot(id) === applied).toBe(true); expect(s.upload.mock.calls.length).toBe(calls);
    await s.expectError(await patch(id, { ...metadata, title: 'Changed' }, photos, { key }), 409, 'IDEMPOTENCY_CONFLICT');
    await s.expectError(await patch(id, metadata, [{ field: 'cover', bytes: jpeg(61) }], { key }), 409, 'IDEMPOTENCY_CONFLICT');
    await s.expectError(await patch(sibling.id, { ...metadata, instructions: unchanged(sibling.value).instructions.slice(0, 2) }, photos, { key }), 409, 'IDEMPOTENCY_CONFLICT');
    await s.expectError(await s.send('/recipes', minimalRecipe(s.name), [], { key }), 409, 'IDEMPOTENCY_CONFLICT');
    const createKey = randomUUID();
    await s.savedId(await s.send('/recipes', minimalRecipe(s.name), [], { key: createKey }), 201);
    await s.expectError(await patch(id, unchanged(await s.detail(id)), [], { key: createKey }), 409, 'IDEMPOTENCY_CONFLICT');
    expect(await snapshot(id) === applied).toBe(true); expect(s.upload.mock.calls.length).toBe(calls);
    expect(await s.stored(rows[0].objectKey)).toBe(false);
    // A young pending claim answers in progress.
    const pending = randomUUID();
    const requestHash = recipeRequestHash(updateRecipeMetadataSchema.parse(metadata), [{ fieldname: 'cover', mimetype: 'image/jpeg', buffer: jpeg(60) }], id);
    await s.db.insert(recipeWriteAttempts).values({ userId: s.owner.user.id, idempotencyKey: pending, operation: 'update', requestHash, recipeId: id, state: 'pending' });
    await s.expectError(await patch(id, metadata, photos, { key: pending }), 409, 'IDEMPOTENCY_IN_PROGRESS');
    expect(await snapshot(id) === applied).toBe(true);
  }, 90_000);

  it('keeps a committed update and its replay at 200 when stale-object deletion fails, then reconciles', async () => {
    const { id, value, rows } = await seed(); const key = randomUUID();
    const metadata: UpdateRecipeMetadata = { ...unchanged(value), title: 'Committed', cover: 'remove' };
    const deletion = vi.spyOn(s.storage, 'deleteObject').mockRejectedValueOnce(new Error('Forced stale deletion failure'));
    try { expect(await s.savedId(await patch(id, metadata, [], { key }), 200)).toBe(id); } finally { deletion.mockRestore(); }
    const committed = await s.detail(id);
    expect(committed.title).toBe('Committed'); expect(committed.imageUrl === null).toBe(true);
    const attempt = await attemptFor(key);
    expect([attempt?.state, attempt?.staleObjectKeys.length]).toEqual(['cleanup_pending', 1]); expect(await s.stored(rows[0].objectKey)).toBe(true);
    expect(await s.savedId(await patch(id, metadata, [], { key }), 200)).toBe(id);
    expect((await s.detail(id)).updatedAt).toBe(committed.updatedAt);
    expect(await reconcileRecipeWrites(s.db, s.storage, { now: new Date(), attemptIds: [attempt!.id] })).toEqual({ completed: 1, removed: 0, deletedObjects: 1, failed: 0 });
    expect(await s.stored(rows[0].objectKey)).toBe(false); expect((await attemptFor(key))?.state).toBe('completed');
    expect(await s.savedId(await patch(id, metadata, [], { key }), 200)).toBe(id);
    for (const row of rows.slice(1)) expect(await s.stored(row.objectKey)).toBe(true);
  }, 90_000);

  it('answers 200 inside a short deadline while replaced-object deletion hangs, then reconciles', async () => {
    const { id, value, rows } = await seed(); const key = randomUUID(); const deadlineMs = 8000;
    const metadata: UpdateRecipeMetadata = { ...unchanged(value), title: 'Slow cleanup', cover: 'replace',
      instructions: unchanged(value).instructions.map((step) => ({ ...step, image: 'remove' })) };
    const photos = [{ field: 'cover', bytes: jpeg(100) }];
    const guard = s.app.get(RecipeWriteGuard); const admit = guard.canActivate.bind(guard);
    const admission = vi.spyOn(guard, 'canActivate').mockImplementationOnce(async (context) => {
      const result = await admit(context); context.switchToHttp().getRequest<RecipeUploadRequest>().writeDeadline = Date.now() + deadlineMs; return result;
    });
    let fail!: () => void; const held = new Promise<void>((resolve) => { fail = resolve; });
    const deletion = vi.spyOn(s.storage, 'deleteObject').mockImplementation(async () => { await held; throw new Error('Forced slow stale deletion failure'); });
    const started = Date.now(); const request = patch(id, metadata, photos, { key });
    try {
      // A committed update is never reported as timed out because its cleanup is slow.
      expect(await s.savedId(await request, 200)).toBe(id);
      expect(Date.now() - started < Math.min(deadlineMs, RECIPE_CLEANUP_BUDGET_MS) + 4000 + CI_LATENCY_MS).toBe(true);
      const committed = await s.detail(id);
      expect(committed.title).toBe('Slow cleanup'); expect((await s.bytesAt(committed.imageUrl))?.equals(jpeg(100))).toBe(true);
      const attempt = await attemptFor(key);
      expect([attempt?.state, attempt?.staleObjectKeys.length]).toEqual(['cleanup_pending', 4]);
      // The upload slot is free again: the replay is admitted and answers without waiting for cleanup.
      expect(await s.savedId(await patch(id, metadata, photos, { key }), 200)).toBe(id);
      expect(await reconcileRecipeWrites(s.db, s.storage, { now: new Date(), attemptIds: [attempt!.id] })).toEqual({ completed: 0, removed: 0, deletedObjects: 0, failed: 0 });
      fail(); deletion.mockRestore();
      await vi.waitFor(async () => {
        expect(await reconcileRecipeWrites(s.db, s.storage, { now: new Date(), attemptIds: [attempt!.id] })).toEqual({ completed: 1, removed: 0, deletedObjects: 4, failed: 0 });
      }, { timeout: 20_000, interval: 500 });
      for (const row of rows) expect(await s.stored(row.objectKey)).toBe(false);
      expect((await attemptFor(key))?.state).toBe('completed'); expect((await s.bytesAt((await s.detail(id)).imageUrl))?.equals(jpeg(100))).toBe(true);
    } finally { fail(); deletion.mockRestore(); admission.mockRestore(); await request.catch(() => undefined); }
  }, 90_000);

  it('answers a replay of a finished update with a conflict once its recipe was deleted', async () => {
    const { id, value, rows } = await seed(); const finished = randomUUID(); const cleaning = randomUUID();
    const first: UpdateRecipeMetadata = { ...unchanged(value), title: 'Finished edit' };
    expect(await s.savedId(await patch(id, first, [], { key: finished }), 200)).toBe(id);
    // A second edit commits but leaves its replaced cover to reconciliation.
    const second: UpdateRecipeMetadata = { ...first, title: 'Edit with cleanup left', cover: 'remove' };
    const deletion = vi.spyOn(s.storage, 'deleteObject').mockRejectedValueOnce(new Error('Forced stale deletion failure'));
    try { expect(await s.savedId(await patch(id, second, [], { key: cleaning }), 200)).toBe(id); } finally { deletion.mockRestore(); }
    expect((await attemptFor(cleaning))?.state).toBe('cleanup_pending');
    await s.expectEmpty(await s.call('DELETE', `/recipes/${id}`));
    const owned = await s.db.$count(recipes, eq(recipes.userId, s.owner.user.id)); const calls = s.upload.mock.calls.length;
    for (const [key, metadata] of [[finished, first], [cleaning, second], [finished, { ...first, title: 'Changed' }]] as const) {
      await s.expectError(await patch(id, metadata, [], { key }), 409, 'IDEMPOTENCY_CONFLICT');
    }
    // A key that never wrote this recipe, and another account, still answer like any unknown recipe.
    await s.expectError(await patch(id, first), 404, 'NOT_FOUND');
    await s.expectError(await patch(id, first, [], { key: finished, cookie: s.other.cookie }), 404, 'NOT_FOUND');
    const attemptIds = [(await attemptFor(finished))!.id, (await attemptFor(cleaning))!.id];
    expect(await reconcileRecipeWrites(s.db, s.storage, { now: new Date(), ageMs: 0, attemptIds })).toEqual({ completed: 1, removed: 0, deletedObjects: 1, failed: 0 });
    expect([(await attemptFor(finished))?.state, (await attemptFor(cleaning))?.state]).toEqual(['completed', 'completed']);
    for (const [key, metadata] of [[finished, first], [cleaning, second]] as const) await s.expectError(await patch(id, metadata, [], { key }), 409, 'IDEMPOTENCY_CONFLICT');
    expect(await s.db.$count(recipes, eq(recipes.userId, s.owner.user.id))).toBe(owned); expect(s.upload.mock.calls.length).toBe(calls);
    for (const row of rows) expect(await s.stored(row.objectKey)).toBe(false);
  }, 90_000);

  it('lets an update racing a delete of the same recipe commit first or fail with 404, leaving no objects or open attempts', async () => {
    const { id, value, rows } = await seed(); const uploaded = s.uploadedKeys(); const key = randomUUID();
    const metadata: UpdateRecipeMetadata = { ...unchanged(value), title: 'Racing edit', cover: 'replace' };
    const cover = [{ field: 'cover', bytes: jpeg(110) }];
    const [updated, removed] = await Promise.all([patch(id, metadata, cover, { key }), s.call('DELETE', `/recipes/${id}`)]);
    await s.expectEmpty(removed);
    if (updated.status === 200) expect(await s.savedId(updated, 200)).toBe(id); else await s.expectError(updated, 404, 'NOT_FOUND');
    expect(await s.db.$count(recipes, eq(recipes.id, id))).toBe(0); expect(await s.imageRows(id)).toEqual([]);
    for (const row of rows) expect(await s.stored(row.objectKey)).toBe(false);
    expect(await s.orphans(uploaded)).toBe(0);
    const attempts = await s.db.select().from(recipeWriteAttempts).where(eq(recipeWriteAttempts.recipeId, id));
    expect(attempts.filter(({ state }) => state !== 'completed')).toEqual([]);
    expect(attempts.filter(({ operation }) => operation === 'delete')).toEqual([]);
    // The recipe is gone for good: a second delete and a fresh edit answer 404, and the key that already wrote answers a conflict.
    await s.expectError(await s.call('DELETE', `/recipes/${id}`), 404, 'NOT_FOUND');
    await s.expectError(await patch(id, metadata, cover), 404, 'NOT_FOUND');
    if (updated.status === 200) await s.expectError(await patch(id, metadata, cover, { key }), 409, 'IDEMPOTENCY_CONFLICT');
  }, 90_000);

  it('reconciles an abandoned pending update by deleting only its unreferenced uploads', async () => {
    const { id, value, rows } = await seed(); const before = await snapshot(id);
    const orphan = `verification/${randomUUID()}.jpg`; await s.storage.upload(orphan, jpeg(70), 'image/jpeg');
    const key = randomUUID(); const attemptId = randomUUID();
    await s.db.insert(recipeWriteAttempts).values({ id: attemptId, userId: s.owner.user.id, idempotencyKey: key, operation: 'update', requestHash: 'test',
      recipeId: id, objectKeys: [orphan, rows[0].objectKey], state: 'pending', createdAt: new Date(0) });
    expect(await reconcileRecipeWrites(s.db, s.storage, { now: new Date(), attemptIds: [attemptId] })).toEqual({ completed: 0, removed: 1, deletedObjects: 1, failed: 0 });
    expect(await s.stored(orphan)).toBe(false); expect(await s.stored(rows[0].objectKey)).toBe(true);
    expect(await attemptCount(key)).toBe(0); expect(await snapshot(id) === before).toBe(true);
    // The abandoned update never applied, so its key is free to apply it now.
    expect(await s.savedId(await patch(id, { ...unchanged(value), title: 'Applied after takeover' }, [], { key }), 200)).toBe(id);
    expect((await s.detail(id)).title).toBe('Applied after takeover');
  }, 90_000);

  it('resolves a lost COMMIT acknowledgement to the committed update before deleting any object', async () => {
    const { id, value, rows } = await seed(); const uploaded = s.uploadedKeys();
    const transaction = s.db.transaction.bind(s.db);
    let finish!: () => void; const held = new Promise<void>((resolve) => { finish = resolve; });
    let resolutionStarted!: () => void; const resolving = new Promise<void>((resolve) => { resolutionStarted = resolve; });
    let committing: Promise<unknown> | undefined; let first = true; let deletedBeforeCommit = false; let committedYet = false;
    const seam = vi.spyOn(s.db, 'transaction').mockImplementation(async (...args) => {
      if (!first) { resolutionStarted(); return transaction(...args); }
      first = false;
      let prepared!: () => void; const ready = new Promise<void>((resolve) => { prepared = resolve; });
      committing = transaction(async (tx) => { const result = await args[0](tx); prepared(); await held; return result; }, args[1]).then(() => { committedYet = true; });
      await ready; throw new Error('Forced lost acknowledgement while COMMIT is still in flight');
    });
    const deleteObject = s.storage.deleteObject.bind(s.storage);
    const deletion = vi.spyOn(s.storage, 'deleteObject').mockImplementation(async (object) => {
      if (!committedYet) deletedBeforeCommit = true;
      resolutionStarted(); return deleteObject(object);
    });
    const key = randomUUID(); const metadata: UpdateRecipeMetadata = { ...unchanged(value), title: 'Acknowledgement lost', cover: 'replace' };
    const photos = [{ field: 'cover', bytes: jpeg(80) }];
    const response = patch(id, metadata, photos, { key });
    try { await resolving; finish(); await committing; expect(await s.savedId(await response, 200)).toBe(id); }
    finally { finish(); await committing; await response.catch(() => undefined); seam.mockRestore(); deletion.mockRestore(); }
    expect(deletedBeforeCommit).toBe(false);
    const updated = await s.detail(id);
    expect(updated.title).toBe('Acknowledgement lost'); expect((await s.bytesAt(updated.imageUrl))?.equals(jpeg(80))).toBe(true);
    expect(await s.stored(rows[0].objectKey)).toBe(false); expect(await s.orphans(uploaded)).toBe(0);
    expect((await attemptFor(key))?.state).toBe('completed');
    expect(await s.savedId(await patch(id, metadata, photos, { key }), 200)).toBe(id);
  }, 90_000);

  it('serializes two concurrent updates of one recipe so that one of them wins entirely', async () => {
    const { id, value, rows } = await seed(); const uploaded = s.uploadedKeys();
    const [a, b, ...rest] = unchanged(value).instructions;
    const first: UpdateRecipeMetadata = { ...unchanged(value), title: 'First writer', cover: 'replace', categories: ['Breakfast'],
      ingredients: [{ name: `${s.name} oats`, quantity: 1, unit: 'cup' }], instructions: [{ ...a, image: 'replace' }, { ...b, image: 'remove' }, ...rest] };
    const second: UpdateRecipeMetadata = { ...unchanged(value), title: 'Second writer', cover: 'replace', categories: ['Desserts'],
      ingredients: [{ name: `${s.name} cocoa`, quantity: 2, unit: 'tbsp' }], instructions: [{ ...a, image: 'remove' }, { ...b, image: 'replace' }, ...rest] };
    const service = s.app.get(RecipeUpdateService);
    const requests = [serviceRequest(first, [{ field: 'cover', bytes: jpeg(91) }, { field: 'step-0', bytes: jpeg(93) }]),
      serviceRequest(second, [{ field: 'cover', bytes: jpeg(92) }, { field: 'step-1', bytes: jpeg(94) }])];
    const results = await Promise.all(requests.map((request) => service.update(id, request)));
    await Promise.all(requests.map((request) => request.writeSettled));
    expect(results).toEqual([{ id, replay: false }, { id, replay: false }]);
    const final = await s.detail(id);
    const images = await Promise.all([final.imageUrl, final.instructions[0].imageUrl, final.instructions[1].imageUrl].map((url) => s.bytesAt(url)));
    const view = { title: final.title, categories: final.categories, ingredients: final.ingredients.map(({ name }) => name), images: images.map((bytes) => bytes?.at(6) ?? null) };
    expect([
      { title: 'First writer', categories: ['Breakfast'], ingredients: [`${s.name} oats`], images: [91, 93, null] },
      { title: 'Second writer', categories: ['Desserts'], ingredients: [`${s.name} cocoa`], images: [92, null, 94] },
    ]).toContainEqual(view);
    // Step C's kept photo survives both writers; every other original and the loser's uploads are gone.
    expect((await s.bytesAt(final.instructions[2].imageUrl))?.equals(jpeg(13))).toBe(true);
    const remaining = await s.imageRows(id);
    expect(remaining).toHaveLength(3); expect(await s.orphans(uploaded)).toBe(0);
    const kept = new Set(remaining.map(({ objectKey }) => objectKey));
    for (const row of rows.filter(({ objectKey }) => !kept.has(objectKey))) expect(await s.stored(row.objectKey)).toBe(false);
    expect(await s.db.$count(recipeWriteAttempts, eq(recipeWriteAttempts.recipeId, id))).toBe(3);
    // Through HTTP the per-user upload slot admits one at a time; whatever is admitted still leaves one whole recipe.
    const current = await s.detail(id);
    const responses = await Promise.all(['Third writer', 'Fourth writer'].map((title) => patch(id, { ...unchanged(current), title })));
    expect(responses.some((response) => response.status === 200)).toBe(true);
    for (const response of responses) if (response.status === 200) await s.savedId(response, 200); else await s.expectError(response, 409, 'IDEMPOTENCY_IN_PROGRESS');
    expect(['Third writer', 'Fourth writer']).toContain((await s.detail(id)).title);
  }, 120_000);

  it('routes a JSON PATCH to the 415 guard and applies the per-user write limit', async () => {
    const { id, value } = await seed(); const before = await snapshot(id);
    for (const body of ['{broken JSON', 'x'.repeat(9 * 1024)]) {
      const response = await fetch(`${s.baseUrl}/recipes/${id}`, { method: 'PATCH', body, headers: {
        Cookie: s.owner.cookie, Origin: TEST_ORIGIN, 'Idempotency-Key': randomUUID(), 'Content-Type': 'application/json' } });
      await s.expectError(response, 415, 'UNSUPPORTED_MEDIA_TYPE');
    }
    await s.fillLimit('recipe-write', s.owner.user.id, RECIPE_WRITE_LIMIT);
    const limited = await patch(id, { ...unchanged(value), title: 'Limited' });
    await s.expectError(limited, 429, 'RATE_LIMITED'); expect(Number(limited.headers.get('retry-after')) > 0).toBe(true);
    expect(await snapshot(id) === before).toBe(true);
  }, 60_000);
});
