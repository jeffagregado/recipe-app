import { randomUUID } from 'node:crypto';
import { deflateSync, crc32 } from 'node:zlib';
import type { Locator, Page } from '@playwright/test';
import { asc, eq } from '../apps/api/node_modules/drizzle-orm/index.js';
import type { DrizzleDb } from '../apps/api/src/database/database.service.js';
import { recipeImages, recipeInstructions } from '../apps/api/src/database/schema.js';
import { expect, WEB_URL } from './fixtures.js';

const API_URL = 'http://127.0.0.1:4101';

export type Photo = { name: string; mimeType: string; buffer: Buffer };

function chunk(type: string, data: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, checksum]);
}

/**
 * A small valid PNG that looks like a plated dish from a distance: a gradient tabletop, a rimmed plate and swirls on it.
 * Smooth shapes only, so files stay small, but distinct per colour and never a flat block.
 */
export function photo(name: string, [red, green, blue]: [number, number, number] = [200, 90, 40], width = 320, height = 240): Photo {
  const stride = width * 3 + 1;
  const raw = Buffer.alloc(stride * height);
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.min(width, height) * 0.4;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = y * stride + 1 + x * 3;
      const shade = (x + y) / (width + height);
      let pixel = [red * (1 - shade * 0.6), green * (1 - shade * 0.4) + 40 * shade, blue + (255 - blue) * shade * 0.5];
      const distance = Math.hypot(x - centerX, y - centerY);
      if (distance < radius) {
        const angle = Math.atan2(y - centerY, x - centerX);
        const swirl = 0.5 + 0.5 * Math.sin(distance / radius * 18 + angle * 3);
        const rim = distance > radius * 0.88 ? 0.92 : 0;
        pixel = rim ? [244, 240, 232] : [230 - 70 * swirl + (red - 128) * 0.15, 196 - 60 * swirl, 120 - 50 * swirl + (blue - 128) * 0.1];
      }
      raw[offset] = Math.max(0, Math.min(255, Math.round(pixel[0])));
      raw[offset + 1] = Math.max(0, Math.min(255, Math.round(pixel[1])));
      raw[offset + 2] = Math.max(0, Math.min(255, Math.round(pixel[2])));
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8);
  const buffer = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
  return { name, mimeType: 'image/png', buffer };
}

export const COVER = photo('creamy-garlic-pasta.png', [214, 160, 90]);
export const STEP_ONE = photo('boiling-pasta.png', [120, 150, 190]);
export const STEP_THREE = photo('garlic-butter.png', [190, 120, 140]);

const YOUTUBE_LINK = 'https://youtu.be/dQw4w9WgXcQ';
export const PLAIN_LINK = 'https://example.com/watch/creamy-garlic-pasta';

/** Every host a video embed or its thumbnails could reach; nothing in the tests may depend on them being reachable. */
const VIDEO_HOST = /(^|\.)(youtube\.com|youtube-nocookie\.com|ytimg\.com|youtu\.be|vimeo\.com|vimeocdn\.com)$/;

/** Keeps tests off the network: the embed itself is not under test, only that the right frame is requested. */
export async function stubVideoHosts(page: Page) {
  await page.route((url) => VIDEO_HOST.test(url.hostname), (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>stub</title>' }));
}

/** Records every request the page makes, in order, so a test can say what was (not) requested before and after an action. */
export function recordRequests(page: Page) {
  const entries: { url: URL; resourceType: string }[] = [];
  page.on('request', (request) => entries.push({ url: new URL(request.url()), resourceType: request.resourceType() }));
  return {
    mark: () => entries.length,
    videoRequests: (from = 0) => entries.slice(from).filter(({ url }) => VIDEO_HOST.test(url.hostname)).map(({ url }) => url.hostname),
  };
}

/** Console errors/warnings and page errors; the desktop sidebar's Settings route answers 404 by design. */
export function watchConsole(page: Page): string[] {
  const issues: string[] = [];
  const unbuilt = /\/settings(\?|$)/;
  page.on('pageerror', (error) => issues.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() !== 'error' && message.type() !== 'warning') return;
    if (unbuilt.test(message.location().url)) return;
    // Path only: image and storage URLs carry signatures in their query strings.
    const { url } = message.location();
    issues.push(`${message.type()}: ${message.text()} (${url ? new URL(url).pathname : 'no url'})`);
  });
  return issues;
}

