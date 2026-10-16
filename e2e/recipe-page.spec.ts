import { randomUUID } from 'node:crypto';
import type { Locator, Page } from '@playwright/test';
import { eq } from '../apps/api/node_modules/drizzle-orm/index.js';
import { authRateLimits, recipes } from '../apps/api/src/database/schema.js';
import { creatorTest as test, expect } from './fixtures.js';
import {
  PLAIN_LINK, RICH, RICH_FILES, WIDTHS, categoryIdsFor, createRecipeViaApi, imagesLoaded, ingredientRows, metadataWith, minimalMetadata, noOverflow, openRecipe, photoButtons,
  recordRequests, richMetadata, stepTexts, stubVideoHosts, toast, watchConsole,
  type CreateMetadata,
} from './create-recipe-helpers.js';

const issues = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => { issues.set(page, watchConsole(page)); await stubVideoHosts(page); });
test.afterEach(async ({ page }) => { expect(issues.get(page)).toEqual([]); });

const box = async (locator: Locator) => (await locator.boundingBox())!;
const section = (page: Page, name: string) => page.getByRole('region', { name, exact: true });
const detailsText = (page: Page) => page.getByRole('list', { name: 'Recipe details' }).locator(':scope > li')
  .evaluateAll((items) => items.map((item) => (item.textContent ?? '').replace(/·/g, ' ').replace(/\s+/g, ' ').trim()));

/** Six long steps, photos on steps 1 and 3, so the page scrolls and the right column outgrows the left one. */
const longRich = (title: string, categoryIds: string[], videoUrl?: string | null): CreateMetadata => {
  const base = richMetadata(title, categoryIds, videoUrl);
  const filler = 'Stir gently and keep the heat low so nothing catches on the bottom of the pan while the flavours come together. ';
  return {
    ...base,
    instructions: Array.from({ length: 6 }, (_, index) => ({ description: `Step ${index + 1}. ${filler.repeat(3)}`, hasImage: index === 0 || index === 2 })),
  };
};

/** Servings 4 with amounts that exercise rounding: 5 servings give 250 g, 1.88 tbsp, 3.75 piece, 0.42 tsp. */
const scalable = (title: string, servings: number | null = 4): CreateMetadata => metadataWith(title, {
  servings,
  ingredients: [
    { name: 'Flour', quantity: 200, unit: 'g' }, { name: 'Olive oil', quantity: 1.5, unit: 'tbsp' }, { name: 'Eggs', quantity: 3, unit: 'piece' },
    { name: 'Pepper', quantity: 0.333, unit: 'tsp' }, { name: 'Salt', quantity: null, unit: null },
  ],
});

