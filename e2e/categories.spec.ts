import type { Locator, Page } from '@playwright/test';
import { creatorTest as test, expect, WEB_URL } from './fixtures.js';
import {
  WIDTHS, categoryIdsFor, createRecipeViaApi, field, fillMinimal, metadataWith, noOverflow, openCreate,
  openRecipe, recipeCards, toast, userCategories, waitHydrated, watchConsole,
} from './create-recipe-helpers.js';

const DEFAULTS = ['Breakfast', 'Lunch', 'Dinner', 'Snacks', 'Desserts'];
const EXTRA = ['Soup', 'Baking', 'Grill', 'Kids', 'Vegan'];
const form = (page: Page) => page.getByRole('form', { name: 'Categories', exact: true, includeHidden: true }).filter({ visible: true });
const names = (page: Page) => form(page).getByRole('textbox', { name: /^Category \d+ name$/ });
const input = (page: Page, position: number) => form(page).getByRole('textbox', { name: `Category ${position} name`, exact: true });
const save = (page: Page) => form(page).getByRole('button', { name: 'Save Categories', exact: true });
const chips = (page: Page) => page.getByRole('group', { name: 'Recipe categories', exact: true }).getByRole('button');
const inputValues = (locator: Locator) => locator.evaluateAll((elements) => elements.map((element) => (element as HTMLInputElement).value));
const issues = new WeakMap<Page, string[]>();

// creatorTest calls workerData.signupFreshAccount() and registers every account for fixture cleanup.
test.beforeEach(async ({ page }) => { issues.set(page, watchConsole(page)); });
test.afterEach(async ({ page }) => { expect(issues.get(page)).toEqual([]); });

async function openCategories(page: Page) {
  await page.goto('/categories');
  await expect(page.getByRole('heading', { level: 1, name: 'Categories', exact: true })).toBeVisible();
  await waitHydrated(form(page));
}

async function addNames(page: Page, added: readonly string[]) {
  for (const name of added) {
    await form(page).getByRole('button', { name: 'Add category', exact: true }).click();
    await names(page).last().fill(name);
  }
}

async function saved(page: Page) {
  const notice = toast.success(page, 'Categories saved');
  await expect(notice).toBeVisible();
  await toast.dismiss(notice).click();
  await expect(form(page)).toHaveAttribute('aria-busy', 'false');
}

test('sidebar journey renames, adds and untags recipes, refreshing chips, cards, details and the form', async ({ page, creator, workerData }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  const [snacks, dinner, lunch] = await categoryIdsFor(creator, ['Snacks', 'Dinner', 'Lunch']);
  const tagged = await createRecipeViaApi(creator, workerData.address, metadataWith('Evening plate', { categoryIds: [snacks, dinner] }));
  const renamed = await createRecipeViaApi(creator, workerData.address, metadataWith('Lunch plate', { categoryIds: [lunch] }));
  await page.goto('/recipes');
  await page.getByRole('link', { name: 'Categories', exact: true }).click();
  await expect(page).toHaveURL(`${WEB_URL}/categories`);
  await waitHydrated(form(page));
  expect(await inputValues(names(page))).toEqual(DEFAULTS);
  await input(page, 2).fill('Bites');
  await addNames(page, ['Soup']);
  await form(page).getByRole('button', { name: 'Remove Snacks', exact: true }).click();
  await save(page).click();
  const confirmation = page.getByRole('alertdialog', { name: 'Remove “Snacks”?', exact: true });
  await expect(confirmation).toContainText('1 recipe is tagged with it.');
  await confirmation.getByRole('button', { name: 'Remove and save', exact: true }).click();
  await saved(page);

  await page.goto('/recipes');
  await expect(chips(page)).toHaveText(['All2', 'Favorites0', 'Breakfast0', 'Bites1', 'Dinner1', 'Desserts0', 'Soup0']);
  const lunchCard = recipeCards(page).filter({ has: page.getByRole('heading', { name: 'Lunch plate', exact: true }) });
  const eveningCard = recipeCards(page).filter({ has: page.getByRole('heading', { name: 'Evening plate', exact: true }) });
  await expect(lunchCard.getByText('Bites', { exact: true })).toBeVisible();
  await expect(eveningCard.getByText('Dinner', { exact: true })).toBeVisible();
  await expect(eveningCard.getByText('Snacks', { exact: true })).toHaveCount(0);
  await openRecipe(page, renamed, 'Lunch plate');
  await expect(page.getByRole('list', { name: 'Categories', exact: true }).getByRole('listitem')).toHaveText(['Bites']);
  await openRecipe(page, tagged, 'Evening plate');
  await expect(page.getByRole('list', { name: 'Categories', exact: true }).getByRole('listitem')).toHaveText(['Dinner']);
  await openCreate(page);
  await expect(page.getByRole('group', { name: 'Category', exact: true }).getByRole('button')).toHaveText(['Breakfast', 'Bites', 'Dinner', 'Desserts', 'Soup']);

  await openCategories(page);
  await form(page).getByRole('button', { name: 'Remove Desserts', exact: true }).click();
  await save(page).click();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await saved(page);
  expect(await inputValues(names(page))).toEqual(['Breakfast', 'Bites', 'Dinner', 'Soup']);
});

