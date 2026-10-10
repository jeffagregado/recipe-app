import { randomUUID } from 'node:crypto';
import type { Page } from '@playwright/test';
import { count, eq } from '../apps/api/node_modules/drizzle-orm/index.js';
import { authRateLimits, recipes, recipeWriteAttempts } from '../apps/api/src/database/schema.js';
import { seedRecipes } from '../apps/api/src/recipes/seed-recipes.js';
import { creatorTest as test, expect, WEB_URL } from './fixtures.js';
import {
  COVER, PLAIN_LINK, RICH, RICH_FILES, STEP_ONE, WIDTHS,
  chooseUnit, createRecipeViaApi, field, fillIngredient, fillMinimal, fillRich, ingredientRows, noOverflow, openCreate, photo, richMetadata, stepTexts, stubVideoHosts, toast, watchConsole,
} from './create-recipe-helpers.js';

// The one-time notice is removed from the URL once the toast shows, so the saved page is just /recipes/<id>.
const SAVED = /\/recipes\/(?!create$)[^/?]+$/;
const issues = new WeakMap<Page, string[]>();
const cards = (page: Page) => page.getByRole('list', { name: 'Recipes' }).locator(':scope > li');
const categoryCount = (page: Page, name: string) => page.getByRole('group', { name: 'Recipe categories' }).getByRole('button', { name: new RegExp(`^${name}(?: |$)`) });
const rowValues = (page: Page, pattern: RegExp) => page.getByLabel(pattern).evaluateAll((elements) => elements.map((element) => (element as HTMLInputElement | HTMLTextAreaElement).value));
const savedId = (page: Page) => new URL(page.url()).pathname.split('/').pop()!;
const optimizerStatuses = (page: Page) => {
  const statuses: number[] = [];
  page.on('response', (response) => { if (new URL(response.url()).pathname === '/_next/image') statuses.push(response.status()); });
  return statuses;
};
const createForm = (page: Page) => page.getByRole('form', { name: 'Create Recipe' });
const loaded = (page: Page, selector: string) => page.locator(selector).evaluateAll((images) => images.map((image) => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0));

test.beforeEach(async ({ page }) => { issues.set(page, watchConsole(page)); await stubVideoHosts(page); });
test.afterEach(async ({ page }) => { expect(issues.get(page)).toEqual([]); });

test.describe('navigation', () => {
  test('sidebar Create Recipe and the list New Recipe button reach the form', async ({ page, isMobile }) => {
    await page.goto('/recipes');
    await expect(page.getByRole('link', { name: 'New Recipe' })).toBeVisible();
    await page.getByRole('link', { name: 'New Recipe' }).click();
    await expect(page).toHaveURL(`${WEB_URL}/recipes/create`);
    await expect(page.getByRole('heading', { level: 1, name: 'Create Recipe' })).toBeVisible();
    if (isMobile) return;
    await page.goto('/recipes');
    await page.getByRole('link', { name: 'Create Recipe', exact: true }).click();
    await expect(page).toHaveURL(`${WEB_URL}/recipes/create`);
    await expect(page.getByRole('heading', { level: 1, name: 'Create Recipe' })).toBeVisible();
  });

  test('an anonymous visitor is sent to the sign-in page', async ({ browser }) => {
    const anonymous = await browser.newContext();
    try {
      const page = await anonymous.newPage();
      await page.goto(`${WEB_URL}/recipes/create`);
      await expect(page).toHaveURL(`${WEB_URL}/`);
      await expect(page.getByLabel('Username', { exact: true })).toBeVisible();
    } finally { await anonymous.close(); }
  });
});

