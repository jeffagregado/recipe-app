import type { BrowserContext, Page } from '@playwright/test';
import { eq } from '../apps/api/node_modules/drizzle-orm/index.js';
import { authRateLimits } from '../apps/api/src/database/schema.js';
import { createHash } from 'node:crypto';
import { authTest as test, expect, WEB_URL } from './fixtures.js';

// Password-toggle screenshots and traces must not persist credentials.
test.use({ trace: 'off', screenshot: 'off' });

const cards = (page: Page) => page.getByRole('list', { name: 'Recipes' }).locator(':scope > li');
const allCount = (page: Page) => page.getByRole('group', { name: 'Recipe categories' }).getByRole('button', { name: /^All / });
const mode = (page: Page, name: string) => page.getByRole('group', { name: 'Authentication mode' }).getByRole('button', { name, exact: true });
async function login(page: Page, email: string, password: string) {
  await page.goto('/');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
}
async function logout(page: Page) {
  await page.getByRole('button', { name: 'Log out', exact: true }).filter({ visible: true }).click();
  await expect(page).toHaveURL(`${WEB_URL}/`);
  await expect(page.getByLabel('Email', { exact: true })).toBeVisible();
}

const fits = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
const sessionCookies = async (context: BrowserContext) => (await context.cookies()).filter(({ name }) => name.endsWith('session_token'));

