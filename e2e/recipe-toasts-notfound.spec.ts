import { randomUUID } from 'node:crypto';
import type { Locator, Page } from '@playwright/test';
import { authRateLimits } from '../apps/api/src/database/schema.js';
import { seedRecipes } from '../apps/api/src/recipes/seed-recipes.js';
import { creatorTest as test, expect, WEB_URL } from './fixtures.js';
import {
  createRecipeViaApi, field, fillMinimal, minimalMetadata, openCreate, openRecipe, recipeCards, stubVideoHosts, toast, waitHydrated, watchConsole,
} from './create-recipe-helpers.js';

const issues = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => { issues.set(page, watchConsole(page)); await stubVideoHosts(page); });
test.afterEach(async ({ page }) => { expect(issues.get(page)).toEqual([]); });

const box = async (locator: Locator) => (await locator.boundingBox())!;
const FAVORITE_ERROR = 'Couldn’t save favorite. Try again.';
const notFoundHeading = (page: Page) => page.getByRole('heading', { level: 1, name: 'Page not found' });

test.describe('toasts', () => {
  test('a success toast is a status with a Dismiss button and goes away by itself after about five seconds', async ({ page, creator, workerData }) => {
    const id = await createRecipeViaApi(creator, workerData.address, minimalMetadata('Timed toast'));
    await page.goto(`/recipes/${id}?notice=recipe-saved`);
    const saved = toast.success(page, 'Recipe saved');
    await expect(saved).toBeVisible();
    const shownAt = Date.now();
    await expect(saved).toHaveAttribute('role', 'status');
    await expect(saved.getByRole('button', { name: 'Dismiss' })).toBeVisible();
    // It was already on screen for a moment before the clock above started, so only "still there after 2 s" and "gone by 8 s" are real-time claims.
    await page.waitForTimeout(2_000);
    await expect(saved).toBeVisible();
    await expect(saved).toHaveCount(0, { timeout: 10_000 });
    expect(Date.now() - shownAt).toBeLessThan(8_000);
  });

  test('the five seconds are exact: still there at 4.5 s, gone by 6 s (fake clock)', async ({ page, creator, workerData }) => {
    const id = await createRecipeViaApi(creator, workerData.address, minimalMetadata('Exact toast'));
    await page.clock.install();
    await page.goto(`/recipes/${id}?notice=recipe-saved`);
    const saved = toast.success(page, 'Recipe saved');
    await expect(saved).toBeVisible();
    await page.clock.runFor(4_500);
    await expect(saved).toBeVisible();
    await page.clock.runFor(1_500);
    await expect(saved).toHaveCount(0);
  });

  test('a success toast can be dismissed earlier with Dismiss, by mouse and by keyboard', async ({ page, creator, workerData }) => {
    const id = await createRecipeViaApi(creator, workerData.address, minimalMetadata('Dismissed toast'));
    await page.goto(`/recipes/${id}?notice=recipe-saved`);
    const saved = toast.success(page, 'Recipe saved');
    await expect(saved).toBeVisible();
    await saved.getByRole('button', { name: 'Dismiss' }).click();
    await expect(saved).toHaveCount(0, { timeout: 2_000 });

    await page.goto(`/recipes/${id}?notice=recipe-updated`);
    const updated = toast.success(page, 'Recipe updated');
    await expect(updated).toBeVisible();
    await updated.getByRole('button', { name: 'Dismiss' }).focus();
    await page.keyboard.press('Enter');
    await expect(updated).toHaveCount(0, { timeout: 2_000 });
  });

  test('an error toast is an alert that stays beyond five seconds until dismissed, and is announced once', async ({ page, creator, workerData }) => {
    const id = await createRecipeViaApi(creator, workerData.address, minimalMetadata('Persistent error'));
    await workerData.db.insert(authRateLimits).values({ id: randomUUID(), key: `wrapper:recipe-favorite:user:${creator.user.id}`, count: 120, lastRequest: Date.now() });
    await openRecipe(page, id, 'Persistent error');
    await page.getByRole('button', { name: 'Add Persistent error to favorites' }).click();
    const failure = toast.error(page, FAVORITE_ERROR);
    await expect(failure).toBeVisible();
    await expect(failure).toHaveAttribute('role', 'alert');
    await expect(toast.announced(page, FAVORITE_ERROR)).toHaveCount(1);
    await page.waitForTimeout(7_000);
    await expect(failure).toBeVisible();
    await toast.dismiss(failure).click();
    await expect(failure).toHaveCount(0, { timeout: 2_000 });
  });

  test('the notice parameter is removed after the toast shows; a reload, Back and Forward never show it again; other parameters stay', async ({ page, creator, workerData }) => {
    await createRecipeViaApi(creator, workerData.address, minimalMetadata('Notice host'));
    await page.goto('/recipes');
    await expect(recipeCards(page)).toHaveCount(1);
    await page.goto('/recipes?notice=recipe-deleted&search=Notice');
    await expect(toast.success(page, 'Recipe deleted')).toBeVisible();
    await expect(page).toHaveURL(`${WEB_URL}/recipes?search=Notice`);
    expect(new URL(page.url()).searchParams.has('notice')).toBe(false);

    await page.reload();
    await expect(recipeCards(page)).toHaveCount(1);
    await page.waitForTimeout(1_000);
    await expect(page.getByText('Recipe deleted')).toHaveCount(0);

    await page.goBack();
    await page.waitForTimeout(500);
    await expect(page.getByText('Recipe deleted')).toHaveCount(0);
    await page.goForward();
    await page.waitForTimeout(500);
    await expect(page).toHaveURL(`${WEB_URL}/recipes?search=Notice`);
    await expect(page.getByText('Recipe deleted')).toHaveCount(0);
  });

  test('unknown notice codes show nothing but are still removed from the URL', async ({ page }) => {
    for (const code of ['bogus', 'toString', 'constructor', '__proto__']) {
      await page.goto(`/recipes?notice=${code}`);
      await expect(page).toHaveURL(`${WEB_URL}/recipes`);
      await expect(page.getByRole('region', { name: 'Notifications' }).locator('[data-slot="toast"]')).toHaveCount(0);
    }
  });

  test('toasts sit bottom-right on desktop and across the bottom on mobile', async ({ page, creator, workerData }) => {
    const id = await createRecipeViaApi(creator, workerData.address, minimalMetadata('Toast position'));
    for (const [width, height] of [[1280, 720], [390, 844]] as const) {
      await page.setViewportSize({ width, height });
      await page.goto(`/recipes/${id}?notice=recipe-saved`);
      const saved = toast.success(page, 'Recipe saved');
      await expect(saved).toBeVisible();
      // The toast slides in; measure once it has settled.
      await expect.poll(async () => Math.round((await box(saved)).y + (await box(saved)).height), { timeout: 3_000 }).toBeGreaterThan(height - 40);
      await page.waitForTimeout(300);
      const toastBox = await box(saved);
      if (width >= 640) {
        expect(Math.abs(toastBox.x + toastBox.width - (width - 24))).toBeLessThan(2);
        expect(Math.abs(toastBox.y + toastBox.height - (height - 24))).toBeLessThan(2);
        expect(toastBox.width).toBeLessThanOrEqual(384.5);
        expect(toastBox.x).toBeGreaterThan(width / 2);
      } else {
        expect(Math.abs(toastBox.x - 16)).toBeLessThan(2);
        expect(Math.abs(toastBox.x + toastBox.width - (width - 16))).toBeLessThan(2);
        expect(Math.abs(toastBox.y + toastBox.height - (height - 16))).toBeLessThan(2);
      }
      await saved.getByRole('button', { name: 'Dismiss' }).click();
    }
  });

  test('a toast neither takes focus nor covers the sticky header and Save button on mobile', async ({ page, creator, workerData }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await workerData.db.insert(authRateLimits).values({ id: randomUUID(), key: `wrapper:recipe-write:user:${creator.user.id}`, count: 60, lastRequest: Date.now() });
    await openCreate(page);
    await fillMinimal(page, 'Toast over form');
    await field.title(page).focus();
    // A rate-limited save is the real failure that raises the toast.
    await field.save(page).click();
    await expect(toast.error(page, 'Couldn’t save recipe. Try again.')).toBeVisible();
    const toastBox = await box(toast.error(page, 'Couldn’t save recipe. Try again.'));
    const saveBox = await box(field.save(page));
    await expect(field.save(page)).toBeInViewport({ ratio: 1 });
    const overlap = !(toastBox.x + toastBox.width <= saveBox.x || saveBox.x + saveBox.width <= toastBox.x || toastBox.y + toastBox.height <= saveBox.y || saveBox.y + saveBox.height <= toastBox.y);
    expect(overlap).toBe(false);
    // Focus stays where the user was; the toast does not trap it.
    expect(await page.evaluate(() => Boolean(document.activeElement?.closest('[data-slot="toast"]')))).toBe(false);
    await field.title(page).focus();
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => Boolean(document.activeElement?.closest('[data-slot="toast"]')))).toBe(false);
    await expect(field.save(page)).toBeEnabled();
    await expect(field.title(page)).toBeEditable();
  });
});

