import { createHash } from 'node:crypto';
import type { ZodType } from 'zod';
import { createRecipeMetadataSchema } from '@recipe-app/contracts/schemas';
import type { CreateRecipeMetadata, UpdateRecipeMetadata } from '@recipe-app/contracts/types';
import { fieldError, RecipeError } from './recipe-errors.js';

/** Parses a save's JSON body, which the interceptor has already bounded to 1 MiB. */
export function parseRecipeMetadata(json: string | undefined): CreateRecipeMetadata;
export function parseRecipeMetadata<T>(json: string | undefined, schema: ZodType<T>): T;
export function parseRecipeMetadata(json: string | undefined, schema: ZodType<unknown> = createRecipeMetadataSchema): unknown {
  if (!json) throw fieldError('recipe', 'Send the recipe as JSON.');
  let input: unknown;
  try { input = JSON.parse(json); } catch (cause) { throw new RecipeError(400, 'VALIDATION_FAILED', 'Malformed recipe JSON.', { cause, fieldErrors: Object.assign(Object.create(null), { recipe: ['Provide valid JSON metadata.'] }) }); }
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors = metadataErrors(parsed.error.issues);
    throw new RecipeError(400, 'VALIDATION_FAILED', 'Check recipe fields.', { fieldErrors });
  }
  return parsed.data;
}

type MetadataIssue = { code: string; path: PropertyKey[]; message: string; keys?: string[] };
function metadataErrors(issues: MetadataIssue[]): Record<string, string[]> {
  const errors: Record<string, string[]> = Object.create(null);
  const fields = issues.flatMap((issue) => {
    const paths = issue.code === 'unrecognized_keys' ? issue.keys!.slice(0, 32).map((key) => [...issue.path, key.slice(0, 200)].join('.')) : [issue.path.join('.') || 'recipe'];
    return paths.map((path) => ({ path: path.slice(0, 200), message: issue.code === 'unrecognized_keys' ? 'Unexpected field.' : issue.message }));
  });
  for (const { path, message } of fields.slice(0, 32)) {
    const messages = errors[path] ??= [];
    if (messages.length < 3) messages.push(message);
  }
  return errors;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value !== null && typeof value === 'object') return `{${Object.entries(value).filter(([, value]) => value !== undefined)
    .sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(',')}}`;
  return JSON.stringify(value);
}

/** Normalizes optional null-only row properties; Pending photo ids are part of the metadata, so they are hashed with it.
 * An update also hashes its operation and target, so its key cannot replay a create or an update of another recipe.
 */
export function recipeRequestHash(metadata: CreateRecipeMetadata): string;
export function recipeRequestHash(metadata: UpdateRecipeMetadata, updatedRecipeId: string): string;
export function recipeRequestHash(metadata: CreateRecipeMetadata | UpdateRecipeMetadata, updatedRecipeId?: string): string {
  const hash = createHash('sha256');
  if (updatedRecipeId !== undefined) hash.update(JSON.stringify(['update', updatedRecipeId]));
  hash.update(stableJson({ ...metadata, ingredients: metadata.ingredients.map((row) => ({ ...row, preparation: null, note: null })) }));
  return hash.digest('hex');
}
