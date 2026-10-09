import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { inArray, like, sql } from 'drizzle-orm';
import { ingredients, recipes, recipeWriteAttempts, users } from '../../src/database/schema.js';
import { jpeg, minimalRecipe, openRecipeSuite } from '../recipe-suite.js';
import type { RecipeSuite } from '../recipe-suite.js';

describe('Recipe suite teardown', () => {
  let s: RecipeSuite;
  beforeAll(async () => { s = await openRecipeSuite(); }, 60_000);
  // Runs the whole cleanup again, so nothing is left behind even when the scenario below fails.
  afterAll(() => s?.close(), 60_000);

  it('still removes users, recipes, attempts and ingredients when an object deletion throws, and reports the failure', async () => {
    await s.savedId(await s.send('/recipes', minimalRecipe(s.name), [{ field: 'cover', bytes: jpeg(1) }]), 201);
    const userIds = [s.owner.user.id, s.other.user.id];
    const deletion = vi.spyOn(s.storage, 'deleteObject').mockRejectedValueOnce(new Error('Forced teardown storage failure'));
    try { await expect(s.cleanup()).rejects.toThrow('Forced teardown storage failure'); } finally { deletion.mockRestore(); }
    expect(await s.db.$count(users, inArray(users.id, userIds))).toBe(0);
    expect(await s.db.$count(recipes, inArray(recipes.userId, userIds))).toBe(0);
    expect(await s.db.$count(recipeWriteAttempts, inArray(recipeWriteAttempts.userId, userIds))).toBe(0);
    expect(await s.db.$count(ingredients, like(sql`lower(${ingredients.name})`, `${s.name}%`))).toBe(0);
  }, 60_000);
});
