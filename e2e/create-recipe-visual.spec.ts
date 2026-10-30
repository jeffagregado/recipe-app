import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import type { Locator, Page } from '@playwright/test';
import { eq } from '../apps/api/node_modules/drizzle-orm/index.js';
import type { DrizzleDb } from '../apps/api/src/database/database.service.js';
import { authRateLimits } from '../apps/api/src/database/schema.js';
import { creatorTest as test, expect } from './fixtures.js';
import { RICH, RICH_FILES, WIDTHS, categoryIdsFor, createRecipeViaApi, field, fillRich, imagesLoaded, minimalMetadata, openCreate, openRecipe, photo, richMetadata, stubVideoHosts } from './create-recipe-helpers.js';

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
  await expect(page.getByText(/^boiling-pasta\.(webp|jpg) · \d+ KB$/)).toBeVisible();
  for (const width of WIDTHS) await capture(page, 'create-filled', width);

  // Mobile "scrolled down" state: the sticky header stays put while Instructions scroll underneath.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('region', { name: /^Instructions/ }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${OUTPUT}/create-scrolled-390.png` });

  const minimal = await createRecipeViaApi(creator, workerData.address, minimalMetadata('Boiled Water'));
  const rich = await createRecipeViaApi(creator, workerData.address, richMetadata('Creamy Garlic Pasta', await categoryIdsFor(creator, RICH.categories)), RICH_FILES);
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

// ---- Recipe page release ----------------------------------------------------------------------------------------------
const RECIPE_OUTPUT = 'output/playwright/recipe-page';

async function shoot(page: Page, name: string, width: number, { fullPage = true } = {}) {
  await page.setViewportSize({ width, height: 900 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForLoadState('networkidle');
  // Overlays fade in and out over ~100–200 ms; capture them settled.
  if (!fullPage) await page.waitForTimeout(500);
  await page.screenshot({ path: `${RECIPE_OUTPUT}/${name}-${width}.png`, fullPage });
}

/** Larger, dish-like photos so cover, poster and step thumbnails are judged on something real-looking. */
const DISH = {
  cover: photo('carbonara-cover.png', [214, 160, 90], 1200, 640),
  one: photo('boiling-water.png', [120, 150, 190], 800, 600),
  three: photo('garlic-pan.png', [190, 120, 140], 800, 600),
  four: photo('plated.png', [90, 140, 90], 800, 600),
};

const visualMetadata = (title: string, categoryIds: string[]) => ({
  ...richMetadata(title, categoryIds),
  description: 'A simple and creamy pasta that’s quick to make. Perfect for a weeknight dinner.',
  servings: 2,
  ingredients: [
    { name: 'Spaghetti or fettuccine', quantity: 200, unit: 'g' as const }, { name: 'Bacon (optional)', quantity: 100, unit: 'g' as const },
    { name: 'Garlic', quantity: 4, unit: 'clove' as const }, { name: 'Cooking cream', quantity: 200, unit: 'ml' as const }, { name: 'Salt', quantity: null, unit: null },
  ],
  instructions: [
    { description: 'Bring a pot of salted water to a boil. Cook the pasta according to package directions until al dente. Drain and set aside.', hasImage: true },
    { description: 'In a large pan, cook the bacon over medium heat until crispy. Remove and set aside.', hasImage: false },
    { description: 'In the same pan, add a little butter and sauté the garlic until fragrant. Pour in the cooking cream and let it simmer for 2–3 minutes.', hasImage: true },
    { description: 'Toss the pasta with the sauce, top with the bacon and serve right away.', hasImage: true },
  ],
  notes: 'Swap the bacon for mushrooms to make it vegetarian. Keeps for 2 days in the fridge; loosen with a splash of milk when reheating.',
});
const VISUAL_FILES = { cover: DISH.cover, 'step-0': DISH.one, 'step-2': DISH.three, 'step-3': DISH.four };

/** Opens one overlay per width, captures the viewport with it settled, then closes it with Escape. */
async function captureOverlay(page: Page, name: string, widths: readonly number[], open: () => Promise<Locator>) {
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    const overlay = await open();
    await expect(overlay).toBeVisible();
    await shoot(page, name, width, { fullPage: false });
    await page.keyboard.press('Escape');
    await expect(overlay).toHaveCount(0);
  }
}

/** Menu open (desktop widths), the delete confirmation and the step photo dialog. */
async function captureOverlays(page: Page) {
  const openMenu = async () => {
    await page.getByRole('button', { name: /^More options for / }).click();
    return page.getByRole('menu');
  };
  await captureOverlay(page, 'recipe-menu-open', [1024, 1280, 1440], openMenu);
  await captureOverlay(page, 'recipe-delete-dialog', WIDTHS, async () => {
    await openMenu();
    await page.getByRole('menuitem', { name: 'Delete recipe' }).click();
    return page.getByRole('alertdialog', { name: 'Delete recipe?' });
  });
  await captureOverlay(page, 'recipe-photo-dialog', WIDTHS, async () => {
    await page.getByRole('button', { name: 'Open step 1 photo' }).scrollIntoViewIfNeeded();
    await page.getByRole('button', { name: 'Open step 1 photo' }).click();
    await expect.poll(() => imagesLoaded(page, '[role="dialog"] img')).toBe(true);
    return page.getByRole('dialog', { name: 'Step 1 photo' });
  });
}

/** Error toast over the page (persistent), then the success toast on arrival. */
async function captureToasts(page: Page, db: DrizzleDb, userId: string, recipeId: string) {
  const limitKey = `wrapper:recipe-favorite:user:${userId}`;
  await db.insert(authRateLimits).values({ id: randomUUID(), key: limitKey, count: 120, lastRequest: Date.now() });
  await page.getByRole('button', { name: 'Add Creamy Garlic Pasta to favorites' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Couldn’t save favorite. Try again.' })).toHaveCount(1);
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(250);
    await shoot(page, 'recipe-toast-error', width, { fullPage: false });
  }
  await db.delete(authRateLimits).where(eq(authRateLimits.key, limitKey));
  await page.getByRole('button', { name: 'Add Creamy Garlic Pasta to favorites' }).click();
  await expect(page.getByRole('button', { name: 'Remove Creamy Garlic Pasta from favorites' })).toHaveAttribute('aria-pressed', 'true');
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/recipes/${recipeId}?notice=recipe-saved`);
    await expect(page.getByRole('status').filter({ hasText: 'Recipe saved' })).toBeVisible();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${RECIPE_OUTPUT}/recipe-toast-success-${width}.png` });
  }
}

