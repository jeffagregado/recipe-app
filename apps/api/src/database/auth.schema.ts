import { sql } from 'drizzle-orm';
import { bigint, boolean, check, foreignKey, index, integer, pgTable, primaryKey, text, unique } from 'drizzle-orm/pg-core';
import { textId, time, timestamps } from './columns.js';

// Generated with auth@1.7.7 from auth.cli.ts; adapted to text IDs, timestamptz and named constraints.

export const users = pgTable('users', {
  id: textId(),
  name: text('name').notNull(),
  email: text('email').notNull(),
  emailVerified: boolean('email_verified').default(false).notNull(),
  image: text('image'),
  ...timestamps(),
}, (t) => [
  primaryKey({ name: 'users_pkey', columns: [t.id] }),
  unique('users_email_key').on(t.email),
  check('users_email_normalized_check', sql`${t.email} = lower(btrim(${t.email})) AND length(${t.email}) > 0`),
]);

export const authSessions = pgTable('auth_sessions', {
  id: textId(),
  expiresAt: time('expires_at').notNull(),
  token: text('token').notNull(),
  ...timestamps(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id').notNull(),
}, (t) => [
  primaryKey({ name: 'auth_sessions_pkey', columns: [t.id] }),
  unique('auth_sessions_token_key').on(t.token),
  foreignKey({ name: 'auth_sessions_user_id_fkey', columns: [t.userId], foreignColumns: [users.id] }).onDelete('cascade'),
  index('auth_sessions_user_id_idx').on(t.userId),
]);

export const authAccounts = pgTable('auth_accounts', {
  id: textId(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id').notNull(),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: time('access_token_expires_at'),
  refreshTokenExpiresAt: time('refresh_token_expires_at'),
  scope: text('scope'),
  password: text('password'),
  ...timestamps(),
}, (t) => [
  primaryKey({ name: 'auth_accounts_pkey', columns: [t.id] }),
  unique('auth_accounts_provider_account_key').on(t.providerId, t.accountId),
  foreignKey({ name: 'auth_accounts_user_id_fkey', columns: [t.userId], foreignColumns: [users.id] }).onDelete('cascade'),
  index('auth_accounts_user_id_idx').on(t.userId),
]);

export const authVerifications = pgTable('auth_verifications', {
  id: textId(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: time('expires_at').notNull(),
  ...timestamps(),
}, (t) => [
  primaryKey({ name: 'auth_verifications_pkey', columns: [t.id] }),
  index('auth_verifications_identifier_idx').on(t.identifier),
]);

export const authRateLimits = pgTable('auth_rate_limits', {
  id: textId(),
  key: text('key').notNull(),
  count: integer('count').notNull(),
  lastRequest: bigint('last_request', { mode: 'number' }).notNull(),
}, (t) => [
  primaryKey({ name: 'auth_rate_limits_pkey', columns: [t.id] }),
  unique('auth_rate_limits_key_key').on(t.key),
]);
