import { describe, expect, it } from 'vitest';
import { createRecipeMetadataSchema } from '@recipe-app/contracts/schemas';
import { DEMO_TEMPLATE_RECIPES, templateMetadata } from './demo-template-recipes.js';

describe('Demo template recipes', () => {
  it.each(DEMO_TEMPLATE_RECIPES.map((recipe) => [recipe.title, recipe] as const))('%s passes the shared recipe schema', (_, recipe) => {
    const result = createRecipeMetadataSchema.safeParse(templateMetadata(recipe, (name) => `category-${name}`));
    expect(result.error).toBeUndefined();
  });
});
