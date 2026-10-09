import { mkdir } from 'node:fs/promises';
import type { Page } from '@playwright/test';
import { creatorTest as test, expect } from './fixtures.js';
import { RICH_FILES, WIDTHS, createRecipeViaApi, field, fillRich, minimalMetadata, openCreate, richMetadata, stubVideoHosts } from './create-recipe-helpers.js';

// Screenshot capture for visual review; not part of the default run. Use:
//   CREATE_RECIPE_VISUAL=1 pnpm exec playwright test e2e/create-recipe-visual.spec.ts --project=chromium
const OUTPUT = 'output/playwright/create-recipe';

test.skip(!process.env.CREATE_RECIPE_VISUAL, 'Set CREATE_RECIPE_VISUAL=1 to capture the Create Recipe screenshots.');
test.skip(({ isMobile }) => isMobile, 'Widths are set explicitly; one desktop-engine pass is enough.');

async function capture(page: Page, name: string, width: number) {
  await page.setViewportSize({ width, height: 900 });
  await page.evaluate(() => window.scrollTo(0, 0));
  // Let lazy images and layout settle before the full-page capture.
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: `${OUTPUT}/${name}-${width}.png`, fullPage: true });
}

test('captures the Create page and the detail page at every width', async ({ page, creator, workerData }) => {
  test.setTimeout(300_000);
  await mkdir(OUTPUT, { recursive: true });
  await stubVideoHosts(page);

  await openCreate(page);
  for (const width of WIDTHS) await capture(page, 'create-empty', width);

  await field.save(page).click();
  await expect(page.getByText('Add a title before saving.')).toBeVisible();
  for (const width of WIDTHS) await capture(page, 'create-invalid', width);

  await openCreate(page);
  await fillRich(page, 'Creamy Garlic Pasta');
  await expect(page.getByText(/^boiling-pasta\.png · \d+ KB$/)).toBeVisible();
  for (const width of WIDTHS) await capture(page, 'create-filled', width);

  // Mobile "scrolled down" state: the sticky header stays put while Instructions scroll underneath.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('region', { name: /^Instructions/ }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${OUTPUT}/create-scrolled-390.png` });

  const minimal = await createRecipeViaApi(creator, workerData.address, minimalMetadata('Boiled Water'));
  const rich = await createRecipeViaApi(creator, workerData.address, richMetadata('Creamy Garlic Pasta'), RICH_FILES);
  for (const [name, id] of [['detail-minimal', minimal], ['detail-rich', rich]] as const) {
    await page.goto(`/recipes/${id}`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      await page.waitForFunction(() => Array.from(document.querySelectorAll('article img')).every((image) => (image as HTMLImageElement).complete));
      await capture(page, name, width);
    }
  }
});
