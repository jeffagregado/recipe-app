import { test, expect } from '@playwright/test';

// Public privacy and terms pages (#82): the Google consent screen links to them, so they open without a session.
const PAGES = [
  { link: 'Privacy Policy', path: '/privacy', tabsFromGoogle: 1 },
  { link: 'Terms of Service', path: '/terms', tabsFromGoogle: 2 },
] as const;

test.describe('at 320×720 without a session', () => {
  test.use({ viewport: { width: 320, height: 720 } });

  // Google verifies that the home page names the app as the consent screen does (#86).
  test('the home page names the app Recapp in its title and on the page', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle('Recapp');
    await expect(page.getByText('Recapp', { exact: true })).toBeVisible();
  });

  for (const { link, path, tabsFromGoogle } of PAGES) {
    test(`the sign-in footer reaches ${path} by keyboard, and the page fits the width`, async ({ page, baseURL }) => {
      await page.goto('/auth/login');
      await page.getByRole('button', { name: 'Continue with Google', exact: true }).focus();
      for (let press = 0; press < tabsFromGoogle; press++) await page.keyboard.press('Tab');
      await expect(page.getByRole('contentinfo').getByRole('link', { name: link, exact: true })).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(page).toHaveURL(`${baseURL}${path}`);
      await expect(page.getByRole('heading', { level: 1, name: link })).toBeVisible();
      await expect(page.getByText(/^Last updated /)).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    });

    test(`a direct visit to ${path} returns the page without a redirect`, async ({ page, baseURL }) => {
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);
      expect(response?.request().redirectedFrom()).toBeNull();
      await expect(page).toHaveURL(`${baseURL}${path}`);
      await expect(page).toHaveTitle(`${link} · Recapp`);
      await expect(page.getByRole('heading', { level: 1, name: link })).toBeVisible();
    });
  }
});
