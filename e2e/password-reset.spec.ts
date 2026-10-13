import type { BrowserContext, Page } from '@playwright/test';
import { addSession, authTest as test, expect, WEB_URL } from './fixtures.js';

// Password-toggle screenshots and traces must not persist credentials, and the reset link is in the address bar.
test.use({ trace: 'off', screenshot: 'off' });

const fits = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
const sessionCookies = async (context: BrowserContext) => (await context.cookies()).filter(({ name }) => name.endsWith('session_token'));
/** What the web app's own session read answers for this browser's cookies: the list behind /recipes can take longer than an assertion waits. */
const sessionStatus = async (context: BrowserContext) => (await context.request.get('/backend/auth/session')).status();
async function login(page: Page, email: string, password: string) {
  await page.goto('/');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
}

test('a forgotten password is reset through the emailed link, the new one signs in and the old session is gone', async ({ page, context, browser, workerData }) => {
  const account = await workerData.signupFreshAccount();
  const password = workerData.newPassword();
  // A second browser that stays signed in with the session from before the reset.
  const elsewhere = await browser.newContext({ baseURL: WEB_URL, extraHTTPHeaders: { 'X-Forwarded-For': workerData.address } });
  try {
    await addSession(elsewhere, account.cookie);
    const signedIn = await elsewhere.newPage();
    await signedIn.goto('/recipes');
    await expect(signedIn).toHaveURL(`${WEB_URL}/recipes`);
    expect(await sessionStatus(elsewhere)).toBe(200);

    await page.setViewportSize({ width: 320, height: 720 });
    await page.goto('/');
    await page.getByRole('link', { name: 'Forgot password?', exact: true }).click();
    await expect(page).toHaveURL(`${WEB_URL}/forgot-password`);
    await expect(page.getByRole('heading', { level: 1, name: 'Forgot your password?' })).toBeVisible();
    expect(await fits(page)).toBe(true);
    // The login page stays mounted, hidden, behind a client navigation; only the visible field is this page's.
    await page.getByLabel('Email', { exact: true }).filter({ visible: true }).fill(account.email.toUpperCase());
    await page.getByRole('button', { name: 'Send reset link', exact: true }).click();
    await expect(page.getByText('If an Account exists for that address, we sent a link to reset its password. The link expires in one hour.', { exact: true })).toBeVisible();
    expect(await fits(page)).toBe(true);

    // Counts only: a failed assertion must not print a link.
    const tokens = await workerData.resetTokens(account.email);
    expect(tokens.length).toBe(1);
    await page.goto(`/reset-password?token=${tokens[0]}`);
    await expect(page.getByRole('heading', { level: 1, name: 'Choose a new password' })).toBeVisible();
    expect(await page.locator('meta[name="referrer"]').getAttribute('content')).toBe('no-referrer');
    expect(await fits(page)).toBe(true);
    // Opening the page used nothing up: the link is still stored and the old session still works.
    expect((await workerData.resetTokens(account.email)).length).toBe(1);
    expect(await sessionStatus(elsewhere)).toBe(200);

    await page.getByLabel('New password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Update password', exact: true }).click();
    await expect(page.getByText('Password updated. Log in with your new password.', { exact: true })).toBeVisible();
    await expect(page).toHaveURL(`${WEB_URL}/`);
    // The reset signs nobody in.
    expect(await sessionCookies(context)).toEqual([]);
    expect((await workerData.resetTokens(account.email)).length).toBe(0);

    // The browser that was signed in before the reset is out.
    expect(await sessionStatus(elsewhere)).toBe(401);
    await signedIn.goto('/recipes');
    await expect(signedIn).toHaveURL(`${WEB_URL}/`);
    await expect(signedIn.getByLabel('Email', { exact: true })).toBeVisible();

    await login(page, account.email, account.password);
    await expect(page.locator('form').getByRole('alert')).toHaveText('Invalid email or password');
    await login(page, account.email, password);
    await expect(page).toHaveURL(`${WEB_URL}/recipes`);
    expect(await sessionStatus(context)).toBe(200);

    // The link works once: submitting it again shows the expired state with a way to ask for another.
    await page.goto(`/reset-password?token=${tokens[0]}`);
    await page.getByLabel('New password', { exact: true }).fill(workerData.newPassword());
    await page.getByRole('button', { name: 'Update password', exact: true }).click();
    await expect(page.getByText('This link has expired or was already used.', { exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Request a new link', exact: true })).toHaveAttribute('href', '/forgot-password');
    expect(await fits(page)).toBe(true);
  } finally { await elsewhere.close(); }
});
