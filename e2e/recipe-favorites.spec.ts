import { randomUUID } from 'node:crypto';
import type { Locator, Page } from '@playwright/test';
import { and, eq } from '../apps/api/node_modules/drizzle-orm/index.js';
import type { DrizzleDb } from '../apps/api/src/database/database.service.js';
import { authRateLimits, favorites } from '../apps/api/src/database/schema.js';
import { creatorTest as test, expect, WEB_URL } from './fixtures.js';
import {
  createRecipeViaApi, logIn, logOut, minimalMetadata, openRecipe, recipeCards, stubVideoHosts, toast, waitHydrated, watchConsole,
} from './create-recipe-helpers.js';

const issues = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => { issues.set(page, watchConsole(page)); await stubVideoHosts(page); });
test.afterEach(async ({ page }) => { expect(issues.get(page)).toEqual([]); });

const FAVORITE_ERROR = 'Couldn’t save favorite. Try again.';
const pageHeart = (page: Page, title: string) => page.getByRole('button', { name: new RegExp(`^(Add|Remove) ${title} (to|from) favorites$`) });
const card = (page: Page, title: string) => recipeCards(page).filter({ has: page.getByRole('heading', { name: title }) });
const cardHeart = (page: Page, title: string) => card(page, title).getByRole('button', { name: new RegExp(`^(Add|Remove) ${title} (to|from) favorites$`) });

async function openList(page: Page, title: string) {
  await page.goto('/recipes');
  await expect(cardHeart(page, title)).toBeVisible();
  await waitHydrated(cardHeart(page, title));
}

type Data = { db: DrizzleDb };
const isStored = async (workerData: Data, userId: string, recipeId: string) => {
  const rows = await workerData.db.select().from(favorites).where(and(eq(favorites.userId, userId), eq(favorites.recipeId, recipeId)));
  return rows.length === 1;
};

