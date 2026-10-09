import { Injectable } from '@nestjs/common';
import type { DrizzleDb } from '../database/database.service.js';

export type RecipeTransaction = Parameters<Parameters<DrizzleDb['transaction']>[0]>[0];

/** Transaction extension point; tests replace it to force failure after all rows have been inserted. */
@Injectable()
export class RecipeWriteHook {
  beforeComplete(tx: RecipeTransaction): Promise<void> { void tx; return Promise.resolve(); }
}