test.describe('content', () => {
  test('a rich recipe shows banner, title row, chips, meta, description and the four cards in order', async ({ page, creator, workerData }) => {
    const id = await createRecipeViaApi(creator, workerData.address, richMetadata('Rich page', await categoryIdsFor(creator, RICH.categories)), RICH_FILES);
    await openRecipe(page, id, 'Rich page');
    await expect(page.getByRole('img', { name: 'Rich page' })).toBeVisible();
    await expect(page.getByRole('list', { name: 'Categories' }).getByRole('listitem')).toHaveText(RICH.categories);
    expect(await detailsText(page)).toEqual(['Prep 10 min Cook 20 min Total 30 min', '4 servings']);
    await expect(page.getByText(RICH.description)).toBeVisible();
    await expect(page.locator('article section h2')).toHaveText(['Ingredients', 'Video', 'Instructions', 'Notes']);
    await expect(section(page, 'Notes')).toContainText('Swap the bacon for mushrooms.');
    await expect(section(page, 'Notes')).toContainText('Keeps for two days.');
    expect(await ingredientRows(page)).toEqual([
      { name: 'Spaghetti', amount: '200 g' }, { name: 'Olive oil', amount: '1.5 tbsp' }, { name: 'Salt', amount: 'to taste' },
    ]);
    expect(await stepTexts(page)).toEqual(RICH.steps);
    // Cover under the back link, with the title beside it from lg (the desktop project); the heart and ⋮ are not in a top bar.
    const [back, cover, title] = [await box(page.getByRole('link', { name: 'Back to Recipes' })), await box(page.getByRole('img', { name: 'Rich page' })), await box(page.getByRole('heading', { level: 1 }))];
    expect(cover.y).toBeGreaterThan(back.y + back.height - 1);
    expect(title.x).toBeGreaterThan(cover.x + cover.width - 1);
    expect(title.y).toBeGreaterThan(cover.y - 1);
    expect(title.y + title.height).toBeLessThan(cover.y + cover.height + 1);
    await expect.poll(() => imagesLoaded(page)).toBe(true);
  });

  test('a minimal recipe has no banner, no placeholder, no Video, no Notes and no scaler', async ({ page, creator, workerData }) => {
    const placeholders: string[] = [];
    page.on('request', (request) => { if (request.url().includes('recipe-placeholder')) placeholders.push(request.url()); });
    const id = await createRecipeViaApi(creator, workerData.address, minimalMetadata('Plain page'));
    await openRecipe(page, id, 'Plain page');
    await expect(page.locator('article img')).toHaveCount(0);
    expect(await page.locator('article').evaluate((article) => article.firstElementChild?.tagName)).toBe('HEADER');
    await expect(page.locator('article section h2')).toHaveText(['Ingredients', 'Instructions']);
    await expect(page.getByRole('group', { name: 'Servings' })).toHaveCount(0);
    await expect(page.getByRole('list', { name: 'Categories' })).toHaveCount(0);
    await expect(page.getByRole('list', { name: 'Recipe details' })).toHaveCount(0);
    // With no cover the page starts at the title, right under the back link.
    const [back, title] = [await box(page.getByRole('link', { name: 'Back to Recipes' })), await box(page.getByRole('heading', { level: 1 }))];
    expect(title.y - (back.y + back.height)).toBeLessThan(40);
    expect(placeholders).toEqual([]);
  });

  test('the meta row keeps "min" on the last time only on mobile and on every time from the sm breakpoint', async ({ page, creator, workerData }) => {
    const id = await createRecipeViaApi(creator, workerData.address, richMetadata('Meta widths', await categoryIdsFor(creator, RICH.categories)), RICH_FILES);
    await openRecipe(page, id, 'Meta widths');
    const minWidths = () => page.locator('ul[aria-label="Recipe details"] span.inline-flex > span:last-child > span').evaluateAll((spans) => spans.map((span) => Math.round(span.getBoundingClientRect().width)));
    await page.setViewportSize({ width: 390, height: 900 });
    const narrow = await minWidths();
    expect(narrow.slice(0, -1).every((width) => width <= 1)).toBe(true);
    expect(narrow.at(-1)).toBeGreaterThan(10);
    await page.setViewportSize({ width: 1024, height: 900 });
    expect((await minWidths()).every((width) => width > 10)).toBe(true);
  });
});

