import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { apiErrorEnvelopeSchema } from '@recipe-app/contracts/schemas';
import type { CreateRecipeMetadata, RecipeDetail, UpdateRecipeMetadata } from '@recipe-app/contracts/types';
import { pendingPhotos, recipes, recipeWriteAttempts } from '../../src/database/schema.js';
import { PENDING_PHOTO_UPLOAD_LIMIT } from '../../src/recipes/pending-photos.js';
import { RecipeWriteHook } from '../../src/recipes/recipe-write-hook.js';
import { TEST_ORIGIN } from '../auth-harness.js';
import { rawRecipeRequest } from '../recipe-http.js';
import { jpeg, minimalRecipe, openRecipeSuite, storedPhoto } from '../recipe-suite.js';
import type { RecipeSuite } from '../recipe-suite.js';

describe('Pending photos HTTP', () => {
  let s: RecipeSuite;
  beforeAll(async () => { s = await openRecipeSuite(); }, 60_000);
  beforeEach(() => s.resetLimits());
  afterAll(() => s?.close(), 60_000);

  const withCover = (pendingPhotoId: string): CreateRecipeMetadata => ({ ...minimalRecipe(`${s.name} salt`), cover: { pendingPhotoId } });
  const ownedPendingPhotos = () => s.db.$count(pendingPhotos, eq(pendingPhotos.userId, s.owner.user.id));
  const ownedRecipes = () => s.db.$count(recipes, eq(recipes.userId, s.owner.user.id));
  const unchanged = (value: RecipeDetail): UpdateRecipeMetadata => ({ title: value.title, description: value.description, categoryIds: value.categories.map(({ id }) => id),
    servings: value.servings, prepTimeMinutes: value.prepTimeMinutes, cookTimeMinutes: value.cookTimeMinutes, videoUrl: value.videoUrl, notes: value.notes,
    ingredients: value.ingredients.map(({ name, quantity, unit, heading }) => ({ name, quantity, unit, heading })), cover: 'keep',
    instructions: value.instructions.map(({ id, description, heading }) => ({ id, description, heading, image: 'keep' })) });

  describe('upload', () => {
    it('stores the photo re-encoded as WebP, as a Pending photo owned by the uploader', async () => {
      const id = await s.pendingPhoto(jpeg(40));
      const row = await s.pendingRow(id);
      expect(row?.userId).toBe(s.owner.user.id);
      expect(Math.abs(row!.createdAt.getTime() - Date.now())).toBeLessThan(60_000);
      expect(await s.photoAt(await s.storage.signedDownloadUrl(row!.objectKey))).toEqual(storedPhoto(40));
    }, 30_000);

    it.each([
      ['no session', { cookie: null }, 401, 'UNAUTHENTICATED'],
      ['an untrusted origin', { origin: 'https://hostile.example.invalid' }, 403, 'ORIGIN_REJECTED'],
      ['no origin', { origin: null }, 403, 'ORIGIN_REJECTED'],
    ] as const)('refuses an upload with %s and stores nothing', async (_name, options, status, code) => {
      const calls = s.upload.mock.calls.length; const before = await ownedPendingPhotos();
      await s.expectError(await s.uploadPhoto(jpeg(41), options), status, code);
      expect([s.upload.mock.calls.length, await ownedPendingPhotos()]).toEqual([calls, before]);
    }, 30_000);

    it('counts uploads against their own per-Account rate limit', async () => {
      await s.fillLimit('recipe-photo', s.owner.user.id, PENDING_PHOTO_UPLOAD_LIMIT);
      const response = await s.uploadPhoto(jpeg(42));
      await s.expectError(response, 429, 'RATE_LIMITED');
      expect(Number(response.headers.get('retry-after')) > 0).toBe(true);
    }, 30_000);

    it.each([
      ['a photo over 4 MiB', Buffer.alloc(4 * 1024 * 1024 + 1), 'image/jpeg', 'photo', 413, 'PAYLOAD_TOO_LARGE'],
      ['an unsupported type', jpeg(43), 'image/gif', 'photo', 415, 'UNSUPPORTED_MEDIA_TYPE'],
      ['bytes that do not match their type', jpeg(43), 'image/png', 'photo', 400, 'VALIDATION_FAILED'],
      ['an undecodable JPEG', Buffer.concat([Buffer.from([255, 216, 255]), Buffer.alloc(64, 7)]), 'image/jpeg', 'photo', 400, 'VALIDATION_FAILED'],
      ['an empty file', Buffer.alloc(0), 'image/jpeg', 'photo', 400, 'VALIDATION_FAILED'],
      ['another field name', jpeg(43), 'image/jpeg', 'cover', 400, 'VALIDATION_FAILED'],
    ] as const)('rejects %s without storing anything', async (_name, bytes, mime, field, status, code) => {
      const calls = s.upload.mock.calls.length; const before = await ownedPendingPhotos();
      await s.expectError(await s.uploadPhoto(bytes, { mime, field }), status, code, field);
      expect([s.upload.mock.calls.length, await ownedPendingPhotos()]).toEqual([calls, before]);
    }, 30_000);

    it('refuses a body declared larger than one photo before reading it, and any body that is not multipart', async () => {
      const headers = { Cookie: s.owner.cookie, Origin: TEST_ORIGIN, 'Content-Type': 'multipart/form-data; boundary=verification-boundary' };
      const early = await rawRecipeRequest(`${s.baseUrl}/pending-photos`, { ...headers, 'Content-Length': String(4_259_840 + 1) });
      expect(early.status).toBe(413); expect(apiErrorEnvelopeSchema.parse(JSON.parse(early.body)).code).toBe('PAYLOAD_TOO_LARGE');
      const json = await fetch(`${s.baseUrl}/pending-photos`, { method: 'POST', body: '{broken JSON', headers: { ...headers, 'Content-Type': 'application/json' } });
      await s.expectError(json, 415, 'UNSUPPORTED_MEDIA_TYPE');
      const two = new FormData();
      for (const marker of [44, 45]) two.append('photo', new Blob([new Uint8Array(jpeg(marker))], { type: 'image/jpeg' }), 'client-name.jpg');
      await s.expectError(await fetch(`${s.baseUrl}/pending-photos`, { method: 'POST', body: two, headers: { Cookie: s.owner.cookie, Origin: TEST_ORIGIN } }), 400, 'VALIDATION_FAILED');
    }, 30_000);
  });

  describe('saving a cover named as a Pending photo', () => {
    it('creates the recipe with that photo as its cover and leaves it no longer pending', async () => {
      const pendingPhotoId = await s.pendingPhoto(jpeg(50)); const { objectKey } = (await s.pendingRow(pendingPhotoId))!;
      const key = randomUUID();
      const id = await s.savedId(await s.send('/recipes', withCover(pendingPhotoId), [], { key }), 201);
      expect(await s.photoAt((await s.detail(id)).imageUrl)).toEqual(storedPhoto(50));
      expect((await s.imageRows(id)).map((row) => [row.objectKey, row.sortOrder])).toEqual([[objectKey, 0]]);
      expect(await s.pendingRow(pendingPhotoId)).toBeUndefined();
      // The attempt records only objects the save uploaded itself, so its cleanup can never delete the Pending photo.
      expect((await s.db.query.recipeWriteAttempts.findFirst({ where: eq(recipeWriteAttempts.idempotencyKey, key) }))?.objectKeys).toEqual([]);
    }, 60_000);

    it('takes effect once when retried with the same key and Pending photo', async () => {
      const pendingPhotoId = await s.pendingPhoto(jpeg(51)); const key = randomUUID(); const before = await ownedRecipes();
      const id = await s.savedId(await s.send('/recipes', withCover(pendingPhotoId), [], { key }), 201);
      expect(await s.savedId(await s.send('/recipes', withCover(pendingPhotoId), [], { key }), 200)).toBe(id);
      expect(await ownedRecipes()).toBe(before + 1);
      expect(await s.photoAt((await s.detail(id)).imageUrl)).toEqual(storedPhoto(51));
    }, 60_000);

    it.each([
      ['another Account', async () => s.pendingPhoto(jpeg(52), s.other.cookie)],
      ['an expired', async () => {
        const id = await s.pendingPhoto(jpeg(53));
        await s.db.update(pendingPhotos).set({ createdAt: sql`now() - interval '24 hours 1 minute'` }).where(eq(pendingPhotos.id, id));
        return id;
      }],
      ['an unknown', async () => randomUUID()],
      ['an already used', async () => {
        const id = await s.pendingPhoto(jpeg(54));
        await s.savedId(await s.send('/recipes', withCover(id)), 201);
        return id;
      }],
    ])('rejects the Pending photo of %s Account on the cover and saves nothing', async (_name, prepare) => {
      const pendingPhotoId = await prepare(); const key = randomUUID(); const before = await ownedRecipes(); const calls = s.upload.mock.calls.length;
      await s.expectError(await s.send('/recipes', withCover(pendingPhotoId), [], { key }), 400, 'VALIDATION_FAILED', 'cover');
      expect([await ownedRecipes(), s.upload.mock.calls.length]).toEqual([before, calls]);
      expect(await s.db.$count(recipeWriteAttempts, eq(recipeWriteAttempts.idempotencyKey, key))).toBe(0);
    }, 60_000);

    it('keeps the Pending photo after a save that rolls back, so a retry can use it', async () => {
      const pendingPhotoId = await s.pendingPhoto(jpeg(56)); const { objectKey } = (await s.pendingRow(pendingPhotoId))!;
      const hook = vi.spyOn(s.app.get(RecipeWriteHook), 'beforeComplete').mockRejectedValueOnce(new Error('forced rollback'));
      const metadata = { ...withCover(pendingPhotoId), instructions: [{ description: 'Mix.', hasImage: true }] };
      await s.expectError(await s.send('/recipes', metadata, [{ field: 'step-0', bytes: jpeg(57) }]), 503, 'SERVICE_UNAVAILABLE');
      hook.mockRestore();
      expect((await s.pendingRow(pendingPhotoId))?.objectKey).toBe(objectKey);
      expect(await s.stored(objectKey)).toBe(true);
      const id = await s.savedId(await s.send('/recipes', metadata, [{ field: 'step-0', bytes: jpeg(57) }]), 201);
      const value = await s.detail(id);
      // Step photos keep travelling in the multipart save beside a Pending cover.
      expect([await s.photoAt(value.imageUrl), await s.photoAt(value.instructions[0].imageUrl)]).toEqual([storedPhoto(56), storedPhoto(57)]);
    }, 60_000);

    it('rejects a cover file sent beside a cover named as a Pending photo', async () => {
      const pendingPhotoId = await s.pendingPhoto(jpeg(58));
      await s.expectError(await s.send('/recipes', withCover(pendingPhotoId), [{ field: 'cover', bytes: jpeg(59) }]), 400, 'VALIDATION_FAILED', 'cover');
      expect(await s.pendingRow(pendingPhotoId)).toBeDefined();
    }, 60_000);

    it('replaces the cover while editing and removes the replaced photo from storage', async () => {
      const id = await s.savedId(await s.send('/recipes', minimalRecipe(`${s.name} pepper`), [{ field: 'cover', bytes: jpeg(60) }]), 201);
      const [oldCover] = await s.imageRows(id);
      const pendingPhotoId = await s.pendingPhoto(jpeg(61)); const { objectKey } = (await s.pendingRow(pendingPhotoId))!;
      const metadata: UpdateRecipeMetadata = { ...unchanged(await s.detail(id)), cover: { pendingPhotoId } };
      const key = randomUUID();
      expect(await s.savedId(await s.send(`/recipes/${id}`, metadata, [], { method: 'PATCH', key }), 200)).toBe(id);
      expect(await s.savedId(await s.send(`/recipes/${id}`, metadata, [], { method: 'PATCH', key }), 200)).toBe(id);
      expect(await s.photoAt((await s.detail(id)).imageUrl)).toEqual(storedPhoto(61));
      expect((await s.imageRows(id)).map((row) => [row.objectKey, row.sortOrder])).toEqual([[objectKey, 0]]);
      expect(await s.pendingRow(pendingPhotoId)).toBeUndefined();
      await expect.poll(() => s.stored(oldCover.objectKey), { timeout: 20_000 }).toBe(false);
    }, 60_000);

    it('rejects another Account\'s Pending photo on an edited cover and keeps the recipe as it was', async () => {
      const id = await s.savedId(await s.send('/recipes', minimalRecipe(`${s.name} thyme`), [{ field: 'cover', bytes: jpeg(62) }]), 201);
      const pendingPhotoId = await s.pendingPhoto(jpeg(63), s.other.cookie);
      const metadata: UpdateRecipeMetadata = { ...unchanged(await s.detail(id)), cover: { pendingPhotoId } };
      await s.expectError(await s.send(`/recipes/${id}`, metadata, [], { method: 'PATCH' }), 400, 'VALIDATION_FAILED', 'cover');
      expect(await s.photoAt((await s.detail(id)).imageUrl)).toEqual(storedPhoto(62));
      expect((await s.pendingRow(pendingPhotoId))?.userId).toBe(s.other.user.id);
    }, 60_000);
  });
});
