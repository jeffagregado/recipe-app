import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { apiErrorEnvelopeSchema } from '@recipe-app/contracts/schemas';
import type { CreateRecipeMetadata, RecipeDetail, UpdateRecipeMetadata } from '@recipe-app/contracts/types';
import { pendingPhotos, recipes, recipeWriteAttempts } from '../../src/database/schema.js';
import { PENDING_PHOTO_UPLOAD_LIMIT, PendingPhotoSweep, reconcilePendingPhotos } from '../../src/recipes/pending-photos.js';
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

  /** Older than any other Pending photo, so the next sweep, which takes the oldest first, includes it. */
  async function expired(marker: number) {
    const id = await s.pendingPhoto(jpeg(marker));
    const [row] = await s.db.update(pendingPhotos).set({ createdAt: sql`timestamptz '2000-01-01 00:00:00+00'` }).where(eq(pendingPhotos.id, id)).returning();
    return row;
  }

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

  describe('the 60 unexpired Pending photos an Account may hold', () => {
    const unexpired = sql`${pendingPhotos.createdAt} > now() - interval '24 hours'`;
    /** Rows only, standing in for photos uploaded earlier; `age` back-dates them. Removed again after each test. */
    let filler: string[] = [];
    async function fill(count: number, age = sql`interval '0 seconds'`) {
      const rows = Array.from({ length: count }, () => { const id = randomUUID(); return { id, userId: s.owner.user.id, objectKey: `photos/${id}.webp`, createdAt: sql`now() - ${age}` }; });
      if (rows.length) await s.db.insert(pendingPhotos).values(rows);
      filler.push(...rows.map(({ id }) => id));
    }
    const toLimit = async () => 60 - await s.db.$count(pendingPhotos, and(eq(pendingPhotos.userId, s.owner.user.id), unexpired));
    afterEach(async () => { if (filler.length) await s.db.delete(pendingPhotos).where(inArray(pendingPhotos.id, filler)); filler = []; });

    it('refuses an upload beyond 60 before reading it, asking to save or wait, and stores nothing', async () => {
      await fill(await toLimit());
      const calls = s.upload.mock.calls.length;
      const response = await s.uploadPhoto(jpeg(90));
      expect(response.status).toBe(409);
      expect(apiErrorEnvelopeSchema.parse(await response.json())).toEqual({ code: 'PENDING_PHOTO_LIMIT', message: 'Too many photos are waiting to be saved. Save the recipe first, or try again tomorrow.' });
      expect([s.upload.mock.calls.length, await toLimit()]).toEqual([calls, 0]);
    }, 30_000);

    it('does not count expired Pending photos', async () => {
      await fill(1, sql`interval '24 hours 1 minute'`);
      await fill(await toLimit() - 1);
      await s.pendingPhoto(jpeg(91));
      expect(await toLimit()).toBe(0);
    }, 30_000);

    it('lets only one of two uploads through when one place is left', async () => {
      await fill(await toLimit() - 1);
      const responses = await Promise.all([s.uploadPhoto(jpeg(92)), s.uploadPhoto(jpeg(93))]);
      expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
      expect(await toLimit()).toBe(0);
    }, 30_000);
  });

  describe('expiry', () => {
    it('deletes an expired Pending photo and its stored photo when any photo is uploaded', async () => {
      const old = await expired(94);
      const fresh = await s.pendingPhoto(jpeg(95));
      // Another process's upload may sweep it first; either way the Pending photo is gone.
      await expect.poll(async () => [await s.pendingRow(old.id), await s.stored(old.objectKey)], { timeout: 20_000 }).toEqual([undefined, false]);
      expect((await s.pendingRow(fresh))?.userId).toBe(s.owner.user.id);
    }, 60_000);

    it('still answers the upload when deleting an expired photo fails, and leaves that photo to reconciliation', async () => {
      const id = await s.pendingPhoto(jpeg(96)); const { objectKey } = (await s.pendingRow(id))!;
      // Other processes on the shared Neon branch sweep too. The row stays unexpired in database time, so none of them can take
      // it; only this process's sweep, narrowed to this photo with no lifetime, counts it as expired.
      const scope = vi.spyOn(s.app.get(PendingPhotoSweep), 'scope').mockReturnValue({ objectKeys: [objectKey], lifetimeMs: 0 });
      const deletion = vi.spyOn(s.storage, 'deleteObject').mockRejectedValue(new Error('storage down'));
      try {
        await s.pendingPhoto(jpeg(97));
        // The sweep deletes the row before the photo.
        await expect.poll(() => deletion.mock.calls.some(([key]) => key === objectKey), { timeout: 20_000 }).toBe(true);
      } finally { deletion.mockRestore(); scope.mockRestore(); }
      expect([await s.pendingRow(id), await s.stored(objectKey)]).toEqual([undefined, true]);
    }, 60_000);
  });

  describe('reconciliation', () => {
    it('deletes expired Pending photos with their stored photos', async () => {
      const id = await s.pendingPhoto(jpeg(98)); const { objectKey } = (await s.pendingRow(id))!;
      // Unexpired in database time, so no upload's sweep in another process can take it first.
      expect(await reconcilePendingPhotos(s.db, s.storage, { now: new Date(), objectKeys: [objectKey], lifetimeMs: 0 })).toEqual({ expired: 1, orphans: 0, failed: 0 });
      expect([await s.pendingRow(id), await s.stored(objectKey)]).toEqual([undefined, false]);
    }, 60_000);

    it('deletes a stored photo no row names once it is old enough, and keeps Pending and saved photos', async () => {
      const orphan = await s.pendingPhoto(jpeg(99)); const { objectKey: orphanKey } = (await s.pendingRow(orphan))!;
      // As after a failed row insert, or a deleted Account.
      await s.db.delete(pendingPhotos).where(eq(pendingPhotos.id, orphan));
      const kept = await s.pendingPhoto(jpeg(100)); const { objectKey: keptKey } = (await s.pendingRow(kept))!;
      const used = await s.pendingPhoto(jpeg(101)); const { objectKey: savedKey } = (await s.pendingRow(used))!;
      await s.savedId(await s.send('/recipes', withCover(used)), 201);
      const objectKeys = [orphanKey, keptKey, savedKey];
      // An upload may still be writing the row of a photo stored moments ago.
      expect(await reconcilePendingPhotos(s.db, s.storage, { now: new Date(), objectKeys })).toEqual({ expired: 0, orphans: 0, failed: 0 });
      expect(await reconcilePendingPhotos(s.db, s.storage, { now: new Date(), ageMs: 0, objectKeys })).toEqual({ expired: 0, orphans: 1, failed: 0 });
      expect(await Promise.all(objectKeys.map(s.stored))).toEqual([false, true, true]);
    }, 60_000);
  });

  describe('delete', () => {
    it('deletes the uploader\'s own Pending photo and its stored photo', async () => {
      const id = await s.pendingPhoto(jpeg(46)); const { objectKey } = (await s.pendingRow(id))!;
      await s.expectEmpty(await s.call('DELETE', `/pending-photos/${id}`));
      expect([await s.pendingRow(id), await s.stored(objectKey)]).toEqual([undefined, false]);
    }, 30_000);

    it.each([
      ['another Account\'s', async () => s.pendingPhoto(jpeg(47), s.other.cookie)],
      ['an unknown', async () => randomUUID()],
      ['a malformed', async () => 'not-a-pending-photo'],
    ])('answers %s Pending photo the same way and deletes nothing', async (_name, prepare) => {
      const id = await prepare(); const row = await s.pendingRow(id);
      await s.expectEmpty(await s.call('DELETE', `/pending-photos/${id}`));
      expect(await s.pendingRow(id)).toEqual(row);
      if (row) expect(await s.stored(row.objectKey)).toBe(true);
    }, 30_000);

    it('keeps a Pending photo a save has already used', async () => {
      const id = await s.pendingPhoto(jpeg(48));
      const recipeId = await s.savedId(await s.send('/recipes', withCover(id)), 201);
      await s.expectEmpty(await s.call('DELETE', `/pending-photos/${id}`));
      expect(await s.photoAt((await s.detail(recipeId)).imageUrl)).toEqual(storedPhoto(48));
    }, 60_000);

    it.each([
      ['no session', { cookie: null }, 401, 'UNAUTHENTICATED'],
      ['an untrusted origin', { origin: 'https://hostile.example.invalid' }, 403, 'ORIGIN_REJECTED'],
    ] as const)('refuses a delete with %s and keeps the Pending photo', async (_name, options, status, code) => {
      const id = await s.pendingPhoto(jpeg(49));
      await s.expectError(await s.call('DELETE', `/pending-photos/${id}`, options), status, code);
      expect((await s.pendingRow(id))?.userId).toBe(s.owner.user.id);
    }, 30_000);
  });

  describe('saving a cover named as a Pending photo', () => {
    it('creates the recipe with that photo as its cover and leaves it no longer pending', async () => {
      const pendingPhotoId = await s.pendingPhoto(jpeg(50)); const { objectKey } = (await s.pendingRow(pendingPhotoId))!;
      const key = randomUUID();
      const id = await s.savedId(await s.send('/recipes', withCover(pendingPhotoId), { key }), 201);
      expect(await s.photoAt((await s.detail(id)).imageUrl)).toEqual(storedPhoto(50));
      expect((await s.imageRows(id)).map((row) => [row.objectKey, row.sortOrder])).toEqual([[objectKey, 0]]);
      expect(await s.pendingRow(pendingPhotoId)).toBeUndefined();
      // A save stores no objects of its own, so its attempt records none and its cleanup can never delete the Pending photo.
      expect((await s.db.query.recipeWriteAttempts.findFirst({ where: eq(recipeWriteAttempts.idempotencyKey, key) }))?.objectKeys).toEqual([]);
    }, 60_000);

    it('takes effect once when retried with the same key and Pending photo', async () => {
      const pendingPhotoId = await s.pendingPhoto(jpeg(51)); const key = randomUUID(); const before = await ownedRecipes();
      const id = await s.savedId(await s.send('/recipes', withCover(pendingPhotoId), { key }), 201);
      expect(await s.savedId(await s.send('/recipes', withCover(pendingPhotoId), { key }), 200)).toBe(id);
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
      await s.expectError(await s.send('/recipes', withCover(pendingPhotoId), { key }), 400, 'VALIDATION_FAILED', 'cover');
      expect([await ownedRecipes(), s.upload.mock.calls.length]).toEqual([before, calls]);
      expect(await s.db.$count(recipeWriteAttempts, eq(recipeWriteAttempts.idempotencyKey, key))).toBe(0);
    }, 60_000);

    it('keeps the Pending photo after a save that rolls back, so a retry can use it', async () => {
      const pendingPhotoId = await s.pendingPhoto(jpeg(56)); const { objectKey } = (await s.pendingRow(pendingPhotoId))!;
      const hook = vi.spyOn(s.app.get(RecipeWriteHook), 'beforeComplete').mockRejectedValueOnce(new Error('forced rollback'));
      const metadata = await s.withPendingPhotos(withCover(pendingPhotoId), [{ field: 'step-0', bytes: jpeg(57) }]);
      await s.expectError(await s.send('/recipes', metadata), 503, 'SERVICE_UNAVAILABLE');
      hook.mockRestore();
      expect((await s.pendingRow(pendingPhotoId))?.objectKey).toBe(objectKey);
      expect(await s.stored(objectKey)).toBe(true);
      const id = await s.savedId(await s.send('/recipes', metadata), 201);
      const value = await s.detail(id);
      expect([await s.photoAt(value.imageUrl), await s.photoAt(value.instructions[0].imageUrl)]).toEqual([storedPhoto(56), storedPhoto(57)]);
    }, 60_000);

    it('replaces the cover while editing and removes the replaced photo from storage', async () => {
      const id = await s.savedId(await s.send('/recipes', await s.withPendingPhotos(minimalRecipe(`${s.name} pepper`), [{ field: 'cover', bytes: jpeg(60) }])), 201);
      const [oldCover] = await s.imageRows(id);
      const pendingPhotoId = await s.pendingPhoto(jpeg(61)); const { objectKey } = (await s.pendingRow(pendingPhotoId))!;
      const metadata: UpdateRecipeMetadata = { ...unchanged(await s.detail(id)), cover: { pendingPhotoId } };
      const key = randomUUID();
      expect(await s.savedId(await s.send(`/recipes/${id}`, metadata, { method: 'PATCH', key }), 200)).toBe(id);
      expect(await s.savedId(await s.send(`/recipes/${id}`, metadata, { method: 'PATCH', key }), 200)).toBe(id);
      expect(await s.photoAt((await s.detail(id)).imageUrl)).toEqual(storedPhoto(61));
      expect((await s.imageRows(id)).map((row) => [row.objectKey, row.sortOrder])).toEqual([[objectKey, 0]]);
      expect(await s.pendingRow(pendingPhotoId)).toBeUndefined();
      await expect.poll(() => s.stored(oldCover.objectKey), { timeout: 20_000 }).toBe(false);
    }, 60_000);

    it('rejects another Account\'s Pending photo on an edited cover and keeps the recipe as it was', async () => {
      const id = await s.savedId(await s.send('/recipes', await s.withPendingPhotos(minimalRecipe(`${s.name} thyme`), [{ field: 'cover', bytes: jpeg(62) }])), 201);
      const pendingPhotoId = await s.pendingPhoto(jpeg(63), s.other.cookie);
      const metadata: UpdateRecipeMetadata = { ...unchanged(await s.detail(id)), cover: { pendingPhotoId } };
      await s.expectError(await s.send(`/recipes/${id}`, metadata, { method: 'PATCH' }), 400, 'VALIDATION_FAILED', 'cover');
      expect(await s.photoAt((await s.detail(id)).imageUrl)).toEqual(storedPhoto(62));
      expect((await s.pendingRow(pendingPhotoId))?.userId).toBe(s.other.user.id);
    }, 60_000);
  });

  describe('saving step photos named as Pending photos', () => {
    const steps = (...ids: string[]) => ids.map((pendingPhotoId, index) => ({ description: `Step ${index + 1}.`, image: { pendingPhotoId } }));

    it('creates the recipe with Pending photos on its steps, each step showing its own photo', async () => {
      const [cover, first, third, last] = [await s.pendingPhoto(jpeg(70)), await s.pendingPhoto(jpeg(71)), await s.pendingPhoto(jpeg(72)), await s.pendingPhoto(jpeg(73))];
      const metadata: CreateRecipeMetadata = { ...withCover(cover), instructions: [
        { description: 'Chop.', image: { pendingPhotoId: first } }, { description: 'Rest.' },
        { description: 'Fry.', image: { pendingPhotoId: third } }, { description: 'Serve.', image: { pendingPhotoId: last } },
      ] };
      const key = randomUUID(); const before = await ownedRecipes(); const uploads = s.upload.mock.calls.length;
      const id = await s.savedId(await s.send('/recipes', metadata, { key }), 201);
      const value = await s.detail(id);
      expect(await Promise.all([value.imageUrl, ...value.instructions.map((step) => step.imageUrl)].map((url) => url && s.photoAt(url))))
        .toEqual([storedPhoto(70), storedPhoto(71), null, storedPhoto(72), storedPhoto(73)]);
      expect((await s.imageRows(id)).map((row) => row.sortOrder)).toEqual([0, 1, 2, 3]);
      expect(await Promise.all([cover, first, third, last].map(s.pendingRow))).toEqual([undefined, undefined, undefined, undefined]);
      // Retried with the same key and Pending photos, the save takes effect once; neither save stores a photo.
      expect(await s.savedId(await s.send('/recipes', metadata, { key }), 200)).toBe(id);
      expect([await ownedRecipes(), s.upload.mock.calls.length]).toEqual([before + 1, uploads]);
    }, 60_000);

    it.each([
      ["another Account's Pending photo", async () => s.pendingPhoto(jpeg(74), s.other.cookie)],
      ['an expired Pending photo', async () => {
        const id = await s.pendingPhoto(jpeg(75));
        await s.db.update(pendingPhotos).set({ createdAt: sql`now() - interval '24 hours 1 minute'` }).where(eq(pendingPhotos.id, id));
        return id;
      }],
    ])('rejects %s on a step and saves nothing', async (_name, prepare) => {
      const usable = await s.pendingPhoto(jpeg(76)); const refused = await prepare(); const before = await ownedRecipes();
      const metadata: CreateRecipeMetadata = { ...minimalRecipe(`${s.name} sage`), instructions: steps(usable, refused) };
      await s.expectError(await s.send('/recipes', metadata), 400, 'VALIDATION_FAILED', 'step-1');
      expect(await ownedRecipes()).toBe(before);
      expect((await s.pendingRow(usable))?.userId).toBe(s.owner.user.id);
    }, 60_000);

    it('replaces one step photo while editing, keeps the others without sending them, and removes the replaced photo from storage', async () => {
      const created: CreateRecipeMetadata = { ...minimalRecipe(`${s.name} basil`), instructions: [{ description: 'Chop.' }, { description: 'Fry.' }] };
      const id = await s.savedId(await s.send('/recipes', await s.withPendingPhotos(created, [{ field: 'step-0', bytes: jpeg(77) }, { field: 'step-1', bytes: jpeg(78) }])), 201);
      const before = await s.imageRows(id);
      const replaced = before.find((row) => row.sortOrder === 2)!;
      const pendingPhotoId = await s.pendingPhoto(jpeg(79)); const { objectKey } = (await s.pendingRow(pendingPhotoId))!;
      const current = unchanged(await s.detail(id));
      const metadata: UpdateRecipeMetadata = { ...current, instructions: current.instructions.map((step, index) => (index === 1 ? { ...step, image: { pendingPhotoId } } : step)) };
      const key = randomUUID(); const uploads = s.upload.mock.calls.length;
      expect(await s.savedId(await s.send(`/recipes/${id}`, metadata, { method: 'PATCH', key }), 200)).toBe(id);
      expect(await s.savedId(await s.send(`/recipes/${id}`, metadata, { method: 'PATCH', key }), 200)).toBe(id);
      // Nothing was uploaded by the saves: the kept photo is referenced, the new one was already stored as a Pending photo.
      expect(s.upload.mock.calls.length).toBe(uploads);
      const value = await s.detail(id);
      expect([await s.photoAt(value.instructions[0].imageUrl), await s.photoAt(value.instructions[1].imageUrl)]).toEqual([storedPhoto(77), storedPhoto(79)]);
      expect((await s.imageRows(id)).map((row) => row.objectKey)).toEqual([before.find((row) => row.sortOrder === 1)!.objectKey, objectKey]);
      expect(await s.pendingRow(pendingPhotoId)).toBeUndefined();
      await expect.poll(() => s.stored(replaced.objectKey), { timeout: 20_000 }).toBe(false);
    }, 60_000);

    it('rejects an expired Pending photo on an edited step and keeps the recipe as it was', async () => {
      const created: CreateRecipeMetadata = { ...minimalRecipe(`${s.name} dill`), instructions: [{ description: 'Chop.' }] };
      const id = await s.savedId(await s.send('/recipes', await s.withPendingPhotos(created, [{ field: 'step-0', bytes: jpeg(80) }])), 201);
      const pendingPhotoId = await s.pendingPhoto(jpeg(81));
      await s.db.update(pendingPhotos).set({ createdAt: sql`now() - interval '24 hours 1 minute'` }).where(eq(pendingPhotos.id, pendingPhotoId));
      const current = unchanged(await s.detail(id));
      const metadata: UpdateRecipeMetadata = { ...current, instructions: [{ ...current.instructions[0], image: { pendingPhotoId } }] };
      await s.expectError(await s.send(`/recipes/${id}`, metadata, { method: 'PATCH' }), 400, 'VALIDATION_FAILED', 'step-0');
      expect(await s.photoAt((await s.detail(id)).instructions[0].imageUrl)).toEqual(storedPhoto(80));
    }, 60_000);
  });
});