test.describe('columns', () => {
  test('single column below 1280px, two columns with a sticky left column from 1280px', async ({ page, creator, workerData }) => {
    const id = await createRecipeViaApi(creator, workerData.address, longRich('Columns', await categoryIdsFor(creator, RICH.categories)), RICH_FILES);
    await openRecipe(page, id, 'Columns');
    const boxes = async () => ({
      ingredients: await box(section(page, 'Ingredients')), video: await box(section(page, 'Video')),
      instructions: await box(section(page, 'Instructions')), notes: await box(section(page, 'Notes')),
    });

    await page.setViewportSize({ width: 1279, height: 900 });
    const narrow = await boxes();
    const stack = [narrow.ingredients, narrow.video, narrow.instructions, narrow.notes];
    for (const item of stack) { expect(Math.abs(item.x - narrow.ingredients.x)).toBeLessThan(1); expect(Math.abs(item.width - narrow.ingredients.width)).toBeLessThan(1); }
    stack.slice(1).forEach((item, index) => expect(item.y).toBeGreaterThan(stack[index].y + stack[index].height - 1));
    expect(await section(page, 'Ingredients').evaluate((element) => getComputedStyle(element.parentElement!).position)).not.toBe('sticky');

    await page.setViewportSize({ width: 1280, height: 900 });
    const wide = await boxes();
    expect(Math.abs(wide.video.x - wide.ingredients.x)).toBeLessThan(1);
    expect(Math.abs(wide.notes.x - wide.instructions.x)).toBeLessThan(1);
    expect(wide.instructions.x).toBeGreaterThan(wide.ingredients.x + wide.ingredients.width - 1);
    expect(Math.abs(wide.instructions.y - wide.ingredients.y)).toBeLessThan(2);
    expect(wide.video.y).toBeGreaterThan(wide.ingredients.y + wide.ingredients.height - 1);
    expect(wide.notes.y).toBeGreaterThan(wide.instructions.y + wide.instructions.height - 1);
    // 5/12 and 7/12 of the row, less the gap.
    const ratio = wide.ingredients.width / wide.instructions.width;
    expect(ratio).toBeGreaterThan(5 / 7 - 0.1);
    expect(ratio).toBeLessThan(5 / 7 + 0.1);
    expect(await noOverflow(page)).toBe(true);

    // The left column stays in view while the taller right column scrolls past.
    expect(wide.instructions.height + wide.notes.height).toBeGreaterThan(wide.ingredients.height + wide.video.height);
    expect(await section(page, 'Ingredients').evaluate((element) => getComputedStyle(element.parentElement!).position)).toBe('sticky');
    // Scroll until well past the point where the column reaches the top of the viewport.
    const target = await section(page, 'Ingredients').evaluate((element) => element.getBoundingClientRect().top + window.scrollY + 200);
    await page.evaluate((to) => window.scrollTo(0, to), target);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(target - 5);
    const stuck = await box(section(page, 'Ingredients'));
    expect(stuck.y).toBeGreaterThan(0);
    expect(stuck.y).toBeLessThan(48);
  });
});

