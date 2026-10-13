import type { Locator, Page } from '@playwright/test';
import { addSession, creatorTest as test, expect, WEB_URL } from './fixtures.js';
import { logIn, logOut, noOverflow, toast, waitHydrated, watchConsole } from './create-recipe-helpers.js';

// Settings: the page shell and its cards, Display name (#49), Email (#51) and Password (#50).
const card = (page: Page) => page.getByRole('region', { name: 'Display name', exact: true });
const nameInput = (page: Page) => card(page).getByRole('textbox', { name: 'Display name', exact: true });
const save = (page: Page) => card(page).getByRole('button', { name: 'Save name', exact: true });
const passwordCard = (page: Page) => page.getByRole('region', { name: 'Password', exact: true });
const currentPassword = (page: Page) => passwordCard(page).getByLabel('Current password', { exact: true });
const newPassword = (page: Page) => passwordCard(page).getByLabel('New password', { exact: true });
const changePassword = (page: Page) => passwordCard(page).getByRole('button', { name: 'Change password', exact: true });
const emailCard = (page: Page) => page.getByRole('region', { name: 'Email', exact: true });
const currentEmail = (page: Page) => emailCard(page).getByLabel('Current email', { exact: true });
const newEmail = (page: Page) => emailCard(page).getByLabel('New email', { exact: true });
const emailPassword = (page: Page) => emailCard(page).getByLabel('Current password', { exact: true });
const sendLink = (page: Page) => emailCard(page).getByRole('button', { name: 'Send verification link', exact: true });
/** The pending-change banner. Toasts are statuses too, but they sit outside the card. */
const pendingBanner = (page: Page) => emailCard(page).getByRole('status');
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

test('password journey: changing the password keeps this browser signed in and signs the other device out', async ({ page, context, browser, creator, workerData }) => {
  const sessionStatus = async (browserContext: typeof context) => (await browserContext.request.get('/backend/auth/session')).status();
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

    await currentPassword(page).fill(creator.password);
    await newPassword(page).fill(workerData.newPassword());
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
  } finally { await elsewhere.close(); }
});

