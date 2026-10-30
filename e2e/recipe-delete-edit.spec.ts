import { randomUUID } from 'node:crypto';
import type { Locator, Page } from '@playwright/test';
import { count, eq } from '../apps/api/node_modules/drizzle-orm/index.js';
import { authRateLimits, recipeImages, recipes } from '../apps/api/src/database/schema.js';
import { seedRecipes } from '../apps/api/src/recipes/seed-recipes.js';
import { creatorTest as test, expect, WEB_URL } from './fixtures.js';
import {
  COVER, RICH, RICH_FILES, STEP_ONE, STEP_THREE, WIDTHS, chooseUnit, categoryIdsFor, createRecipeViaApi, field, imageState, imagesLoaded, ingredientRows, metadataWith, minimalMetadata,
  noOverflow, openRecipe, photo, recipeCards, richMetadata, stepTexts, stubVideoHosts, toast, waitHydrated, watchConsole,
  type CreateMetadata, type Photo,
} from './create-recipe-helpers.js';

const issues = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => { issues.set(page, watchConsole(page)); await stubVideoHosts(page); });
test.afterEach(async ({ page }) => { expect(issues.get(page)).toEqual([]); });

const categoryCount = (page: Page, name: string) => page.getByRole('group', { name: 'Recipe categories' }).getByRole('button', { name: new RegExp(`^${name}(?: |$)`) });
const menuTrigger = (page: Page, title: string) => page.getByRole('button', { name: `More options for ${title}` });
const deleteDialog = (page: Page) => page.getByRole('alertdialog', { name: 'Delete recipe?' });
const discardDialog = (page: Page) => page.getByRole('alertdialog', { name: 'Discard changes?' });
const editForm = (page: Page) => page.getByRole('form', { name: 'Edit Recipe' });
const photoSlot = (page: Page, name: string | RegExp) => page.getByRole('img', { name });
const values = (locator: Locator) => locator.evaluateAll((elements) => elements.map((element) => (element as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value));
// Seeding already spent a write (the recipe was created through the API), so the counter row may exist.
const exhaustWrites = (db: Parameters<typeof imageState>[0], userId: string) => db.insert(authRateLimits)
  .values({ id: randomUUID(), key: `wrapper:recipe-write:user:${userId}`, count: 60, lastRequest: Date.now() })
  .onConflictDoUpdate({ target: authRateLimits.key, set: { count: 60, lastRequest: Date.now() } });
const restoreWrites = (db: Parameters<typeof imageState>[0], userId: string) => db.delete(authRateLimits).where(eq(authRateLimits.key, `wrapper:recipe-write:user:${userId}`));

/** Four steps with photos on 1, 3 and 4, so reordering, removing and deleting can each be told apart. */
const FOUR_STEPS = ['Bring salted water to a boil.', 'Cook the bacon until crisp.', 'Toss everything together.', 'Plate and garnish.'];
const PLATE = photo('plate.png', [90, 140, 90]);
const fourStepFiles: Record<string, Photo> = { cover: COVER, 'step-0': STEP_ONE, 'step-2': STEP_THREE, 'step-3': PLATE };
const fourStepMetadata = (title: string, categoryIds: string[]): CreateMetadata => ({
  ...richMetadata(title, categoryIds),
  instructions: FOUR_STEPS.map((description, index) => ({ description, hasImage: index !== 1 })),
});

async function openEdit(page: Page, id: string, title: string) {
  await openRecipe(page, id, title);
  await menuTrigger(page, title).click();
  await page.getByRole('menuitem', { name: 'Edit recipe' }).click();
  await expectEditPage(page, id);
}

async function expectEditPage(page: Page, id: string) {
  await expect(page).toHaveURL(`${WEB_URL}/recipes/${id}/edit`);
  await expect(page.getByRole('heading', { level: 1, name: 'Edit Recipe' })).toBeVisible();
  await expect(field.title(page)).toBeEditable();
  await waitHydrated(editForm(page));
}

const save = (page: Page) => page.getByRole('button', { name: /^(Save Changes|Saving…)$/ });

/** Everything the edit form shows, in a shape that compares against what was saved. */
async function formState(page: Page) {
  return {
    title: await field.title(page).inputValue(),
    description: await field.description(page).inputValue(),
    // Chips are laid out in catalogue order whatever the selection order; the stored order is checked on the recipe page.
    categories: (await page.getByRole('group', { name: 'Category', exact: true }).getByRole('button', { pressed: true }).allTextContents()).sort(),
    prep: await field.prep(page).inputValue(),
    cook: await field.cook(page).inputValue(),
    servings: await field.servings(page).inputValue(),
    video: await field.video(page).inputValue(),
    notes: await field.notes(page).inputValue(),
    ingredientNames: await values(page.getByLabel(/^Ingredient \d+ name$/)),
    ingredientAmounts: await values(page.getByLabel(/^Ingredient \d+ amount$/)),
    ingredientUnits: await page.getByLabel(/^Ingredient \d+ unit$/).locator('[data-slot="select-value"]').allTextContents(),
    steps: await values(page.getByLabel(/^Step \d+ instructions$/)),
  };
}

test.describe('delete', () => {
  test('the dialog names the recipe; Cancel and Escape keep it and return focus; confirming deletes it, its photos and updates the list', async ({ page, creator, workerData }) => {
    test.setTimeout(150_000);
    const keep = await createRecipeViaApi(creator, workerData.address, metadataWith('Stays', { categoryIds: await categoryIdsFor(creator, ['Dinner']) }));
    const target = await createRecipeViaApi(creator, workerData.address, fourStepMetadata('Goes away', await categoryIdsFor(creator, RICH.categories)), fourStepFiles);
    const before = await imageState(workerData.db, target);
    expect(before.images).toHaveLength(4);
    const keys = before.images.map(({ key }) => key);
    expect(await workerData.countStoredObjects(keys)).toBe(4);

    await page.goto('/recipes');
    await expect(categoryCount(page, 'All')).toContainText('2');
    await expect(categoryCount(page, 'Dinner')).toContainText('2');
    await expect(categoryCount(page, 'Breakfast')).toContainText('1');
    await page.getByRole('link', { name: 'Goes away' }).first().click();
    await expect(page.getByRole('heading', { level: 1, name: 'Goes away' })).toBeVisible();
    await waitHydrated(menuTrigger(page, 'Goes away'));

    // Cancel and Escape keep the recipe and put focus back on the ⋮ button.
    const dialog = deleteDialog(page);
    await menuTrigger(page, 'Goes away').click();
    await page.getByRole('menuitem', { name: 'Delete recipe' }).click();
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('“Goes away” and its photos will be permanently deleted.');
    await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Delete recipe' })).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(menuTrigger(page, 'Goes away')).toBeFocused();
    expect(await workerData.db.$count(recipes, eq(recipes.id, target))).toBe(1);

    await menuTrigger(page, 'Goes away').click();
    await page.getByRole('menuitem', { name: 'Delete recipe' }).click();
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(menuTrigger(page, 'Goes away')).toBeFocused();
    await expect(page).toHaveURL(`${WEB_URL}/recipes/${target}`);

    // Confirm (the request is held back briefly so the pending state can be seen).
    await page.route(`${WEB_URL}/recipes/${target}`, async (route) => {
      if (route.request().method() === 'POST') await new Promise((resolve) => setTimeout(resolve, 1_500));
      await route.continue();
    });
    await menuTrigger(page, 'Goes away').click();
    await page.getByRole('menuitem', { name: 'Delete recipe' }).click();
    await dialog.getByRole('button', { name: 'Delete recipe' }).click();
    await expect(dialog.getByRole('button', { name: 'Deleting…' })).toBeDisabled();
    await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    // Four stored photos are deleted before the redirect, so allow the real storage round trips.
    await expect(page).toHaveURL(`${WEB_URL}/recipes`, { timeout: 40_000 });
    await page.unroute(`${WEB_URL}/recipes/${target}`);
    await expect(toast.success(page, 'Recipe deleted')).toBeVisible();
    await expect(page).toHaveURL(`${WEB_URL}/recipes`);

    // The list and its counts changed without a manual reload.
    await expect(recipeCards(page)).toHaveCount(1);
    await expect(page.getByRole('link', { name: 'Goes away' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Stays' }).first()).toBeVisible();
    await expect(categoryCount(page, 'All')).toContainText('1');
    await expect(categoryCount(page, 'Dinner')).toContainText('1');
    await expect(categoryCount(page, 'Breakfast')).toContainText('0');

    // Gone from the database and from storage.
    expect(await workerData.db.$count(recipes, eq(recipes.id, target))).toBe(0);
    expect(await workerData.db.$count(recipeImages, eq(recipeImages.recipeId, target))).toBe(0);
    await expect.poll(() => workerData.countStoredObjects(keys), { timeout: 20_000 }).toBe(0);
    expect(await workerData.db.$count(recipes, eq(recipes.id, keep))).toBe(1);

    // Its page is now Page not found, also when reached with browser Back; no stale recipe appears.
    await page.goto(`/recipes/${target}`);
    await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'Goes away' })).toHaveCount(0);
  });

  test('the list card menu edits and deletes like the recipe page menu', async ({ page, creator, workerData }) => {
    const kept = await createRecipeViaApi(creator, workerData.address, minimalMetadata('Card kept'));
    await createRecipeViaApi(creator, workerData.address, minimalMetadata('Card removed'));
    await page.goto('/recipes');
    await expect(recipeCards(page)).toHaveCount(2);
    const cardFor = (title: string) => recipeCards(page).filter({ hasText: title });

    await cardFor('Card kept').getByRole('button', { name: 'More options for Card kept' }).click();
    await page.getByRole('menuitem', { name: 'Edit recipe' }).click();
    await expect(page).toHaveURL(`${WEB_URL}/recipes/${kept}/edit`);
    await expect(page.getByRole('heading', { level: 1, name: 'Edit Recipe' })).toBeVisible();

    await page.goBack();
    await cardFor('Card removed').getByRole('button', { name: 'More options for Card removed' }).click();
    await page.getByRole('menuitem', { name: 'Delete recipe' }).click();
    await deleteDialog(page).getByRole('button', { name: 'Delete recipe' }).click();
    await expect(toast.success(page, 'Recipe deleted')).toBeVisible();
    await expect(page).toHaveURL(`${WEB_URL}/recipes`);
    await expect(recipeCards(page)).toHaveCount(1);
    await expect(cardFor('Card kept')).toHaveCount(1);
  });

  test('browser Back after a delete never shows the deleted recipe', async ({ page, creator, workerData }) => {
    const target = await createRecipeViaApi(creator, workerData.address, minimalMetadata('Back after delete'));
    await createRecipeViaApi(creator, workerData.address, minimalMetadata('Other survivor'));
    await page.goto('/recipes');
    await page.getByRole('link', { name: 'Back after delete' }).first().click();
    await expect(page.getByRole('heading', { level: 1, name: 'Back after delete' })).toBeVisible();
    await waitHydrated(menuTrigger(page, 'Back after delete'));
    await menuTrigger(page, 'Back after delete').click();
    await page.getByRole('menuitem', { name: 'Delete recipe' }).click();
    await deleteDialog(page).getByRole('button', { name: 'Delete recipe' }).click();
    await expect(page).toHaveURL(`${WEB_URL}/recipes`);
    await expect(recipeCards(page)).toHaveCount(1);

    let sawDeletedUrl = false;
    for (let step = 0; step < 3; step++) {
      await page.goBack();
      await page.waitForLoadState('load');
      if (page.url() === `${WEB_URL}/recipes/${target}`) {
        await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible();
        await expect(page.getByRole('heading', { level: 1, name: 'Back after delete' })).toHaveCount(0);
        sawDeletedUrl = true;
        break;
      }
      if (page.url() === `${WEB_URL}/recipes`) {
        await expect(page.getByRole('link', { name: 'Back after delete' })).toHaveCount(0);
        await expect(page.getByRole('link', { name: 'Other survivor' }).first()).toBeVisible();
      }
    }
    // Back reaches the deleted recipe's own history entry, and it is not-found rather than a stale page.
    expect(sawDeletedUrl).toBe(true);
  });

  test('a failed delete keeps the recipe, shows a persistent error toast, and a retry then deletes it', async ({ page, creator, workerData }) => {
    const id = await createRecipeViaApi(creator, workerData.address, minimalMetadata('Delete retry'));
    await exhaustWrites(workerData.db, creator.user.id);
    await openRecipe(page, id, 'Delete retry');
    await menuTrigger(page, 'Delete retry').click();
    await page.getByRole('menuitem', { name: 'Delete recipe' }).click();
    await deleteDialog(page).getByRole('button', { name: 'Delete recipe' }).click();
    await expect(toast.error(page, 'Couldn’t delete recipe. Try again.')).toBeVisible();
    await expect(deleteDialog(page)).toHaveCount(0);
    await expect(page).toHaveURL(`${WEB_URL}/recipes/${id}`);
    await expect(page.getByRole('heading', { level: 1, name: 'Delete retry' })).toBeVisible();
    expect(await workerData.db.$count(recipes, eq(recipes.id, id))).toBe(1);

    await restoreWrites(workerData.db, creator.user.id);
    await menuTrigger(page, 'Delete retry').click();
    await page.getByRole('menuitem', { name: 'Delete recipe' }).click();
    await deleteDialog(page).getByRole('button', { name: 'Delete recipe' }).click();
    await expect(page).toHaveURL(`${WEB_URL}/recipes`);
    await expect(toast.success(page, 'Recipe deleted')).toBeVisible();
    expect(await workerData.db.$count(recipes, eq(recipes.id, id))).toBe(0);
  });
});

test.describe('edit: pre-fill and no-op save', () => {
  test('every field and every image is pre-filled from the menu, and saving with no change keeps the same stored photos', async ({ page, creator, workerData }) => {
    test.setTimeout(150_000);
    const id = await createRecipeViaApi(creator, workerData.address, richMetadata('Prefilled', await categoryIdsFor(creator, RICH.categories)), RICH_FILES);
    const before = await imageState(workerData.db, id);
    expect(before.images).toHaveLength(3);
    await openEdit(page, id, 'Prefilled');

    await expect(save(page)).toHaveText('Save Changes');
    expect(await formState(page)).toEqual({
      title: 'Prefilled', description: RICH.description, categories: [...RICH.categories].sort(), prep: '10', cook: '20', servings: '4',
      video: 'https://youtu.be/dQw4w9WgXcQ', notes: RICH.notes,
      ingredientNames: ['Spaghetti', 'Olive oil', 'Salt'], ingredientAmounts: ['200', '1½', ''], ingredientUnits: ['g', 'tbsp', 'to taste'],
      steps: RICH.steps,
    });
    await expect(page.getByText('Choose up to 3 · 3 selected')).toBeVisible();
    await expect(field.ingredientAmount(page, 3)).toBeDisabled();

    // Cover and the photos of steps 1 and 3 show as saved photos; step 2 has none.
    await expect(photoSlot(page, 'Current cover photo')).toBeVisible();
    await expect(photoSlot(page, 'Current photo for step 1')).toBeVisible();
    await expect(photoSlot(page, 'Current photo for step 3')).toBeVisible();
    await expect(photoSlot(page, 'Current photo for step 2')).toHaveCount(0);
    await expect(page.getByText('Current photo', { exact: true })).toHaveCount(3);
    await expect(page.getByLabel('Replace cover photo')).toBeVisible();
    await expect(page.getByLabel('Replace photo for step 1')).toBeVisible();
    await expect(page.getByLabel('Add photo to step 2')).toBeVisible();
    await expect.poll(() => imagesLoaded(page, 'form img')).toBe(true);

    await save(page).click();
    await expect(page).toHaveURL(`${WEB_URL}/recipes/${id}`, { timeout: 30_000 });
    await expect(page.getByRole('heading', { level: 1, name: 'Prefilled' })).toBeVisible({ timeout: 20_000 });
    await expect(toast.success(page, 'Recipe updated')).toBeVisible();
    await expect(page.getByRole('list', { name: 'Categories' }).getByRole('listitem')).toHaveText(RICH.categories);
    expect(await ingredientRows(page)).toEqual([
      { name: 'Spaghetti', amount: '200 g' }, { name: 'Olive oil', amount: '1½ tbsp' }, { name: 'Salt', amount: 'to taste' },
    ]);
    expect(await stepTexts(page)).toEqual(RICH.steps);

    // Nothing was re-uploaded: same image rows and keys, still attached to the same steps, objects untouched.
    const after = await imageState(workerData.db, id);
    expect(after.images).toEqual(before.images);
    expect(after.steps).toEqual(before.steps);
    expect(await workerData.countStoredObjects(after.images.map(({ key }) => key))).toBe(3);
  });
});

test.describe('edit: changing everything', () => {
  test('text, categories, ingredients, step order, photos replaced, removed, added and deleted all land exactly as edited', async ({ page, creator, workerData }) => {
    test.setTimeout(240_000);
    const id = await createRecipeViaApi(creator, workerData.address, fourStepMetadata('Before edit', await categoryIdsFor(creator, RICH.categories)), fourStepFiles);
    const before = await imageState(workerData.db, id);
    expect(before.images).toHaveLength(4);
    const [coverBefore, photoA, photoC, photoD] = before.images; // positions: cover, step 1, step 3, step 4
    const keyOf = (row: { key: string }) => row.key;
    await expect.poll(() => workerData.countStoredObjects(before.images.map(keyOf))).toBe(4);

    await page.goto('/recipes');
    await expect(page.getByRole('link', { name: 'Before edit' }).first()).toBeVisible();
    await page.getByRole('link', { name: 'Before edit' }).first().click();
    await expect(page.getByRole('heading', { level: 1, name: 'Before edit' })).toBeVisible();
    await waitHydrated(menuTrigger(page, 'Before edit'));
    await menuTrigger(page, 'Before edit').click();
    await page.getByRole('menuitem', { name: 'Edit recipe' }).click();
    await expectEditPage(page, id);

    // Text fields, categories (Breakfast out, Lunch in), times, servings, video, notes.
    await field.title(page).fill('After edit');
    await field.description(page).fill('A new description.');
    await field.category(page, 'Breakfast').click();
    await field.category(page, 'Lunch').click();
    await field.prep(page).fill('5');
    await field.cook(page).fill('');
    await field.servings(page).fill('6');
    await field.video(page).fill('https://vimeo.com/76979871');
    await field.notes(page).fill('New note, one line.');
    // Ingredients: rename, add one with decimals, make "Salt" a different to-taste row.
    await field.ingredientName(page, 1).fill('Linguine');
    await field.ingredientAmount(page, 1).fill('250');
    await field.ingredientName(page, 3).fill('Black pepper');
    await page.getByRole('button', { name: 'Add ingredient' }).click();
    await field.ingredientName(page, 4).fill('Parmesan');
    await field.ingredientAmount(page, 4).fill('0.25');
    await chooseUnit(page, 4, 'cup');

    // Steps: move "Toss everything together." (kept photo) up, drop the photo of step 1, delete step 4 (it had a photo), add a new step with a new photo.
    await page.getByRole('button', { name: 'Move step 3 up' }).click();
    await page.getByRole('button', { name: 'Remove photo from step 1' }).click();
    await page.getByRole('button', { name: 'Remove step 4' }).click();
    await page.getByRole('button', { name: 'Add step' }).click();
    await field.step(page, 4).fill('Serve hot.');
    const added = photo('serve-hot.png', [200, 80, 60]);
    await page.getByLabel('Add photo to step 4').setInputFiles(added);
    // The cover is replaced: the new photo uploads at once as a Pending photo and the save names it.
    const coverUpload = page.waitForResponse((answer) => new URL(answer.url()).pathname === '/api/pending-photos' && answer.request().method() === 'POST');
    await page.getByLabel('Replace cover photo').setInputFiles(photo('new-cover.png', [70, 120, 200]));
    await expect(page.getByText(/^new-cover\.(webp|jpg) · \d+ KB$/)).toBeVisible();
    expect(await (await coverUpload).json()).toMatchObject({ status: 'uploaded' });

    await save(page).click();
    await expect(page).toHaveURL(`${WEB_URL}/recipes/${id}`, { timeout: 40_000 });
    await expect(page.getByRole('heading', { level: 1, name: 'After edit' })).toBeVisible({ timeout: 20_000 });
    await expect(toast.success(page, 'Recipe updated')).toBeVisible();
    await expect(page.getByRole('list', { name: 'Categories' }).getByRole('listitem')).toHaveText(['Dinner', 'Snacks', 'Lunch']);
    await expect(page.getByRole('list', { name: 'Recipe details' })).toContainText('Prep 5 min');
    await expect(page.getByRole('list', { name: 'Recipe details' })).not.toContainText('Cook');
    await expect(page.getByRole('list', { name: 'Recipe details' })).toContainText('6 servings');
    await expect(page.getByText('A new description.')).toBeVisible();
    await expect(page.getByText('New note, one line.')).toBeVisible();
    expect(await ingredientRows(page)).toEqual([
      { name: 'Linguine', amount: '250 g' }, { name: 'Olive oil', amount: '1½ tbsp' }, { name: 'Black pepper', amount: 'to taste' }, { name: 'Parmesan', amount: '¼ cup' },
    ]);
    expect(await stepTexts(page)).toEqual([FOUR_STEPS[0], FOUR_STEPS[2], FOUR_STEPS[1], 'Serve hot.']);
    // Photos: the kept one followed its step to position 2, the new one is on step 4, steps 1 and 3 have none.
    await expect(page.getByRole('button', { name: /^Open step \d+ photo$/ })).toHaveCount(2);
    await expect(page.getByRole('button', { name: 'Open step 2 photo' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open step 4 photo' })).toBeVisible();
    await expect(page.getByRole('img', { name: 'After edit' })).toBeVisible();
    await expect.poll(() => imagesLoaded(page)).toBe(true);
    await expect(page.getByText('Plays from Vimeo')).toBeVisible();

    // Database: the kept photo is the same row and key and still belongs to its step; replaced, removed and deleted ones are gone.
    const after = await imageState(workerData.db, id);
    expect(after.images).toHaveLength(3);
    const afterIds = after.images.map(({ id: imageId }) => imageId);
    expect(afterIds).toContain(photoC.id);
    expect(after.images.find(({ id: imageId }) => imageId === photoC.id)?.key).toBe(photoC.key);
    for (const gone of [coverBefore, photoA, photoD]) expect(afterIds).not.toContain(gone.id);
    expect(after.steps.map(({ text, imageId }) => [text, imageId === null ? 'none' : imageId === photoC.id ? 'kept' : 'new']))
      .toEqual([[FOUR_STEPS[0], 'none'], [FOUR_STEPS[2], 'kept'], [FOUR_STEPS[1], 'none'], ['Serve hot.', 'new']]);
    // Storage: removed, replaced and deleted objects are gone, the kept one is untouched and the new ones exist.
    await expect.poll(() => workerData.countStoredObjects([coverBefore, photoA, photoD].map(keyOf)), { timeout: 20_000 }).toBe(0);
    expect(await workerData.countStoredObjects([photoC.key])).toBe(1);
    expect(await workerData.countStoredObjects(after.images.filter(({ id: imageId }) => imageId !== photoC.id).map(keyOf))).toBe(2);

    // Reopening Edit shows what was saved, not what the form held before.
    await menuTrigger(page, 'After edit').click();
    await page.getByRole('menuitem', { name: 'Edit recipe' }).click();
    await expectEditPage(page, id);
    const reopened = await formState(page);
    expect(reopened.title).toBe('After edit');
    expect(reopened.cook).toBe('');
    expect(reopened.categories).toEqual(['Dinner', 'Lunch', 'Snacks']);
    expect(reopened.steps).toEqual([FOUR_STEPS[0], FOUR_STEPS[2], FOUR_STEPS[1], 'Serve hot.']);
    expect(reopened.ingredientNames).toEqual(['Linguine', 'Olive oil', 'Black pepper', 'Parmesan']);
    await expect(photoSlot(page, 'Current photo for step 2')).toBeVisible();
    await expect(photoSlot(page, 'Current photo for step 4')).toBeVisible();
    await expect(photoSlot(page, 'Current photo for step 1')).toHaveCount(0);
  });
});

test.describe('edit: freshness elsewhere', () => {
  test('the list card and the recipe page show the update by link and by browser Back and Forward', async ({ page, creator, workerData }) => {
    test.setTimeout(180_000);
    const id = await createRecipeViaApi(creator, workerData.address, richMetadata('Fresh before', await categoryIdsFor(creator, RICH.categories)), RICH_FILES);
    await page.goto('/recipes');
    await expect(page.getByRole('link', { name: 'Fresh before' }).first()).toBeVisible();
    await expect(recipeCards(page).first().getByText('Dinner')).toBeVisible();
    await page.getByRole('link', { name: 'Fresh before' }).first().click();
    await expect(page.getByRole('heading', { level: 1, name: 'Fresh before' })).toBeVisible();
    await waitHydrated(menuTrigger(page, 'Fresh before'));
    await menuTrigger(page, 'Fresh before').click();
    await page.getByRole('menuitem', { name: 'Edit recipe' }).click();
    await expectEditPage(page, id);
    await field.title(page).fill('Fresh after');
    await field.category(page, 'Dinner').click();
    await field.category(page, 'Desserts').click();
    await page.getByLabel('Replace cover photo').setInputFiles(photo('changed-cover.png', [60, 130, 90]));
    await save(page).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Fresh after' })).toBeVisible({ timeout: 40_000 });
    await expect(page).toHaveURL(`${WEB_URL}/recipes/${id}`);

    const listShowsFresh = async () => {
      await expect(page.getByRole('link', { name: 'Fresh after' }).first()).toBeVisible();
      await expect(page.getByRole('link', { name: 'Fresh before' })).toHaveCount(0);
      const card = recipeCards(page).first();
      await expect(card.getByText('Breakfast')).toBeVisible();
      await expect(card.getByText('Snacks')).toBeVisible();
      await expect(card.getByText('Dinner')).toHaveCount(0);
      await expect.poll(() => imagesLoaded(page, 'li img')).toBe(true);
    };
    // By link.
    await page.getByRole('link', { name: 'Back to Recipes' }).click();
    await expect(page).toHaveURL(`${WEB_URL}/recipes`);
    await listShowsFresh();

    // By browser history: every entry shows the saved values.
    const visited: string[] = [];
    const check = async () => {
      const path = new URL(page.url()).pathname;
      if (path === `/recipes/${id}/edit`) { visited.push('edit'); await expect(field.title(page)).toHaveValue('Fresh after'); await expect(page.getByText('Choose up to 3 · 3 selected')).toBeVisible(); }
      else if (path === `/recipes/${id}`) { visited.push('recipe'); await expect(page.getByRole('heading', { level: 1, name: 'Fresh after' })).toBeVisible(); await expect(page.getByRole('list', { name: 'Categories' }).getByRole('listitem')).toHaveText(['Breakfast', 'Snacks', 'Desserts']); }
      else { visited.push('list'); await listShowsFresh(); }
    };
    for (let step = 0; step < 4; step++) { await page.goBack(); await page.waitForLoadState('load'); await check(); }
    for (let step = 0; step < 4; step++) { await page.goForward(); await page.waitForLoadState('load'); await check(); }
    expect(visited).toContain('recipe');
    expect(visited).toContain('list');
  });
});

test.describe('edit: leaving, errors and access', () => {
  test('a pristine Cancel leaves quietly; a dirty one asks, Keep editing stays, Discard returns to the recipe page and the next visit is clean', async ({ page, creator, workerData }) => {
    const id = await createRecipeViaApi(creator, workerData.address, minimalMetadata('Cancel me'));
    await openEdit(page, id, 'Cancel me');
    await field.leave(page).click();
    await expect(page).toHaveURL(`${WEB_URL}/recipes/${id}`);
    await expect(discardDialog(page)).toHaveCount(0);

    await menuTrigger(page, 'Cancel me').click();
    await page.getByRole('menuitem', { name: 'Edit recipe' }).click();
    await expectEditPage(page, id);
    await field.title(page).fill('Changed but not saved');
    await field.leave(page).click();
    await expect(discardDialog(page)).toBeVisible();
    await expect(discardDialog(page)).toContainText('Your changes to this recipe will be lost.');
    await discardDialog(page).getByRole('button', { name: 'Keep editing' }).click();
    await expect(discardDialog(page)).toHaveCount(0);
    await expect(page).toHaveURL(`${WEB_URL}/recipes/${id}/edit`);
    await expect(field.title(page)).toHaveValue('Changed but not saved');

    await field.leave(page).click();
    await discardDialog(page).getByRole('button', { name: 'Discard' }).click();
    await expect(page).toHaveURL(`${WEB_URL}/recipes/${id}`);
    await expect(page.getByRole('heading', { level: 1, name: 'Cancel me' })).toBeVisible();
    await expect(page.getByText('Recipe updated')).toHaveCount(0);
    expect(await workerData.db.query.recipes.findFirst({ where: eq(recipes.id, id) }).then((row) => row?.title)).toBe('Cancel me');

    await menuTrigger(page, 'Cancel me').click();
    await page.getByRole('menuitem', { name: 'Edit recipe' }).click();
    await expectEditPage(page, id);
    await expect(field.title(page)).toHaveValue('Cancel me');
  });

  test('validation errors on edit are inline, focus goes to the first, and nothing is saved', async ({ page, creator, workerData }) => {
    const id = await createRecipeViaApi(creator, workerData.address, richMetadata('Validate edit', await categoryIdsFor(creator, RICH.categories)), RICH_FILES);
    await openEdit(page, id, 'Validate edit');
    await field.title(page).fill('');
    await field.ingredientName(page, 2).fill('');
    await field.step(page, 3).fill('');
    await field.video(page).fill('http://example.com/not-secure');
    await save(page).click();
    await expect(page.getByText('Add a title before saving.')).toBeVisible();
    await expect(page.getByText('Add an ingredient name.')).toBeVisible();
    await expect(page.getByText('Describe this step.')).toBeVisible();
    await expect(page.getByText('Enter a link that starts with https://')).toBeVisible();
    await expect(field.title(page)).toHaveAttribute('aria-invalid', 'true');
    await expect(field.title(page)).toBeFocused();
    await expect(page).toHaveURL(`${WEB_URL}/recipes/${id}/edit`);
    expect(await workerData.db.query.recipes.findFirst({ where: eq(recipes.id, id) }).then((row) => row?.title)).toBe('Validate edit');
  });

  test('a rejected update keeps the edits, shows the inline alert and an error toast, and a retry saves', async ({ page, creator, workerData }) => {
    const id = await createRecipeViaApi(creator, workerData.address, minimalMetadata('Update retry'));
    await exhaustWrites(workerData.db, creator.user.id);
    await openEdit(page, id, 'Update retry');
    await field.title(page).fill('Update retried');
    await save(page).click();
    await expect(editForm(page).getByRole('alert').filter({ hasText: 'Too many saves. Try again in a moment.' })).toBeVisible();
    await expect(toast.error(page, 'Couldn’t update recipe. Try again.')).toBeVisible();
    await expect(field.title(page)).toHaveValue('Update retried');
    await expect(save(page)).toBeEnabled();
    expect(await workerData.db.query.recipes.findFirst({ where: eq(recipes.id, id) }).then((row) => row?.title)).toBe('Update retry');

    await restoreWrites(workerData.db, creator.user.id);
    await save(page).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Update retried' })).toBeVisible({ timeout: 30_000 });
    await expect(toast.success(page, 'Recipe updated')).toBeVisible();
    expect(await workerData.db.$count(recipes, eq(recipes.userId, creator.user.id))).toBe(1);
  });

  test("another account's recipe and an unknown id under /edit show Page not found; anonymous visitors go to sign-in", async ({ page, browser, workerData }) => {
    const foreignId = `${workerData.other.tag}-${seedRecipes[0].id}`;
    for (const id of [foreignId, 'does-not-exist']) {
      await page.goto(`/recipes/${id}/edit`);
      await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible();
      await expect(page.getByRole('status').filter({ hasText: 'Taking you to Recipes in 5 seconds.' })).toBeVisible();
      await expect(page.getByRole('heading', { level: 1, name: 'Edit Recipe' })).toHaveCount(0);
    }
    const anonymous = await browser.newContext();
    try {
      const visitor = await anonymous.newPage();
      await visitor.goto(`${WEB_URL}/recipes/${foreignId}/edit`);
      await expect(visitor).toHaveURL(`${WEB_URL}/auth/login`);
    } finally { await anonymous.close(); }
  });
});

test.describe('edit: layout', () => {
  test('the pre-filled edit page never overflows at any width, also with the discard dialog and an error toast open', async ({ page, creator, workerData }) => {
    test.setTimeout(240_000);
    const id = await createRecipeViaApi(creator, workerData.address, fourStepMetadata('Edit layout with a deliberately long title that has to wrap inside the header instead of overflowing', await categoryIdsFor(creator, RICH.categories)), fourStepFiles);
    await openEdit(page, id, 'Edit layout with a deliberately long title that has to wrap inside the header instead of overflowing');
    await expect.poll(() => imagesLoaded(page, 'form img')).toBe(true);
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      expect(await noOverflow(page), `edit ${width}`).toBe(true);
      const saveBox = (await save(page).boundingBox())!;
      expect(saveBox.x).toBeGreaterThanOrEqual(0);
      expect(saveBox.x + saveBox.width).toBeLessThanOrEqual(width);
    }
    await field.title(page).fill('Edit layout changed');
    await field.leave(page).click();
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      await expect(discardDialog(page)).toBeVisible();
      expect(await noOverflow(page), `discard dialog ${width}`).toBe(true);
      const dialogBox = (await discardDialog(page).boundingBox())!;
      expect(dialogBox.x).toBeGreaterThanOrEqual(0);
      expect(dialogBox.x + dialogBox.width).toBeLessThanOrEqual(width);
    }
    await discardDialog(page).getByRole('button', { name: 'Keep editing' }).click();

    await exhaustWrites(workerData.db, creator.user.id);
    await save(page).click();
    await expect(toast.error(page, 'Couldn’t update recipe. Try again.')).toBeVisible();
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      expect(await noOverflow(page), `toast ${width}`).toBe(true);
    }
    // The count of stored rows is unchanged by a rejected update.
    expect((await workerData.db.select({ n: count() }).from(recipeImages).where(eq(recipeImages.recipeId, id)))[0].n).toBe(4);
  });
});