export const noOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

export const field = {
  title: (page: Page) => page.getByLabel('Title', { exact: true }),
  description: (page: Page) => page.getByLabel('Description', { exact: true }),
  prep: (page: Page) => page.getByLabel('Prep time in minutes'),
  cook: (page: Page) => page.getByLabel('Cook time in minutes'),
  // A role query, so the recipe page's servings stepper (kept mounted but hidden behind the edit page) never matches.
  servings: (page: Page) => page.getByRole('textbox', { name: 'Servings', exact: true }),
  video: (page: Page) => page.getByLabel('Video link', { exact: true }),
  notes: (page: Page) => page.getByRole('textbox', { name: 'Notes', exact: true }),
  ingredientName: (page: Page, position: number) => page.getByLabel(`Ingredient ${position} name`, { exact: true }),
  ingredientAmount: (page: Page, position: number) => page.getByLabel(`Ingredient ${position} amount`, { exact: true }),
  ingredientUnit: (page: Page, position: number) => page.getByLabel(`Ingredient ${position} unit`, { exact: true }),
  step: (page: Page, position: number) => page.getByLabel(`Step ${position} instructions`, { exact: true }),
  category: (page: Page, name: string) => page.getByRole('group', { name: 'Category', exact: true }).getByRole('button', { name, exact: true }),
  save: (page: Page) => page.getByRole('button', { name: /^(Save Recipe|Saving…)$/ }),
  leave: (page: Page) => page.getByRole('button', { name: /^(Back|Cancel)$/ }),
};

export async function openCreate(page: Page) {
  await page.goto('/recipes/create');
  await expect(page.getByRole('heading', { level: 1, name: 'Create Recipe' })).toBeVisible();
  await expect(field.title(page)).toBeEditable();
  // A click before hydration would submit the form natively instead of through React.
  await page.waitForFunction(() => Object.keys(document.querySelector('form[aria-label]') ?? {}).some((key) => key.startsWith('__reactProps')));
}

/** Picks a unit from the dropdown: opens it from its trigger and clicks the option (`to-taste` reads "to taste"). */
export async function chooseUnit(page: Page, position: number, unit: string) {
  await field.ingredientUnit(page, position).click();
  await page.getByRole('listbox').getByRole('option', { name: unit === 'to-taste' ? 'to taste' : unit, exact: true }).click();
  await expect(page.getByRole('listbox')).toHaveCount(0);
}

export async function fillIngredient(page: Page, position: number, name: string, amount: string, unit: string) {
  await field.ingredientName(page, position).fill(name);
  if (unit === 'to-taste') await chooseUnit(page, position, 'to-taste');
  else {
    await field.ingredientAmount(page, position).fill(amount);
    await chooseUnit(page, position, unit);
  }
}

/** The smallest valid recipe. */
export async function fillMinimal(page: Page, title: string) {
  await field.title(page).fill(title);
  await fillIngredient(page, 1, 'Water', '2', 'cup');
  await field.step(page, 1).fill('Boil the water.');
}

export const RICH = {
  description: 'A simple pasta that is quick to make.',
  categories: ['Dinner', 'Breakfast', 'Snacks'],
  prep: '10', cook: '20', servings: '4',
  notes: 'Swap the bacon for mushrooms.\nKeeps for two days.',
  steps: ['Bring salted water to a boil.', 'Cook the bacon until crisp.', 'Toss everything together.'],
};

