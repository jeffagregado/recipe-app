import { ResilienceTimeoutError } from '@nestjs/resilience';
import { sql } from 'drizzle-orm';
import type { DrizzleDb } from '../database/database.service.js';
import { RECIPE_DATABASE_TIMEOUT_MS, RECIPE_STATEMENT_TIMEOUT_MS } from './recipes.resilience.js';

type ReadTransaction = Parameters<Parameters<DrizzleDb['transaction']>[0]>[0];

/** Bound SQL in PostgreSQL and stop starting statements when the read's elapsed budget expires. */
export function createReadDeadline(signal: AbortSignal) {
  const deadline = Date.now() + RECIPE_DATABASE_TIMEOUT_MS;
  let configured = false;
  let statementBudget = RECIPE_STATEMENT_TIMEOUT_MS;
  const timeoutError = (timeout: number, cause?: unknown) => Object.assign(
    new ResilienceTimeoutError(timeout, 'recipeDatabase'), { cause },
  );
  const checkBudget = () => {
    signal.throwIfAborted();
    if (Date.now() >= deadline) throw timeoutError(RECIPE_DATABASE_TIMEOUT_MS);
  };

  return async function read<T>(tx: ReadTransaction, operation: () => Promise<T>): Promise<T> {
    checkBudget();
    if (!configured) {
      // PostgreSQL interprets zero as "no timeout".
      statementBudget = Math.max(1, Math.min(RECIPE_STATEMENT_TIMEOUT_MS, deadline - Date.now()));
      // Configure once to avoid a network round trip per read. LOCAL resets on commit/rollback.
      await tx.execute(sql`select set_config('statement_timeout', ${String(statementBudget)}, true)`);
      configured = true;
      checkBudget();
    }
    try {
      const result = await operation();
      checkBudget();
      return result;
    } catch (cause) {
      // Drizzle wraps the original PostgreSQL error in its cause.
      const databaseCause = cause instanceof Error ? cause.cause : undefined;
      if (databaseCause instanceof Error && 'code' in databaseCause && databaseCause.code === '57014') {
        throw timeoutError(statementBudget, cause);
      }
      throw cause;
    }
  };
}
