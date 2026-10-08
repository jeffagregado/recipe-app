import { randomBytes, randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { eq, like, or } from 'drizzle-orm';
import { recipeSummarySchema, updateRecipeSchema } from '@recipe-app/contracts/schemas';
import { authOrigins, createAuth } from '../../src/auth/auth.js';
import { mountAuth } from '../../src/auth/auth.http.js';
import { validateEnvironment } from '../../src/config/environment.js';
import { DatabaseService } from '../../src/database/database.service.js';
import { authRateLimits, categories, recipeCategories, recipeImages, recipes, users } from '../../src/database/schema.js';
import { sampleRecipes } from '../../src/recipes/sample-recipes.js';
import { getDevDatabaseUrl } from '../neon-dev.js';

describe('Native Better Auth and public recipe HTTP', () => {
  let app: NestExpressApplication;
  let baseUrl: string;
  const email = `verify-${randomUUID()}@example.invalid`;
  const password = randomBytes(24).toString('base64url');
  const origin = 'http://localhost:3000';
  const ip = `198.51.100.${Math.floor(Math.random() * 200) + 1}`;
  const secureIp = `203.0.113.${Math.floor(Math.random() * 200) + 1}`;
  let cookie = '';

  beforeAll(async () => {
    process.env.DATABASE_URL = await getDevDatabaseUrl();
    process.env.BETTER_AUTH_URL = 'http://127.0.0.1:4101';
    const { AppModule } = await import('../../src/app.module.js');
    app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: false, bodyParser: false, abortOnError: false });
    mountAuth(app);
    await app.listen(0, '127.0.0.1');
    baseUrl = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
  }, 60_000);
  afterAll(async () => {
    if (!app) return;
    try {
      const db = app.get(DatabaseService).db;
      await db.delete(users).where(eq(users.email, email));
      await db.delete(authRateLimits).where(or(like(authRateLimits.key, `${ip}%`), like(authRateLimits.key, `${secureIp}%`)));
    } finally { await app.close(); }
  });

  const post = (path: string, body: Record<string, unknown>, token = '') => fetch(`${baseUrl}/api/auth/${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin, 'X-Forwarded-For': ip, ...(token ? { Cookie: token } : {}) },
    body: JSON.stringify(body),
  });

  it('reports auth health and exact credentialed CORS', async () => {
    const response = await fetch(`${baseUrl}/api/auth/ok`, { headers: { Origin: origin, 'X-Forwarded-For': ip } });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(response.headers.get('access-control-allow-origin')).toBe(origin);
    expect(response.headers.get('access-control-allow-credentials')).toBe('true');
    const rejected = await fetch(`${baseUrl}/api/auth/ok`, { headers: { Origin: 'https://untrusted.example.invalid', 'X-Forwarded-For': ip } });
    expect(rejected.headers.get('access-control-allow-origin')).toBeNull();
    expect(authOrigins('production')).toEqual([]);
  });

  it('signs up with normalized identity, safe cookies, persisted session, and signs out', async () => {
    const response = await post('sign-up/email', { name: 'Temporary verification', email: email.toUpperCase(), password });
    expect(response.status).toBe(200);
    const cookies = response.headers.getSetCookie();
    expect(cookies.some((value) => /HttpOnly/i.test(value) && /SameSite=Lax/i.test(value))).toBe(true);
    cookie = cookies.map((value) => value.split(';')[0]).join('; ');
    const session = await fetch(`${baseUrl}/api/auth/get-session`, { headers: { Cookie: cookie, Origin: origin, 'X-Forwarded-For': ip } });
    expect(session.status).toBe(200);
    const data = await session.json() as { user: { email: string; id: string }; session: { id: string } };
    expect(data.user.email === email).toBe(true);
    expect(/^[0-9a-f-]{36}$/.test(data.user.id)).toBe(true);
    const rows = await app.get(DatabaseService).db.query.authSessions.findMany({ where: (table, { eq }) => eq(table.id, data.session.id), columns: { id: true } });
    expect(rows.length).toBe(1);
    expect((await post('sign-out', {}, cookie)).status).toBe(200);
    expect(await (await fetch(`${baseUrl}/api/auth/get-session`, { headers: { Cookie: cookie, 'X-Forwarded-For': ip } })).json()).toBeNull();
  }, 30_000);

  it('rejects wrong credentials, signs in, and rate-limits subsequent requests', async () => {
    const wrong = await post('sign-in/email', { email, password: randomBytes(24).toString('base64url') });
    expect(wrong.status).toBe(401);
    const signedIn = await post('sign-in/email', { email, password });
    expect(signedIn.status).toBe(200);
    const token = signedIn.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ');
    expect((await post('sign-out', {}, token)).status).toBe(200);
    let limited: Response | undefined;
    for (let attempt = 0; attempt < 4; attempt++) {
      const response = await post('sign-in/email', { email, password });
      if (response.status === 429) { limited = response; break; }
    }
    expect(limited?.status).toBe(429);
    const counters = await app.get(DatabaseService).db.select({ id: authRateLimits.id }).from(authRateLimits).where(like(authRateLimits.key, `${ip}%`));
    expect(counters.length).toBeGreaterThan(0);
  }, 30_000);

  it('rejects untrusted origins and invalid password lengths', async () => {
    const rejected = await fetch(`${baseUrl}/api/auth/sign-up/email`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://untrusted.example.invalid', 'X-Forwarded-For': ip },
      body: JSON.stringify({ name: 'Temporary verification', email, password }),
    });
    expect(rejected.status).toBe(403);
    expect((await post('sign-up/email', { name: 'Temporary verification', email, password: 'short' })).status).toBe(400);
    expect((await post('sign-up/email', { name: 'Temporary verification', email, password: 'x'.repeat(129) })).status).toBe(400);
  });

  it('sets Secure cookies when the configured base URL uses HTTPS', async () => {
    const config = app.get<ConfigService>(ConfigService);
    const secureAuth = createAuth(app.get(DatabaseService).db, {
      BETTER_AUTH_SECRET: config.getOrThrow<string>('BETTER_AUTH_SECRET'), BETTER_AUTH_URL: 'https://auth.example.invalid',
    });
    const response = await secureAuth.handler(new Request('https://auth.example.invalid/api/auth/sign-in/email', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin, 'X-Forwarded-For': secureIp }, body: JSON.stringify({ email, password }),
    }));
    expect(response.status).toBe(200);
    expect(response.headers.getSetCookie().some((value) => /; Secure/i.test(value) && /HttpOnly/i.test(value) && /SameSite=Lax/i.test(value))).toBe(true);
  }, 30_000);

  it('returns database-backed summaries with stable IDs/order and no-store', async () => {
    const response = await fetch(`${baseUrl}/recipes`);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const summaries = recipeSummarySchema.array().parse(await response.json());
    expect(summaries.map(({ id }) => id)).toEqual(sampleRecipes.map(({ id }) => id));
    expect(summaries.length).toBe(20);
    expect(summaries.map(({ categories }) => categories)).toEqual(sampleRecipes.map(({ categories }) => categories));
    expect(updateRecipeSchema.safeParse({ categories: [] }).success).toBe(true);
    expect(updateRecipeSchema.safeParse({ categories: ['Dinner', 'Dinner'] }).success).toBe(false);
    expect(updateRecipeSchema.safeParse({ categories: ['Dinner', 'Lunch', 'Snacks', 'Breakfast'] }).success).toBe(false);
    const db = app.get(DatabaseService).db;
    const owner = await db.query.users.findFirst({ where: eq(users.email, email), columns: { id: true } });
    if (!owner) throw new Error('Temporary auth verification user missing.');
    const probeId = `verify-read-${randomUUID()}`;
    try {
      await db.insert(recipes).values({ id: probeId, userId: owner.id, title: 'Temporary database read', sortOrder: 100 });
      const changed = recipeSummarySchema.array().parse(await (await fetch(`${baseUrl}/recipes`)).json());
      expect(changed.length).toBe(21);
      expect(changed.at(-1)?.id === probeId).toBe(true);
      expect(changed.at(-1)?.categories).toEqual([]);
      const categoryRows = await db.select().from(categories);
      const names = ['Dinner', 'Lunch', 'Snacks'] as const;
      await db.insert(recipeCategories).values(names.map((name, sortOrder) => {
        const category = categoryRows.find((row) => row.name === name);
        if (!category) throw new Error('Verification category missing.');
        return { recipeId: probeId, categoryId: category.id, sortOrder };
      }));
      await db.insert(recipeImages).values({ recipeId: probeId, objectKey: probeId, sortOrder: 0 });
      const withCover = recipeSummarySchema.array().parse(await (await fetch(`${baseUrl}/recipes`)).json()).at(-1);
      expect(withCover?.categories).toEqual(names);
      // Validate the signing projection without fetching an absent object or printing the signed URL.
      expect(withCover?.imageUrl !== null).toBe(true);
      expect(new URL(withCover?.imageUrl ?? 'https://invalid.example').searchParams.has('X-Amz-Signature')).toBe(true);
    } finally { await db.delete(recipes).where(eq(recipes.id, probeId)); }
  });

  it('fails missing or invalid auth settings with key-only errors', () => {
    const config = app.get<ConfigService>(ConfigService);
    const keys = ['DATABASE_URL', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_ENDPOINT_URL_S3', 'AWS_REGION', 'S3_BUCKET', 'PORT', 'BETTER_AUTH_SECRET', 'BETTER_AUTH_URL'];
    const input: Record<string, unknown> = Object.fromEntries(keys.map((key) => [key, config.get<unknown>(key)]));
    for (const [key, value] of [['BETTER_AUTH_SECRET', undefined], ['BETTER_AUTH_SECRET', 'short'], ['BETTER_AUTH_URL', undefined], ['BETTER_AUTH_URL', 'invalid']] as const) {
      let message = '';
      try { validateEnvironment({ ...input, [key]: value }); } catch (error) { message = error instanceof Error ? error.message : 'unknown'; }
      expect(message.includes(key)).toBe(true);
      expect(message.includes('short')).toBe(false);
      expect(message.startsWith('Invalid API configuration:')).toBe(true);
    }
  });
});