test.describe('persistence and agreement', () => {
  test('a heart set on the recipe page survives a reload, and clearing it does too', async ({ page, creator, workerData }) => {
    const id = await createRecipeViaApi(creator, workerData.address, minimalMetadata('Persisted heart'));
    await openRecipe(page, id, 'Persisted heart');
    const heart = pageHeart(page, 'Persisted heart');
    await expect(heart).toHaveAttribute('aria-pressed', 'false');
    await heart.click();
    await expect(heart).toHaveAttribute('aria-pressed', 'true');
    await expect(heart).toHaveAccessibleName('Remove Persisted heart from favorites');
    await expect.poll(() => isStored(workerData, creator.user.id, id)).toBe(true);

    await page.reload();
    await expect(pageHeart(page, 'Persisted heart')).toHaveAttribute('aria-pressed', 'true');
    await pageHeart(page, 'Persisted heart').click();
    await expect(pageHeart(page, 'Persisted heart')).toHaveAttribute('aria-pressed', 'false');
    await expect.poll(() => isStored(workerData, creator.user.id, id)).toBe(false);
    await page.reload();
    await expect(pageHeart(page, 'Persisted heart')).toHaveAttribute('aria-pressed', 'false');
  });

  test('the card heart and the recipe page agree in both directions', async ({ page, creator, workerData }) => {
    const first = await createRecipeViaApi(creator, workerData.address, minimalMetadata('Agree one'));
    const second = await createRecipeViaApi(creator, workerData.address, minimalMetadata('Agree two'));

    // Page -> list: the card heart shows the new state.
    await openRecipe(page, first, 'Agree one');
    await pageHeart(page, 'Agree one').click();
    await expect(pageHeart(page, 'Agree one')).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => isStored(workerData, creator.user.id, first)).toBe(true);
    await page.getByRole('link', { name: 'Back to Recipes' }).click();
    await expect(cardHeart(page, 'Agree one')).toHaveAttribute('aria-pressed', 'true');
    await expect(cardHeart(page, 'Agree two')).toHaveAttribute('aria-pressed', 'false');
    await waitHydrated(cardHeart(page, 'Agree one'));

    // List -> page: the card heart toggles and the recipe page agrees.
    await cardHeart(page, 'Agree two').click();
    await expect(cardHeart(page, 'Agree two')).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => isStored(workerData, creator.user.id, second)).toBe(true);
    await card(page, 'Agree two').getByRole('link', { name: 'Agree two' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Agree two' })).toBeVisible();
    await expect(pageHeart(page, 'Agree two')).toHaveAttribute('aria-pressed', 'true');

    // Card heart off -> the page shows it off, and a reload of the list keeps it.
    await page.goBack();
    await expect(cardHeart(page, 'Agree two')).toHaveAttribute('aria-pressed', 'true');
    await cardHeart(page, 'Agree two').click();
    await expect(cardHeart(page, 'Agree two')).toHaveAttribute('aria-pressed', 'false');
    await expect.poll(() => isStored(workerData, creator.user.id, second)).toBe(false);
    await card(page, 'Agree two').getByRole('link', { name: 'Agree two' }).click();
    await expect(pageHeart(page, 'Agree two')).toHaveAttribute('aria-pressed', 'false');
    await page.goto('/recipes');
    await expect(cardHeart(page, 'Agree two')).toHaveAttribute('aria-pressed', 'false');
    await expect(cardHeart(page, 'Agree one')).toHaveAttribute('aria-pressed', 'true');
  });

  test('Back and Forward between the list and the recipe page never show a stale heart', async ({ page, creator, workerData }) => {
    const id = await createRecipeViaApi(creator, workerData.address, minimalMetadata('History heart'));
    await openList(page, 'History heart');
    await card(page, 'History heart').getByRole('link', { name: 'History heart' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'History heart' })).toBeVisible();
    await waitHydrated(pageHeart(page, 'History heart'));

    await pageHeart(page, 'History heart').click();
    await expect(pageHeart(page, 'History heart')).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => isStored(workerData, creator.user.id, id)).toBe(true);
    await page.goBack();
    await expect(cardHeart(page, 'History heart')).toHaveAttribute('aria-pressed', 'true');

    await cardHeart(page, 'History heart').click();
    await expect(cardHeart(page, 'History heart')).toHaveAttribute('aria-pressed', 'false');
    await expect.poll(() => isStored(workerData, creator.user.id, id)).toBe(false);
    await page.goForward();
    await expect(page.getByRole('heading', { level: 1, name: 'History heart' })).toBeVisible();
    await expect(pageHeart(page, 'History heart')).toHaveAttribute('aria-pressed', 'false');

    await pageHeart(page, 'History heart').click();
    await expect(pageHeart(page, 'History heart')).toHaveAttribute('aria-pressed', 'true');
    await page.goBack();
    await expect(cardHeart(page, 'History heart')).toHaveAttribute('aria-pressed', 'true');
    await page.goForward();
    await expect(pageHeart(page, 'History heart')).toHaveAttribute('aria-pressed', 'true');
    // A reload of either entry agrees with what the server stored.
    await page.reload();
    await expect(pageHeart(page, 'History heart')).toHaveAttribute('aria-pressed', 'true');
  });
});

