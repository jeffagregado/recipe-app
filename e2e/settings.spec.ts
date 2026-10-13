import type { Locator, Page } from '@playwright/test';
import { creatorTest as test, expect, WEB_URL } from './fixtures.js';
import { noOverflow, toast, waitHydrated, watchConsole } from './create-recipe-helpers.js';

// Settings (#49): the page shell and its first card, Display name.
const card = (page: Page) => page.getByRole('region', { name: 'Display name', exact: true });
const nameInput = (page: Page) => card(page).getByRole('textbox', { name: 'Display name', exact: true });
const save = (page: Page) => card(page).getByRole('button', { name: 'Save name', exact: true });
const sidebar = (page: Page) => page.getByRole('complementary');
const mainNav = (page: Page) => page.getByRole('navigation', { name: 'Main', exact: true });
const box = async (locator: Locator) => (await locator.boundingBox())!;
const issues = new WeakMap<Page, string[]>();

// creatorTest signs up a fresh Account through the fixture, so renaming it never touches the worker's shared owner.
test.beforeEach(async ({ page }) => { issues.set(page, watchConsole(page)); });
test.afterEach(async ({ page }) => { expect(issues.get(page)).toEqual([]); });

async function openSettings(page: Page) {
  await page.goto('/settings');
  await expect(page.getByRole('heading', { level: 1, name: 'Settings', exact: true })).toBeVisible();
  await waitHydrated(nameInput(page));
}

test('sidebar journey: Settings is current, a changed name saves and the sidebar shows it without a reload', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/recipes');
  await sidebar(page).getByRole('link', { name: 'Settings', exact: true }).click();
  await expect(page).toHaveURL(`${WEB_URL}/settings`);
  await expect(page.getByRole('heading', { level: 1, name: 'Settings', exact: true })).toBeVisible();
  await expect(page.getByText('Your name, email, password and the ways you sign in.', { exact: true })).toBeVisible();
  await expect(sidebar(page).locator('a[aria-current="page"]')).toHaveText(['Settings']);
  await waitHydrated(nameInput(page));

  // The card opens with the name sign-up stored, which is the one the sidebar shows.
  const stored = await nameInput(page).inputValue();
  expect(stored).not.toBe('');
  await expect(sidebar(page).getByText(stored, { exact: true })).toBeVisible();
  await expect(save(page)).toBeDisabled();

  await nameInput(page).fill('   ');
  await save(page).click();
  await expect(nameInput(page)).toHaveAccessibleDescription('Enter a display name.');
  await expect(sidebar(page).getByText(stored, { exact: true })).toBeVisible();

  await nameInput(page).fill('Ana María');
  await expect(card(page).getByText('9/100', { exact: true })).toBeVisible();
  await save(page).click();
  const notice = toast.success(page, 'Display name saved');
  await expect(notice).toBeVisible();
  await expect(sidebar(page).getByText('Ana María', { exact: true })).toBeVisible();
  await expect(sidebar(page).getByText(stored, { exact: true })).toHaveCount(0);
  await expect(nameInput(page)).toHaveValue('Ana María');
  await expect(save(page)).toBeDisabled();
  await toast.dismiss(notice).click();

  // The stored name, not a preserved copy: a fresh load reads it back.
  await page.reload();
  await expect(nameInput(page)).toHaveValue('Ana María');
  await expect(sidebar(page).getByText('Ana María', { exact: true })).toBeVisible();
});

for (const width of [320, 390, 768]) {
  test(`at ${width}px the page fits, Settings is the current tab and the card saves above the tab bar`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await openSettings(page);
    expect(await noOverflow(page)).toBe(true);
    await expect(sidebar(page)).toBeHidden();
    await expect(mainNav(page).locator('a[aria-current="page"]')).toHaveText(['Settings']);

    const [cardBox, inputBox, saveBox, barBox] = [await box(card(page)), await box(nameInput(page)), await box(save(page)), await box(mainNav(page))];
    expect(cardBox.x).toBeGreaterThanOrEqual(0);
    expect(cardBox.x + cardBox.width).toBeLessThanOrEqual(width);
    for (const control of [inputBox, saveBox]) expect(control.height).toBeGreaterThanOrEqual(44);
    expect(saveBox.y + saveBox.height).toBeLessThanOrEqual(barBox.y);

    await nameInput(page).fill(`Narrow ${width}`);
    await save(page).click();
    const notice = toast.success(page, 'Display name saved');
    await expect(notice).toBeVisible();
    // Below md the toast stacks under the page's sticky header with the app's usual gap, as on Categories.
    if (width < 768) {
      const header = await box(page.locator('header').filter({ has: page.getByRole('heading', { level: 1, name: 'Settings', exact: true }) }));
      expect((await box(notice)).y).toBeGreaterThanOrEqual(header.y + header.height);
    }
    await expect(save(page)).toBeDisabled();
    expect(await noOverflow(page)).toBe(true);
    await toast.dismiss(notice).click();

    if (width < 768) {
      await page.getByRole('link', { name: 'Back', exact: true }).click();
      await expect(page).toHaveURL(`${WEB_URL}/recipes`);
    }
  });
}
