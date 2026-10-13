import type { Locator, Page } from '@playwright/test';
import { addSession, creatorTest as test, expect, WEB_URL } from './fixtures.js';
import { noOverflow, toast, waitHydrated, watchConsole } from './create-recipe-helpers.js';

// Settings: the page shell and its cards, Display name (#49) and Password (#50).
const card = (page: Page) => page.getByRole('region', { name: 'Display name', exact: true });
const nameInput = (page: Page) => card(page).getByRole('textbox', { name: 'Display name', exact: true });
const save = (page: Page) => card(page).getByRole('button', { name: 'Save name', exact: true });
const passwordCard = (page: Page) => page.getByRole('region', { name: 'Password', exact: true });
const currentPassword = (page: Page) => passwordCard(page).getByLabel('Current password', { exact: true });
const newPassword = (page: Page) => passwordCard(page).getByLabel('New password', { exact: true });
const changePassword = (page: Page) => passwordCard(page).getByRole('button', { name: 'Change password', exact: true });
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

  await nameInput(page).fill('Ana María');
  await expect(card(page).getByText('9/100', { exact: true })).toBeVisible();
  // Saved from the keyboard: Enter in the field, and focus stays there once the stored name comes back.
  await nameInput(page).press('Enter');
  const notice = toast.success(page, 'Display name saved');
  await expect(notice).toBeVisible();
  await expect(sidebar(page).getByText('Ana María', { exact: true })).toBeVisible();
  await expect(sidebar(page).getByText(stored, { exact: true })).toHaveCount(0);
  await expect(nameInput(page)).toHaveValue('Ana María');
  await expect(save(page)).toBeDisabled();
  await expect(nameInput(page)).toBeFocused();
  await toast.dismiss(notice).click();

  // The stored name, not a preserved copy: a fresh load reads it back.
  await page.reload();
  await expect(nameInput(page)).toHaveValue('Ana María');
  await expect(sidebar(page).getByText('Ana María', { exact: true })).toBeVisible();
});

test('password journey: a wrong current password is refused inline, the right one changes it, and the other device is signed out', async ({ page, context, browser, creator, workerData }) => {
  const sessionStatus = async (browserContext: typeof context) => (await browserContext.request.get('/backend/auth/session')).status();
  const loginStatus = async (password: string) => (await workerData.client.post('/auth/login', { email: creator.email, password })).status;
  // A second device: its own session of the same Account, in its own browser.
  const second = await workerData.client.post('/auth/login', { email: creator.email, password: creator.password });
  expect(second.status).toBe(200);
  const elsewhere = await browser.newContext({ baseURL: WEB_URL, extraHTTPHeaders: { 'X-Forwarded-For': workerData.address } });
  try {
    await addSession(elsewhere, second.headers.getSetCookie().map((value) => value.split(';')[0]).join('; '));
    const signedIn = await elsewhere.newPage();
    await signedIn.goto('/settings');
    await expect(signedIn.getByRole('heading', { level: 1, name: 'Settings', exact: true })).toBeVisible();
    expect(await sessionStatus(elsewhere)).toBe(200);

    await page.setViewportSize({ width: 1280, height: 900 });
    await openSettings(page);
    await expect(passwordCard(page).getByText('Changing it signs out your other devices.', { exact: true })).toBeVisible();
    await expect(changePassword(page)).toBeDisabled();
    const next = workerData.newPassword();

    // The new password is not the current one: the refusal lands on that field and nothing changes.
    await currentPassword(page).fill(next);
    await newPassword(page).fill(next);
    await changePassword(page).click();
    await expect(currentPassword(page)).toHaveAccessibleDescription('Current password is incorrect.');
    await expect(currentPassword(page)).toBeFocused();
    await toast.dismiss(toast.error(page, 'Couldn’t change your password. Try again.')).click();
    expect(await sessionStatus(elsewhere)).toBe(200);

    await currentPassword(page).fill(creator.password);
    // Changed from the keyboard: Enter in the last field.
    await newPassword(page).press('Enter');
    const notice = toast.success(page, 'Password changed');
    await expect(notice).toBeVisible();
    await expect(currentPassword(page)).toHaveValue('');
    await expect(newPassword(page)).toHaveValue('');
    await expect(changePassword(page)).toBeDisabled();
    await toast.dismiss(notice).click();

    // This browser stays signed in, also across a fresh load.
    expect(await sessionStatus(context)).toBe(200);
    await page.reload();
    await expect(page).toHaveURL(`${WEB_URL}/settings`);
    await expect(passwordCard(page)).toBeVisible();

    // The other device is out.
    expect(await sessionStatus(elsewhere)).toBe(401);
    await signedIn.goto('/settings');
    await expect(signedIn).toHaveURL(`${WEB_URL}/`);
    await expect(signedIn.getByLabel('Email', { exact: true })).toBeVisible();

    // Statuses only: a failed assertion must not print a password.
    expect(await loginStatus(creator.password)).toBe(401);
    expect(await loginStatus(next)).toBe(200);
  } finally { await elsewhere.close(); }
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
    // The Password card stacks below with the same width and the same 44px controls.
    const passwordBox = await box(passwordCard(page));
    expect(passwordBox.y).toBeGreaterThanOrEqual(cardBox.y + cardBox.height);
    expect(passwordBox.x).toBe(cardBox.x);
    expect(passwordBox.width).toBe(cardBox.width);
    await expect(passwordCard(page).getByText('Changing it signs out your other devices.', { exact: true })).toBeVisible();
    for (const control of [currentPassword(page), newPassword(page), changePassword(page)]) expect((await box(control)).height).toBeGreaterThanOrEqual(44);
    await expect(changePassword(page)).toBeDisabled();
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