test.describe('failures', () => {
  // The real API answers 429 once the per-user favorite budget is spent, so the failure is deterministic and needs no stub.
  const exhaust = (workerData: Data, userId: string) => workerData.db.insert(authRateLimits).values({ id: randomUUID(), key: `wrapper:recipe-favorite:user:${userId}`, count: 120, lastRequest: Date.now() });
  const restore = (workerData: Data, userId: string) => workerData.db.delete(authRateLimits).where(eq(authRateLimits.key, `wrapper:recipe-favorite:user:${userId}`));

  test('a failed toggle on the recipe page reverts, shows an error toast that stays, and a retry works', async ({ page, creator, workerData }) => {
    const id = await createRecipeViaApi(creator, workerData.address, minimalMetadata('Failing heart'));
    await exhaust(workerData, creator.user.id);
    await openRecipe(page, id, 'Failing heart');
    await pageHeart(page, 'Failing heart').click();
    await expect(toast.error(page, FAVORITE_ERROR)).toBeVisible();
    await expect(toast.announced(page, FAVORITE_ERROR)).toHaveCount(1);
    await expect(pageHeart(page, 'Failing heart')).toHaveAttribute('aria-pressed', 'false');
    expect(await isStored(workerData, creator.user.id, id)).toBe(false);
    // An error toast does not time out.
    await page.waitForTimeout(6_000);
    await expect(toast.error(page, FAVORITE_ERROR)).toBeVisible();
    await toast.dismiss(toast.error(page, FAVORITE_ERROR)).click();
    await expect(toast.error(page, FAVORITE_ERROR)).toHaveCount(0);

    await restore(workerData, creator.user.id);
    await pageHeart(page, 'Failing heart').click();
    await expect(pageHeart(page, 'Failing heart')).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => isStored(workerData, creator.user.id, id)).toBe(true);
    await expect(toast.error(page, FAVORITE_ERROR)).toHaveCount(0);
  });

  test('a failed toggle from a card heart reverts it and shows the error toast', async ({ page, creator, workerData }) => {
    const id = await createRecipeViaApi(creator, workerData.address, minimalMetadata('Failing card'));
    await exhaust(workerData, creator.user.id);
    await openList(page, 'Failing card');
    await cardHeart(page, 'Failing card').click();
    await expect(toast.error(page, FAVORITE_ERROR)).toBeVisible();
    await expect(cardHeart(page, 'Failing card')).toHaveAttribute('aria-pressed', 'false');
    expect(await isStored(workerData, creator.user.id, id)).toBe(false);
  });
});

test.describe('between accounts', () => {
  test('a favorite never carries over to another account in the same browser tab, and comes back for its owner', async ({ page, creator, workerData }) => {
    test.setTimeout(150_000);
    const other = await workerData.signupFreshAccount();
    const mine = await createRecipeViaApi(creator, workerData.address, minimalMetadata('Owner heart'));
    const theirs = await createRecipeViaApi(other, workerData.address, minimalMetadata('Other heart'));

    await openRecipe(page, mine, 'Owner heart');
    await waitHydrated(pageHeart(page, 'Owner heart'));
    await pageHeart(page, 'Owner heart').click();
    await expect(pageHeart(page, 'Owner heart')).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => isStored(workerData, creator.user.id, mine)).toBe(true);
    await page.getByRole('link', { name: 'Back to Recipes' }).click();
    await expect(cardHeart(page, 'Owner heart')).toHaveAttribute('aria-pressed', 'true');

    await logOut(page);
    await logIn(page, other);
    await expect(cardHeart(page, 'Other heart')).toHaveAttribute('aria-pressed', 'false');
    await expect(card(page, 'Owner heart')).toHaveCount(0);
    // The first account's recipe is not reachable, so its heart cannot show up here either.
    await page.goto(`/recipes/${mine}`);
    await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible();
    await page.goto(`/recipes/${theirs}`);
    await expect(pageHeart(page, 'Other heart')).toHaveAttribute('aria-pressed', 'false');
    await waitHydrated(pageHeart(page, 'Other heart'));
    await pageHeart(page, 'Other heart').click();
    await expect(pageHeart(page, 'Other heart')).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => isStored(workerData, other.user.id, theirs)).toBe(true);

    await logOut(page);
    await logIn(page, creator);
    await expect(cardHeart(page, 'Owner heart')).toHaveAttribute('aria-pressed', 'true');
    await expect(card(page, 'Other heart')).toHaveCount(0);
    expect(page.url()).toBe(`${WEB_URL}/recipes`);
  });
});
