import { randomUUID } from 'node:crypto';
import type { ServerResponse } from 'node:http';
import { Catch, HttpException, Logger } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import { ResilienceError, ResilienceTimeoutError } from '@nestjs/resilience';
import type { ApiErrorEnvelope } from '@recipe-app/contracts/types';
import { AuthError } from '../auth/auth.errors.js';

type RecipeErrorCode = 'VALIDATION_FAILED' | 'NOT_FOUND' | 'IDEMPOTENCY_CONFLICT' | 'IDEMPOTENCY_IN_PROGRESS'
  | 'PAYLOAD_TOO_LARGE' | 'UNSUPPORTED_MEDIA_TYPE' | 'RATE_LIMITED' | 'SERVICE_UNAVAILABLE' | 'TIMEOUT' | 'PENDING_PHOTO_LIMIT';

export class RecipeError extends HttpException {
  constructor(status: number, code: RecipeErrorCode, message: string, options: { cause?: unknown; fieldErrors?: Record<string, string[]> } = {}) {
    super({ code, message, ...(options.fieldErrors ? { fieldErrors: options.fieldErrors } : {}) } satisfies ApiErrorEnvelope,
      status, { cause: options.cause });
  }
}

export const recipeNotFound = () => new RecipeError(404, 'NOT_FOUND', 'Recipe not found.');

/** A key whose write is on record never writes again, even after that recipe was deleted. */
export const recipeSaveDeleted = () => new RecipeError(409, 'IDEMPOTENCY_CONFLICT', 'This save already completed and the recipe has since been deleted.');

/** Malformed IDs answer like unknown ones, before any query runs. */
export function assertRecipeId(id: string): void {
  if (id.includes('\u0000') || id.length > 200) throw recipeNotFound();
}

export function fieldError(field: string, message: string, status = 400, code: RecipeErrorCode = 'VALIDATION_FAILED'): RecipeError {
  const fieldErrors: Record<string, string[]> = Object.create(null);
  fieldErrors[field] = [message];
  return new RecipeError(status, code, message, { fieldErrors });
}

type RecipeOperation = 'create' | 'update' | 'delete' | 'favorite' | 'cleanup' | 'detail' | 'reconcile' | 'categories' | 'photo';
const METHOD_OPERATIONS: Record<string, RecipeOperation> = { GET: 'detail', PATCH: 'update', DELETE: 'delete', PUT: 'favorite' };

const logger = new Logger('RecipeOperations');
/** Static labels, locally generated correlation IDs and safe SQLSTATEs only; never error messages or request values. */
export function logRecipeFailure(operation: RecipeOperation, start: unknown): void {
  const seen = new Set<Error>(); const codes = new Set<string>(); const classes = new Set<string>();
  for (let error = start; error instanceof Error && !seen.has(error); error = error.cause) {
    seen.add(error);
    if (/^[A-Za-z][A-Za-z0-9]{0,63}$/.test(error.constructor.name)) classes.add(error.constructor.name);
    if ('code' in error && typeof error.code === 'string' && /^[0-9A-Z]{5}$/.test(error.code)) codes.add(error.code);
  }
  logger.error(`Recipe ${operation} failed (${randomUUID()}): ${[...classes].join(' <- ') || 'unknown'}${codes.size ? ` SQLSTATE ${[...codes].join(',')}` : ''}.`);
}

export function recipeUnavailable(operation: RecipeOperation, cause: unknown): RecipeError {
  logRecipeFailure(operation, cause);
  return new RecipeError(503, 'SERVICE_UNAVAILABLE', 'Recipe service unavailable. Try again.', { cause });
}

export function recipeCleanupFailure(cause: unknown, cleanupCause: unknown, unresolvedCommit: boolean): RecipeError {
  const options = { cause: new AggregateError([cause, cleanupCause]) };
  if (unresolvedCommit) return new RecipeError(504, 'TIMEOUT', 'Recipe save outcome is unresolved. Retry with the same key and unchanged payload.', options);
  return new RecipeError(503, 'SERVICE_UNAVAILABLE', 'Recipe was not saved; storage cleanup is pending. Retry with the same key after cleanup.', options);
}

@Catch()
export class RecipeFilter implements ExceptionFilter {
  catch(cause: unknown, host: ArgumentsHost): void {
    const error = cause instanceof RecipeError || cause instanceof AuthError ? cause
      : cause instanceof ResilienceTimeoutError ? new RecipeError(504, 'TIMEOUT', 'Recipe read timed out. Try again.', { cause })
        : cause instanceof ResilienceError ? new RecipeError(503, 'SERVICE_UNAVAILABLE', 'Recipe service busy. Try again.', { cause })
          : recipeUnavailable(METHOD_OPERATIONS[host.switchToHttp().getRequest<{ method?: string }>().method ?? ''] ?? 'create', cause);
    const response = host.switchToHttp().getResponse<ServerResponse>();
    response.statusCode = error.getStatus();
    response.setHeader('Cache-Control', 'private, no-store');
    if (error instanceof AuthError && error.retryAfter) response.setHeader('Retry-After', String(error.retryAfter));
    response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify(error.getResponse()));
  }
}
