import { expect, test } from './fixtures.js';

test('searches recipes, combines filters, restores history and clears search', async ({ page }) => {
  const errors: string[] = [];
  const consoleErrors: string[] = [];
  const missingRoutes: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('response', (response) => { if (response.status() >= 400) missingRoutes.push(new URL(response.url()).pathname); });
  const search = page.getByRole('searchbox', { name: 'Search recipes' });
  const cards = page.getByRole('list', { name: 'Recipes' }).locator(':scope > li');
  await page.goto('/recipes');
  await expect(cards).toHaveCount(20);
  await page.getByText('Showing 20 of 100 recipes', { exact: true }).scrollIntoViewIfNeeded();
  await expect(cards).toHaveCount(40);
  await search.fill('  PASTA  ');
  await search.press('Enter');
  await expect(page).toHaveURL(/search=PASTA/);
  await expect(cards).toHaveCount(5);
  await expect(search).toHaveValue('PASTA');
  await page.getByRole('group', { name: 'Recipe categories' }).getByRole('button', { name: /^Breakfast/ }).click();
  await expect(page.getByText('No recipes match your filters. Try another search or category.')).toBeVisible();
  await page.goBack();
  await expect(cards).toHaveCount(5);
  await page.reload();
  await expect(cards).toHaveCount(5);
  await expect(search).toHaveValue('PASTA');
  await search.fill('softened apple');
  await page.getByRole('button', { name: 'Submit recipe search' }).click();
  await expect(cards).toHaveCount(1);
  await expect(cards.getByRole('heading')).toHaveText('Apple Cinnamon Porridge');
  await page.goBack();
  await expect(search).toHaveValue('PASTA');
  await expect(cards).toHaveCount(5);
  await page.goForward();
  await expect(search).toHaveValue('softened apple');
  await expect(cards).toHaveCount(1);
  await search.focus();
  const size = await search.evaluate((input) => ({ width: input.clientWidth, height: input.clientHeight }));
  // The native search clear button is inside the input's right edge.
  await search.click({ position: { x: size.width - 16, y: size.height / 2 } });
  await expect(search).toHaveValue('');
  await expect(cards).toHaveCount(20);
  expect(new URL(page.url()).searchParams.has('search')).toBe(false);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
  // Existing desktop sidebar links prefetch routes that are not implemented yet.
  for (const path of missingRoutes) expect(['/categories', '/settings']).toContain(path);
  expect(consoleErrors).toHaveLength(missingRoutes.length);
});

test('rejects malformed search URLs and preserves blank search behavior', async ({ page }) => {
  for (const query of ['search=oat&search=rice', `search=${'a'.repeat(201)}`]) {
    await page.goto(`/recipes?${query}`);
    await expect(page.getByRole('alert').filter({ hasText: 'Invalid recipe filters.' })).toBeVisible();
  }
  await page.goto('/recipes?search=%20%20');
  await expect(page.getByRole('list', { name: 'Recipes' }).locator(':scope > li')).toHaveCount(20);
});
