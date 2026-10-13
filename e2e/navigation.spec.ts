import type { Locator, Page } from '@playwright/test';
import { creatorTest as test, expect, WEB_URL } from './fixtures.js';
import { createRecipeViaApi, logOut, minimalMetadata, recipeCards, stubVideoHosts, watchConsole } from './create-recipe-helpers.js';

// Mobile navigation (#31): below lg the sidebar becomes a top header and a bottom tab bar; from lg nothing changes.
const issues = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => { issues.set(page, watchConsole(page)); await stubVideoHosts(page); });
test.afterEach(async ({ page }) => { expect(issues.get(page)).toEqual([]); });

const box = async (locator: Locator) => (await locator.boundingBox())!;
const mainNav = (page: Page) => page.getByRole('navigation', { name: 'Main', exact: true });
const tab = (page: Page, name: string) => mainNav(page).getByRole('link', { name, exact: true });
const sidebar = (page: Page) => page.getByRole('complementary');
const currentTabs = (page: Page) => mainNav(page).locator('a[aria-current="page"]');
const TABS = ['Recipes', 'Create', 'Categories', 'Settings'] as const;

test.describe('at 390×844', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('the Main navigation shows the four tabs in the sidebar order, each at least 44px, and the sidebar is absent', async ({ page }) => {
    await page.goto('/recipes');
    await expect(mainNav(page)).toBeVisible();
    await expect(mainNav(page).getByRole('link')).toHaveText([...TABS]);
    await expect(sidebar(page)).toBeHidden();
    for (const name of TABS) {
      const { width, height } = await box(tab(page, name));
      expect(width, name).toBeGreaterThanOrEqual(44);
      expect(height, name).toBeGreaterThanOrEqual(44);
    }
  });

  test('tapping each tab navigates and moves the current marking; a recipe page marks none', async ({ page, creator, workerData }) => {
    const id = await createRecipeViaApi(creator, workerData.address, minimalMetadata('Tab bar host'));
    await page.goto('/recipes');
    await expect(currentTabs(page)).toHaveText(['Recipes']);
    for (const [name, path] of [['Create', '/recipes/create'], ['Categories', '/categories'], ['Settings', '/settings'], ['Recipes', '/recipes']] as const) {
      await tab(page, name).click();
      await expect(page).toHaveURL(`${WEB_URL}${path}`);
      await expect(currentTabs(page)).toHaveText([name]);
    }
    await page.goto(`/recipes/${id}`);
    await expect(page.getByRole('heading', { level: 1, name: 'Tab bar host' })).toBeVisible();
    await expect(mainNav(page)).toBeVisible();
    await expect(currentTabs(page)).toHaveCount(0);
  });

  test('a full recipe list scrolled to the bottom keeps the last card above the bar', async ({ page, creator, workerData }) => {
    // Six cards, three rows of two at 390px, so the list scrolls past one screen. One at a time: the API allows one write per user at once.
    for (let index = 0; index < 6; index++) await createRecipeViaApi(creator, workerData.address, minimalMetadata(`Scroll card ${index + 1}`));
    await page.goto('/recipes');
    await expect(recipeCards(page)).toHaveCount(6);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect.poll(() => page.evaluate(() => window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 1)).toBe(true);
    const lastCard = await box(recipeCards(page).last());
    const bar = await box(mainNav(page));
    expect(lastCard.y + lastCard.height).toBeLessThanOrEqual(bar.y);
  });

  test('the header shows the brand and a Log out button without the account name, and Log out signs out', async ({ page, creator }) => {
    await page.goto('/recipes');
    const header = page.locator('header').filter({ hasText: 'My Recipes' });
    await expect(header.getByRole('link', { name: /My Recipes/ })).toHaveAttribute('href', '/recipes');
    await expect(header.getByRole('button', { name: 'Log out', exact: true })).toBeVisible();
    await expect(header).not.toContainText(creator.user.displayName);
    await expect(header).not.toContainText(creator.email);
    await logOut(page);
  });
});

test.describe('at 1280×720', () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test('the sidebar is visible and the bottom navigation is not rendered', async ({ page }) => {
    await page.goto('/recipes');
    await expect(sidebar(page)).toBeVisible();
    await expect(sidebar(page).getByRole('link', { name: 'Create Recipe' })).toBeVisible();
    await expect(mainNav(page)).toBeHidden();
    await expect(page.locator('header').filter({ hasText: 'My Recipes' })).toBeHidden();
  });
});