test('full set saves ten categories, explains the cap and enables Add after removal', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openCategories(page);
  await addNames(page, EXTRA);
  await expect(form(page).getByRole('button', { name: 'Add category', exact: true })).toBeDisabled();
  await expect(form(page).getByText('You’ve reached 10 categories. Remove one to add another.', { exact: true })).toBeVisible();
  await expect(form(page).getByText('Up to 10 · 10 of 10', { exact: true })).toBeVisible();
  await save(page).click();
  await saved(page);
  await page.reload();
  await waitHydrated(form(page));
  expect(await inputValues(names(page))).toEqual([...DEFAULTS, ...EXTRA]);
  await form(page).getByRole('button', { name: 'Remove Vegan', exact: true }).click();
  await expect(form(page).getByRole('button', { name: 'Add category', exact: true })).toBeEnabled();
});

test('invalid names show on their rows, focus the first error and leave stored categories unchanged', async ({ page }) => {
  await openCategories(page);
  await input(page, 1).fill('');
  await input(page, 2).fill('12345678901');
  await input(page, 4).fill('dinner');
  await save(page).click();
  for (const [position, message] of [[1, 'Enter a category name.'], [2, 'Use 10 characters or fewer.'], [4, '“Dinner” already exists. Choose a different name.']] as const) {
    const row = form(page).getByRole('listitem').nth(position - 1);
    await expect(row.getByText(message, { exact: true })).toBeVisible();
  }
  await expect(input(page, 1)).toBeFocused();
  page.once('dialog', (dialog) => dialog.accept());
  await page.reload();
  await expect(names(page)).toHaveCount(5);
  expect(await inputValues(names(page))).toEqual(DEFAULTS);
});

test('empty set leaves All and Favorites and links the create form back to Categories', async ({ page }) => {
  await openCategories(page);
  for (const name of DEFAULTS) await form(page).getByRole('button', { name: `Remove ${name}`, exact: true }).click();
  await save(page).click();
  await saved(page);
  await page.goto('/recipes');
  await expect(chips(page)).toHaveText(['All0', 'Favorites0']);
  await openCreate(page);
  const empty = page.getByText('No categories yet. Add some in Categories', { exact: true });
  await expect(empty).toBeVisible();
  await empty.getByRole('link', { name: 'Categories', exact: true }).click();
  await expect(page).toHaveURL(`${WEB_URL}/categories`);
});

test('anonymous Categories visit redirects to sign in', async ({ browser }) => {
  const context = await browser.newContext({ baseURL: WEB_URL });
  try {
    const page = await context.newPage();
    await page.goto('/categories');
    await expect(page).toHaveURL(`${WEB_URL}/auth/login`);
    await expect(page.getByLabel('Email', { exact: true })).toBeVisible();
  } finally { await context.close(); }
});

test('stale create tab shows category error and saves no recipe', async ({ page, creator }) => {
  await openCreate(page);
  const categories = await userCategories(creator);
  const response = await fetch('http://127.0.0.1:4101/categories', {
    method: 'PUT', headers: { Cookie: creator.cookie, Origin: WEB_URL, 'Content-Type': 'application/json' },
    body: JSON.stringify(categories.filter(({ name }) => name !== 'Snacks').map(({ id, name }) => ({ id, name }))),
  });
  expect(response.status).toBe(200);
  await field.category(page, 'Snacks').click();
  await fillMinimal(page, 'Stale category recipe');
  await field.save(page).click();
  const group = page.getByRole('group', { name: 'Category', exact: true });
  await expect(group).toHaveAccessibleDescription('A category was removed. Reload the page to see the current list.');
  await expect(page.getByText('A category was removed. Reload the page to see the current list.', { exact: true })).toBeVisible();
  const recipes = await fetch('http://127.0.0.1:4101/recipes', { headers: { Cookie: creator.cookie } });
  expect(recipes.status).toBe(200);
  const list = await recipes.json() as { data: unknown[]; meta: { total: number } };
  expect(list.data).toHaveLength(0);
  expect(list.meta.total).toBe(0);
});

async function checkLayout(page: Page, width: number, state: string) {
  await page.setViewportSize({ width, height: 900 });
  expect(await noOverflow(page), `${state} ${width}px`).toBe(true);
  const controls = form(page).locator('button:visible, input:visible');
  const heights = await controls.evaluateAll((elements) => elements.map((element) => ({ name: element.getAttribute('aria-label') ?? element.textContent?.trim(), height: element.getBoundingClientRect().height })));
  for (const { name, height } of heights) expect(height, `${state} ${width}px ${name}`).toBeGreaterThanOrEqual(44);
  await expect(form(page).getByRole('button', { name: width < 768 ? 'Back' : 'Cancel', exact: true, includeHidden: true })).toBeVisible();
  await expect(form(page).getByRole('button', { name: width < 768 ? 'Cancel' : 'Back', exact: true, includeHidden: true })).toBeHidden();
}

test('default, ten-row and delete-confirmation layouts fit every target width with 44px controls', async ({ page, creator, workerData }) => {
  test.setTimeout(120_000);
  const [snacks] = await categoryIdsFor(creator, ['Snacks']);
  await createRecipeViaApi(creator, workerData.address, metadataWith('Layout plate', { categoryIds: [snacks] }));
  await openCategories(page);
  for (const width of WIDTHS) await checkLayout(page, width, 'default');
  await addNames(page, EXTRA);
  for (const width of WIDTHS) await checkLayout(page, width, 'full');
  await form(page).getByRole('button', { name: 'Remove Snacks', exact: true }).click();
  await save(page).click();
  await expect(page.getByRole('alertdialog', { name: 'Remove “Snacks”?', exact: true })).toBeVisible();
  for (const width of WIDTHS) {
    await checkLayout(page, width, 'confirmation');
    const buttons = page.getByRole('alertdialog').getByRole('button');
    // The dialog scales in; measure the settled target rather than an animation frame.
    for (const button of await buttons.all()) await expect.poll(async () => (await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
});