test('email journey: a link to the new address is confirmed with one button, Settings shows the new email and it signs in', async ({ page, context, creator, workerData }) => {
  const sessionStatus = async () => (await context.request.get('/backend/auth/session')).status();
  const address = workerData.newEmail();
  await page.setViewportSize({ width: 1280, height: 900 });
  await openSettings(page);
  await expect(currentEmail(page)).toHaveValue(creator.email);
  await expect(emailCard(page).getByText('Verified', { exact: true })).toBeVisible();
  await expect(pendingBanner(page)).toHaveCount(0);
  await expect(sendLink(page)).toBeDisabled();

  await newEmail(page).fill(address);
  await emailPassword(page).fill(creator.password);
  // Sent from the keyboard: Enter in the last field.
  await emailPassword(page).press('Enter');
  const sent = toast.success(page, 'Verification link sent');
  await expect(sent).toBeVisible();
  await toast.dismiss(sent).click();
  // The banner names the new address; the Account still has its old one and the form is empty again.
  await expect(pendingBanner(page)).toContainText(`We sent a link to ${address}. Your email changes once you open it.`);
  await expect(currentEmail(page)).toHaveValue(creator.email);
  await expect(newEmail(page)).toHaveValue('');
  await expect(emailPassword(page)).toHaveValue('');

  // Counts only: a failed assertion must not print a link.
  const tokens = await workerData.emailChangeTokens(creator.email);
  expect(tokens.length).toBe(1);
  await page.goto(`/confirm-email-change?token=${tokens[0]}`);
  await expect(page.getByRole('heading', { level: 1, name: 'Confirm your new email' })).toBeVisible();
  expect(await page.locator('meta[name="referrer"]').getAttribute('content')).toBe('no-referrer');
  // Opening the page used nothing up: the link is still stored, as it would be after a mail scanner opened it.
  expect((await workerData.emailChangeTokens(creator.email)).length).toBe(1);
  await page.setViewportSize({ width: 320, height: 720 });
  expect(await noOverflow(page)).toBe(true);
  await page.setViewportSize({ width: 1280, height: 900 });

  const confirm = page.getByRole('button', { name: 'Confirm email change', exact: true });
  await waitHydrated(confirm);
  await confirm.click();
  // Signed in as the Account, so the person returns to Settings, still signed in, with the new address in place.
  await expect(page).toHaveURL(`${WEB_URL}/settings`);
  await expect(toast.success(page, 'Email changed')).toBeVisible();
  await expect(currentEmail(page)).toHaveValue(address);
  await expect(pendingBanner(page)).toHaveCount(0);
  expect(await sessionStatus()).toBe(200);
  expect((await workerData.emailChangeTokens(address)).length).toBe(0);

  // The link works once: pressing its button again shows the expired state with the way back to Settings.
  await page.goto(`/confirm-email-change?token=${tokens[0]}`);
  await waitHydrated(confirm);
  await confirm.click();
  await expect(page.getByText('This link has expired or was already used.', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Back to Settings', exact: true }).click();
  await expect(page).toHaveURL(`${WEB_URL}/settings`);
  await expect(currentEmail(page)).toHaveValue(address);

  // The old address is no longer an Account; the new one signs in with the same password.
  await logOut(page);
  await page.getByLabel('Email', { exact: true }).fill(creator.email);
  await page.getByLabel('Password', { exact: true }).fill(creator.password);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page.locator('form').getByRole('alert')).toHaveText('Invalid email or password');
  await logIn(page, { email: address, password: creator.password });
  await page.goto('/settings');
  await expect(currentEmail(page)).toHaveValue(address);
});

test('at 320px a pending change shows its banner inside the card, and Cancel removes it', async ({ page, creator, workerData }) => {
  const address = workerData.newEmail();
  const started = await workerData.client.post('/account/email-change', { newEmail: address, currentPassword: creator.password }, { cookie: creator.cookie });
  expect(started.status).toBe(200);
  await page.setViewportSize({ width: 320, height: 844 });
  await openSettings(page);
  await expect(pendingBanner(page)).toContainText(`We sent a link to ${address}. Your email changes once you open it.`);
  expect(await noOverflow(page)).toBe(true);
  const [cardBox, bannerBox] = [await box(emailCard(page)), await box(pendingBanner(page))];
  expect(bannerBox.x).toBeGreaterThanOrEqual(cardBox.x);
  expect(bannerBox.x + bannerBox.width).toBeLessThanOrEqual(cardBox.x + cardBox.width);
  const cancel = pendingBanner(page).getByRole('button', { name: 'Cancel', exact: true });
  for (const control of [pendingBanner(page).getByRole('button', { name: 'Resend', exact: true }), cancel]) expect((await box(control)).height).toBeGreaterThanOrEqual(44);

  await cancel.click();
  await expect(toast.success(page, 'Email change cancelled')).toBeVisible();
  await expect(pendingBanner(page)).toHaveCount(0);
  await expect(currentEmail(page)).toHaveValue(creator.email);
  expect((await workerData.emailChangeTokens(creator.email)).length).toBe(0);
  expect(await noOverflow(page)).toBe(true);
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
    // The Email card stacks below with the same width and the same 44px controls, and the Password card below that.
    const emailBox = await box(emailCard(page));
    expect(emailBox.y).toBeGreaterThanOrEqual(cardBox.y + cardBox.height);
    expect(emailBox.x).toBe(cardBox.x);
    expect(emailBox.width).toBe(cardBox.width);
    for (const control of [currentEmail(page), newEmail(page), emailPassword(page), sendLink(page)]) expect((await box(control)).height).toBeGreaterThanOrEqual(44);
    await expect(sendLink(page)).toBeDisabled();
    const passwordBox = await box(passwordCard(page));
    expect(passwordBox.y).toBeGreaterThanOrEqual(emailBox.y + emailBox.height);
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