test.describe('servings scaler', () => {
  const stepper = (page: Page) => page.getByRole('group', { name: 'Servings' });
  const servingsValue = (page: Page) => stepper(page).locator('output');

  test('+ and − rescale amounts to two decimals, "to taste" stays, Reset restores, and nothing is saved', async ({ page, creator, workerData }) => {
    const id = await createRecipeViaApi(creator, workerData.address, scalable('Scaling soup'));
    const before = await workerData.db.query.recipes.findFirst({ where: eq(recipes.id, id) });
    await openRecipe(page, id, 'Scaling soup');
    const original = [
      { name: 'Flour', amount: '200 g' }, { name: 'Olive oil', amount: '1.5 tbsp' }, { name: 'Eggs', amount: '3 piece' }, { name: 'Pepper', amount: '0.333 tsp' }, { name: 'Salt', amount: 'to taste' },
    ];
    expect(await ingredientRows(page)).toEqual(original);
    await expect(servingsValue(page)).toHaveText('4');
    await expect(page.getByText(/^Scaled from/)).toHaveCount(0);

    await page.getByRole('button', { name: 'Increase servings' }).click();
    await expect(servingsValue(page)).toHaveText('5');
    expect(await ingredientRows(page)).toEqual([
      { name: 'Flour', amount: '250 g' }, { name: 'Olive oil', amount: '1.88 tbsp' }, { name: 'Eggs', amount: '3.75 piece' }, { name: 'Pepper', amount: '0.42 tsp' }, { name: 'Salt', amount: 'to taste' },
    ]);
    await expect(page.getByText('Scaled from 4 servings.')).toBeVisible();

    // Eight servings: trailing zeros are dropped (3 tbsp, not 3.00).
    for (let step = 0; step < 3; step++) await page.getByRole('button', { name: 'Increase servings' }).click();
    expect(await ingredientRows(page)).toEqual([
      { name: 'Flour', amount: '400 g' }, { name: 'Olive oil', amount: '3 tbsp' }, { name: 'Eggs', amount: '6 piece' }, { name: 'Pepper', amount: '0.67 tsp' }, { name: 'Salt', amount: 'to taste' },
    ]);
    await page.getByRole('button', { name: 'Decrease servings' }).click();
    await expect(servingsValue(page)).toHaveText('7');

    await page.getByRole('button', { name: 'Reset', exact: true }).click();
    await expect(servingsValue(page)).toHaveText('4');
    expect(await ingredientRows(page)).toEqual(original);
    await expect(page.getByText(/^Scaled from/)).toHaveCount(0);
    // The link that was just pressed disappears; focus stays inside the stepper instead of falling to the page.
    expect(await page.evaluate(() => document.activeElement?.closest('[role="group"]')?.getAttribute('aria-labelledby') !== null)).toBe(true);

    // On-screen only: a reload and the stored row both show the saved values.
    await page.getByRole('button', { name: 'Increase servings' }).click();
    await page.getByRole('button', { name: 'Increase servings' }).click();
    await expect(servingsValue(page)).toHaveText('6');
    await page.reload();
    await expect(servingsValue(page)).toHaveText('4');
    expect(await ingredientRows(page)).toEqual(original);
    const after = await workerData.db.query.recipes.findFirst({ where: eq(recipes.id, id) });
    expect([after?.servings, after?.updatedAt.getTime()]).toEqual([4, before?.updatedAt.getTime()]);
  });

  test('without servings there is no scaler, and it sits inline on a wide card but under the title on a narrow one', async ({ page, creator, workerData }) => {
    const plain = await createRecipeViaApi(creator, workerData.address, scalable('No servings', null));
    await openRecipe(page, plain, 'No servings');
    await expect(stepper(page)).toHaveCount(0);
    await expect(page.getByRole('list', { name: 'Ingredients' })).toBeVisible();

    const id = await createRecipeViaApi(creator, workerData.address, scalable('Stepper layout'));
    await openRecipe(page, id, 'Stepper layout');
    const heading = page.getByRole('heading', { level: 2, name: 'Ingredients' });
    await page.setViewportSize({ width: 390, height: 900 });
    const [narrowHeading, narrowStepper] = [await box(heading), await box(stepper(page))];
    expect(narrowStepper.y).toBeGreaterThanOrEqual(narrowHeading.y + narrowHeading.height - 1);
    await page.setViewportSize({ width: 1440, height: 900 });
    const [wideHeading, wideStepper] = [await box(heading), await box(stepper(page))];
    expect(wideStepper.x).toBeGreaterThan(wideHeading.x + wideHeading.width);
    expect(Math.abs((wideStepper.y + wideStepper.height / 2) - (wideHeading.y + wideHeading.height / 2))).toBeLessThan(8);
    await page.setViewportSize({ width: 320, height: 900 });
    expect(await noOverflow(page)).toBe(true);
  });
});

test.describe('ingredient check-off', () => {
  test('toggling strikes the row through by click and keyboard, and the state is gone after a reload', async ({ page, creator, workerData }) => {
    const id = await createRecipeViaApi(creator, workerData.address, scalable('Checklist'));
    await openRecipe(page, id, 'Checklist');
    const flour = page.getByRole('checkbox', { name: /^Flour/ });
    const struck = (name: string) => page.getByRole('list', { name: 'Ingredients' }).locator('label', { hasText: name }).locator('span').evaluateAll((spans) => spans.map((span) => getComputedStyle(span).textDecorationLine));
    await expect(flour).not.toBeChecked();
    expect(await struck('Flour')).toEqual(['none', 'none']);
    await flour.click();
    await expect(flour).toBeChecked();
    expect(await struck('Flour')).toEqual(['line-through', 'line-through']);
    expect(await struck('Olive oil')).toEqual(['none', 'none']);

    const oil = page.getByRole('checkbox', { name: /^Olive oil/ });
    await oil.focus();
    await page.keyboard.press('Space');
    await expect(oil).toBeChecked();
    await page.keyboard.press('Space');
    await expect(oil).not.toBeChecked();

    // Scaling and checking are independent.
    await page.getByRole('button', { name: 'Increase servings' }).click();
    await expect(flour).toBeChecked();

    await page.reload();
    await expect(page.getByRole('checkbox', { name: /^Flour/ })).not.toBeChecked();
    expect(await struck('Flour')).toEqual(['none', 'none']);
  });
});

