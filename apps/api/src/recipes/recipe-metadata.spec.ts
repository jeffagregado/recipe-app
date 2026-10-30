import { describe, expect, it } from 'vitest';
import type { CreateRecipeMetadata } from '@recipe-app/contracts/types';
import { parseRecipeMetadata, recipeRequestHash } from './recipe-metadata.js';

const metadata: CreateRecipeMetadata = { title: 'Soup', description: null, categoryIds: [], servings: null, prepTimeMinutes: null, cookTimeMinutes: null, videoUrl: null,
  notes: null, ingredients: [{ name: 'Salt', quantity: null, unit: null }], instructions: [{ description: 'Mix.', image: { pendingPhotoId: '0b0f6a3e-4c1d-4d6e-9f1a-2b3c4d5e6f70' } }] };

describe('Recipe request hash', () => {
  it('hashes the metadata alone, so the same save hashes alike and a different Pending photo hashes apart', () => {
    const { title, ...rest } = metadata;
    const reordered = parseRecipeMetadata(JSON.stringify({ ...rest, ingredients: [{ unit: null, quantity: null, name: 'Salt', preparation: null }], title }));
    expect(recipeRequestHash(reordered)).toBe(recipeRequestHash(metadata));
    // A pinned value: a change to the hash would turn a retry across a deploy into an idempotency conflict.
    expect(recipeRequestHash(metadata)).toBe('bbd5ef3d33b4f2fb0a69de703c74bb4e37c4c8722013f409a3aad11c4f4e2aca');
    const otherPhoto = { ...metadata, instructions: [{ description: 'Mix.', image: { pendingPhotoId: '1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f' } }] };
    expect(recipeRequestHash(otherPhoto)).not.toBe(recipeRequestHash(metadata));
  });

  it('hashes an update with its target, so its key cannot replay a create or an update of another recipe', () => {
    const update = { ...metadata, cover: 'keep' as const, instructions: [{ id: null, description: 'Mix.', image: 'remove' as const }] };
    expect(recipeRequestHash(update, 'recipe-1')).not.toBe(recipeRequestHash(update, 'recipe-2'));
    expect(recipeRequestHash(update, 'recipe-1')).not.toBe(recipeRequestHash(update as unknown as CreateRecipeMetadata));
  });
});