/** Rich recipe: three ordered categories, decimal and "to taste" rows, three steps (third moved up), cover, two step photos, video and notes. */
export async function fillRich(page: Page, title: string, video = YOUTUBE_LINK) {
  await field.title(page).fill(title);
  await field.description(page).fill(RICH.description);
  for (const category of RICH.categories) await field.category(page, category).click();
  await field.prep(page).fill(RICH.prep);
  await field.cook(page).fill(RICH.cook);
  await field.servings(page).fill(RICH.servings);
  await field.video(page).fill(video);
  await page.getByLabel('Add cover photo').setInputFiles(COVER);
  await fillIngredient(page, 1, 'Spaghetti', '200', 'g');
  await page.getByRole('button', { name: 'Add ingredient' }).click();
  await fillIngredient(page, 2, 'Olive oil', '1.5', 'tbsp');
  await page.getByRole('button', { name: 'Add ingredient' }).click();
  await fillIngredient(page, 3, 'Salt', '', 'to-taste');
  await field.step(page, 1).fill(RICH.steps[0]);
  await page.getByLabel('Add photo to step 1').setInputFiles(STEP_ONE);
  await page.getByRole('button', { name: 'Add step' }).click();
  await field.step(page, 2).fill(RICH.steps[2]);
  await page.getByLabel('Add photo to step 2').setInputFiles(STEP_THREE);
  await page.getByRole('button', { name: 'Add step' }).click();
  await field.step(page, 3).fill(RICH.steps[1]);
  // The photo travels with its step: moving "Cook the bacon" up leaves "Toss everything together." and its photo at step 3.
  await page.getByRole('button', { name: 'Move step 3 up' }).click();
  await field.notes(page).fill(RICH.notes);
}

type Creator = { cookie: string };

export type UserCategory = { id: string; name: string; recipeCount: number };

/** Category ids belong to this account, including its defaults. Never reuse another account's ids. */
export async function userCategories(creator: Creator): Promise<UserCategory[]> {
  const response = await fetch(`${API_URL}/categories`, { headers: { Cookie: creator.cookie } });
  expect(response.status).toBe(200);
  return response.json() as Promise<UserCategory[]>;
}

export async function categoryIdsFor(creator: Creator, names: readonly string[]): Promise<string[]> {
  const categories = await userCategories(creator);
  return names.map((name) => {
    const category = categories.find((category) => category.name === name);
    if (!category) throw new Error(`Temporary account has no category named ${name}.`);
    return category.id;
  });
}

export type CreateMetadata = {
  title: string; description: string | null; categoryIds: string[]; servings: number | null; prepTimeMinutes: number | null; cookTimeMinutes: number | null;
  videoUrl: string | null; notes: string | null;
  ingredients: { name: string; quantity: number | null; unit: string | null }[];
  instructions: { description: string; hasImage: boolean }[];
};

export const minimalMetadata = (title: string): CreateMetadata => ({
  title, description: null, categoryIds: [], servings: null, prepTimeMinutes: null, cookTimeMinutes: null, videoUrl: null, notes: null,
  ingredients: [{ name: 'Water', quantity: 2, unit: 'cup' }], instructions: [{ description: 'Boil the water.', hasImage: false }],
});

export const richMetadata = (title: string, categoryIds: string[], videoUrl: string | null = YOUTUBE_LINK): CreateMetadata => ({
  title, description: RICH.description, categoryIds, servings: 4, prepTimeMinutes: 10, cookTimeMinutes: 20, videoUrl, notes: RICH.notes,
  ingredients: [{ name: 'Spaghetti', quantity: 200, unit: 'g' }, { name: 'Olive oil', quantity: 1.5, unit: 'tbsp' }, { name: 'Salt', quantity: null, unit: null }],
  instructions: [
    { description: RICH.steps[0], hasImage: true }, { description: RICH.steps[1], hasImage: false }, { description: RICH.steps[2], hasImage: true },
  ],
});