test.describe('video', () => {
  test('nothing is requested from the video host before Play, and Play loads one embed that starts from that click', async ({ page, creator, workerData }) => {
    const requests = recordRequests(page);
    const id = await createRecipeViaApi(creator, workerData.address, richMetadata('Video gate', await categoryIdsFor(creator, RICH.categories)), RICH_FILES);
    await openRecipe(page, id, 'Video gate');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('Plays from YouTube')).toBeVisible();
    expect(requests.videoRequests()).toEqual([]);
    await expect(page.locator('iframe')).toHaveCount(0);
    expect(await page.locator('[src*="autoplay"], [allow*="autoplay"], [data-autoplay]').count()).toBe(0);
    // Reloading never starts playback either.
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(page.locator('iframe')).toHaveCount(0);
    expect(requests.videoRequests()).toEqual([]);

    const mark = requests.mark();
    await page.getByRole('button', { name: 'Play video' }).click();
    const frame = page.locator('iframe[title="Video for Video gate"]');
    await expect(frame).toHaveCount(1);
    const src = new URL((await frame.getAttribute('src'))!);
    expect([src.origin, src.pathname, src.searchParams.get('autoplay')]).toEqual(['https://www.youtube-nocookie.com', '/embed/dQw4w9WgXcQ', '1']);
    await expect.poll(() => requests.videoRequests(mark)).toContain('www.youtube-nocookie.com');
    await expect(page.getByRole('button', { name: 'Play video' })).toHaveCount(0);
    await expect(frame).toBeFocused();
  });

  test('a video without a cover still has a Play button, and a host that cannot be embedded is a safe new-tab link', async ({ page, creator, workerData }) => {
    const requests = recordRequests(page);
    const bare = await createRecipeViaApi(creator, workerData.address, metadataWith('Bare video', { videoUrl: 'https://youtu.be/dQw4w9WgXcQ' }));
    await openRecipe(page, bare, 'Bare video');
    await expect(page.getByRole('button', { name: 'Play video' })).toBeVisible();
    await expect(page.locator('iframe')).toHaveCount(0);

    const linked = await createRecipeViaApi(creator, workerData.address, richMetadata('Plain video link', await categoryIdsFor(creator, RICH.categories), PLAIN_LINK), RICH_FILES);
    await openRecipe(page, linked, 'Plain video link');
    const link = page.getByRole('link', { name: 'Watch video (opens in a new tab)' });
    await expect(link).toHaveAttribute('href', PLAIN_LINK);
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    await expect(page.getByRole('button', { name: 'Play video' })).toHaveCount(0);
    await expect(page.locator('iframe')).toHaveCount(0);
    expect(requests.videoRequests()).toEqual([]);
  });
});

