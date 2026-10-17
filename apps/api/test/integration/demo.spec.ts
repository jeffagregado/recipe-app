import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { and, asc, eq, gt, inArray, like, or, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { authSessionResponseSchema, authUserResponseSchema, categoryListSchema, demoStartResponseSchema, recipeDetailSchema, recipeListResponseSchema } from '@recipe-app/contracts/schemas';
import { rateLimitKey } from '../../src/auth/auth.rate-limit.js';
import { AUTH } from '../../src/auth/auth.tokens.js';
import type { RecipeDetail } from '@recipe-app/contracts/types';
import type { DrizzleDb } from '../../src/database/database.service.js';
import { authRateLimits, ingredients, recipeImages, recipes, users } from '../../src/database/schema.js';
import { DEMO_STARTS_PER_HOUR } from '../../src/demo/demo.controller.js';
import { DEMO_RECIPE_LIMIT } from '../../src/demo/demo-recipe-policy.js';
import { DEMO_EMAIL_DOMAIN, DEMO_LIFETIME_MS, DEMO_LIVE_LIMIT, DEMO_SWEEP_BATCH } from '../../src/demo/demo-start.service.js';
import { DEMO_TEMPLATE_ID } from '../../src/demo/demo-template.js';
import { StorageError, StorageService } from '../../src/storage/storage.service.js';
import { cookiePair, startApi, TEST_ORIGIN, testAddress, testEmail, testPassword } from '../auth-harness.js';
import type { RecordingMailTransport } from '../recording-mail.js';
import { removeDemoTemplate, seedDemoTemplate } from '../demo-template.js';
import type { DemoTemplate } from '../demo-template.js';
import { describePhoto, jpeg } from '../recipe-photos.js';

describe('Live demo API (DEMO_MODE on)', () => {
  let app: NestExpressApplication;
  let db: DrizzleDb;
  let baseUrl: string;
  let storage: StorageService;
  let mail: RecordingMailTransport;
  let template: DemoTemplate;
  /** Prefix of the template's ingredient names, so its canonical rows can be removed afterwards. */
  const name = `verification-${randomUUID()}`;
  /** Every Demo account a test started, and every address it started one from. */
  const started = new Set<string>();
  const addresses = new Set<string>();

  /** The deployed demo has no mail key; a blank process value overrides any key in the env file. */
  const mailKey = process.env.RESEND_API_KEY;

  beforeAll(async () => {
    process.env.DEMO_MODE = 'true';
    process.env.RESEND_API_KEY = '';
    ({ app, baseUrl, db, mail } = await startApi());
    storage = app.get(StorageService);
    template = await seedDemoTemplate(db, storage, name);
  }, 60_000);

  afterAll(async () => {
    delete process.env.DEMO_MODE;
    if (mailKey === undefined) delete process.env.RESEND_API_KEY; else process.env.RESEND_API_KEY = mailKey;
    if (!app) return;
    try {
      const ids = [...started];
      const keys = ids.length ? (await db.select({ key: recipeImages.objectKey }).from(recipeImages)
        .innerJoin(recipes, eq(recipes.id, recipeImages.recipeId)).where(inArray(recipes.userId, ids))).map(({ key }) => key) : [];
      if (ids.length) await db.delete(users).where(inArray(users.id, ids));
      for (const key of keys) await storage.deleteObject(key);
      await removeDemoTemplate(db, storage);
      await db.delete(ingredients).where(like(sql`lower(${ingredients.name})`, `${name}%`));
      await db.delete(authRateLimits).where(or(
        inArray(authRateLimits.key, [...addresses].map((address) => rateLimitKey('demo-start:address', address))),
        ...ids.map((id) => like(authRateLimits.key, `wrapper:%:user:${id}`)),
      ));
    } finally {
      vi.restoreAllMocks();
      await app.close();
    }
  }, 60_000);

  /** Start demo from a fresh address unless one is given. */
  async function start(address = testAddress()) {
    addresses.add(address);
    const response = await fetch(`${baseUrl}/demo/start`, { method: 'POST', headers: { Origin: TEST_ORIGIN, 'X-Forwarded-For': address } });
    if (response.status === 201) {
      const body = demoStartResponseSchema.parse(await response.clone().json());
      started.add(body.user.id);
    }
    return response;
  }

  /** A started Demo account and its session cookie. */
  async function startedAccount(address?: string) {
    const response = await start(address);
    expect(response.status).toBe(201);
    return { ...demoStartResponseSchema.parse(await response.json()), cookie: cookiePair(response) };
  }

  /** A fresh address on the reserved domain, the way Start demo names a Demo account. */
  const demoEmail = () => `${randomUUID().replaceAll('-', '')}@${DEMO_EMAIL_DOMAIN}`;
  const get = (path: string, cookie: string) => fetch(`${baseUrl}${path}`, { headers: { Cookie: cookie } });
  async function list(cookie: string) {
    const response = await get('/recipes', cookie);
    expect(response.status).toBe(200);
    return recipeListResponseSchema.parse(await response.json());
  }
  async function detail(id: string, cookie: string) {
    const response = await get(`/recipes/${id}`, cookie);
    expect(response.status).toBe(200);
    return recipeDetailSchema.parse(await response.json());
  }
  /** A multipart recipe write: POST /recipes by default, PATCH /recipes/:id for an update. */
  function send(path: string, metadata: unknown, cookie: string, { method = 'POST', photos = [] }: { method?: 'POST' | 'PATCH'; photos?: { field: string; bytes: Buffer }[] } = {}) {
    const body = new FormData();
    body.set('recipe', JSON.stringify(metadata));
    for (const photo of photos) body.append(photo.field, new Blob([new Uint8Array(photo.bytes)], { type: 'image/jpeg' }), 'photo.jpg');
    return fetch(`${baseUrl}${path}`, { method, body, headers: { Cookie: cookie, Origin: TEST_ORIGIN, 'Idempotency-Key': randomUUID() } });
  }
  /** The update that saves a recipe as it is, with `changes` applied. */
  const updateOf = (recipe: RecipeDetail, changes: Record<string, unknown> = {}) => ({
    title: recipe.title, description: recipe.description, categoryIds: recipe.categories.map(({ id }) => id), servings: recipe.servings,
    prepTimeMinutes: recipe.prepTimeMinutes, cookTimeMinutes: recipe.cookTimeMinutes, videoUrl: recipe.videoUrl, notes: recipe.notes,
    ingredients: recipe.ingredients.map(({ name: item, quantity, unit, heading }) => ({ name: item, quantity, unit, heading })),
    cover: 'keep', instructions: recipe.instructions.map(({ id, description, heading }) => ({ id, description, heading, image: 'keep' })),
    ...changes,
  });
  const remove = (id: string, cookie: string) => fetch(`${baseUrl}/recipes/${id}`, { method: 'DELETE', headers: { Cookie: cookie, Origin: TEST_ORIGIN } });
  const objectKeysOf = async (recipeId: string) =>
    (await db.select({ key: recipeImages.objectKey }).from(recipeImages).where(eq(recipeImages.recipeId, recipeId)).orderBy(asc(recipeImages.sortOrder))).map(({ key }) => key);
  /** True while the object still answers 200. */
  const stored = async (key: string) => (await fetch(await storage.signedDownloadUrl(key))).status === 200;
  async function photoAt(url: string | null) {
    if (url === null) return null;
    const response = await fetch(url);
    return response.status === 200 ? describePhoto(new Uint8Array(await response.arrayBuffer())) : null;
  }
  async function expectCode(response: Response, status: number, code: string) {
    expect(response.status).toBe(status);
    expect(((await response.json()) as { code: string }).code).toBe(code);
  }
  /** A recipe a visitor writes; its ingredient name starts with `name`, so cleanup finds the canonical row. */
  const visitorRecipe = (hasImage = false) => ({
    title: 'Visitor recipe', description: null, categoryIds: [], servings: null, prepTimeMinutes: null, cookTimeMinutes: null, videoUrl: null, notes: null,
    ingredients: [{ name: `${name} salt`, quantity: null, unit: null }], instructions: [{ description: 'Mix.', hasImage }],
  });

  it('starts a verified Demo account with a session that expires with it, 24 hours after its creation', async () => {
    const response = await start();
    expect(response.status).toBe(201);
    const body = demoStartResponseSchema.parse(await response.json());
    expect(body.user).toEqual({ id: body.user.id, displayName: 'Demo visitor', email: body.user.email, pendingEmail: null, hasPassword: false, google: null });
    expect(body.user.email).toMatch(/^[0-9a-f]{32}@demo\.invalid$/);
    const [account] = await db.select({ createdAt: users.createdAt, emailVerified: users.emailVerified }).from(users).where(eq(users.id, body.user.id));
    expect(account.emailVerified).toBe(true);
    expect(new Date(body.expiresAt).getTime()).toBe(account.createdAt.getTime() + DEMO_LIFETIME_MS);

    const [cookie] = response.headers.getSetCookie();
    expect(response.headers.getSetCookie()).toHaveLength(1);
    expect(cookie).toMatch(/; HttpOnly/);
    expect(cookie).toMatch(/; SameSite=Lax/);
    expect(cookie).toMatch(/; Path=\//);
    const maxAge = Number(/; Max-Age=(\d+)/.exec(cookie)?.[1]);
    expect(maxAge).toBeGreaterThan(DEMO_LIFETIME_MS / 1000 - 120);
    expect(maxAge).toBeLessThanOrEqual(DEMO_LIFETIME_MS / 1000);

    const session = await get('/auth/session', cookiePair(response));
    expect(session.status).toBe(200);
    expect(authSessionResponseSchema.parse(await session.json())).toEqual({ user: body.user, expiresAt: body.expiresAt });
  }, 60_000);

  it('fills the Demo account with copies of the template\'s Categories, Recipes, Favorites and Photos', async () => {
    const { cookie } = await startedAccount();
    const categories = await get('/categories', cookie);
    expect(categories.status).toBe(200);
    expect(categoryListSchema.parse(await categories.json()).map(({ name: categoryName, recipeCount }) => [categoryName, recipeCount]))
      .toEqual([['Mains', 1], ['Sweets', 0], ['Quick', 2]]);

    const { data } = await list(cookie);
    expect(data.map(({ title, isFavorite, categories: tags }) => [title, isFavorite, tags.map((tag) => tag.name)])).toEqual([
      ['Template pancakes', true, ['Mains', 'Quick']],
      ['Template salad', false, ['Quick']],
    ]);
    expect(data.map(({ id }) => id).filter((id) => id === template.recipeIds.pancakes || id === template.recipeIds.salad)).toEqual([]);

    const pancakes = await detail(data[0].id, cookie);
    expect({ ...pancakes, id: undefined, userId: undefined, imageUrl: undefined, categories: undefined,
      ingredients: pancakes.ingredients.map(({ name: item, quantity, unit, heading }) => [item.slice(name.length + 1), quantity, unit, heading]),
      instructions: pancakes.instructions.map(({ stepNumber, description, heading, imageUrl }) => [stepNumber, description, heading, imageUrl !== null]),
    }).toEqual({
      id: undefined, userId: undefined, imageUrl: undefined, categories: undefined,
      title: 'Template pancakes', description: 'Fluffy.', notes: 'Rest the batter.', videoUrl: 'https://video.example.invalid/pancakes',
      servings: 4, prepTimeMinutes: 10, cookTimeMinutes: 15, isFavorite: true,
      createdAt: '2026-10-02T00:00:00.000Z', updatedAt: '2026-10-03T00:00:00.000Z',
      ingredients: [['flour', 1.5, 'cup', 'Batter'], ['egg', 2, 'tbsp', null], ['leaf', 0.25, 'cup', 'Topping']],
      instructions: [[1, 'Whisk.', 'Batter', true], [2, 'Fry.', 'Cook', false]],
    });
    expect(await photoAt(pancakes.imageUrl)).toEqual(await describePhoto(template.photos.cover));
    expect(await photoAt(pancakes.instructions[0].imageUrl)).toEqual(await describePhoto(template.photos.step));

    const copiedKeys = (await db.select({ key: recipeImages.objectKey }).from(recipeImages).where(eq(recipeImages.recipeId, pancakes.id))).map(({ key }) => key);
    expect(copiedKeys).toHaveLength(2);
    expect(copiedKeys.every((key) => key.startsWith(`recipes/${pancakes.id}/`))).toBe(true);
  }, 60_000);

  it('keeps two Demo accounts apart, and the template as it was when a copy is edited or deleted', async () => {
    const [a, b] = [await startedAccount(), await startedAccount()];
    const [aPancakes, aSalad] = (await list(a.cookie)).data;
    const edited = await send(`/recipes/${aPancakes.id}`, updateOf(await detail(aPancakes.id, a.cookie), { title: 'Edited pancakes' }), a.cookie, { method: 'PATCH' });
    expect(edited.status, await edited.clone().text()).toBe(200);
    expect((await remove(aSalad.id, a.cookie)).status).toBe(204);

    expect((await list(a.cookie)).data.map(({ title }) => title)).toEqual(['Edited pancakes']);
    const bRecipes = (await list(b.cookie)).data;
    expect(bRecipes.map(({ title }) => title)).toEqual(['Template pancakes', 'Template salad']);
    expect((await get(`/recipes/${bRecipes[0].id}`, a.cookie)).status).toBe(404);
    expect(await db.select({ title: recipes.title }).from(recipes).where(eq(recipes.userId, DEMO_TEMPLATE_ID)).orderBy(asc(recipes.sortOrder)))
      .toEqual([{ title: 'Template pancakes' }, { title: 'Template salad' }]);
    expect(await Promise.all(template.objectKeys.map(stored))).toEqual([true, true]);
    expect(await objectKeysOf(template.recipeIds.pancakes)).toEqual(template.objectKeys);
  }, 60_000);

  it("deletes a demo recipe's copied photos with it, and no other account's or the template's", async () => {
    const [a, b] = [await startedAccount(), await startedAccount()];
    const [aPancakes] = (await list(a.cookie)).data; const [bPancakes] = (await list(b.cookie)).data;
    const aKeys = await objectKeysOf(aPancakes.id); const bKeys = await objectKeysOf(bPancakes.id);
    expect(await Promise.all(aKeys.map(stored))).toEqual([true, true]);

    expect((await remove(aPancakes.id, a.cookie)).status).toBe(204);
    expect(await Promise.all(aKeys.map(stored))).toEqual([false, false]);
    expect(await Promise.all([...bKeys, ...template.objectKeys].map(stored))).toEqual([true, true, true, true]);
  }, 60_000);

  describe('photos', () => {
    let account: Awaited<ReturnType<typeof startedAccount>>;
    let pancakes: RecipeDetail;
    beforeAll(async () => {
      account = await startedAccount();
      pancakes = await detail((await list(account.cookie)).data[0].id, account.cookie);
    }, 60_000);

    it.each([
      ['a cover', visitorRecipe(), 'cover'],
      ['a step photo', visitorRecipe(true), 'step-0'],
    ])('refuses a create with %s', async (_name, metadata, field) => {
      await expectCode(await send('/recipes', metadata, account.cookie, { photos: [{ field, bytes: jpeg(3) }] }), 403, 'DEMO_UPLOADS_DISABLED');
      expect((await list(account.cookie)).data).toHaveLength(2);
    }, 60_000);

    it.each([
      ['replaces the cover', { cover: 'replace' }, [{ field: 'cover', bytes: jpeg(4) }], 'DEMO_UPLOADS_DISABLED'],
      ['gives a step a new photo', { instructions: [{ id: null, description: 'New.', heading: null, image: 'replace' }] }, [{ field: 'step-0', bytes: jpeg(5) }], 'DEMO_UPLOADS_DISABLED'],
      ['removes the cover', { cover: 'remove' }, [], 'DEMO_PHOTO_REMOVAL_DISABLED'],
      ['removes a step photo', { instructions: [{ id: 'first', description: 'Whisk.', heading: 'Batter', image: 'remove' }] }, [], 'DEMO_PHOTO_REMOVAL_DISABLED'],
    ])('refuses an update that %s and keeps every photo', async (_name, changes, photos, code) => {
      const steps = (changes as { instructions?: { id: string | null }[] }).instructions
        ?.map((step) => (step.id === 'first' ? { ...step, id: pancakes.instructions[0].id } : step));
      const update = updateOf(pancakes, { ...changes, ...(steps ? { instructions: steps } : {}) });
      await expectCode(await send(`/recipes/${pancakes.id}`, update, account.cookie, { method: 'PATCH', photos }), 403, code);
      const unchanged = await detail(pancakes.id, account.cookie);
      expect(await photoAt(unchanged.imageUrl)).toEqual(await describePhoto(template.photos.cover));
      expect(await photoAt(unchanged.instructions[0].imageUrl)).toEqual(await describePhoto(template.photos.step));
    }, 60_000);

    it('saves a create and an update that change no photo', async () => {
      expect((await send('/recipes', visitorRecipe(), account.cookie)).status).toBe(201);
      const response = await send(`/recipes/${pancakes.id}`, updateOf(pancakes, { title: 'Renamed pancakes' }), account.cookie, { method: 'PATCH' });
      expect(response.status).toBe(200);
      expect((await detail(pancakes.id, account.cookie)).title).toBe('Renamed pancakes');
    }, 60_000);

    it('lets an update drop a whole step, which takes its photo with it as deleting the recipe does', async () => {
      const [, stepKey] = await objectKeysOf(pancakes.id);
      const current = await detail(pancakes.id, account.cookie);
      const update = updateOf(current, { instructions: [{ id: current.instructions[1].id, description: 'Fry.', heading: 'Cook', image: 'keep' }] });
      expect((await send(`/recipes/${pancakes.id}`, update, account.cookie, { method: 'PATCH' })).status).toBe(200);
      const saved = await detail(pancakes.id, account.cookie);
      expect(saved.instructions.map(({ description, imageUrl }) => [description, imageUrl])).toEqual([['Fry.', null]]);
      expect(await photoAt(saved.imageUrl)).toEqual(await describePhoto(template.photos.cover));
      expect(await stored(stepKey)).toBe(false);
    }, 60_000);
  });

  describe('limits', () => {
    it(`refuses a create once the account holds ${DEMO_RECIPE_LIMIT} recipes, and saves one again after a delete`, async () => {
      const account = await startedAccount();
      const [first] = (await list(account.cookie)).data;
      await db.insert(recipes).values(Array.from({ length: DEMO_RECIPE_LIMIT - 2 }, (_, index) => ({ userId: account.user.id, title: `Filler ${index}`, sortOrder: index + 2 })));
      await expectCode(await send('/recipes', visitorRecipe(), account.cookie), 403, 'DEMO_RECIPE_LIMIT');
      expect(await db.$count(recipes, eq(recipes.userId, account.user.id))).toBe(DEMO_RECIPE_LIMIT);

      expect((await remove(first.id, account.cookie)).status).toBe(204);
      expect((await send('/recipes', visitorRecipe(), account.cookie)).status).toBe(201);
      expect(await db.$count(recipes, eq(recipes.userId, account.user.id))).toBe(DEMO_RECIPE_LIMIT);
    }, 60_000);

    it(`allows ${DEMO_STARTS_PER_HOUR} starts an hour from one address`, async () => {
      const address = testAddress();
      for (let index = 0; index < DEMO_STARTS_PER_HOUR; index++) expect((await start(address)).status).toBe(201);
      const limited = await start(address);
      expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0);
      expect(limited.headers.getSetCookie()).toEqual([]);
      await expectCode(limited, 429, 'RATE_LIMITED');
      expect((await start()).status).toBe(201);
    }, 120_000);

    // The ceiling counts every live Demo account on the branch, so this test fills it up to the limit. Any other demo start on
    // the same branch is answered busy until the fillers are deleted.
    it(`answers busy while ${DEMO_LIVE_LIMIT} Demo accounts are live`, async () => {
      const live = await db.$count(users, and(like(users.email, `%@${DEMO_EMAIL_DOMAIN}`), gt(users.createdAt, new Date(Date.now() - DEMO_LIFETIME_MS))));
      const fillers = Array.from({ length: Math.max(0, DEMO_LIVE_LIMIT - live) }, () => ({ name: 'Demo filler', email: demoEmail(), emailVerified: true }));
      const ids = (await db.insert(users).values(fillers).returning({ id: users.id })).map(({ id }) => id);
      try {
        const busy = await start();
        expect(busy.headers.getSetCookie()).toEqual([]);
        await expectCode(busy, 503, 'DEMO_BUSY');
      } finally {
        await db.delete(users).where(inArray(users.id, ids));
      }
      expect((await start()).status).toBe(201);
    }, 60_000);
  });

  describe('sweep', () => {
    const expiredAt = () => new Date(Date.now() - DEMO_LIFETIME_MS - 60_000);
    const exists = async (id: string) => (await db.$count(users, eq(users.id, id))) === 1;

    it('deletes an expired Demo account with its rows and stored photos, and leaves live and ordinary accounts', async () => {
      const [expired] = await db.insert(users).values({ name: 'Demo visitor', email: demoEmail(), emailVerified: true, createdAt: expiredAt() }).returning();
      const [ordinary] = await db.insert(users).values({ name: 'Ordinary', email: `t_${randomUUID().replaceAll('-', '')}@example.invalid`, emailVerified: true, createdAt: expiredAt() }).returning();
      started.add(expired.id); started.add(ordinary.id);
      const [recipe] = await db.insert(recipes).values({ userId: expired.id, title: 'Expired recipe' }).returning();
      const key = `recipes/${recipe.id}/${randomUUID()}.jpg`;
      await storage.upload(key, jpeg(6), 'image/jpeg');
      try {
        await db.insert(recipeImages).values({ recipeId: recipe.id, objectKey: key, sortOrder: 0 });
        const current = await startedAccount();

        expect((await start()).status).toBe(201);
        expect(await exists(expired.id)).toBe(false);
        expect(await db.$count(recipes, eq(recipes.id, recipe.id))).toBe(0);
        expect(await stored(key)).toBe(false);
        expect([await exists(ordinary.id), await exists(current.user.id)]).toEqual([true, true]);
      } finally {
        await storage.deleteObject(key);
      }
    }, 60_000);

    it(`deletes at most ${DEMO_SWEEP_BATCH} expired Demo accounts per start, oldest first`, async () => {
      // Older than any other expired account, so this batch is swept first.
      const ids = (await db.insert(users).values(Array.from({ length: DEMO_SWEEP_BATCH + 1 }, (_, index) => ({
        name: 'Demo visitor', email: demoEmail(), emailVerified: true, createdAt: new Date(Date.UTC(2000, 0, 1) + index),
      }))).returning({ id: users.id })).map(({ id }) => id);
      ids.forEach((id) => started.add(id));
      const remaining = () => db.$count(users, inArray(users.id, ids));

      expect((await start()).status).toBe(201);
      expect(await remaining()).toBe(1);
      expect(await exists(ids[DEMO_SWEEP_BATCH])).toBe(true);
      expect((await start()).status).toBe(201);
      expect(await remaining()).toBe(0);
    }, 60_000);
  });

  describe('a start that fails after the account is written', () => {
    /** Records each photo copy; `failAt` makes that copy (1-based) fail. */
    function recordCopies(failAt?: number) {
      const copy = storage.copyObject.bind(storage);
      const targets: string[] = [];
      const spy = vi.spyOn(storage, 'copyObject').mockImplementation(async (source, target) => {
        targets.push(target);
        if (targets.length === failAt) throw new StorageError('Injected copy failure.');
        return copy(source, target);
      });
      return { targets, restore: () => spy.mockRestore() };
    }
    /** The recipe a copy target belongs to: keys are `recipes/<recipe id>/<file>`. */
    const recipeOf = (key: string) => key.split('/')[1];

    async function expectNothingLeft(response: Response, targets: string[]) {
      expect(response.headers.getSetCookie()).toEqual([]);
      await expectCode(response, 503, 'SERVICE_UNAVAILABLE');
      expect(targets).toHaveLength(2);
      expect(await Promise.all(targets.map(stored))).toEqual([false, false]);
      expect(await db.$count(recipes, inArray(recipes.id, targets.map(recipeOf)))).toBe(0);
    }

    it('deletes the new account and the photos it copied when a photo copy fails', async () => {
      const copies = recordCopies(2);
      let response: Response;
      try { response = await start(); } finally { copies.restore(); }
      await expectNothingLeft(response, copies.targets);
    }, 60_000);

    it('deletes the new account and its copied photos when the session cannot be created', async () => {
      const auth = app.get<{ $context: Promise<unknown> }>(AUTH);
      const context = Object.getOwnPropertyDescriptor(auth, '$context')!;
      Object.defineProperty(auth, '$context', { configurable: true, get: () => Promise.reject(new Error('Injected session failure.')) });
      const copies = recordCopies();
      let response: Response;
      try { response = await start(); } finally { copies.restore(); Object.defineProperty(auth, '$context', context); }
      await expectNothingLeft(response, copies.targets);
    }, 60_000);
  });

  describe('accounts', () => {
    let account: Awaited<ReturnType<typeof startedAccount>>;
    beforeAll(async () => { account = await startedAccount(); }, 60_000);
    const call = (method: 'POST' | 'PUT', path: string, body: unknown, cookie = account.cookie) => fetch(`${baseUrl}${path}`, {
      method, body: JSON.stringify(body), headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: TEST_ORIGIN, 'X-Forwarded-For': testAddress() },
    });

    it.each([
      ['POST', '/auth/signup', { displayName: 'Visitor', email: testEmail(), password: testPassword() }],
      ['POST', '/auth/login', { email: testEmail(), password: testPassword() }],
      ['POST', '/auth/resend-verification', { email: testEmail() }],
      ['POST', '/auth/verify-email', { token: 'a'.repeat(43) }],
      ['POST', '/auth/forgot-password', { email: testEmail() }],
      ['POST', '/auth/reset-password', { token: 'a'.repeat(43), password: testPassword() }],
      ['POST', '/auth/google/start', {}],
      ['POST', '/auth/google/callback', { code: 'code', state: 'state' }],
      ['POST', '/account/google/connect', {}],
      ['POST', '/account/google/disconnect', {}],
      ['POST', '/account/email-change', { newEmail: testEmail(), currentPassword: testPassword() }],
      ['POST', '/account/email-change/resend', {}],
      ['POST', '/account/email-change/cancel', {}],
      ['POST', '/account/email-change/confirm', { token: 'a'.repeat(43) }],
      ['PUT', '/account/password', { currentPassword: testPassword(), newPassword: testPassword() }],
      ['POST', '/account/password/set-link', {}],
    ] as const)('refuses %s %s, which needs email, a password or Google', async (method, path, body) => {
      for (const route of [path, `${path}/`]) {
        const response = await call(method, route, body);
        expect(response.status).toBe(403);
        expect(response.headers.get('cache-control')).toBe('private, no-store');
        expect(await response.json()).toEqual({ code: 'DEMO_UNAVAILABLE', message: 'Not available in the demo.' });
      }
      if ('email' in body) expect(await db.$count(users, eq(users.email, body.email))).toBe(0);
      expect(mail.messages).toEqual([]);
    }, 30_000);

    it('lets the Demo account rename itself, change its Categories and sign out', async () => {
      const renamed = await call('PUT', '/account/display-name', { displayName: 'Recruiter' });
      expect(renamed.status).toBe(200);
      expect(authUserResponseSchema.parse(await renamed.json()).user.displayName).toBe('Recruiter');

      const current = categoryListSchema.parse(await (await get('/categories', account.cookie)).json());
      const saved = await call('PUT', '/categories', [...current.map(({ id, name: categoryName }) => ({ id, name: categoryName })), { name: 'Brunch' }]);
      expect(saved.status).toBe(200);
      expect(categoryListSchema.parse(await saved.json()).map(({ name: categoryName }) => categoryName)).toEqual(['Mains', 'Sweets', 'Quick', 'Brunch']);

      expect((await call('POST', '/auth/logout', {})).status).toBe(204);
      expect((await get('/auth/session', account.cookie)).status).toBe(401);
    }, 60_000);
  });
});
