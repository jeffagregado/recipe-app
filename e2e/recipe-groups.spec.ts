import type { Page } from '@playwright/test';
import { asc, eq } from '../apps/api/node_modules/drizzle-orm/index.js';
import { recipeIngredients, recipeInstructions, recipes } from '../apps/api/src/database/schema.js';
import { creatorTest as test, expect, WEB_URL } from './fixtures.js';
import { field, fillIngredient, openCreate, stubVideoHosts, toast, waitHydrated, watchConsole } from './create-recipe-helpers.js';

const issues = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => { issues.set(page, watchConsole(page)); await stubVideoHosts(page); });
test.afterEach(async ({ page }) => { expect(issues.get(page)).toEqual([]); });

const SAVED = /\/recipes\/(?!create$)[^/?]+$/;
const ingredientsCard = (page: Page) => page.getByRole('region', { name: /^Ingredients/ });
const instructionsCard = (page: Page) => page.getByRole('region', { name: /^Instructions/ });
const groupRows = (page: Page, name: string) => page.getByRole('list', { name, exact: true }).locator(':scope > li').allInnerTexts();

test('a recipe with an ingredient group, a step group and a fraction saves, shows its groups, and edits back in the same layout with a titled first group', async ({ page, workerData, creator }) => {
  test.setTimeout(120_000);
  await openCreate(page);
  await field.title(page).fill('Grouped pasta');
  await fillIngredient(page, 1, 'Spaghetti', '200', 'g');
  await ingredientsCard(page).getByRole('button', { name: 'Add group' }).click();
  await expect(page.getByLabel('Ingredient group 1 name')).toBeFocused();
  await page.keyboard.type('Sauce');
  await fillIngredient(page, 2, 'Butter', '1 1/2', 'tbsp');
  await field.step(page, 1).fill('Boil the pasta.');
  await instructionsCard(page).getByRole('button', { name: 'Add group' }).click();
  await expect(page.getByLabel('Step group 1 name')).toBeFocused();
  await page.keyboard.type('Make the sauce');
  await field.step(page, 2).fill('Melt the butter.');
  await field.save(page).click();

  await expect(page).toHaveURL(SAVED, { timeout: 30_000 });
  await expect(page.getByRole('heading', { level: 1, name: 'Grouped pasta' })).toBeVisible({ timeout: 20_000 });
  await expect(toast.success(page, 'Recipe saved')).toBeVisible();
  const id = new URL(page.url()).pathname.split('/').pop()!;
  await expect(page.getByRole('heading', { level: 3 })).toHaveText(['Sauce', 'Make the sauce']);
  expect(await groupRows(page, 'Ingredients')).toEqual([expect.stringMatching(/^Spaghetti\s+200 g$/)]);
  expect(await groupRows(page, 'Sauce')).toEqual([expect.stringMatching(/^Butter\s+1½ tbsp$/)]);
  await expect(page.getByRole('list', { name: 'Make the sauce', exact: true })).toHaveAttribute('start', '2');
  expect(await groupRows(page, 'Make the sauce')).toEqual([expect.stringMatching(/^2\s+Melt the butter\.$/)]);

  const stored = await workerData.db.query.recipes.findFirst({ where: eq(recipes.id, id), with: {
    ingredients: { orderBy: asc(recipeIngredients.sortOrder) }, instructions: { orderBy: asc(recipeInstructions.stepNumber) },
  } });
  expect(stored?.userId).toBe(creator.user.id);
  expect(stored?.ingredients.map(({ name, quantity, heading }) => [name, Number(quantity), heading])).toEqual([['Spaghetti', 200, null], ['Butter', 1.5, 'Sauce']]);
  expect(stored?.instructions.map(({ heading }) => heading)).toEqual([null, 'Make the sauce']);

  await page.getByRole('button', { name: 'More options for Grouped pasta' }).click();
  await page.getByRole('menuitem', { name: 'Edit recipe' }).click();
  await expect(page).toHaveURL(`${WEB_URL}/recipes/${id}/edit`);
  await waitHydrated(page.getByRole('form', { name: 'Edit Recipe' }));
  await expect(field.ingredientAmount(page, 2)).toHaveValue('1½');
  await expect(page.getByLabel('Ingredient group 1 name')).toHaveValue('Sauce');
  await expect(page.getByLabel('Step group 1 name')).toHaveValue('Make the sauce');
  await page.getByLabel('Ingredient group 1 name').fill('Garlic butter');
  await ingredientsCard(page).getByRole('button', { name: 'Add heading' }).click();
  await expect(page.getByLabel('First ingredient group name')).toBeFocused();
  await page.keyboard.type('Pasta');
  await page.getByRole('button', { name: 'Remove heading from step group 1' }).click();
  await page.getByRole('button', { name: /^(Save Changes|Saving…)$/ }).click();

  await expect(page).toHaveURL(`${WEB_URL}/recipes/${id}`, { timeout: 30_000 });
  await expect(page.getByRole('heading', { level: 3 })).toHaveText(['Pasta', 'Garlic butter'], { timeout: 20_000 });
  expect(await groupRows(page, 'Pasta')).toEqual([expect.stringMatching(/^Spaghetti\s+200 g$/)]);
  expect(await groupRows(page, 'Garlic butter')).toEqual([expect.stringMatching(/^Butter\s+1½ tbsp$/)]);
  expect(await groupRows(page, 'Instructions')).toEqual([expect.stringMatching(/^1\s+Boil the pasta\.$/), expect.stringMatching(/^2\s+Melt the butter\.$/)]);
});
