import type { RecipeSummary } from '@recipe-app/contracts/types';
import type { DefaultCategoryName } from '../../categories/default-categories.js';
import type { SeedDetails } from '../sample-details.js';

type FixtureInput = {
  id: string;
  title: string;
  description: string;
  prep: number;
  cook: number;
  ingredients: SeedDetails['ingredients'];
  instructions: SeedDetails['instructions'];
  extra?: DefaultCategoryName;
};

/** A seed recipe names default categories; whoever owns the copy supplies the ids. */
export type SeedRecipe = Omit<RecipeSummary, 'categories'> & { categories: DefaultCategoryName[] };

/** Dates and portions depend only on fixed fixture positions, never runtime time/randomness. */
export function makeFixtures(category: DefaultCategoryName, offset: number, inputs: readonly FixtureInput[]) {
  return inputs.map((input, index) => {
    const day = offset + index;
    const createdAt = new Date(Date.UTC(2026, 5, 1 + day)).toISOString();
    const updatedAt = new Date(Date.UTC(2026, 5, 2 + day + index % 7)).toISOString();
    const recipe: SeedRecipe = {
      id: input.id, title: input.title, description: input.description,
      categories: input.extra ? [category, input.extra] : [category], imageUrl: null,
      servings: 2 + index % 4, prepTimeMinutes: input.prep, cookTimeMinutes: input.cook,
      createdAt, updatedAt,
    };
    return { recipe, details: { ingredients: input.ingredients, instructions: input.instructions } };
  });
}