test.describe('step photo dialog', () => {
  test('opens by click, Enter and Space; traps focus; closes by button, Escape and backdrop; focus returns each time', async ({ page, creator, workerData }) => {
    const id = await createRecipeViaApi(creator, workerData.address, longRich('Photo dialog', await categoryIdsFor(creator, RICH.categories)), RICH_FILES);
    await openRecipe(page, id, 'Photo dialog');
    await expect(photoButtons(page)).toHaveCount(2);
    const trigger = page.getByRole('button', { name: 'Open step 1 photo' });
    const dialog = page.getByRole('dialog', { name: 'Step 1 photo' });
    const insideDialog = () => page.evaluate(() => Boolean(document.activeElement?.closest('[role="dialog"]')));
    // Base UI wraps focus from its guards on the next animation frame; give it that frame before looking where focus is.
    const settle = () => page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await trigger.scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollHeight > window.innerHeight)).toBe(true);
    // Scroll a little (keeping the photo button in view) so a leaking scroll would show.
    await page.evaluate(() => window.scrollBy(0, 120));
    const scrollBefore = await page.evaluate(() => window.scrollY);
    expect(scrollBefore).toBeGreaterThan(0);
    await expect(trigger).toBeInViewport();

    for (const [open, close] of [['click', 'button'], ['Enter', 'Escape'], ['Space', 'backdrop']] as const) {
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(scrollBefore);
      if (open === 'click') await trigger.click();
      else { await trigger.focus(); await page.keyboard.press(open); }
      await expect(dialog).toBeVisible();
      await expect.poll(insideDialog).toBe(true);
      await expect(dialog.getByText('Step 1 photo')).toBeVisible();
      await expect.poll(() => imagesLoaded(page, '[role="dialog"] img')).toBe(true);
      expect(await dialog.locator('img').evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(100);

      // The page behind does not scroll.
      await page.mouse.move(5, 5);
      await page.mouse.wheel(0, 700);
      await page.waitForTimeout(200);
      expect(await page.evaluate(() => window.scrollY)).toBe(scrollBefore);

      // Tab and Shift+Tab stay inside the dialog.
      for (let press = 0; press < 8; press++) {
        await page.keyboard.press(press < 5 ? 'Tab' : 'Shift+Tab');
        await settle();
        expect(await insideDialog(), `press ${press}`).toBe(true);
      }

      if (close === 'button') await dialog.getByRole('button', { name: 'Close' }).click();
      else if (close === 'Escape') await page.keyboard.press('Escape');
      else await page.mouse.click(4, 4);
      await expect(dialog).toHaveCount(0);
      await expect(trigger).toBeFocused();
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(scrollBefore);
    }

    // The second photo opens its own dialog.
    await page.getByRole('button', { name: 'Open step 3 photo' }).click();
    await expect(page.getByRole('dialog', { name: 'Step 3 photo' })).toBeVisible();
  });
});

