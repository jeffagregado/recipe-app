import { authTest, test, expect } from './fixtures.js';

// TEMPORARY (#16): deliberate failures that prove the failure artifact. Removed before the final commit.
authTest('artifact proof: a failure after typing credentials', async ({ page, workerData }) => {
  await page.goto('/');
  await page.getByLabel('Username', { exact: true }).fill(workerData.owner.username);
  await page.getByLabel('Password', { exact: true }).fill(workerData.owner.password);
  await page.getByLabel('Password', { exact: true }).press('Tab');
  await page.keyboard.type('typed-on-the-keyboard');
  await expect(page.getByRole('heading', { name: 'This heading does not exist' })).toBeVisible({ timeout: 2_000 });
});

test('artifact proof: a failure on a page with signed photo URLs', async ({ page }) => {
  await page.goto('/recipes');
  const photo = page.getByRole('list', { name: 'Recipes' }).locator('img').first();
  await expect(photo).toBeVisible();
  await expect(photo).toHaveAttribute('alt', 'This alt text does not exist', { timeout: 2_000 });
});