test('signup sends to check-your-email, the link verifies once without a session, then login opens an empty library', async ({ page, context, workerData }) => {
  const email = workerData.newEmail();
  const password = workerData.newPassword();
  const key = `wrapper:signup:address:${createHash('sha256').update(workerData.address).digest('hex').slice(0, 32)}`;
  const before = await workerData.db.query.authRateLimits.findFirst({ where: eq(authRateLimits.key, key) });
  await page.goto('/');
  await mode(page, 'Sign up').click();
  await expect(page.locator('form input')).toHaveCount(3);
  await expect(page.getByLabel('Display Name', { exact: true })).toHaveAttribute('autocomplete', 'name');
  await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('autocomplete', 'new-password');
  await page.getByLabel('Display Name', { exact: true }).fill('My test kitchen');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.locator('form').getByRole('button', { name: 'Sign up', exact: true }).click();
  await expect(page).toHaveURL(`${WEB_URL}/check-email`);
  await expect(page.getByRole('heading', { level: 1, name: 'Check your email' })).toBeVisible();
  await expect(page.getByText(email, { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Resend verification email', exact: true })).toBeVisible();
  await page.setViewportSize({ width: 320, height: 720 });
  expect(await fits(page)).toBe(true);
  expect(await sessionCookies(context)).toEqual([]);
  // Without a session the private pages stay closed.
  await page.goto('/recipes');
  await expect(page).toHaveURL(`${WEB_URL}/`);

  const [token] = await workerData.verificationTokens(email);
  await page.goto(`/verify-email?token=${token}`);
  await expect(page.getByText('Email verified. Log in to continue.', { exact: true })).toBeVisible();
  await expect(page).toHaveURL(`${WEB_URL}/`);
  expect(await sessionCookies(context)).toEqual([]);
  // The link works once: opening it again shows the expired state with a way to ask for another.
  await page.goto(`/verify-email?token=${token}`);
  await expect(page).toHaveURL(`${WEB_URL}/verify-email/invalid`);
  await expect(page.getByRole('heading', { level: 1, name: 'This link has expired or was already used' })).toBeVisible();
  await expect(page.getByLabel('Email', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Resend verification email', exact: true })).toBeVisible();
  expect(await fits(page)).toBe(true);
  await page.setViewportSize({ width: 1280, height: 720 });

  await login(page, email, password);
  await expect(page).toHaveURL(`${WEB_URL}/recipes`);
  await expect(page.getByText('Your recipe library is empty.', { exact: true })).toBeVisible();
  await expect(allCount(page)).toContainText('0');
  const after = await workerData.db.query.authRateLimits.findFirst({ where: eq(authRateLimits.key, key) });
  expect(after?.count).toBe((before?.count ?? 0) + 1);
  const cookie = (await context.cookies()).find(({ name }) => name === 'better-auth.session_token');
  expect(Boolean(cookie?.httpOnly && cookie.sameSite === 'Lax')).toBe(true);
  await page.goto('/');
  await expect(page.getByText('Welcome, My test kitchen')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open recipes' })).toHaveAttribute('href', '/recipes');
  await logout(page);
  await page.goto('/recipes');
  await expect(page).toHaveURL(`${WEB_URL}/`);
  await login(page, email.toUpperCase(), password);
  await expect(page).toHaveURL(`${WEB_URL}/recipes`);
  await expect(page.getByText('Your recipe library is empty.', { exact: true })).toBeVisible();
});

test('the right password before verifying shows the verify message with a resend, and the new link lets the person in', async ({ page, workerData }) => {
  const { email, password } = await workerData.signupUnverified();
  await page.setViewportSize({ width: 320, height: 720 });
  await login(page, email, workerData.newPassword());
  await expect(page.locator('form').getByRole('alert')).toHaveText('Invalid email or password');
  await expect(page.getByRole('button', { name: 'Resend verification email', exact: true })).toHaveCount(0);
  await login(page, email, password);
  await expect(page.getByText('Verify your email before logging in.', { exact: true })).toBeVisible();
  await expect(page).toHaveURL(`${WEB_URL}/`);
  expect(await fits(page)).toBe(true);
  // Counts only: a failed assertion must not print a link.
  expect((await workerData.verificationTokens(email)).length).toBe(1);
  await page.getByRole('button', { name: 'Resend verification email', exact: true }).click();
  await expect(page.getByText('If that address needs verifying, we sent a new link.', { exact: true })).toBeVisible();
  expect(await fits(page)).toBe(true);
  const tokens = await workerData.verificationTokens(email);
  expect(tokens.length).toBe(2);
  await page.goto(`/verify-email?token=${tokens[0]}`);
  await expect(page.getByText('Email verified. Log in to continue.', { exact: true })).toBeVisible();
  await login(page, email, password);
  await expect(page).toHaveURL(`${WEB_URL}/recipes`);
});

test('wrong password and unknown email match; duplicate email links an exact field error', async ({ page, workerData }) => {
  await login(page, workerData.owner.email, workerData.newPassword());
  await expect(page.locator('form').getByRole('alert')).toHaveText('Invalid email or password');
  const unknown = workerData.newEmail();
  await login(page, unknown, workerData.newPassword());
  await expect(page.locator('form').getByRole('alert')).toHaveText('Invalid email or password');
  await mode(page, 'Sign up').click();
  await page.getByLabel('Display Name', { exact: true }).fill('Another kitchen');
  await page.getByLabel('Email', { exact: true }).fill(workerData.owner.email.toUpperCase());
  await page.getByLabel('Password', { exact: true }).fill(workerData.newPassword());
  await page.locator('form').getByRole('button', { name: 'Sign up', exact: true }).click();
  await expect(page.getByLabel('Email', { exact: true })).toHaveAccessibleDescription('Email already exists.');
  await expect(page.getByLabel('Email', { exact: true })).toBeFocused();
});

test('anonymous routes redirect, keyboard login works, toggle/error focus and 320px layout work', async ({ page, workerData }) => {
  await page.goto('/recipes');
  await expect(page).toHaveURL(`${WEB_URL}/`);
  await page.setViewportSize({ width: 320, height: 720 });
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page.getByLabel('Email', { exact: true })).toBeFocused();
  await page.keyboard.type(workerData.owner.email.toUpperCase());
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Password', { exact: true })).toBeFocused();
  await page.keyboard.type(workerData.owner.password);
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Show password' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('type', 'text');
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('type', 'password');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Forgot password?', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Log in', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(`${WEB_URL}/recipes`);
  await expect(cards(page)).toHaveCount(20);
});

test('switching owners clears rows, totals, pagination and browser Back state', async ({ page, workerData }) => {
  await login(page, workerData.owner.email, workerData.owner.password);
  await expect(cards(page)).toHaveCount(20);
  await expect(allCount(page)).toContainText('100');
  await page.getByText('Showing 20 of 100 recipes', { exact: true }).scrollIntoViewIfNeeded();
  await expect(cards(page)).toHaveCount(40);
  await logout(page);
  await page.goBack();
  await expect(page).toHaveURL(`${WEB_URL}/`);
  await expect(cards(page)).toHaveCount(0);
  await login(page, workerData.other.email, workerData.other.password);
  await expect(cards(page)).toHaveCount(20);
  await expect(allCount(page)).toContainText('25');
  const nextPage = page.waitForResponse((response) => new URL(response.url()).pathname === '/backend/recipes' && new URL(response.url()).searchParams.get('page') === '2');
  await page.getByText('Showing 20 of 25 recipes', { exact: true }).scrollIntoViewIfNeeded();
  expect((await nextPage).status()).toBe(200);
  await expect(cards(page)).toHaveCount(25);
  const hrefs = await cards(page).getByRole('heading').getByRole('link').evaluateAll((links) => links.map((link) => link.getAttribute('href')));
  expect(hrefs.every((href) => href?.startsWith(`/recipes/${workerData.other.tag}-`))).toBe(true);
  await expect(cards(page).getByRole('heading').filter({ hasText: /^Other kitchen: / })).toHaveCount(25);
  await logout(page);
  await login(page, workerData.owner.email, workerData.owner.password);
  await expect(cards(page)).toHaveCount(20);
  await expect(allCount(page)).toContainText('100');
  await expect(cards(page).getByText(/^Other kitchen: /)).toHaveCount(0);
});

for (const trigger of ['pagination', 'focus'] as const) {
  test(`revoked session leaves private UI on next ${trigger}`, async ({ page, workerData }) => {
    await login(page, workerData.owner.email, workerData.owner.password);
    await expect(cards(page)).toHaveCount(20);
    // Revokes only this test's current session, leaving the worker's fixture session intact.
    const cookie = (await page.context().cookies()).filter(({ name }) => name === 'better-auth.session_token').map(({ name, value }) => `${name}=${value}`).join('; ');
    const response = await workerData.client.post('/auth/logout', {}, { cookie });
    expect(response.status).toBe(204);
    if (trigger === 'pagination') await page.getByText('Showing 20 of 100 recipes', { exact: true }).scrollIntoViewIfNeeded();
    else await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(page).toHaveURL(`${WEB_URL}/`);
    await expect(cards(page)).toHaveCount(0);
  });
}

test('session tokens stay out of rendered HTML and browser storage; the create form renders no secrets', async ({ page, context, workerData }) => {
  await login(page, workerData.owner.email, workerData.owner.password);
  await expect(cards(page)).toHaveCount(20);
  const secrets = (await context.cookies()).filter(({ name }) => name.endsWith('session_token')).flatMap(({ value }) => [value, decodeURIComponent(value)]);
  const response = await page.goto('/recipes');
  const html = await response!.text();
  const storage = await page.evaluate(() => JSON.stringify([Object.entries(localStorage), Object.entries(sessionStorage)]));
  expect(secrets.some((value) => html.includes(value) || storage.includes(value))).toBe(false);
  expect(html.includes('http://127.0.0.1:4101')).toBe(false);
  const create = await page.goto('/recipes/create');
  await expect(page.getByRole('heading', { level: 1, name: 'Create Recipe' })).toBeVisible();
  const createHtml = await create!.text();
  expect(secrets.some((value) => createHtml.includes(value))).toBe(false);
  expect(createHtml.includes('http://127.0.0.1:4101')).toBe(false);
});

for (const width of [320, 390, 768, 1440]) {
  test(`root and recipes fit ${width}px without horizontal overflow or console errors`, async ({ page, workerData }) => {
    const errors: string[] = [];
    // Settings is the only sidebar route that still answers 404 by design.
    page.on('console', (message) => {
      if (message.type() === 'error' && !(message.text().includes('404 (Not Found)') && /\/settings(\?|$)/.test(message.location().url))) errors.push(message.text());
    });
    page.on('pageerror', (error) => errors.push(error.message));
    const fits = () => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
    await page.setViewportSize({ width, height: 900 });
    // The Google button is a touch target on both forms at every width: at least 44px tall and inside the viewport.
    const googleFits = async () => {
      const box = await page.getByRole('button', { name: 'Continue with Google', exact: true }).boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(44);
      expect(box?.x).toBeGreaterThanOrEqual(0);
      expect((box?.x ?? width) + (box?.width ?? width)).toBeLessThanOrEqual(width);
    };
    await page.goto('/');
    await expect(page.getByLabel('Email', { exact: true })).toBeVisible();
    await googleFits();
    await mode(page, 'Sign up').click();
    await expect(page.getByLabel('Display Name', { exact: true })).toBeVisible();
    await googleFits();
    expect(await fits()).toBe(true);
    await login(page, workerData.owner.email, workerData.owner.password);
    await expect(cards(page)).toHaveCount(20);
    expect(await fits()).toBe(true);
    expect(errors).toEqual([]);
  });
}