test('captures the recipe page, its overlays, the edit page and not-found at every width', async ({ page, creator, workerData }) => {
  test.setTimeout(900_000);
  await mkdir(RECIPE_OUTPUT, { recursive: true });
  await stubVideoHosts(page);

  const rich = await createRecipeViaApi(creator, workerData.address, visualMetadata('Creamy Garlic Pasta', await categoryIdsFor(creator, RICH.categories)), VISUAL_FILES);
  const minimal = await createRecipeViaApi(creator, workerData.address, minimalMetadata('Boiled Water'));
  const waitForImages = async () => { await expect.poll(() => imagesLoaded(page)).toBe(true); };

  await openRecipe(page, minimal, 'Boiled Water');
  for (const width of WIDTHS) await shoot(page, 'recipe-minimal', width);

  await openRecipe(page, rich, 'Creamy Garlic Pasta');
  await waitForImages();
  for (const width of WIDTHS) await shoot(page, 'recipe-rich', width);

  // Scaled and checked-off ingredients.
  await page.getByRole('button', { name: 'Increase servings' }).click();
  await page.getByRole('checkbox', { name: /^Bacon/ }).click();
  for (const width of [390, 1280]) await shoot(page, 'recipe-rich-scaled', width);
  await page.reload();
  await waitForImages();

  await captureOverlays(page);
  await captureToasts(page, workerData.db, creator.user.id, rich);

  // Edit page, pre-filled.
  await page.goto(`/recipes/${rich}/edit`);
  await expect(page.getByRole('heading', { level: 1, name: 'Edit Recipe' })).toBeVisible();
  await expect.poll(() => imagesLoaded(page, 'form img')).toBe(true);
  for (const width of WIDTHS) await shoot(page, 'edit-prefilled', width);

  // Not found, frozen so the five-second redirect does not move the page while it is captured.
  await page.clock.install();
  await page.goto('/recipes/does-not-exist');
  await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible();
  await page.clock.pauseAt(new Date(Date.now() + 500));
  for (const width of WIDTHS) await shoot(page, 'not-found', width);
});