test.describe('validation', () => {
  test('saving an empty form shows inline errors, focuses the title and creates nothing', async ({ page, workerData, creator }) => {
    await openCreate(page);
    await field.save(page).click();
    await expect(page.getByText('Add a title before saving.')).toBeVisible();
    await expect(page.getByText('Add an ingredient name.')).toBeVisible();
    await expect(page.getByText('Enter an amount, or choose “to taste”.')).toBeVisible();
    await expect(page.getByText('Describe this step.')).toBeVisible();
    await expect(field.title(page)).toHaveAttribute('aria-invalid', 'true');
    await expect(field.title(page)).toBeFocused();
    await expect(page).toHaveURL(`${WEB_URL}/recipes/create`);
    const [{ n }] = await workerData.db.select({ n: count() }).from(recipes).where(eq(recipes.userId, creator.user.id));
    expect(n).toBe(0);
  });

  test('fraction amounts, a fourth category and a bad video link are rejected', async ({ page, workerData, creator }) => {
    await openCreate(page);
    await fillMinimal(page, 'Validation soup');
    await field.ingredientAmount(page, 1).fill('1/2');
    await chooseUnit(page, 1, 'g');
    for (const name of ['Breakfast', 'Lunch', 'Dinner']) await field.category(page, name).click();
    await expect(page.getByText('Choose up to 3 · 3 selected')).toBeVisible();
    await expect(field.category(page, 'Snacks')).toBeDisabled();
    await expect(field.category(page, 'Desserts')).toBeDisabled();
    await field.category(page, 'Lunch').click();
    await expect(field.category(page, 'Snacks')).toBeEnabled();
    await field.category(page, 'Lunch').click();
    await field.video(page).fill('http://example.com/pasta');
    await field.save(page).click();
    await expect(page.getByText('Use a decimal such as 0.5 instead of a fraction like 1/2.')).toBeVisible();
    await expect(page.getByText('Enter a link that starts with https://')).toBeVisible();
    await expect(field.ingredientAmount(page, 1)).toHaveAttribute('aria-invalid', 'true');
    await expect(page).toHaveURL(`${WEB_URL}/recipes/create`);
    const [{ n }] = await workerData.db.select({ n: count() }).from(recipes).where(eq(recipes.userId, creator.user.id));
    expect(n).toBe(0);
  });
});

