import { mkdir } from 'node:fs/promises';
import { test, expect, type Page } from '@playwright/test';

const api = 'http://127.0.0.1:4101';
const cards = (page: Page) => page.getByRole('list', { name: 'Recipes' }).locator(':scope > li');
const category = (page: Page, name: string) => page.getByRole('group', { name: 'Recipe categories' }).getByRole('button', { name: new RegExp(`^${name} `) });
const firstTitle = (page: Page) => cards(page).first().getByRole('heading');
const filterAlert = (page: Page) => page.getByRole('alert').filter({ hasText: 'Invalid recipe filters.' });
const requestAlert = (page: Page) => page.getByRole('alert').filter({ hasText: 'Could not load' });
const failures = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page }) => {
  failures.set(page, []);
  page.on('pageerror', (error) => failures.get(page)?.push(error.message));
});
test.afterEach(async ({ page }) => { expect(failures.get(page)).toEqual([]); });

test('server-renders 20, appends five disjoint pages and stops at 100', async ({ page }, info) => {
  const consoleErrors: string[] = [];
  const requests: number[] = [];
  const missingRoutes: string[] = [];
  page.on('response', (response) => { if (response.status() >= 400) missingRoutes.push(new URL(response.url()).pathname); });
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('request', (request) => {
    if (request.url().startsWith(`${api}/recipes?`)) requests.push(Number(new URL(request.url()).searchParams.get('page')));
  });
  const response = await page.goto('/recipes');
  expect((await response!.text()).match(/<li class="min-w-0"/g)).toHaveLength(20);
  await expect(cards(page)).toHaveCount(20);
  await expect(category(page, 'All')).toContainText('100');
  await expect(page.getByRole('button', { name: 'Sort recipes' })).toHaveText('Newest first');
  await mkdir('output/playwright', { recursive: true });
  await page.screenshot({ path: `output/playwright/recipe-paging-${info.project.name}.png` });
  const ids: string[] = [];
  for (const count of [20, 40, 60, 80, 100]) {
    await expect(cards(page)).toHaveCount(count);
    ids.splice(0, ids.length, ...await cards(page).getByRole('heading').getByRole('link').evaluateAll((links) => links.map((link) => link.getAttribute('href')!)));
    expect(new Set(ids).size).toBe(count);
    if (count < 100) await page.getByText(`Showing ${count} of 100 recipes`, { exact: true }).scrollIntoViewIfNeeded();
  }
  await expect(page.getByText('Showing 100 of 100 recipes', { exact: true })).toBeVisible();
  expect(requests).toEqual([2, 3, 4, 5]);
  expect(new URL(page.url()).search).toBe('');
  // Desktop sidebar prefetches three existing routes outside this feature's scope.
  for (const path of missingRoutes) expect(['/categories', '/favorites', '/settings']).toContain(path);
  expect(consoleErrors).toHaveLength(missingRoutes.length);
  expect(consoleErrors.every((message) => message.includes('404 (Not Found)'))).toBe(true);
});

test('resets filters, batches sorting, restores URL on reload/back/forward and revisits page one', async ({ page }) => {
  await page.goto('/recipes');
  await expect(cards(page)).toHaveCount(20);
  await page.getByText('Showing 20 of 100 recipes', { exact: true }).scrollIntoViewIfNeeded();
  await expect(cards(page)).toHaveCount(40);
  await category(page, 'Breakfast').click();
  await expect(cards(page)).toHaveCount(20);
  await expect(firstTitle(page)).toHaveText('Banana Oat Pancakes');
  await expect(page).toHaveURL(/category=Breakfast/);
  await expect(category(page, 'Breakfast')).toContainText('23');
  await page.getByRole('button', { name: 'Sort recipes' }).click();
  await page.getByRole('menuitemradio', { name: 'Title A-Z', exact: true }).click();
  await expect(firstTitle(page)).toHaveText('Apple Cinnamon Porridge');
  const sorted = new URL(page.url());
  expect(sorted.searchParams.get('sortBy')).toBe('title');
  expect(sorted.searchParams.get('order')).toBe('asc');
  expect(sorted.searchParams.has('page')).toBe(false);
  await page.reload();
  await expect(cards(page)).toHaveCount(20);
  await expect(firstTitle(page)).toHaveText('Apple Cinnamon Porridge');
  await page.goBack();
  await expect(firstTitle(page)).toHaveText('Banana Oat Pancakes');
  expect(new URL(page.url()).searchParams.has('sortBy')).toBe(false);
  await page.goBack();
  await expect(category(page, 'All')).toHaveAttribute('aria-pressed', 'true');
  await expect(cards(page)).toHaveCount(20);
  await page.goForward();
  await expect(category(page, 'Breakfast')).toHaveAttribute('aria-pressed', 'true');
  await expect(cards(page)).toHaveCount(20);
});

