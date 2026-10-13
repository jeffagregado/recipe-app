import { AsyncLocalStorage } from 'node:async_hooks';
import { betterAuth } from 'better-auth';
import { eq } from 'drizzle-orm';
import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '@recipe-app/contracts/types';
import { insertDefaultCategories } from '../categories/default-categories.js';
import type { Environment } from '../config/environment.js';
import type { DrizzleDb } from '../database/database.service.js';
import * as schema from '../database/schema.js';
import { GOOGLE_PROVIDER_ID, googleEndpoints, googleSignIn } from './auth.google.js';
import type { GoogleEndpoints } from './auth.google.js';
import { logAuthEvent } from './auth.logger.js';

const SESSION_LIFETIME_SECONDS = 60 * 60 * 24 * 7;

type Transaction = Parameters<Parameters<DrizzleDb['transaction']>[0]>[0];
type Transact = DrizzleDb['transaction'];

/** The transaction Better Auth is running in, if any, so a database hook can write inside it. */
const activeTransaction = new AsyncLocalStorage<Transaction>();

function trackTransactions(db: DrizzleDb): DrizzleDb {
  const tracked: DrizzleDb = Object.create(db);
  const transaction: Transact = (run, config) => db.transaction((tx) => activeTransaction.run(tx, () => run(tx)), config);
  tracked.transaction = transaction;
  return tracked;
}

type AuthConfig = Pick<Environment, 'BETTER_AUTH_SECRET' | 'BETTER_AUTH_URL' | 'AUTH_TRUSTED_ORIGINS'>
  & Partial<Pick<Environment, 'GOOGLE_CLIENT_ID' | 'GOOGLE_CLIENT_SECRET' | 'GOOGLE_REDIRECT_URI'>>;

export function createAuth(db: DrizzleDb, config: AuthConfig, endpoints: GoogleEndpoints = googleEndpoints) {
  const { GOOGLE_CLIENT_ID: clientId, GOOGLE_CLIENT_SECRET: clientSecret, GOOGLE_REDIRECT_URI: redirectUri } = config;
  return betterAuth({
    appName: 'Recipe App',
    baseURL: config.BETTER_AUTH_URL,
    secret: config.BETTER_AUTH_SECRET,
    logger: { log: logAuthEvent },
    database: drizzleAdapter(trackTransactions(db), { provider: 'pg', schema, transaction: true }),
    databaseHooks: {
      account: {
        create: {
          // Sign-up creates the user and then its first Sign-in method, a password or Google, in one transaction. Writing the
          // default categories here, in that transaction, means an account never exists without them and a failure rolls the
          // whole sign-up back. A Google identity attached to an existing Account joins one that already has its categories
          // and writes none.
          before: async (account) => {
            if (account.providerId !== 'credential' && account.providerId !== GOOGLE_PROVIDER_ID) return;
            const tx = activeTransaction.getStore();
            if (await (tx ?? db).$count(schema.authAccounts, eq(schema.authAccounts.userId, account.userId)) === 0) {
              if (!tx) throw new Error('Sign-up is not running in a transaction; default categories were not created.');
              await insertDefaultCategories(tx, account.userId);
            }
            // Google's tokens are spent once the profile is read; only the identity is kept.
            if (account.providerId === GOOGLE_PROVIDER_ID) {
              return { data: { ...account, accessToken: null, refreshToken: null, idToken: null, accessTokenExpiresAt: null, refreshTokenExpiresAt: null, scope: null } };
            }
          },
        },
      },
    },
    trustedOrigins: config.AUTH_TRUSTED_ORIGINS,
    // An Account signs in only with a Verified email. No `emailVerification` sender is configured on purpose: the wrapper
    // owns the single-use link, so Better Auth mails nobody by itself, at sign-up or at a refused login.
    emailAndPassword: { enabled: true, requireEmailVerification: true, minPasswordLength: PASSWORD_MIN_LENGTH, maxPasswordLength: PASSWORD_MAX_LENGTH },
    user: { modelName: 'users' },
    // Fixed seven-day sessions: no sliding renewal and no cookie-cached session copies.
    session: {
      modelName: 'authSessions',
      expiresIn: SESSION_LIFETIME_SECONDS,
      disableSessionRefresh: true,
      cookieCache: { enabled: false },
    },
    // One Account per email (ADR 0003). A Google sign-in whose email matches an Account attaches the identity only when
    // that Account's own email is Verified; over an unverified one Better Auth refuses before it writes anything, so the
    // sign-in can neither join the Account nor verify it. No provider is trusted by name: Google's word that it verified
    // the address is required on every sign-in. The Account's name and email are never overwritten from Google.
    account: {
      modelName: 'authAccounts',
      accountLinking: { enabled: true, requireLocalEmailVerified: true, trustedProviders: [], allowDifferentEmails: false, updateUserInfoOnLink: false },
      updateAccountOnSignIn: false,
    },
    // Without a client the provider is absent, and starting the flow fails like any other refused sign-in.
    plugins: clientId && clientSecret && redirectUri ? [googleSignIn({ clientId, clientSecret, redirectUri }, endpoints)] : [],
    verification: { modelName: 'authVerifications' },
    rateLimit: { enabled: true, storage: 'database', modelName: 'authRateLimits' },
    advanced: {
      disableCSRFCheck: false,
      disableOriginCheck: false,
      database: { generateId: 'uuid' },
      // HTTPS-only trust means a public HTTPS site: keep the Secure cookie even if the API's own URL is internal HTTP.
      ...(config.AUTH_TRUSTED_ORIGINS.every((origin) => origin.startsWith('https://')) ? { useSecureCookies: true } : {}),
    },
  });
}

export type RecipeAuth = ReturnType<typeof createAuth>;