test.describe('layout', () => {
  async function expectNoOverflow(page: Page, label: string) {
    expect(await noOverflow(page), label).toBe(true);
  }

  test('the title row keeps the heart and ⋮ beside the title with 44px targets on mobile', async ({ page, creator, workerData }) => {
    const id = await createRecipeViaApi(creator, workerData.address, richMetadata('Title row with a deliberately long name that wraps onto several lines on small screens', await categoryIdsFor(creator, RICH.categories)), RICH_FILES);
    await openRecipe(page, id);
    for (const width of [320, 390, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      // The buttons animate between their 44px (mobile) and 36px sizes; measure once they settle.
      const heartButton = page.getByRole('button', { name: /^(Add|Remove) .* (to|from) favorites$/ });
      await expect.poll(async () => (await box(heartButton)).width).toBeGreaterThanOrEqual(width < 640 ? 44 : 35.99);
      if (width >= 640) await expect.poll(async () => (await box(heartButton)).width).toBeLessThanOrEqual(36.01);
      const heart = await box(heartButton);
      const menu = await box(page.getByRole('button', { name: /^More options for / }));
      const title = await box(page.getByRole('heading', { level: 1 }));
      expect(heart.x, `heart right of title at ${width}`).toBeGreaterThanOrEqual(title.x + title.width - 1);
      expect(menu.x).toBeGreaterThan(heart.x + heart.width - 1);
      expect(menu.x + menu.width).toBeLessThanOrEqual(width);
      expect(heart.y).toBeGreaterThanOrEqual(title.y - 2);
      expect(heart.y).toBeLessThan(title.y + title.height);
      if (width < 640) for (const target of [heart, menu]) { expect(target.width).toBeGreaterThanOrEqual(44); expect(target.height).toBeGreaterThanOrEqual(44); }
    }
  });

  test('minimal and rich recipe pages never overflow at any width, also with the menu, delete dialog and photo dialog open', async ({ page, creator, workerData }) => {
    test.setTimeout(240_000);
    const minimal = await createRecipeViaApi(creator, workerData.address, minimalMetadata('Layout minimal with a very long title that has to wrap properly instead of pushing the page wider'));
    const rich = await createRecipeViaApi(creator, workerData.address, longRich('Layout rich with a very long title that has to wrap properly instead of pushing the page wider', await categoryIdsFor(creator, RICH.categories)), RICH_FILES);

    await openRecipe(page, minimal);
    for (const width of WIDTHS) { await page.setViewportSize({ width, height: 900 }); await expectNoOverflow(page, `minimal ${width}`); }

    await openRecipe(page, rich);
    await expect.poll(() => imagesLoaded(page)).toBe(true);
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      await expectNoOverflow(page, `rich ${width}`);
      const images = await page.locator('article img').evaluateAll((elements) => elements.map((element) => { const { left, right } = element.getBoundingClientRect(); return left >= 0 && right <= window.innerWidth; }));
      expect(images.every(Boolean)).toBe(true);

      await page.getByRole('button', { name: /^More options for / }).click();
      await expect(page.getByRole('menuitem', { name: 'Delete recipe' })).toBeVisible();
      await expectNoOverflow(page, `menu ${width}`);
      const menuBox = await box(page.getByRole('menu'));
      expect(menuBox.x).toBeGreaterThanOrEqual(0);
      expect(menuBox.x + menuBox.width).toBeLessThanOrEqual(width);
      await page.getByRole('menuitem', { name: 'Delete recipe' }).click();
      const alertDialog = page.getByRole('alertdialog', { name: 'Delete recipe?' });
      await expect(alertDialog).toBeVisible();
      await expectNoOverflow(page, `delete dialog ${width}`);
      const dialogBox = await box(alertDialog);
      expect(dialogBox.x).toBeGreaterThanOrEqual(0);
      expect(dialogBox.x + dialogBox.width).toBeLessThanOrEqual(width);
      await alertDialog.getByRole('button', { name: 'Cancel' }).click();
      await expect(alertDialog).toHaveCount(0);

      await page.getByRole('button', { name: 'Open step 1 photo' }).click();
      const photoDialog = page.getByRole('dialog', { name: 'Step 1 photo' });
      await expect(photoDialog).toBeVisible();
      await expectNoOverflow(page, `photo dialog ${width}`);
      const photoBox = await box(photoDialog);
      expect(photoBox.x).toBeGreaterThanOrEqual(0);
      expect(photoBox.x + photoBox.width).toBeLessThanOrEqual(width);
      expect(photoBox.y + photoBox.height).toBeLessThanOrEqual(900);
      await page.keyboard.press('Escape');
      await expect(photoDialog).toHaveCount(0);
    }
  });

  test('an open toast never causes overflow at any width', async ({ page, creator, workerData }) => {
    test.setTimeout(120_000);
    await workerData.db.insert(authRateLimits).values({ id: randomUUID(), key: `wrapper:recipe-favorite:user:${creator.user.id}`, count: 120, lastRequest: Date.now() });
    const id = await createRecipeViaApi(creator, workerData.address, richMetadata('Toast layout', await categoryIdsFor(creator, RICH.categories)), RICH_FILES);
    await openRecipe(page, id, 'Toast layout');
    await page.getByRole('button', { name: 'Add Toast layout to favorites' }).click();
    await expect(toast.error(page, 'Couldn’t save favorite. Try again.')).toBeVisible();
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      await expectNoOverflow(page, `toast ${width}`);
      const toastBox = await box(toast.error(page, 'Couldn’t save favorite. Try again.'));
      expect(toastBox.x).toBeGreaterThanOrEqual(0);
      expect(toastBox.x + toastBox.width).toBeLessThanOrEqual(width);
    }
  });
});
