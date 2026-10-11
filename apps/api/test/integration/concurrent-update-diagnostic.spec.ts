// [DEBUG-f3a1] Temporary diagnostic for issue #10, item 1. It asserts nothing and is removed before the pull request opens.
// It repeats the two-writer scenario of update-recipe.spec.ts and prints, per run, when every transaction and every object
// deletion started and ended, what the API logged, and what the write attempts recorded when the storage check used to run.
// Only labels, class names, status codes and counts are printed: never object keys, URLs or error messages.
import { randomUUID } from 'node:crypto';
import { Logger } from '@nestjs/common';
import { afterAll, beforeAll, beforeEach, describe, it, vi } from 'vitest';
import { and, eq, ne, sql } from 'drizzle-orm';
import type { CreateRecipeMetadata, RecipeDetail, UpdateRecipeMetadata } from '@recipe-app/contracts/types';
import { recipeWriteAttempts } from '../../src/database/schema.js';
import { reconcileRecipeWrites } from '../../src/recipes/recipe-reconcile.js';
import { RecipeUpdateService } from '../../src/recipes/recipe-update.service.js';
import type { RecipeUploadRequest } from '../../src/recipes/recipe-upload.js';
import { jpeg, openRecipeSuite } from '../recipe-suite.js';
import type { Photo, RecipeSuite } from '../recipe-suite.js';

const RUNS = Number(process.env.DIAGNOSTIC_RUNS ?? 12);
const TAG = '[DEBUG-f3a1]';

/** Class names, HTTP statuses and short error codes along the cause chain. */
function describeFailure(start: unknown): string {
  const parts: string[] = []; const seen = new Set<unknown>();
  for (let error = start; error instanceof Error && !seen.has(error); error = error.cause) {
    seen.add(error);
    const fields = error as { code?: unknown; getStatus?: () => number; getResponse?: () => unknown; $metadata?: { httpStatusCode?: number } };
    const code = typeof fields.code === 'string' && /^[A-Z0-9_]{3,40}$/.test(fields.code) ? `:${fields.code}` : '';
    const status = typeof fields.getStatus === 'function' ? `:${fields.getStatus()}` : fields.$metadata?.httpStatusCode ? `:http${fields.$metadata.httpStatusCode}` : '';
    const response = typeof fields.getResponse === 'function' ? fields.getResponse() : undefined;
    const apiCode = typeof response === 'object' && response !== null && 'code' in response && typeof response.code === 'string' ? `:${response.code}` : '';
    const name = /^[A-Za-z][A-Za-z0-9]{0,63}$/.test(error.name) && error.name !== error.constructor.name ? `(${error.name})` : '';
    parts.push(`${error.constructor.name}${name}${status}${apiCode}${code}`);
  }
  return parts.join(' <- ') || 'unknown';
}

