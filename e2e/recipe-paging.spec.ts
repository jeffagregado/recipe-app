import { mkdir } from 'node:fs/promises';
import type { Page } from '@playwright/test';
import { test, expect } from './fixtures.js';

const api = 'http://127.0.0.1:4100/backend';
const cards = (page: Page) => page.getByRole('list', { name: 'Recipes' }).locator(':scope > li');
const category = (page: Page, name: string) => page.getByRole('group', { name: 'Recipe categories' }).getByRole('button', { name: new RegExp(`^${name}(?: |$)`) });
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
  const html = await response!.text();
  expect(html.match(/<li class="min-w-0"/g)).toHaveLength(20);
  expect(html).toContain('aria-label="Loading categories"');
  expect(html).toContain('aria-label="Loading recipes"');
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
  // Desktop sidebar prefetches two existing routes outside this feature's scope.
  for (const path of missingRoutes) expect(['/categories', '/settings']).toContain(path);
  expect(consoleErrors).toHaveLength(missingRoutes.length);
  expect(consoleErrors.every((message) => message.includes('404 (Not Found)'))).toBe(true);
});

test('shows category/count and card skeletons while real filter and next-page requests wait', async ({ page }, info) => {
  let releaseFilter!: () => void;
  let releasePage!: () => void;
  const filterGate = new Promise<void>((resolve) => { releaseFilter = resolve; });
  const pageGate = new Promise<void>((resolve) => { releasePage = resolve; });
  await page.route(`${api}/recipes?*`, async (route) => {
    const params = new URL(route.request().url()).searchParams;
    if (params.get('category') === 'Breakfast') await (params.get('page') === '1' ? filterGate : pageGate);
    await route.continue();
  });
  try {
    await page.goto('/recipes');
    await expect(cards(page)).toHaveCount(20);
    await category(page, 'Breakfast').click();
    const categories = page.getByRole('group', { name: 'Recipe categories' });
    const loading = page.getByRole('status', { name: 'Loading recipes', exact: true });
    await expect(categories).toHaveAttribute('aria-busy', 'true');
    await expect(categories.locator('[data-slot="skeleton"]')).toHaveCount(7);
    await expect(loading).toBeVisible();
    await expect(category(page, 'Dinner')).toBeEnabled();
    await mkdir('output/playwright', { recursive: true });
    await page.screenshot({ path: `output/playwright/recipe-loading-${info.project.name}.png` });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    expect(await loading.locator('[data-slot="skeleton"]').first().evaluate((element) => getComputedStyle(element).animationName)).toBe('none');
    releaseFilter();
    await expect(cards(page)).toHaveCount(20);
    await expect(loading).toHaveCount(0);
    await expect(categories).toHaveAttribute('aria-busy', 'false');
    await page.getByText('Showing 20 of 23 recipes', { exact: true }).scrollIntoViewIfNeeded();
    await expect(page.getByRole('status', { name: 'Loading more recipes', exact: true })).toBeVisible();
    await expect(cards(page)).toHaveCount(20);
    releasePage();
    await expect(cards(page)).toHaveCount(23);
    await expect(page.getByRole('status', { name: 'Loading more recipes', exact: true })).toHaveCount(0);
  } finally { releaseFilter(); releasePage(); }
});

test('toggles Asc/Desc beside sort while preserving category, field and URL history', async ({ page }) => {
  await page.goto('/recipes?category=Breakfast&sortBy=title&order=asc');
  await expect(cards(page)).toHaveCount(20);
  await expect(firstTitle(page)).toHaveText('Apple Cinnamon Porridge');
  const direction = page.getByRole('group', { name: 'Recipe sorting' });
  await expect(direction.getByRole('button', { name: 'Switch to descending order' })).toHaveText('Asc');
  await direction.getByRole('button', { name: 'Switch to descending order' }).click();
  await expect(firstTitle(page)).toHaveText('Tomato Scrambled Eggs');
  await expect(cards(page)).toHaveCount(20);
  const descending = new URL(page.url());
  expect(descending.searchParams.get('category')).toBe('Breakfast');
  expect(descending.searchParams.get('sortBy')).toBe('title');
  expect(descending.searchParams.has('order')).toBe(false);
  await expect(direction.getByRole('button', { name: 'Switch to ascending order' })).toHaveText('Desc');
  await page.reload();
  await expect(firstTitle(page)).toHaveText('Tomato Scrambled Eggs');
  await page.goBack();
  await expect(firstTitle(page)).toHaveText('Apple Cinnamon Porridge');
  await page.goForward();
  await expect(firstTitle(page)).toHaveText('Tomato Scrambled Eggs');
  await direction.getByRole('button', { name: 'Switch to ascending order' }).click();
  await expect(firstTitle(page)).toHaveText('Apple Cinnamon Porridge');
  expect(new URL(page.url()).searchParams.get('order')).toBe('asc');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
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
    await new Promise((resolve) => setTimeout(resolve, 20_500));
    await route.abort();
  });
  await page.goto('/recipes');
  await expect(cards(page)).toHaveCount(20);
  await page.getByText('Showing 20 of 100 recipes', { exact: true }).scrollIntoViewIfNeeded();
  await expect(requestAlert(page)).toContainText('invalid recipe list data');
  mode = 'slow';
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(requestAlert(page)).toContainText('timed out after 20 seconds', { timeout: 25_000 });
  await expect(cards(page)).toHaveCount(20);
  await page.unrouteAll({ behavior: 'wait' });
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(cards(page)).toHaveCount(40);
});

test('accepts healthy filter responses beyond the former five-second client limit', async ({ page }) => {
  await page.route(`${api}/recipes?*`, async (route) => {
    if (new URL(route.request().url()).searchParams.get('category') === 'Breakfast') {
      await new Promise((resolve) => setTimeout(resolve, 6_000));
    }
    await route.continue();
  });
  await page.goto('/recipes');
  await expect(cards(page)).toHaveCount(20);
  // The owner's unfiltered first card can match the filtered one, so wait for the slow response itself.
  const filtered = page.waitForResponse((response) => new URL(response.url()).searchParams.get('category') === 'Breakfast', { timeout: 15_000 });
  await category(page, 'Breakfast').click();
  expect((await filtered).status()).toBe(200);
  await expect(firstTitle(page)).toHaveText('Banana Oat Pancakes');
  await expect(cards(page)).toHaveCount(20);
  await expect(requestAlert(page)).toHaveCount(0);
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
  // The heart saves through a Server Action; a second toggle is ignored until the first save has settled.
  await Promise.all([page.waitForResponse((response) => response.request().method() === 'POST'), favorite.click()]);
  await expect(card.getByRole('button', { name: 'Remove Banana Oat Pancakes from favorites' })).toHaveAttribute('aria-pressed', 'true');
  await card.getByRole('button', { name: 'More options for Banana Oat Pancakes' }).click();
  await expect(page.getByRole('menuitem', { name: 'Edit recipe' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Delete recipe' })).toBeVisible();
  await page.keyboard.press('Escape');
  await Promise.all([page.waitForResponse((response) => response.request().method() === 'POST'), card.getByRole('button', { name: 'Remove Banana Oat Pancakes from favorites' }).click()]);
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
  const title = await firstTitle(page).textContent();
  await cards(page).first().getByRole('heading').getByRole('link').click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(title!);
});
