import { betterAuth } from 'better-auth';
import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import type { Environment } from '../config/environment.js';
import type { DrizzleDb } from '../database/database.service.js';
import * as schema from '../database/schema.js';

/** Local frontend origins are never included in production trust. */
export function authOrigins(nodeEnv: string | undefined): string[] {
  return nodeEnv === 'production' ? [] : [
    'http://localhost:3000', 'http://127.0.0.1:3000',
    'http://localhost:4100', 'http://127.0.0.1:4100',
  ];
}

export function createAuth(db: DrizzleDb, config: Pick<Environment, 'BETTER_AUTH_SECRET' | 'BETTER_AUTH_URL'>) {
  return betterAuth({
    appName: 'Recipe App',
    baseURL: config.BETTER_AUTH_URL,
    secret: config.BETTER_AUTH_SECRET,
    database: drizzleAdapter(db, { provider: 'pg', schema, transaction: true }),
    trustedOrigins: authOrigins(process.env.NODE_ENV),
    emailAndPassword: { enabled: true, minPasswordLength: 12, maxPasswordLength: 128 },
    user: { modelName: 'users' },
    session: { modelName: 'authSessions' },
    account: { modelName: 'authAccounts' },
    verification: { modelName: 'authVerifications' },
    rateLimit: { enabled: true, storage: 'database', modelName: 'authRateLimits' },
    advanced: { disableCSRFCheck: false, disableOriginCheck: false, database: { generateId: 'uuid' } },
  });
}

export type RecipeAuth = ReturnType<typeof createAuth>;
