import { randomBytes } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { and, desc, eq, inArray, like, or } from 'drizzle-orm';
import { authUserResponseSchema } from '@recipe-app/contracts/schemas';
import type { AuthUser } from '@recipe-app/contracts/types';
import { mountAuth } from '../src/auth/auth.http.js';
import { EMAIL_CHANGE_IDENTIFIERS, tokenOfEmailChangeIdentifier } from '../src/auth/auth.email-change.js';
import { rateLimitKey } from '../src/auth/auth.rate-limit.js';
import { RESET_IDENTIFIERS, tokenOfResetIdentifier } from '../src/auth/auth.reset.js';
import { tokenOfIdentifier, VERIFICATION_IDENTIFIERS } from '../src/auth/auth.verification.js';
import { DatabaseService } from '../src/database/database.service.js';
import type { DrizzleDb } from '../src/database/database.service.js';
import { authRateLimits, authVerifications, categories, recipeCategories, recipes, users } from '../src/database/schema.js';
import type { SeedRecipe } from '../src/recipes/fixtures/fixture.js';
import { seedRecipes } from '../src/recipes/seed-recipes.js';
import { getDevDatabaseUrl } from './neon-dev.js';
import type { ConfigureTestingModule, RecordingMailTransport } from './recording-mail.js';

export const TEST_ORIGIN = 'http://localhost:3000';

const issuedAddresses = new Set<string>();

/** Loopback callers may name a private-range client address; counters stay isolated per suite. */
export function testAddress(): string {
  // Signup is capped per address, so a repeat would spend another test's allowance. In CI the integration shards and the
  // E2E workers are separate processes on one database, so the address is drawn from all of 10.0.0.0/8, where two
  // processes rarely pick the same one. From 250 addresses, some address was shared in nearly every run.
  let address: string;
  do {
    const [a, b, c] = randomBytes(3);
    address = `10.${a}.${b}.${(c % 254) + 1}`;
  } while (issuedAddresses.has(address));
  issuedAddresses.add(address);
  return address;
}
/** A non-deliverable address: the reserved .invalid domain never resolves. */
export const testEmail = () => `t_${randomBytes(10).toString('hex')}@example.invalid`;
export const testPassword = () => randomBytes(24).toString('base64url');

export async function startApi(configure?: ConfigureTestingModule): Promise<{ app: NestExpressApplication; baseUrl: string; db: DrizzleDb; mail: RecordingMailTransport }> {
  process.env.DATABASE_URL = await getDevDatabaseUrl();
  process.env.BETTER_AUTH_URL = 'http://127.0.0.1:4101';
  // Process environment overrides the env file, so the suite never depends on the developer's list.
  process.env.AUTH_TRUSTED_ORIGINS = TEST_ORIGIN;
  const { AppModule } = await import('../src/app.module.js');
  // Imported here, not at the top: the e2e loader compiles this file alone and resolves no other test module.
  const { createAppWithRecordedMail } = await import('./recording-mail.js');
  const { app, mail } = await createAppWithRecordedMail(AppModule, { logger: false, bodyParser: false, abortOnError: false }, configure);
  mountAuth(app);
  await app.listen(0, '127.0.0.1');
  const baseUrl = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
  return { app, baseUrl, db: app.get(DatabaseService).db, mail };
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

/** The tokens of one kind of link still stored for an address, newest first. The verifications table is the agreed seam for links. */
async function storedTokens(db: DrizzleDb, email: string, identifiers: string, tokenOf: (identifier: string) => string): Promise<string[]> {
  const rows = await db.select({ identifier: authVerifications.identifier }).from(authVerifications)
    .innerJoin(users, eq(users.id, authVerifications.value))
    .where(and(eq(users.email, email), like(authVerifications.identifier, identifiers)))
    .orderBy(desc(authVerifications.createdAt));
  return rows.map(({ identifier }) => tokenOf(identifier));
}

export const verificationTokens = (db: DrizzleDb, email: string) => storedTokens(db, email, VERIFICATION_IDENTIFIERS, tokenOfIdentifier);
export const resetTokens = (db: DrizzleDb, email: string) => storedTokens(db, email, RESET_IDENTIFIERS, tokenOfResetIdentifier);

/** Looked up by the Account's current email: the link is stored for the Account, not for the address it was mailed to. */
export const emailChangeTokens = (db: DrizzleDb, email: string) => storedTokens(db, email, EMAIL_CHANGE_IDENTIFIERS, tokenOfEmailChangeIdentifier);

export async function latestVerificationToken(db: DrizzleDb, email: string): Promise<string> {
  const [token] = await verificationTokens(db, email);
  if (!token) throw new Error('No verification link is stored for the temporary account.');
  return token;
}

export async function latestResetToken(db: DrizzleDb, email: string): Promise<string> {
  const [token] = await resetTokens(db, email);
  if (!token) throw new Error('No reset link is stored for the temporary account.');
  return token;
}

/** Signs up, opens the stored verification link and logs in: the one place a suite gets a session for a new Account. */
export async function signupUser(client: ReturnType<typeof apiClient>, db: DrizzleDb, email = testEmail(), password = testPassword()) {
  const signup = await client.post('/auth/signup', { displayName: 'Temporary verification', email, password });
  if (signup.status !== 201) throw new Error(`Temporary signup failed with HTTP ${signup.status}.`);
  const verification = await client.post('/auth/verify-email', { token: await latestVerificationToken(db, email) });
  if (verification.status !== 204) throw new Error(`Temporary verification failed with HTTP ${verification.status}.`);
  const login = await client.post('/auth/login', { email, password });
  if (login.status !== 200) throw new Error(`Temporary login failed with HTTP ${login.status}.`);
  const { user } = authUserResponseSchema.parse(await login.json());
  return { user, email, password, cookie: cookiePair(login) };
}

export async function latestEmailChangeToken(db: DrizzleDb, email: string): Promise<string> {
  const [token] = await emailChangeTokens(db, email);
  if (!token) throw new Error('No email-change link is stored for the temporary account.');
  return token;
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
  let accountKeys: string[] = [];
  if (data.emails.length > 0) {
    // Verification links name their Account without a foreign key, so they go before the users they belong to.
    const owners = db.select({ id: users.id }).from(users).where(inArray(users.email, data.emails));
    accountKeys = (await owners).flatMap(({ id }) => ['change-password:user', 'sign-in-methods:user'].map((scope) => rateLimitKey(scope, id)));
    await db.delete(authVerifications).where(inArray(authVerifications.value, owners));
    await db.delete(users).where(inArray(users.email, data.emails));
  }
  const keys = [
    ...accountKeys,
    ...data.emails.flatMap((email) => ['login:email', 'resend:email', 'notice:email', 'forgot:email', 'email-change:email'].map((scope) => rateLimitKey(scope, email))),
    ...data.addresses.flatMap((address) => ['login:address', 'signup:address', 'resend:address', 'verify:address', 'google-start:address', 'google-callback:address', 'forgot:address', 'reset:address', 'set-password:address', 'email-change:address', 'email-change-confirm:address'].map((scope) => rateLimitKey(scope, address))),
  ];
  // Better Auth keys its own counters `<address>|<path>`. Without the separator, 10.1.2.3 would also clear 10.1.2.34,
  // which may belong to a suite running in another process.
  await db.delete(authRateLimits).where(or(inArray(authRateLimits.key, keys), ...data.addresses.map((address) => like(authRateLimits.key, `${address}|%`))));
}
