import { randomBytes } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { eq, inArray, like, or } from 'drizzle-orm';
import { authUserResponseSchema } from '@recipe-app/contracts/schemas';
import type { AuthUser } from '@recipe-app/contracts/types';
import { mountAuth } from '../src/auth/auth.http.js';
import { rateLimitKey } from '../src/auth/auth.rate-limit.js';
import { DatabaseService } from '../src/database/database.service.js';
import type { DrizzleDb } from '../src/database/database.service.js';
import { authRateLimits, categories, recipeCategories, recipes, users } from '../src/database/schema.js';
import type { SeedRecipe } from '../src/recipes/fixtures/fixture.js';
import { seedRecipes } from '../src/recipes/seed-recipes.js';
import { getDevDatabaseUrl } from './neon-dev.js';

export const TEST_ORIGIN = 'http://localhost:3000';

const ADDRESS_POOL = 250;
const issuedAddresses = new Set<string>();

/** Loopback callers may name a documentation-range client address; counters stay isolated per suite. */
export function testAddress(): string {
  // Signup is capped per address, so a repeat inside one suite would spend another test's allowance.
  if (issuedAddresses.size === ADDRESS_POOL) issuedAddresses.clear();
  let address: string;
  do { address = `198.51.100.${Math.floor(Math.random() * ADDRESS_POOL) + 1}`; } while (issuedAddresses.has(address));
  issuedAddresses.add(address);
  return address;
}
/** A non-deliverable address: the reserved .invalid domain never resolves. */
export const testEmail = () => `t_${randomBytes(10).toString('hex')}@example.invalid`;
export const testPassword = () => randomBytes(24).toString('base64url');

export async function startApi(): Promise<{ app: NestExpressApplication; baseUrl: string; db: DrizzleDb }> {
  process.env.DATABASE_URL = await getDevDatabaseUrl();
  process.env.BETTER_AUTH_URL = 'http://127.0.0.1:4101';
  // Process environment overrides the env file, so the suite never depends on the developer's list.
  process.env.AUTH_TRUSTED_ORIGINS = TEST_ORIGIN;
  const { AppModule } = await import('../src/app.module.js');
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: false, bodyParser: false, abortOnError: false });
  mountAuth(app);
  await app.listen(0, '127.0.0.1');
  const baseUrl = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
  return { app, baseUrl, db: app.get(DatabaseService).db };
}

type RequestOptions = { cookie?: string; origin?: string | null; address?: string };

export function apiClient(baseUrl: string, defaultAddress: string, defaultOrigin = TEST_ORIGIN) {
  const headers = ({ cookie, origin = defaultOrigin, address = defaultAddress }: RequestOptions) => ({
    'X-Forwarded-For': address,
    ...(origin === null ? {} : { Origin: origin }),
    ...(cookie ? { Cookie: cookie } : {}),
  });
  return {
    post: (path: string, body: unknown, options: RequestOptions = {}) => fetch(`${baseUrl}${path}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...headers(options) }, body: JSON.stringify(body),
    }),
    get: (path: string, options: RequestOptions = {}) => fetch(`${baseUrl}${path}`, { headers: headers({ origin: null, ...options }) }),
  };
}

/** Name=value pairs for a Cookie header; attributes stay on the response under test. */
export const cookiePair = (response: Response) => response.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ');

export async function signupUser(client: ReturnType<typeof apiClient>, email = testEmail(), password = testPassword()) {
  const response = await client.post('/auth/signup', { displayName: 'Temporary verification', email, password });
  if (response.status !== 201) throw new Error(`Temporary signup failed with HTTP ${response.status}.`);
  const { user } = authUserResponseSchema.parse(await response.json());
  return { user, email, password, cookie: cookiePair(response) };
}

export const ownedId = (tag: string, id: string) => `${tag}-${id}`;

/** Copies seed summaries under an owner, tagged with that owner's default categories; deleting the user cascades every row. */
export async function insertOwnedRecipes(db: DrizzleDb, user: Pick<AuthUser, 'id'>, tag: string, samples: readonly SeedRecipe[] = seedRecipes): Promise<void> {
  const categoryRows = await db.select().from(categories).where(eq(categories.userId, user.id));
  await db.insert(recipes).values(samples.map((sample) => ({
    id: ownedId(tag, sample.id), userId: user.id, title: sample.title, description: sample.description,
    servings: sample.servings, prepTimeMinutes: sample.prepTimeMinutes, cookTimeMinutes: sample.cookTimeMinutes,
    sortOrder: seedRecipes.findIndex(({ id }) => id === sample.id), createdAt: new Date(sample.createdAt), updatedAt: new Date(sample.updatedAt),
  })));
  await db.insert(recipeCategories).values(samples.flatMap((sample) => sample.categories.map((name, sortOrder) => {
    const category = categoryRows.find((row) => row.name === name);
    if (!category) throw new Error('Verification category missing.');
    return { recipeId: ownedId(tag, sample.id), categoryId: category.id, sortOrder };
  })));
}

/** Removes temporary users (cascading sessions, accounts and recipes) and their wrapper counters. */
export async function removeTestData(db: DrizzleDb, data: { emails: string[]; addresses: string[] }): Promise<void> {
  if (data.emails.length > 0) await db.delete(users).where(inArray(users.email, data.emails));
  const keys = [
    ...data.emails.map((email) => rateLimitKey('login:email', email)),
    ...data.addresses.flatMap((address) => [rateLimitKey('login:address', address), rateLimitKey('signup:address', address)]),
  ];
  await db.delete(authRateLimits).where(or(inArray(authRateLimits.key, keys), ...data.addresses.map((address) => like(authRateLimits.key, `${address}%`))));
}
