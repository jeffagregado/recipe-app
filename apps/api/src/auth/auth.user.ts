import { and, eq, sql } from 'drizzle-orm';
import type { AuthUser } from '@recipe-app/contracts/types';
import type { DrizzleDb } from '../database/database.service.js';
import { authAccounts, users } from '../database/schema.js';

/** Better Auth's provider id for an email-and-password Sign-in method; its account id is the Account's own id. */
export const CREDENTIAL_PROVIDER = 'credential';

/** What the session guard knows about the caller. The Settings fields of the public user are read only where they are returned. */
export type SessionUser = Pick<AuthUser, 'id' | 'displayName'>;

/** Joins an Account's credential record to its `users` row. An Account has at most one, so the join never multiplies the row. */
export const ownCredential = and(eq(authAccounts.userId, users.id), eq(authAccounts.providerId, CREDENTIAL_PROVIDER));
/** Whether that record holds a password, without reading the hash. */
export const hasPassword = sql<boolean>`${authAccounts.password} is not null`;

/**
 * Reads the public user of one Account, or nothing when the Account is gone. Raises a storage error as it is. A new
 * Settings field is added here and in the contract, nowhere else.
 */
export async function readPublicUser(db: DrizzleDb, userId: string): Promise<AuthUser | undefined> {
  const [user] = await db.select({ id: users.id, displayName: users.name, hasPassword })
    .from(users).leftJoin(authAccounts, ownCredential).where(eq(users.id, userId)).limit(1);
  return user;
}