test.describe('page not found', () => {
  const unknownPaths = (workerData: { other: { tag: string } }, id: string) => [
    ['an unknown recipe id', '/recipes/does-not-exist'],
    ["another account's recipe id", `/recipes/${workerData.other.tag}-${seedRecipes[0].id}`],
    ['an unknown edit sub-path', `/recipes/${id}/edit/x`],
    ['an unknown recipe sub-path', `/recipes/${id}/nope`],
    ['an unknown create sub-path', '/recipes/create/nope'],
  ] as const;

  test('every unknown private URL shows the block and redirects to Recipes after five seconds', async ({ page, creator, workerData }) => {
    test.setTimeout(120_000);
    const id = await createRecipeViaApi(creator, workerData.address, minimalMetadata('Known recipe'));
    await page.clock.install();
    for (const [label, path] of unknownPaths(workerData, id)) {
      await page.goto(path);
      await expect(notFoundHeading(page), label).toBeVisible();
      const status = page.getByRole('status').filter({ hasText: 'Taking you to Recipes in 5 seconds.' });
      await expect(status, label).toBeVisible();
      await expect(page.getByRole('link', { name: 'Go now' }), label).toHaveAttribute('href', '/recipes');
      await page.clock.fastForward(4_000);
      await expect(page, `${label} before five seconds`).toHaveURL(`${WEB_URL}${path}`);
      await page.clock.fastForward(1_500);
      await expect(page, `${label} after five seconds`).toHaveURL(`${WEB_URL}/recipes`);
      await expect(page.getByRole('link', { name: 'New Recipe' })).toBeVisible();
    }
  });

  test('the redirect really takes about five seconds on the real clock', async ({ page }) => {
    await page.goto('/recipes/does-not-exist');
    await expect(notFoundHeading(page)).toBeVisible();
    const shownAt = Date.now();
    await expect(page).toHaveURL(`${WEB_URL}/recipes`, { timeout: 10_000 });
    const waited = Date.now() - shownAt;
    expect(waited).toBeGreaterThan(3_500);
    expect(waited).toBeLessThan(8_500);
  });

  test('Go now leaves immediately and no second redirect fires afterwards', async ({ page }) => {
    await page.clock.install();
    await page.goto('/recipes/does-not-exist');
    await expect(notFoundHeading(page)).toBeVisible();
    await page.getByRole('link', { name: 'Go now' }).click();
    await expect(page).toHaveURL(`${WEB_URL}/recipes`);
    // Move on; a leftover timer from the abandoned page must not pull the user back to Recipes.
    await page.getByRole('link', { name: 'New Recipe' }).click();
    await expect(page).toHaveURL(`${WEB_URL}/recipes/create`);
    await expect(field.title(page)).toBeEditable();
    await page.clock.fastForward(15_000);
    await expect(page).toHaveURL(`${WEB_URL}/recipes/create`);
  });

  test('the countdown is one static sentence in a status region and is not re-announced every second', async ({ page }) => {
    await page.clock.install();
    await page.goto('/recipes/does-not-exist');
    const status = page.getByRole('status').filter({ hasText: 'Taking you to Recipes in 5 seconds.' });
    await expect(status).toBeVisible();
    await expect(status).toHaveCount(1);
    await status.evaluate((element) => {
      (window as unknown as { __mutations: number }).__mutations = 0;
      new MutationObserver((records) => { (window as unknown as { __mutations: number }).__mutations += records.length; }).observe(element, { subtree: true, childList: true, characterData: true, attributes: true });
    });
    for (let second = 0; second < 4; second++) await page.clock.fastForward(1_000);
    expect(await page.evaluate(() => (window as unknown as { __mutations: number }).__mutations)).toBe(0);
    await expect(status).toHaveText('Taking you to Recipes in 5 seconds.');
  });

  test('an anonymous visitor to those URLs is sent to the sign-in page instead', async ({ browser, creator, workerData }) => {
    const id = await createRecipeViaApi(creator, workerData.address, minimalMetadata('Anonymous probe'));
    const anonymous = await browser.newContext();
    try {
      const visitor = await anonymous.newPage();
      for (const [label, path] of unknownPaths(workerData, id)) {
        await visitor.goto(`${WEB_URL}${path}`);
        await expect(visitor, label).toHaveURL(`${WEB_URL}/`);
        await expect(visitor.getByLabel('Username', { exact: true }), label).toBeVisible();
        await expect(visitor.getByRole('heading', { level: 1, name: 'Page not found' }), label).toHaveCount(0);
      }
    } finally { await anonymous.close(); }
  });

  test('a public unknown URL is an ordinary 404, not the redirecting block', async ({ page, browser }) => {
    await page.clock.install();
    const response = await page.goto('/nope');
    expect(response?.status()).toBe(404);
    await expect(page.getByText('Taking you to Recipes')).toHaveCount(0);
    await page.clock.fastForward(8_000);
    await expect(page).toHaveURL(`${WEB_URL}/nope`);

    const anonymous = await browser.newContext();
    try {
      const visitor = await anonymous.newPage();
      const anonymousResponse = await visitor.goto(`${WEB_URL}/nope`);
      expect(anonymousResponse?.status()).toBe(404);
      await expect(visitor.getByText('Taking you to Recipes')).toHaveCount(0);
      await expect(visitor).toHaveURL(`${WEB_URL}/nope`);
    } finally { await anonymous.close(); }
    // The only console entry is the browser's own note about the 404 document itself.
    const logged = issues.get(page)!;
    expect(logged.every((entry) => entry.includes('status of 404') && entry.endsWith('(/nope)'))).toBe(true);
    logged.length = 0;
  });
});