test.describe('rows', () => {
  test('ingredients can be added, edited, moved and removed by click and keyboard; "to taste" disables the amount', async ({ page }) => {
    await openCreate(page);
    await fillIngredient(page, 1, 'Flour', '100', 'g');
    await page.getByRole('button', { name: 'Add ingredient' }).click();
    await expect(field.ingredientName(page, 2)).toBeFocused();
    await page.keyboard.type('Sugar');
    await page.getByRole('button', { name: 'Add ingredient' }).click();
    await page.keyboard.type('Eggs');
    expect(await rowValues(page, /^Ingredient \d+ name$/)).toEqual(['Flour', 'Sugar', 'Eggs']);
    await expect(page.getByRole('button', { name: 'Move ingredient 1 up' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Move ingredient 3 down' })).toBeDisabled();

    await field.ingredientName(page, 1).fill('Flour (sifted)');
    await page.getByRole('button', { name: 'Move ingredient 3 up' }).click();
    await expect(page.getByRole('button', { name: 'Move ingredient 2 up' })).toBeFocused();
    expect(await rowValues(page, /^Ingredient \d+ name$/)).toEqual(['Flour (sifted)', 'Eggs', 'Sugar']);
    // Keyboard: Enter and Space activate the focused move buttons.
    await page.getByRole('button', { name: 'Move ingredient 1 down' }).focus();
    await page.keyboard.press('Enter');
    expect(await rowValues(page, /^Ingredient \d+ name$/)).toEqual(['Eggs', 'Flour (sifted)', 'Sugar']);
    await expect(page.getByRole('button', { name: 'Move ingredient 2 down' })).toBeFocused();
    await page.getByRole('button', { name: 'Move ingredient 3 up' }).focus();
    await page.keyboard.press('Space');
    expect(await rowValues(page, /^Ingredient \d+ name$/)).toEqual(['Eggs', 'Sugar', 'Flour (sifted)']);
    await page.getByRole('button', { name: 'Remove ingredient 2' }).focus();
    await page.keyboard.press('Enter');
    expect(await rowValues(page, /^Ingredient \d+ name$/)).toEqual(['Eggs', 'Flour (sifted)']);

    await field.ingredientAmount(page, 1).fill('3');
    await chooseUnit(page, 1, 'to-taste');
    await expect(field.ingredientAmount(page, 1)).toBeDisabled();
    await expect(field.ingredientAmount(page, 1)).toHaveValue('');
    await chooseUnit(page, 1, 'piece');
    await expect(field.ingredientAmount(page, 1)).toBeEnabled();

    // The last remaining row is cleared, never removed: one row is always required.
    await page.getByRole('button', { name: 'Remove ingredient 2' }).click();
    await page.getByRole('button', { name: 'Remove ingredient 1' }).click();
    await expect(page.getByLabel(/^Ingredient \d+ name$/)).toHaveCount(1);
    await expect(field.ingredientName(page, 1)).toHaveValue('');
  });

  test('steps can be added, edited, moved and removed by click and keyboard', async ({ page }) => {
    await openCreate(page);
    await field.step(page, 1).fill('Chop');
    await page.getByRole('button', { name: 'Add step' }).click();
    await expect(field.step(page, 2)).toBeFocused();
    await page.keyboard.type('Mix');
    await page.getByRole('button', { name: 'Add step' }).click();
    await page.keyboard.type('Bake');
    expect(await rowValues(page, /^Step \d+ instructions$/)).toEqual(['Chop', 'Mix', 'Bake']);
    await expect(page.getByRole('button', { name: 'Move step 1 up' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Move step 3 down' })).toBeDisabled();

    await field.step(page, 1).fill('Chop finely');
    await page.getByRole('button', { name: 'Move step 3 up' }).click();
    expect(await rowValues(page, /^Step \d+ instructions$/)).toEqual(['Chop finely', 'Bake', 'Mix']);
    await page.getByRole('button', { name: 'Move step 1 down' }).focus();
    await page.keyboard.press('Enter');
    expect(await rowValues(page, /^Step \d+ instructions$/)).toEqual(['Bake', 'Chop finely', 'Mix']);
    await page.getByRole('button', { name: 'Remove step 1' }).focus();
    await page.keyboard.press('Space');
    expect(await rowValues(page, /^Step \d+ instructions$/)).toEqual(['Chop finely', 'Mix']);
    await page.getByRole('button', { name: 'Remove step 2' }).click();
    await page.getByRole('button', { name: 'Remove step 1' }).click();
    await expect(page.getByLabel(/^Step \d+ instructions$/)).toHaveCount(1);
    await expect(field.step(page, 1)).toHaveValue('');
  });

  test('a blank extra row is reported, not dropped', async ({ page, workerData, creator }) => {
    await openCreate(page);
    await fillMinimal(page, 'Blank rows');
    await page.getByRole('button', { name: 'Add ingredient' }).click();
    await page.getByRole('button', { name: 'Add step' }).click();
    await field.save(page).click();
    await expect(page.getByText('Add an ingredient name.')).toBeVisible();
    await expect(page.getByText('Describe this step.')).toBeVisible();
    await expect(field.ingredientName(page, 2)).toBeFocused();
    await expect(page.getByLabel(/^Ingredient \d+ name$/)).toHaveCount(2);
    await expect(page.getByLabel(/^Step \d+ instructions$/)).toHaveCount(2);
    const [{ n }] = await workerData.db.select({ n: count() }).from(recipes).where(eq(recipes.userId, creator.user.id));
    expect(n).toBe(0);
  });
});

test.describe('photos', () => {
  test('cover photo: pick, replace and remove; bad files are rejected inline', async ({ page, isMobile }) => {
    await openCreate(page);
    const pick = page.getByLabel('Add cover photo');
    await pick.setInputFiles(COVER);
    await expect(page.getByText(/^creamy-garlic-pasta\.png · \d+ KB$/)).toBeVisible();
    await expect(page.getByRole('img', { name: 'Preview of creamy-garlic-pasta.png' })).toBeVisible();
    await page.getByLabel('Replace cover photo').setInputFiles(photo('second.png', [20, 120, 200]));
    await expect(page.getByText(/^second\.png · \d+ KB$/)).toBeVisible();
    await expect(page.getByRole('img', { name: 'Preview of creamy-garlic-pasta.png' })).toHaveCount(0);
    // A rejected replacement keeps the current photo and explains why.
    await page.getByLabel('Replace cover photo').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('not an image') });
    await expect(page.getByText('notes.txt is not a JPG, PNG or WebP image.')).toBeVisible();
    await expect(page.getByText(/^second\.png · \d+ KB$/)).toBeVisible();
    await page.getByRole('button', { name: 'Remove cover photo' }).click();
    await expect(page.getByLabel('Add cover photo')).toBeVisible();
    await expect(page.getByText(isMobile ? 'Tap to add a photo' : 'Drag a photo here, or click to browse')).toBeVisible();
    await expect(page.getByText('notes.txt is not a JPG, PNG or WebP image.')).toHaveCount(0);
    // Over 5 MiB: refused before anything is uploaded.
    await page.getByLabel('Add cover photo').setInputFiles({ name: 'huge.png', mimeType: 'image/png', buffer: Buffer.alloc(5 * 1024 * 1024 + 1) });
    await expect(page.getByText(/^huge\.png is \d\.\d MB\. The limit is 5 MB\.$/)).toBeVisible();
    await expect(page.getByRole('img', { name: /^Preview of/ })).toHaveCount(0);
  });

  test('step photos: pick, replace and remove, errors stay under their step, and a photo follows its step', async ({ page }) => {
    await openCreate(page);
    await field.step(page, 1).fill('First step');
    await page.getByRole('button', { name: 'Add step' }).click();
    await field.step(page, 2).fill('Second step');
    await page.getByLabel('Add photo to step 1').setInputFiles(STEP_ONE);
    await expect(page.getByText(/^boiling-pasta\.png · \d+ KB$/)).toBeVisible();
    await page.getByLabel('Replace photo for step 1').setInputFiles(photo('replaced.png', [60, 160, 90]));
    await expect(page.getByText(/^replaced\.png · \d+ KB$/)).toBeVisible();

    await page.getByLabel('Add photo to step 2').setInputFiles({ name: 'big.png', mimeType: 'image/png', buffer: Buffer.alloc(5 * 1024 * 1024 + 1) });
    const second = page.getByRole('listitem').filter({ has: field.step(page, 2) });
    await expect(second.getByText(/^big\.png is \d\.\d MB\. The limit is 5 MB\.$/)).toBeVisible();
    await expect(page.getByLabel('Add photo to step 1')).toHaveCount(0);

    await page.getByRole('button', { name: 'Move step 1 down' }).click();
    const firstRow = page.getByRole('listitem').filter({ has: field.step(page, 1) });
    await expect(field.step(page, 1)).toHaveValue('Second step');
    await expect(page.getByLabel('Add photo to step 1')).toBeVisible();
    await expect(page.getByLabel('Replace photo for step 2')).toBeVisible();
    await expect(page.getByRole('listitem').filter({ has: field.step(page, 2) }).getByText(/^replaced\.png · \d+ KB$/)).toBeVisible();
    await expect(firstRow.getByText(/replaced\.png/)).toHaveCount(0);

    await page.getByRole('button', { name: 'Remove photo from step 2' }).click();
    await expect(page.getByLabel('Add photo to step 2')).toBeVisible();
    await expect(page.getByText(/replaced\.png/)).toHaveCount(0);
  });
});

test.describe('leaving the form', () => {
  const discardDialog = (page: Page) => page.getByRole('alertdialog', { name: 'Discard changes?' });

  test('a pristine form leaves without asking and never opens a native confirm', async ({ page }) => {
    const prompts: string[] = [];
    page.on('dialog', (dialog) => { prompts.push(dialog.type()); void dialog.dismiss(); });
    await openCreate(page);
    await field.leave(page).click();
    await expect(page).toHaveURL(`${WEB_URL}/recipes`);
    await expect(discardDialog(page)).toHaveCount(0);
    expect(prompts).toEqual([]);
  });

  test('a dirty form asks in a dialog: Keep editing, Escape and the backdrop keep it; Discard leaves and the next visit starts empty', async ({ page }) => {
    const prompts: string[] = [];
    page.on('dialog', (dialog) => { prompts.push(dialog.type()); void dialog.dismiss(); });
    await openCreate(page);
    await field.title(page).fill('Unsaved idea');
    await field.leave(page).click();
    const dialog = discardDialog(page);
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('Your changes to this recipe will be lost.');
    await expect(dialog.getByRole('button', { name: 'Keep editing' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Discard' })).toBeVisible();

    await dialog.getByRole('button', { name: 'Keep editing' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page).toHaveURL(`${WEB_URL}/recipes/create`);
    await expect(field.title(page)).toHaveValue('Unsaved idea');

    await field.leave(page).click();
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(field.title(page)).toHaveValue('Unsaved idea');

    // An alert dialog ignores backdrop clicks: the click must never count as consent to discard.
    await field.leave(page).click();
    await expect(dialog).toBeVisible();
    await page.mouse.click(3, 3);
    await expect(page).toHaveURL(`${WEB_URL}/recipes/create`);
    await expect(field.title(page)).toHaveValue('Unsaved idea');
    await dialog.getByRole('button', { name: 'Keep editing' }).click();
    await expect(dialog).toHaveCount(0);

    await field.leave(page).click();
    await dialog.getByRole('button', { name: 'Discard' }).click();
    await expect(page).toHaveURL(`${WEB_URL}/recipes`);
    // The form stays mounted (hidden) after leaving; the discarded text must not greet the next visit.
    await page.getByRole('link', { name: 'New Recipe' }).click();
    await expect(field.title(page)).toBeEditable();
    await expect(field.title(page)).toHaveValue('');
    await expect(page.getByText('Choose up to 3 · 0 selected')).toBeVisible();
    expect(prompts).toEqual([]);
  });
});

test.describe('saving', () => {
  test('a minimal recipe saves and the detail page shows only what was entered', async ({ page, workerData, creator }) => {
    const statuses = optimizerStatuses(page);
    await openCreate(page);
    await fillMinimal(page, 'Minimal tea');
    await field.save(page).click();
    await expect(page).toHaveURL(SAVED, { timeout: 30_000 });
    await expect(page.getByRole('heading', { level: 1, name: 'Minimal tea' })).toBeVisible({ timeout: 20_000 });
    await expect(toast.success(page, 'Recipe saved')).toBeVisible();
    expect(await ingredientRows(page)).toEqual([{ name: 'Water', amount: '2 cup' }]);
    expect(await stepTexts(page)).toEqual(['Boil the water.']);
    await expect(page.getByRole('heading', { name: 'Notes' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Video' })).toHaveCount(0);
    await expect(page.getByRole('list', { name: 'Categories' })).toHaveCount(0);
    await expect(page.getByRole('list', { name: 'Recipe details' })).toHaveCount(0);
    await expect(page.locator('article img')).toHaveCount(0);
    expect(statuses).toEqual([]);
    const saved = await workerData.db.query.recipes.findFirst({ where: eq(recipes.userId, creator.user.id) });
    expect(saved?.id).toBe(savedId(page));
    expect([saved?.description, saved?.notes, saved?.videoUrl, saved?.servings, saved?.prepTimeMinutes, saved?.cookTimeMinutes]).toEqual([null, null, null, null, null, null]);
  });

  test('a rich recipe keeps every field in the saved order and renders its photos through Next Image', async ({ page, workerData, creator }) => {
    test.setTimeout(120_000);
    const statuses = optimizerStatuses(page);
    await openCreate(page);
    await fillRich(page, 'Rich carbonara');
    await field.save(page).click();
    await expect(page).toHaveURL(SAVED, { timeout: 30_000 });
    await expect(page.getByRole('heading', { level: 1, name: 'Rich carbonara' })).toBeVisible({ timeout: 20_000 });
    await expect(toast.success(page, 'Recipe saved')).toBeVisible();
    await expect(page.getByRole('list', { name: 'Categories' }).getByRole('listitem')).toHaveText(RICH.categories);
    await expect(page.getByRole('list', { name: 'Recipe details' }).getByRole('listitem')).toHaveCount(2);
    await expect(page.getByRole('list', { name: 'Recipe details' })).toContainText(/Prep 10.*Cook 20.*Total 30 min.*4 servings/);
    await expect(page.getByText(RICH.description)).toBeVisible();
    expect(await ingredientRows(page)).toEqual([
      { name: 'Spaghetti', amount: '200 g' }, { name: 'Olive oil', amount: '1.5 tbsp' }, { name: 'Salt', amount: 'to taste' },
    ]);
    expect(await stepTexts(page)).toEqual(RICH.steps);
    await expect(page.getByRole('heading', { name: 'Notes' })).toBeVisible();
    await expect(page.getByText('Swap the bacon for mushrooms.')).toBeVisible();
    await expect(page.getByText('Keeps for two days.')).toBeVisible();
    // The video is a poster with a Play button; the embed exists only after Play.
    await expect(page.locator('iframe')).toHaveCount(0);
    await page.getByRole('button', { name: 'Play video' }).click();
    await expect(page.locator('iframe[title="Video for Rich carbonara"]')).toHaveAttribute('src', 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1');

    // The cover, the photos of steps 1 and 3 and (until Play is pressed) the video poster go through the optimizer; step 2 has no photo.
    const imageSelector = 'article img';
    await expect.poll(async () => (await loaded(page, imageSelector)).filter(Boolean).length).toBe(3);
    await expect(page.getByRole('img', { name: 'Rich carbonara' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open step 1 photo' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open step 3 photo' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open step 2 photo' })).toHaveCount(0);
    const sources = await page.locator(imageSelector).evaluateAll((images) => images.map((image) => new URL((image as HTMLImageElement).currentSrc).pathname));
    expect(sources.every((path) => path === '/_next/image')).toBe(true);
    expect(statuses.length).toBeGreaterThanOrEqual(3);
    expect(statuses.every((status) => status === 200)).toBe(true);

    const saved = await workerData.db.query.recipes.findFirst({ where: eq(recipes.userId, creator.user.id), with: { images: true } });
    expect(saved?.images).toHaveLength(3);

    // Cover photos also appear on the list cards.
    const cardStatuses = optimizerStatuses(page);
    await page.getByRole('link', { name: 'Back to Recipes' }).click();
    const card = cards(page).filter({ hasText: 'Rich carbonara' });
    await expect(card).toHaveCount(1);
    await expect.poll(async () => (await loaded(page, 'li img')).filter(Boolean).length).toBeGreaterThan(0);
    await expect(card.locator('img')).toHaveCount(1);
    await card.locator('img').scrollIntoViewIfNeeded();
    await expect.poll(() => card.locator('img').evaluate((image) => (image as HTMLImageElement).naturalWidth > 0)).toBe(true);
    // The card shows the stored cover (optimized signed URL), not the bundled placeholder.
    expect(await card.locator('img').evaluate((image) => new URL((image as HTMLImageElement).currentSrc).searchParams.get('url')?.startsWith('https://'))).toBe(true);
    expect(cardStatuses.every((status) => status === 200)).toBe(true);
  });

  test('a video host that cannot be embedded becomes a link that opens in a new tab', async ({ page, creator, workerData }) => {
    const id = await createRecipeViaApi(creator, workerData.address, richMetadata('Plain video link', PLAIN_LINK), RICH_FILES);
    await page.goto(`/recipes/${id}`);
    const link = page.getByRole('link', { name: 'Watch video (opens in a new tab)' });
    await expect(link).toHaveAttribute('href', PLAIN_LINK);
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', /noopener/);
    await expect(page.locator('iframe')).toHaveCount(0);
    await expect(page.getByText('Recipe saved')).toHaveCount(0);
  });

  test('photo URLs are signed afresh on every load and no page response is cacheable', async ({ page, creator, workerData }) => {
    const id = await createRecipeViaApi(creator, workerData.address, richMetadata('Fresh signatures'), RICH_FILES);
    const pageCache: string[] = [];
    page.on('response', (response) => { if (new URL(response.url()).pathname === `/recipes/${id}`) pageCache.push(response.headers()['cache-control'] ?? ''); });
    const signature = async () => {
      const cover = page.getByRole('img', { name: 'Fresh signatures' });
      await expect.poll(() => cover.evaluate((image) => (image as HTMLImageElement).currentSrc !== '')).toBe(true);
      return cover.evaluate((image) => {
        const signed = new URL(new URL((image as HTMLImageElement).currentSrc).searchParams.get('url')!);
        return { date: signed.searchParams.get('X-Amz-Date'), lifetime: Number(signed.searchParams.get('X-Amz-Expires')) };
      });
    };
    await page.goto(`/recipes/${id}`);
    const first = await signature();
    expect(first.lifetime).toBeLessThanOrEqual(900);
    await page.waitForTimeout(1_100);
    await page.reload();
    const reloaded = await signature();
    expect(reloaded.date).not.toBe(first.date);
    await page.waitForTimeout(1_100);
    await page.getByRole('link', { name: 'Back to Recipes' }).click();
    await page.getByRole('link', { name: 'Fresh signatures' }).first().click();
    const revisited = await signature();
    expect([revisited.date === reloaded.date, revisited.date === first.date]).toEqual([false, false]);
    expect(pageCache.length).toBeGreaterThan(0);
    expect(pageCache.every((value) => value.includes('no-store'))).toBe(true);
  });

  test('pressing Save twice quickly creates exactly one recipe', async ({ page, workerData, creator }) => {
    await openCreate(page);
    await fillMinimal(page, 'Double click soup');
    const recipeCount = async () => (await workerData.db.select({ n: count() }).from(recipes).where(eq(recipes.userId, creator.user.id)))[0].n;
    const attemptCount = async () => (await workerData.db.select({ n: count() }).from(recipeWriteAttempts).where(eq(recipeWriteAttempts.userId, creator.user.id)))[0].n;
    expect([await recipeCount(), await attemptCount()]).toEqual([0, 0]);
    await field.save(page).dblclick();
    await expect(page).toHaveURL(SAVED, { timeout: 30_000 });
    await expect(page.getByRole('heading', { level: 1, name: 'Double click soup' })).toBeVisible({ timeout: 20_000 });
    expect([await recipeCount(), await attemptCount()]).toEqual([1, 1]);
  });

  test('an expired session keeps the filled form and says to sign in again', async ({ page, context, workerData, creator }) => {
    await openCreate(page);
    await fillMinimal(page, 'Kept through expiry');
    await page.getByLabel('Add cover photo').setInputFiles(COVER);
    await context.clearCookies();
    await field.save(page).click();
    await expect(createForm(page).getByRole('alert').filter({ hasText: 'Your session has expired.' })).toBeVisible();
    await expect(toast.error(page, 'Your session has expired.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Open sign in in a new tab' })).toHaveAttribute('target', '_blank');
    await expect(field.title(page)).toHaveValue('Kept through expiry');
    await expect(field.step(page, 1)).toHaveValue('Boil the water.');
    await expect(page.getByText(/^creamy-garlic-pasta\.png · \d+ KB$/)).toBeVisible();
    await expect(field.save(page)).toBeEnabled();
    await expect(page).toHaveURL(`${WEB_URL}/recipes/create`);
    const [{ n }] = await workerData.db.select({ n: count() }).from(recipes).where(eq(recipes.userId, creator.user.id));
    expect(n).toBe(0);
    // The save endpoint answers a missing session with 401, which the browser logs itself; nothing else may be reported.
    expect(issues.get(page)!.splice(0)).toEqual(['error: Failed to load resource: the server responded with a status of 401 (Unauthorized) (/api/recipes)']);
  });

  // Rate limiting is the deterministic failure: the real API refuses the 61st write in ten minutes with a 429.
  test('a rejected save keeps the values and a later retry saves exactly one recipe', async ({ page, workerData, creator }) => {
    const key = `wrapper:recipe-write:user:${creator.user.id}`;
    await workerData.db.insert(authRateLimits).values({ id: randomUUID(), key, count: 60, lastRequest: Date.now() });
    await openCreate(page);
    await fillMinimal(page, 'Retry after limit');
    await page.getByLabel('Add cover photo').setInputFiles(COVER);
    await field.save(page).click();
    await expect(createForm(page).getByRole('alert').filter({ hasText: 'Too many saves. Try again in a moment.' })).toBeVisible();
    await expect(toast.error(page, 'Couldn’t save recipe. Try again.')).toBeVisible();
    await expect(field.title(page)).toHaveValue('Retry after limit');
    await expect(page.getByText(/^creamy-garlic-pasta\.png · \d+ KB$/)).toBeVisible();
    await expect(field.save(page)).toBeEnabled();
    await expect(page).toHaveURL(`${WEB_URL}/recipes/create`);
    expect((await workerData.db.select({ n: count() }).from(recipes).where(eq(recipes.userId, creator.user.id)))[0].n).toBe(0);

    await workerData.db.delete(authRateLimits).where(eq(authRateLimits.key, key));
    await field.save(page).click();
    await expect(page).toHaveURL(SAVED, { timeout: 30_000 });
    expect((await workerData.db.select({ n: count() }).from(recipes).where(eq(recipes.userId, creator.user.id)))[0].n).toBe(1);
  });
});

test.describe('detail page access', () => {
  test("another owner's recipe and an unknown id both show Page not found", async ({ page, workerData }) => {
    const foreignId = `${workerData.other.tag}-${seedRecipes[0].id}`;
    for (const id of [foreignId, 'does-not-exist']) {
      await page.goto(`/recipes/${id}`);
      await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible();
      await expect(page.getByRole('status').filter({ hasText: 'Taking you to Recipes in 5 seconds.' })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Go now' })).toBeVisible();
    }
  });
});

test.describe('list freshness', () => {
  test('the list and its counts include a new recipe on the next visit, by link and by browser Back, and the form restarts empty', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('/recipes');
    await expect(page.getByText('Your recipe library is empty.', { exact: true })).toBeVisible();
    await expect(categoryCount(page, 'All')).toContainText('0');

    // First recipe: list -> New Recipe -> save -> Back to Recipes.
    await page.getByRole('link', { name: 'New Recipe' }).click();
    await expect(field.title(page)).toBeEditable();
    await fillMinimal(page, 'First fresh recipe');
    await field.category(page, 'Dinner').click();
    await field.save(page).click();
    await expect(page.getByRole('heading', { level: 1, name: 'First fresh recipe' })).toBeVisible({ timeout: 20_000 });
    await page.getByRole('link', { name: 'Back to Recipes' }).click();
    await expect(page).toHaveURL(`${WEB_URL}/recipes`);
    await expect(cards(page)).toHaveCount(1);
    await expect(cards(page).first()).toContainText('First fresh recipe');
    await expect(categoryCount(page, 'All')).toContainText('1');
    await expect(categoryCount(page, 'Dinner')).toContainText('1');
    await expect(page.getByText('Your recipe library is empty.', { exact: true })).toHaveCount(0);

    // Second recipe in the same session: the form is empty again, and browser Back lands on a fresh list.
    await page.getByRole('link', { name: 'New Recipe' }).click();
    await expect(field.title(page)).toBeEditable();
    await expect(field.title(page)).toHaveValue('');
    await expect(field.step(page, 1)).toHaveValue('');
    await expect(field.ingredientName(page, 1)).toHaveValue('');
    await expect(page.getByText('Choose up to 3 · 0 selected')).toBeVisible();
    await fillMinimal(page, 'Second fresh recipe');
    await field.category(page, 'Breakfast').click();
    await field.category(page, 'Dinner').click();
    await field.save(page).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Second fresh recipe' })).toBeVisible({ timeout: 20_000 });
    await page.goBack();
    await expect(page).toHaveURL(`${WEB_URL}/recipes/create`);
    await expect(field.title(page)).toHaveValue('');
    await expect(field.step(page, 1)).toHaveValue('');
    await expect(page.getByText('Choose up to 3 · 0 selected')).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(`${WEB_URL}/recipes`);
    await expect(cards(page)).toHaveCount(2);
    await expect(cards(page).first()).toContainText('Second fresh recipe');
    await expect(categoryCount(page, 'All')).toContainText('2');
    await expect(categoryCount(page, 'Dinner')).toContainText('2');
    await expect(categoryCount(page, 'Breakfast')).toContainText('1');
  });
});

test.describe('layout', () => {
  const sectionBoxes = async (page: Page) => {
    const names = [/^Basic Information/, /^Cover Photo/, /^Ingredients/, /^Instructions/, /^Notes/];
    const boxes = await Promise.all(names.map((name) => page.getByRole('region', { name }).boundingBox()));
    return boxes.map((box) => box!);
  };

  async function expectCreateLayout(page: Page, width: number) {
    expect(await noOverflow(page)).toBe(true);
    const [basic, cover, ingredients, instructions, notes] = await sectionBoxes(page);
    if (width >= 1280) {
      expect(Math.abs(basic.y - ingredients.y)).toBeLessThan(2);
      expect(ingredients.x).toBeGreaterThan(basic.x + basic.width - 1);
      expect(cover.y).toBeGreaterThan(basic.y + basic.height - 1);
      expect(Math.abs(cover.x - basic.x)).toBeLessThan(1);
      expect(instructions.y).toBeGreaterThan(ingredients.y + ingredients.height - 1);
      expect(Math.abs(instructions.x - ingredients.x)).toBeLessThan(1);
      expect(Math.abs(notes.x - basic.x)).toBeLessThan(1);
      expect(notes.x + notes.width).toBeGreaterThan(instructions.x + instructions.width - 2);
      expect(notes.y).toBeGreaterThan(Math.max(cover.y + cover.height, instructions.y + instructions.height) - 1);
      // 5/12 left, 7/12 right.
      expect(ingredients.width).toBeGreaterThan(basic.width);
    } else {
      const ordered = [basic, cover, ingredients, instructions, notes];
      for (const box of ordered) { expect(Math.abs(box.x - basic.x)).toBeLessThan(1); expect(Math.abs(box.width - basic.width)).toBeLessThan(1); }
      ordered.slice(1).forEach((box, index) => expect(box.y).toBeGreaterThan(ordered[index].y + ordered[index].height - 1));
    }
  }

  async function expectUsableControls(page: Page, width: number) {
    const small = await page.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>('form input:not([type=file]), form select, form textarea, form button'))
      // The unit dropdown keeps a visually hidden form input next to its 44px trigger; it is not a touch target.
      .filter((element) => element.getClientRects().length > 0 && element.getAttribute('aria-hidden') !== 'true')
      .map((element) => ({ height: element.getBoundingClientRect().height, label: element.getAttribute('aria-label') ?? element.id ?? element.textContent?.trim() ?? '' }))
      .filter(({ height }) => height < 43.5).map(({ label }) => label));
    expect(small).toEqual([]);
    const save = field.save(page);
    for (const scroll of [0, 1]) {
      await page.evaluate((to) => window.scrollTo(0, to ? document.documentElement.scrollHeight : 0), scroll);
      const box = (await save.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width + 0.5);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.y + box.height).toBeLessThanOrEqual(page.viewportSize()!.height);
      await expect(save).toBeInViewport({ ratio: 1 });
    }
  }

  test('the Create page keeps its columns, targets and Save button at every width, empty and filled', async ({ page }) => {
    test.setTimeout(180_000);
    await openCreate(page);
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      await expectCreateLayout(page, width);
      await expectUsableControls(page, width);
    }
    await fillRich(page, 'Layout check with a deliberately long recipe title that must wrap instead of overflowing the header');
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      await expectCreateLayout(page, width);
      await expectUsableControls(page, width);
    }
  });

  test('the detail page never overflows at any width', async ({ page, creator, workerData }) => {
    const id = await createRecipeViaApi(creator, workerData.address, richMetadata('Detail layout check with a deliberately long recipe title that must wrap properly'), RICH_FILES);
    await page.goto(`/recipes/${id}`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    // Cover, video poster and the two step photos.
    await expect.poll(async () => (await loaded(page, 'article img')).filter(Boolean).length).toBe(4);
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      expect(await noOverflow(page)).toBe(true);
      const images = await page.locator('article img').evaluateAll((elements) => elements.map((element) => { const box = element.getBoundingClientRect(); return box.left >= 0 && box.right <= window.innerWidth; }));
      expect(images.every(Boolean)).toBe(true);
    }
  });
});