describe(`${TAG} concurrent update cleanup timeline`, () => {
  let s: RecipeSuite;
  beforeAll(async () => { s = await openRecipeSuite(); }, 120_000);
  beforeEach(() => s.resetLimits());
  afterAll(async () => {
    try { await s?.close(); } catch (cause) { console.log(`${TAG} teardown failed: ${describeFailure(cause)}`); }
  }, 180_000);

  const base = (): CreateRecipeMetadata => ({ title: 'Base recipe', description: 'Old description', categoryIds: s.categoryIds(['Dinner', 'Lunch']),
    servings: 2, prepTimeMinutes: 5, cookTimeMinutes: 10, videoUrl: 'https://www.youtube.com/watch?v=old', notes: 'Old notes',
    ingredients: [{ name: `${s.name} flour`, quantity: 1, unit: 'cup' }, { name: `${s.name} salt`, quantity: null, unit: null }],
    instructions: ['A', 'B', 'C', 'D'].map((description, index) => ({ description, hasImage: index < 3 })) });
  const basePhotos = [{ field: 'cover', bytes: jpeg(10) }, { field: 'step-0', bytes: jpeg(11) }, { field: 'step-1', bytes: jpeg(12) }, { field: 'step-2', bytes: jpeg(13) }];
  const unchanged = (value: RecipeDetail): UpdateRecipeMetadata => ({ title: value.title, description: value.description, categoryIds: value.categories.map(({ id }) => id),
    servings: value.servings, prepTimeMinutes: value.prepTimeMinutes, cookTimeMinutes: value.cookTimeMinutes, videoUrl: value.videoUrl, notes: value.notes,
    ingredients: value.ingredients.map(({ name, quantity, unit }) => ({ name, quantity, unit })), cover: 'keep',
    instructions: value.instructions.map(({ id, description }) => ({ id, description, image: 'keep' })) });
  const serviceRequest = (metadata: UpdateRecipeMetadata, photos: Photo[]) => ({ headers: {}, user: s.owner.user, idempotencyKey: randomUUID(),
    writeDeadline: Date.now() + 30_000, body: { recipe: JSON.stringify(metadata) },
    files: photos.map((photo) => ({ fieldname: photo.field, mimetype: 'image/jpeg', buffer: photo.bytes })) }) as unknown as RecipeUploadRequest;

  it.each(Array.from({ length: RUNS }, (_, index) => index))('timeline #%i', async (index) => {
    const events: string[] = []; let t0 = Date.now(); const t = () => Date.now() - t0;
    const restore: (() => void)[] = []; let requests: RecipeUploadRequest[] = [];
    try {
      const id = await s.savedId(await s.send('/recipes', base(), basePhotos), 201);
      const value = await s.detail(id); const rows = await s.imageRows(id); const uploaded = s.uploadedKeys();
      const roundTrips: number[] = [];
      for (let probe = 0; probe < 3; probe++) { const at = performance.now(); await s.db.execute(sql`select 1`); roundTrips.push(Math.round(performance.now() - at)); }
      const label = (key: string) => { const original = rows.findIndex((row) => row.objectKey === key); return original >= 0 ? `original${original}` : 'upload'; };

      const deleteObject = s.storage.deleteObject.bind(s.storage);
      const deletion = vi.spyOn(s.storage, 'deleteObject').mockImplementation(async (key) => {
        const started = t();
        try { await deleteObject(key); events.push(`delete ${label(key)} ${started}->${t()} ok`); }
        catch (cause) { events.push(`delete ${label(key)} ${started}->${t()} FAILED ${describeFailure(cause)}`); throw cause; }
      });
      restore.push(() => deletion.mockRestore());
      const transaction = s.db.transaction.bind(s.db) as (...args: unknown[]) => Promise<unknown>;
      const transactions = vi.spyOn(s.db, 'transaction').mockImplementation(((...args: unknown[]) => {
        const started = t();
        return transaction(...args).then(
          (result) => { events.push(`tx ${started}->${t()} ok`); return result; },
          (cause: unknown) => { events.push(`tx ${started}->${t()} THREW ${describeFailure(cause)}`); throw cause; });
      }) as typeof s.db.transaction);
      restore.push(() => transactions.mockRestore());
      // The API's own failure lines carry a static label, a random id, class names and SQLSTATEs only.
      const logged = vi.spyOn(Logger.prototype, 'error');
      restore.push(() => logged.mockRestore());

      const [a, b, ...rest] = unchanged(value).instructions;
      const first: UpdateRecipeMetadata = { ...unchanged(value), title: 'First writer', cover: 'replace', categoryIds: s.categoryIds(['Breakfast']),
        ingredients: [{ name: `${s.name} oats`, quantity: 1, unit: 'cup' }], instructions: [{ ...a, image: 'replace' }, { ...b, image: 'remove' }, ...rest] };
      const second: UpdateRecipeMetadata = { ...unchanged(value), title: 'Second writer', cover: 'replace', categoryIds: s.categoryIds(['Desserts']),
        ingredients: [{ name: `${s.name} cocoa`, quantity: 2, unit: 'tbsp' }], instructions: [{ ...a, image: 'remove' }, { ...b, image: 'replace' }, ...rest] };
      const service = s.app.get(RecipeUpdateService);
      t0 = Date.now();
      requests = [serviceRequest(first, [{ field: 'cover', bytes: jpeg(91) }, { field: 'step-0', bytes: jpeg(93) }]),
        serviceRequest(second, [{ field: 'cover', bytes: jpeg(92) }, { field: 'step-1', bytes: jpeg(94) }])];
      const answers = await Promise.allSettled(requests.map((request, writer) => service.update(id, request).then(
        (result) => { events.push(`writer${writer} answered ${t()}`); return result; },
        (cause: unknown) => { events.push(`writer${writer} REJECTED ${t()} ${describeFailure(cause)}`); throw cause; })));
      await Promise.allSettled(requests.map((request, writer) => request.writeSettled?.then(() => { events.push(`writer${writer} settled ${t()}`); })));

      // The same reads the test makes between the writes settling and its storage checks.
      const final = await s.detail(id);
      await Promise.all([final.imageUrl, final.instructions[0].imageUrl, final.instructions[1].imageUrl].map((url) => s.bytesAt(url)));
      await s.bytesAt(final.instructions[2].imageUrl);
      const remaining = await s.imageRows(id);
      const orphans = await s.orphans(uploaded);
      const kept = new Set(remaining.map(({ objectKey }) => objectKey));
      const replaced = rows.filter(({ objectKey }) => !kept.has(objectKey));
      const checkedAt = t();
      const stillStored: string[] = [];
      for (const row of replaced) if (await s.stored(row.objectKey)) stillStored.push(label(row.objectKey));
      const attempts = await s.db.select({ operation: recipeWriteAttempts.operation, state: recipeWriteAttempts.state, stale: recipeWriteAttempts.staleObjectKeys,
        leaseActive: sql<boolean>`${recipeWriteAttempts.updatedAt} > clock_timestamp()` }).from(recipeWriteAttempts).where(eq(recipeWriteAttempts.recipeId, id));
      const recorded = new Set(attempts.flatMap((attempt) => attempt.stale));
      const unrecorded = replaced.filter(({ objectKey }) => !recorded.has(objectKey)).map(({ objectKey }) => label(objectKey)).filter((name) => stillStored.includes(name));
      const states = attempts.map((attempt) => `${attempt.operation}:${attempt.state}:stale${attempt.stale.length}${attempt.leaseActive ? ':lease' : ''}`).join(' ');
      const verdict = orphans > 0 ? `ORPHANS=${orphans}` : stillStored.length ? `REPLACED_STILL_STORED=${stillStored.join(',')}` : 'clean';

      // Leave nothing behind, and see what reconciliation makes of whatever was left.
      const settleAt = t(); let settled = 'ok';
      const attemptIds = (await s.db.select({ id: recipeWriteAttempts.id }).from(recipeWriteAttempts).where(eq(recipeWriteAttempts.recipeId, id))).map((attempt) => attempt.id);
      try {
        await vi.waitFor(async () => {
          await reconcileRecipeWrites(s.db, s.storage, { now: new Date(), attemptIds });
          const open = await s.db.$count(recipeWriteAttempts, and(eq(recipeWriteAttempts.recipeId, id), ne(recipeWriteAttempts.state, 'completed')));
          if (open) throw new Error('attempts still open');
        }, { timeout: 60_000, interval: 500 });
      } catch { settled = 'TIMED OUT'; }
      const left: string[] = [];
      for (const row of replaced) if (await s.stored(row.objectKey)) left.push(label(row.objectKey));
      const recipeLines = logged.mock.calls.map(([message]) => message).filter((message): message is string => typeof message === 'string' && /^Recipe \w+ failed /.test(message));
      const apiLog = recipeLines.map((message) => message.replace(/\([0-9a-f-]{36}\)/, '')).join(' / ') || 'none';
      console.log(`${TAG} #${index} ${verdict} | answers=${answers.map(({ status }) => status).join(',')} winner=${final.title} roundTrip=${roundTrips.join('/')}ms checkedAt=${checkedAt} | `
        + `attempts: ${states} | storedAndUnrecorded=[${unrecorded.join(',')}] | reconciled ${settled} in ${t() - settleAt}ms, left=[${left.join(',')}] orphans=${await s.orphans(uploaded)} | `
        + `apiLog: ${apiLog} | ${events.join('; ')}`);
    } catch (cause) {
      console.log(`${TAG} #${index} DIAGNOSTIC ERROR ${describeFailure(cause)} | ${events.join('; ')}`);
    } finally {
      for (const undo of restore) undo();
      await Promise.allSettled(requests.map((request) => request.writeSettled));
    }
  }, 300_000);
});