/** Seeds a recipe straight through the API (faster than the form) and returns its id. */
export async function createRecipeViaApi(creator: Creator, address: string, metadata: CreateMetadata, files: Record<string, Photo> = {}): Promise<string> {
  const body = new FormData();
  body.append('recipe', JSON.stringify(metadata));
  for (const [name, file] of Object.entries(files)) body.append(name, new Blob([new Uint8Array(file.buffer)], { type: file.mimeType }), file.name);
  // The dev database and storage are remote; a 503 means nothing was saved, so a fresh attempt is safe. Anything else is a real failure.
  let response!: Response;
  for (let attempt = 0; attempt < 3; attempt++) {
    response = await fetch(`${API_URL}/recipes`, {
      method: 'POST', body,
      headers: { Cookie: creator.cookie, Origin: WEB_URL, 'Idempotency-Key': randomUUID(), 'X-Forwarded-For': address },
    });
    if (response.status !== 503) break;
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  expect(response.status).toBe(201);
  const { id } = await response.json() as { id: string };
  return id;
}

export const RICH_FILES = { cover: COVER, 'step-0': STEP_ONE, 'step-2': STEP_THREE };

export const WIDTHS = [320, 390, 768, 1024, 1280, 1440] as const;

export const metadataWith = (title: string, overrides: Partial<CreateMetadata>): CreateMetadata => ({ ...minimalMetadata(title), ...overrides });

/** Ingredient rows of the recipe page as shown: name and amount text. */
export const ingredientRows = (page: Page) => page.getByRole('list', { name: 'Ingredients' }).locator(':scope > li').evaluateAll((items) => items.map((item) => {
  const [name, amount] = Array.from(item.querySelectorAll('label > span')).map((element) => element.textContent?.trim() ?? '');
  return { name, amount };
}));

export const stepTexts = (page: Page) => page.getByRole('list', { name: 'Instructions' }).locator(':scope > li p').allTextContents();

export const photoButtons = (page: Page) => page.getByRole('button', { name: /^Open step \d+ photo$/ });

/** Image rows and the photo each step points at; ids and keys stay in the test, assertions compare them without printing. */
export async function imageState(db: DrizzleDb, recipeId: string) {
  const images = await db.select({ id: recipeImages.id, key: recipeImages.objectKey, position: recipeImages.sortOrder }).from(recipeImages)
    .where(eq(recipeImages.recipeId, recipeId)).orderBy(asc(recipeImages.sortOrder));
  const steps = await db.select({ step: recipeInstructions.stepNumber, text: recipeInstructions.description, imageId: recipeInstructions.imageId }).from(recipeInstructions)
    .where(eq(recipeInstructions.recipeId, recipeId)).orderBy(asc(recipeInstructions.stepNumber));
  return { images, steps };
}

/** The page as the user sees it once the recipe heading is up. */
export async function openRecipe(page: Page, id: string, title?: string) {
  await page.goto(`/recipes/${id}`);
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
  // Interactions before hydration would be dropped silently.
  await page.waitForFunction(() => Array.from(document.querySelectorAll('article button')).some((button) => Object.keys(button).some((key) => key.startsWith('__reactProps'))));
}

export const imagesLoaded = (page: Page, selector = 'article img') => page.locator(selector).evaluateAll((images) => images.every((image) => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0));

/**
 * Toasts render in a portal. Success toasts are role=status in the accessibility tree. Base UI keeps an error toast's own
 * element out of the accessibility tree (aria-hidden until focused) and announces it through a hidden role=alert live
 * region instead, so `error` finds the visible element by its role attribute and `announced` finds the announcement.
 */
export const toast = {
  success: (page: Page, text: string | RegExp) => page.getByRole('status').filter({ hasText: text }).filter({ has: page.getByRole('button', { name: 'Dismiss' }) }),
  error: (page: Page, text: string | RegExp) => page.locator('[data-slot="toast"][role="alert"]').filter({ hasText: text }),
  announced: (page: Page, text: string | RegExp) => page.getByRole('alert').filter({ hasText: text }),
  dismiss: (toastElement: Locator) => toastElement.getByRole('button', { name: 'Dismiss', includeHidden: true }),
};

/** Interactions before React hydrates a control are dropped silently; wait until the element has its handlers. */
export const waitHydrated = (locator: Locator) => expect.poll(() => locator.evaluate((element) => Object.keys(element).some((key) => key.startsWith('__reactProps')))).toBe(true);

export const recipeCards = (page: Page) => page.getByRole('list', { name: 'Recipes' }).locator(':scope > li');

/** Signs in through the form as the given temporary account. */
export async function logIn(page: Page, { email, password }: { email: string; password: string }) {
  // Values typed before hydration are reset when React takes over the inputs.
  await waitHydrated(page.getByRole('button', { name: 'Log in', exact: true }));
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page).toHaveURL(`${WEB_URL}/recipes`);
}

/** Signs out through the visible Log out button (sidebar on desktop, header on mobile) and waits for the sign-in page. */
export async function logOut(page: Page) {
  // Logout finishes with a full load of the sign-in page (leavePrivateSession). The form can already be visible
  // before that load, and anything typed into it then is discarded, so wait for the load itself.
  const reloaded = page.waitForEvent('load');
  await page.getByRole('button', { name: 'Log out', exact: true }).filter({ visible: true }).click();
  await reloaded;
  await expect(page.getByLabel('Email', { exact: true })).toBeVisible();
}
