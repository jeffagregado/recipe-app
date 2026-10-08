import { sampleRecipes } from './sample-recipes.js';
import { sampleDetails } from './sample-details.js';
import type { SeedDetails } from './sample-details.js';
import { breakfastFixtures } from './fixtures/breakfast.js';
import { lunchFixtures } from './fixtures/lunch.js';
import { dinnerFixtures } from './fixtures/dinner.js';
import { snackFixtures } from './fixtures/snacks.js';
import { dessertFixtures } from './fixtures/desserts.js';

const additions = [...breakfastFixtures, ...lunchFixtures, ...dinnerFixtures, ...snackFixtures, ...dessertFixtures];
export const seedRecipes = [...sampleRecipes, ...additions.map(({ recipe }) => recipe)];
export const seedDetails: Readonly<Record<string, SeedDetails>> = {
  ...sampleDetails,
  ...Object.fromEntries(additions.map(({ recipe, details }) => [recipe.id, details] as const)),
};
