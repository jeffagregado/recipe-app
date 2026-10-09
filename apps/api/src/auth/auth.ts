import { betterAuth } from 'better-auth';
import { username } from 'better-auth/plugins';
import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { isNormalizedUsername } from '@recipe-app/contracts/schemas';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, USERNAME_MAX_LENGTH, USERNAME_MIN_LENGTH } from '@recipe-app/contracts/types';
import type { Environment } from '../config/environment.js';
import type { DrizzleDb } from '../database/database.service.js';
import * as schema from '../database/schema.js';
import { logAuthEvent } from './auth.logger.js';

const SESSION_LIFETIME_SECONDS = 60 * 60 * 24 * 7;

export function createAuth(db: DrizzleDb, config: Pick<Environment, 'BETTER_AUTH_SECRET' | 'BETTER_AUTH_URL' | 'AUTH_TRUSTED_ORIGINS'>) {
  return betterAuth({
    appName: 'Recipe App',
    baseURL: config.BETTER_AUTH_URL,
    secret: config.BETTER_AUTH_SECRET,
    logger: { log: logAuthEvent },
    database: drizzleAdapter(db, { provider: 'pg', schema, transaction: true }),
    trustedOrigins: config.AUTH_TRUSTED_ORIGINS,
    emailAndPassword: { enabled: true, minPasswordLength: PASSWORD_MIN_LENGTH, maxPasswordLength: PASSWORD_MAX_LENGTH },
    plugins: [username({
      displayUsername: false,
      immutableUsername: true,
      minUsernameLength: USERNAME_MIN_LENGTH,
      maxUsernameLength: USERNAME_MAX_LENGTH,
      // The default validator allows leading, trailing and consecutive dots.
      usernameValidator: isNormalizedUsername,
      validationOrder: { username: 'post-normalization' },
    })],
    user: { modelName: 'users' },
    // Fixed seven-day sessions: no sliding renewal and no cookie-cached session copies.
    session: {
      modelName: 'authSessions',
      expiresIn: SESSION_LIFETIME_SECONDS,
      disableSessionRefresh: true,
      cookieCache: { enabled: false },
    },
    account: { modelName: 'authAccounts' },
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
