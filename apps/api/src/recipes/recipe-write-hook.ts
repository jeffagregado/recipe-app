import { Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type { DrizzleDb } from '../database/database.service.js';

export type RecipeTransaction = Parameters<Parameters<DrizzleDb['transaction']>[0]>[0];

/** Bounds each statement of the short owner-scoped writes (favorite, delete). */
export const RECIPE_MUTATION_SQL_TIMEOUT_MS = 10_000;

/** LOCAL to the transaction; PostgreSQL reads zero as "no timeout", so the budget never drops below 1 ms. */
export const setStatementTimeout = (tx: RecipeTransaction, ms: number) =>
  tx.execute(sql`select set_config('statement_timeout', ${String(Math.max(1, Math.ceil(ms)))}, true)`);

/** Transaction extension point; tests replace it to force failure after all rows have been inserted. */
@Injectable()
export class RecipeWriteHook {
  beforeComplete(tx: RecipeTransaction): Promise<void> { void tx; return Promise.resolve(); }
}
