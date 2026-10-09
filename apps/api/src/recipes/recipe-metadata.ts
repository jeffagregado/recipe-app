import { createHash } from 'node:crypto';
import { createRecipeMetadataSchema, expectedRecipeFileFields } from '@recipe-app/contracts/schemas';
import { RECIPE_LIMITS } from '@recipe-app/contracts/types';
import type { CreateRecipeMetadata } from '@recipe-app/contracts/types';
import type { RecipeFile } from './recipe-images.js';
import { validateRecipeImage } from './recipe-images.js';
import { fieldError, RecipeError } from './recipe-errors.js';

export function parseRecipeMetadata(body: Record<string, unknown>): CreateRecipeMetadata {
  const raw = body.recipe;
  if (Object.keys(body).some((key) => key !== 'recipe')) throw fieldError('recipe', 'Only the recipe metadata field is allowed.');
  if (typeof raw !== 'string' || !raw || Buffer.byteLength(raw) > RECIPE_LIMITS.metadataBytes) throw fieldError('recipe', 'Provide one JSON metadata part up to 1 MiB.');
  let input: unknown;
  try { input = JSON.parse(raw); } catch (cause) { throw new RecipeError(400, 'VALIDATION_FAILED', 'Malformed recipe JSON.', { cause, fieldErrors: Object.assign(Object.create(null), { recipe: ['Provide valid JSON metadata.'] }) }); }
  const parsed = createRecipeMetadataSchema.safeParse(input);
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

export function validateRecipeFiles(metadata: CreateRecipeMetadata, files: RecipeFile[]): RecipeFile[] {
  const fields = expectedRecipeFileFields(metadata, files.some((file) => file.fieldname === 'cover'));
  const seen = new Set<string>();
  for (const file of files) {
    if (!fields.includes(file.fieldname) || seen.has(file.fieldname)) throw fieldError(file.fieldname, 'Unexpected or repeated image field.');
    seen.add(file.fieldname); validateRecipeImage(file);
  }
  for (const field of fields) if (!seen.has(field)) throw fieldError(field, 'Declared image is missing.');
  return fields.map((field) => files.find((file) => file.fieldname === field)!);
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value !== null && typeof value === 'object') return `{${Object.entries(value).filter(([, value]) => value !== undefined)
    .sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(',')}}`;
  return JSON.stringify(value);
}

/** Normalizes optional null-only row properties; file order follows semantic slots, not multipart arrival. */
export function recipeRequestHash(metadata: CreateRecipeMetadata, files: RecipeFile[]): string {
  const hash = createHash('sha256');
  hash.update(stableJson({ ...metadata, ingredients: metadata.ingredients.map((row) => ({ ...row, preparation: null, note: null })) }));
  for (const file of files) hash.update(JSON.stringify([file.fieldname, createHash('sha256').update(file.buffer).digest('hex')]));
  return hash.digest('hex');
}
