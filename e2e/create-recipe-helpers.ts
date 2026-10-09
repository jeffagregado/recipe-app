import { randomUUID } from 'node:crypto';
import { deflateSync, crc32 } from 'node:zlib';
import type { Page } from '@playwright/test';
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

/** A small valid PNG with a diagonal gradient, so thumbnails and renders are visibly distinct per colour. */
export function photo(name: string, [red, green, blue]: [number, number, number] = [200, 90, 40], width = 320, height = 240): Photo {
  const stride = width * 3 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = y * stride + 1 + x * 3;
      const shade = (x + y) / (width + height);
      raw[offset] = Math.round(red * (1 - shade * 0.6));
      raw[offset + 1] = Math.round(green * (1 - shade * 0.4) + 40 * shade);
      raw[offset + 2] = Math.round(blue + (255 - blue) * shade * 0.5);
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
const STEP_THREE = photo('garlic-butter.png', [190, 120, 140]);

const YOUTUBE_LINK = 'https://youtu.be/dQw4w9WgXcQ';
export const PLAIN_LINK = 'https://example.com/watch/creamy-garlic-pasta';

/** Keeps tests off the network: the embed itself is not under test, only that the right frame is requested. */
export async function stubVideoHosts(page: Page) {
  await page.route(/^https:\/\/(www\.youtube-nocookie\.com|player\.vimeo\.com)\//, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>stub</title>' }));
}

/** Console errors/warnings and page errors; the desktop sidebar's three unbuilt routes answer 404 by design. */
export function watchConsole(page: Page): string[] {
  const issues: string[] = [];
  const unbuilt = /\/(categories|favorites|settings)(\?|$)/;
  page.on('pageerror', (error) => issues.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() !== 'error' && message.type() !== 'warning') return;
    if (unbuilt.test(message.location().url)) return;
    issues.push(`${message.type()}: ${message.text()}`);
  });
  return issues;
}

export const noOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

export const field = {
  title: (page: Page) => page.getByLabel('Title', { exact: true }),
  description: (page: Page) => page.getByLabel('Description', { exact: true }),
  prep: (page: Page) => page.getByLabel('Prep time in minutes'),
  cook: (page: Page) => page.getByLabel('Cook time in minutes'),
  servings: (page: Page) => page.getByLabel('Servings', { exact: true }),
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

export async function fillIngredient(page: Page, position: number, name: string, amount: string, unit: string) {
  await field.ingredientName(page, position).fill(name);
  if (unit === 'to-taste') await field.ingredientUnit(page, position).selectOption('to-taste');
  else {
    await field.ingredientAmount(page, position).fill(amount);
    await field.ingredientUnit(page, position).selectOption(unit);
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
type CreateMetadata = {
  title: string; description: string | null; categories: string[]; servings: number | null; prepTimeMinutes: number | null; cookTimeMinutes: number | null;
  videoUrl: string | null; notes: string | null;
  ingredients: { name: string; quantity: number | null; unit: string | null }[];
  instructions: { description: string; hasImage: boolean }[];
};

export const minimalMetadata = (title: string): CreateMetadata => ({
  title, description: null, categories: [], servings: null, prepTimeMinutes: null, cookTimeMinutes: null, videoUrl: null, notes: null,
  ingredients: [{ name: 'Water', quantity: 2, unit: 'cup' }], instructions: [{ description: 'Boil the water.', hasImage: false }],
});

export const richMetadata = (title: string, videoUrl: string | null = YOUTUBE_LINK): CreateMetadata => ({
  title, description: RICH.description, categories: RICH.categories, servings: 4, prepTimeMinutes: 10, cookTimeMinutes: 20, videoUrl, notes: RICH.notes,
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
  const response = await fetch(`${API_URL}/recipes`, {
    method: 'POST', body,
    headers: { Cookie: creator.cookie, Origin: WEB_URL, 'Idempotency-Key': randomUUID(), 'X-Forwarded-For': address },
  });
  expect(response.status).toBe(201);
  const { id } = await response.json() as { id: string };
  return id;
}

export const RICH_FILES = { cover: COVER, 'step-0': STEP_ONE, 'step-2': STEP_THREE };

export const WIDTHS = [320, 390, 768, 1024, 1280, 1440] as const;
