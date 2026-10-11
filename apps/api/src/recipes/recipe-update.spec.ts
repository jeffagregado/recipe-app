import { describe, expect, it } from 'vitest';
import type { UpdateRecipeMetadata } from '@recipe-app/contracts/types';
import { planRecipeUpdate } from './recipe-update.js';

const state = {
  instructions: [{ id: 'a', imageId: 'photo-a' }, { id: 'b', imageId: 'photo-b' }, { id: 'c', imageId: null }],
  images: [{ id: 'cover', objectKey: 'k-cover', sortOrder: 0 }, { id: 'photo-a', objectKey: 'k-a', sortOrder: 1 },
    { id: 'photo-b', objectKey: 'k-b', sortOrder: 4 }, { id: 'unowned', objectKey: 'k-unowned', sortOrder: 2 }],
};
const metadata = (cover: UpdateRecipeMetadata['cover'], instructions: UpdateRecipeMetadata['instructions']): UpdateRecipeMetadata => ({
  title: 'Soup', description: null, categoryIds: [], servings: null, prepTimeMinutes: null, cookTimeMinutes: null, videoUrl: null, notes: null,
  ingredients: [{ name: 'Salt', quantity: null, unit: null }], cover, instructions,
});
const upload = (fieldname: string) => ({ id: `new-${fieldname}`, key: `k-new-${fieldname}`, file: { fieldname, mimetype: 'image/jpeg', buffer: Buffer.alloc(1) } });
const keys = (images: { objectKey: string }[]) => images.map(({ objectKey }) => objectKey).sort();

describe('Recipe update image plan', () => {
  it('keeps photos with their reordered steps and leaves every stored image untouched', () => {
    const plan = planRecipeUpdate(state, metadata('keep', [
      { id: 'c', description: 'C', image: 'keep' }, { id: 'b', description: 'B', image: 'keep' }, { id: 'a', description: 'A', image: 'keep' }]), []);
    expect(plan).toEqual({ stepImageIds: [null, 'photo-b', 'photo-a'], stale: [], added: [] });
  });

  it('marks replaced, removed and dropped-step photos stale and places new images on free positions', () => {
    const plan = planRecipeUpdate(state, metadata('replace', [
      { id: 'a', description: 'A', image: 'replace' }, { id: null, description: 'New', image: 'replace' }, { id: 'c', description: 'C', image: 'remove' }]),
    [upload('cover'), upload('step-0'), upload('step-1')]);
    expect(plan.stepImageIds).toEqual(['new-step-0', 'new-step-1', null]);
    expect(keys(plan.stale)).toEqual(['k-a', 'k-b', 'k-cover']);
    // The image no slot owns keeps position 2, so new step photos continue after it.
    expect(plan.added).toEqual([{ id: 'new-cover', objectKey: 'k-new-cover', sortOrder: 0 },
      { id: 'new-step-0', objectKey: 'k-new-step-0', sortOrder: 3 }, { id: 'new-step-1', objectKey: 'k-new-step-1', sortOrder: 4 }]);
  });

  it('removes only the cover when asked and treats keep on a photoless slot as no photo', () => {
    const plan = planRecipeUpdate({ ...state, images: state.images.slice(1) }, metadata('keep', [
      { id: 'a', description: 'A', image: 'keep' }, { id: 'b', description: 'B', image: 'remove' }, { id: 'c', description: 'C', image: 'keep' }]), []);
    expect(plan.stepImageIds).toEqual(['photo-a', null, null]); expect(keys(plan.stale)).toEqual(['k-b']);
    expect(keys(planRecipeUpdate(state, metadata('remove', [{ id: 'a', description: 'A', image: 'keep' }, { id: 'b', description: 'B', image: 'keep' }]), []).stale)).toEqual(['k-cover']);
  });

  it('rejects an instruction of another recipe at its own field', () => {
    try {
      planRecipeUpdate(state, metadata('keep', [{ id: 'a', description: 'A', image: 'keep' }, { id: 'foreign', description: 'X', image: 'keep' }]), []);
      expect.fail('Expected a field error');
    } catch (cause) {
      const error = cause as { getStatus: () => number; getResponse: () => { code: string; fieldErrors: Record<string, string[]> } };
      expect(error.getStatus()).toBe(400); expect(error.getResponse().code).toBe('VALIDATION_FAILED');
      expect(Object.keys(error.getResponse().fieldErrors)).toEqual(['instructions.1.id']);
    }
  });
});