test('rejects malformed URL filters and resets explicitly', async ({ page }) => {
  for (const query of ['category=Unknown', 'category=', 'category=Dinner&category=Lunch', 'sortBy=invalid', 'order=invalid']) {
    await page.goto(`/recipes?${query}`);
    await expect(filterAlert(page)).toContainText('Invalid recipe filters.');
    await expect(page.getByRole('list', { name: 'Recipes' })).toHaveCount(0);
  }
  await page.getByRole('link', { name: 'Reset filters' }).click();
  await expect(cards(page)).toHaveCount(20);
  expect(new URL(page.url()).search).toBe('');
});

test('keeps loaded cards on later-page failure and retries only on request', async ({ page }) => {
  let failing = true;
  let attempts = 0;
  await page.route(`${api}/recipes?*`, async (route) => {
    if (new URL(route.request().url()).searchParams.get('page') === '2') {
      attempts++;
      if (failing) { await route.fulfill({ status: 503, contentType: 'application/json', body: '{"message":"Injected paging outage"}' }); return; }
    }
    await route.continue();
  });
  await page.goto('/recipes');
  await expect(cards(page)).toHaveCount(20);
  await page.getByText('Showing 20 of 100 recipes', { exact: true }).scrollIntoViewIfNeeded();
  await expect(requestAlert(page)).toContainText('Could not load more recipes.');
  await expect(requestAlert(page)).toContainText('503');
  await expect(cards(page)).toHaveCount(20);
  expect(attempts).toBe(1);
  failing = false;
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(cards(page)).toHaveCount(40);
  await expect(requestAlert(page)).toHaveCount(0);
  expect(attempts).toBe(2);
});

test('validates later responses and exposes timeout errors with Retry', async ({ page }) => {
  let mode: 'invalid' | 'slow' = 'invalid';
  await page.route(`${api}/recipes?*`, async (route) => {
    if (new URL(route.request().url()).searchParams.get('page') !== '2') { await route.continue(); return; }
    if (mode === 'invalid') { await route.fulfill({ status: 200, contentType: 'application/json', body: '{"data":[]}' }); return; }
    await new Promise((resolve) => setTimeout(resolve, 5_500));
    await route.abort();
  });
  await page.goto('/recipes');
  await expect(cards(page)).toHaveCount(20);
  await page.getByText('Showing 20 of 100 recipes', { exact: true }).scrollIntoViewIfNeeded();
  await expect(requestAlert(page)).toContainText('invalid recipe list data');
  mode = 'slow';
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(requestAlert(page)).toContainText('timed out after 5 seconds', { timeout: 10_000 });
  await expect(cards(page)).toHaveCount(20);
  await page.unrouteAll({ behavior: 'wait' });
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(cards(page)).toHaveCount(40);
});

test('cancels obsolete category requests without mixing results', async ({ page }) => {
  const cancelled: string[] = [];
  page.on('requestfailed', (request) => { if (request.url().includes('category=Dinner')) cancelled.push(request.failure()?.errorText ?? 'unknown'); });
  await page.route(`${api}/recipes?*`, async (route) => {
    if (new URL(route.request().url()).searchParams.get('category') === 'Dinner') await new Promise((resolve) => setTimeout(resolve, 750));
    await route.continue();
  });
  await page.goto('/recipes');
  await expect(cards(page)).toHaveCount(20);
  const dinner = page.waitForRequest((request) => request.url().startsWith(`${api}/recipes?`) && new URL(request.url()).searchParams.get('category') === 'Dinner');
  await category(page, 'Dinner').click();
  await dinner;
  await category(page, 'Breakfast').click();
  await expect(firstTitle(page)).toHaveText('Banana Oat Pancakes');
  await expect(cards(page)).toHaveCount(20);
  expect(cancelled).toContain('net::ERR_ABORTED');
  await expect(cards(page).getByText('Breakfast', { exact: true })).toHaveCount(20);
});

test('preserves card controls and keeps mobile chips inside horizontal scroller', async ({ page, isMobile }) => {
  if (isMobile) await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/recipes');
  await expect(cards(page)).toHaveCount(20);
  const card = cards(page).first();
  const favorite = card.getByRole('button', { name: 'Add Banana Oat Pancakes to favorites', exact: true });
  await favorite.click();
  await expect(card.getByRole('button', { name: 'Remove Banana Oat Pancakes from favorites' })).toHaveAttribute('aria-pressed', 'true');
  await card.getByRole('button', { name: 'More options for Banana Oat Pancakes' }).click();
  await expect(page.getByRole('menuitem', { name: 'View recipe' })).toBeVisible();
  await page.getByRole('menuitem', { name: 'Remove from favorites' }).click();
  await expect(favorite).toHaveAttribute('aria-pressed', 'false');
  if (isMobile) {
    const scroller = page.getByRole('group', { name: 'Recipe categories' });
    expect(await scroller.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await category(page, 'Desserts').click();
    await expect(cards(page)).toHaveCount(20);
    await expect(category(page, 'Desserts')).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Sort recipes' }).click();
    await page.getByRole('menuitemradio', { name: 'Oldest first', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Sort recipes' })).toHaveText('Oldest first');
    await category(page, 'All').click();
  }
  await cards(page).first().getByRole('heading').getByRole('link').click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/^Recipe /);
});
