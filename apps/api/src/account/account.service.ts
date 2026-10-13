import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { AuthUser, UpdateDisplayNameInput } from '@recipe-app/contracts/types';
import { unauthenticated, unavailable } from '../auth/auth.errors.js';
import { DRIZZLE_DB } from '../database/database.module.js';
import type { DrizzleDb } from '../database/database.service.js';
import { users } from '../database/schema.js';

@Injectable()
export class AccountService {
  constructor(@Inject(DRIZZLE_DB) private readonly db: DrizzleDb) {}

  /**
   * Renames the Account the session guard already identified. One statement: Better Auth's own update would look the
   * session up a second time, and with no cookie cache it has nothing else to refresh. The session is unchanged.
   */
  async updateDisplayName(input: UpdateDisplayNameInput, user: AuthUser): Promise<AuthUser> {
    let renamed: { id: string; displayName: string } | undefined;
    try {
      [renamed] = await this.db.update(users).set({ name: input.displayName }).where(eq(users.id, user.id))
        .returning({ id: users.id, displayName: users.name });
    } catch (cause) { throw unavailable('update-display-name', cause); }
    // The Account was deleted between the guard's read and this write.
    if (!renamed) throw unauthenticated();
    return renamed;
  }
}
