import { createRequire } from 'node:module';
import type { Writable } from 'node:stream';
import type { ServerResponse } from 'node:http';
import { Injectable } from '@nestjs/common';
import type { CanActivate, ExecutionContext, NestInterceptor, CallHandler } from '@nestjs/common';
import { finalize } from 'rxjs';
import { RECIPE_IMAGE_MIME_TYPES, RECIPE_LIMITS } from '@recipe-app/contracts/types';
import type { AuthRequest } from '../auth/auth.request.js';
import { AuthRateLimiter, rateLimitKey } from '../auth/auth.rate-limit.js';
import { unauthenticated } from '../auth/auth.errors.js';
import { IMAGE_TOO_LARGE } from './recipe-images.js';
import type { RecipeFile } from './recipe-images.js';
import { fieldError, RecipeError } from './recipe-errors.js';

export const RECIPE_WRITE_LIMIT = 60;
const RECIPE_WRITE_WINDOW_MS = 10 * 60_000;
const RECIPE_UPLOAD_CONCURRENCY = 4;
export const RECIPE_WRITE_TIMEOUT_MS = 30_000;
const RECIPE_BACKGROUND_TIMEOUT_MS = 30_000;

export const consumeRecipeWrite = (rateLimiter: AuthRateLimiter, userId: string) =>
  rateLimiter.consume(rateLimitKey('recipe-write:user', userId), { limit: RECIPE_WRITE_LIMIT, windowMs: RECIPE_WRITE_WINDOW_MS });

export type RecipeUploadRequest = AuthRequest & {
  body?: Record<string, unknown>; files?: RecipeFile[]; idempotencyKey?: string;
  writeDeadline?: number; writeSettled?: Promise<unknown>;
};

@Injectable()
export class RecipeWriteGuard implements CanActivate {
  constructor(private readonly rateLimiter: AuthRateLimiter) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RecipeUploadRequest>();
    if (!request.user) throw unauthenticated();
    const key = request.headers['idempotency-key'];
    if (typeof key !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key)) {
      throw fieldError('idempotencyKey', 'Provide a canonical UUID Idempotency-Key.');
    }
    request.idempotencyKey = key.toLowerCase();
    const size = request.headers['content-length'];
    if (size !== undefined && (!/^\d+$/.test(size) || Number(size) > RECIPE_LIMITS.requestBytes)) {
      throw new RecipeError(413, 'PAYLOAD_TOO_LARGE', 'Request exceeds 128 MiB.');
    }
    if (!/^multipart\/form-data(?:\s*;|$)/i.test(request.headers['content-type'] ?? '')) {
      throw new RecipeError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Use multipart/form-data.');
    }
    request.writeDeadline = Date.now() + RECIPE_WRITE_TIMEOUT_MS;
    await consumeRecipeWrite(this.rateLimiter, request.user.id);
    return true;
  }
}

/** Throws the write timeout once the request's write deadline has passed. */
export function writeDeadlineCheck(deadline: number): () => void {
  return () => { if (Date.now() >= deadline) throw new RecipeError(504, 'TIMEOUT', 'Recipe write timed out. Retry with the same key and payload.'); };
}

@Injectable()
export class RecipeUploadSlots {
  private active = 0;
  private readonly owners = new Set<string>();
  /** A second upload from this owner returns 409 IDEMPOTENCY_IN_PROGRESS, including during bounded cleanup. */
  acquire(userId: string): () => void {
    if (this.owners.has(userId)) throw new RecipeError(409, 'IDEMPOTENCY_IN_PROGRESS', 'An upload for this account is still in progress. Retry when it settles.');
    if (this.active >= RECIPE_UPLOAD_CONCURRENCY) throw new RecipeError(503, 'SERVICE_UNAVAILABLE', 'Upload capacity reached. Try again.');
    this.active++; this.owners.add(userId);
    let released = false;
    return () => { if (!released) { released = true; this.active--; this.owners.delete(userId); } };
  }
}

/** Counts raw request bytes even when Multer has unpiped its parser and is draining. */
export function recipeBodyCounter(limit = RECIPE_LIMITS.requestBytes): (chunk: Buffer) => void {
  let received = 0;
  return (chunk) => {
    received += chunk.length;
    if (received > limit) throw new RecipeError(413, 'PAYLOAD_TOO_LARGE', 'Request exceeds 128 MiB.');
  };
}

type MulterOptions = {
  limits: { fieldSize: number; fileSize: number; files: number; fields: number; parts: number; fieldNameSize: number; fieldNestingDepth: number };
  fileFilter: (request: RecipeUploadRequest, file: Pick<RecipeFile, 'fieldname' | 'mimetype'>, callback: (error: Error | null, accept: boolean) => void) => void;
  streamHandler: (request: RecipeUploadRequest, parser: Writable) => void;
};
type Multer = (options: MulterOptions) => { any(): (request: RecipeUploadRequest, response: ServerResponse, done: (error?: unknown) => void) => void };
// Resolve the parser owned by platform-express; do not add a direct or global package dependency.
const require = createRequire(import.meta.url);
const multer: Multer = require(require.resolve('multer', { paths: [require.resolve('@nestjs/platform-express')] }));

function parserError(cause: unknown): RecipeError {
  if (cause instanceof RecipeError) return cause;
  const error = cause as { code?: unknown; field?: unknown } | null | undefined;
  const code = error?.code;
  const field = typeof error?.field === 'string' ? error.field : 'recipe';
  if (code === 'LIMIT_FILE_SIZE') return fieldError(field, IMAGE_TOO_LARGE, 413, 'PAYLOAD_TOO_LARGE');
  return new RecipeError(400, 'VALIDATION_FAILED', 'Invalid multipart recipe request.', {
    cause, fieldErrors: Object.assign(Object.create(null), { [field]: [code === 'LIMIT_FIELD_VALUE' ? 'Metadata exceeds 1 MiB.' : 'Invalid or excessive multipart parts.'] }),
  });
}

/** Stop client reuse, flush the error, then bound half-open lifetime without TCP-resetting queued upload bytes. */
function closeRejectedUpload(request: RecipeUploadRequest, response: ServerResponse): void {
  const socket = request.socket; let closed = false;
  const close = () => {
    if (closed) return;
    closed = true; socket.end();
    const timer = setTimeout(() => request.destroy(), 1000); timer.unref();
    socket.once('close', () => clearTimeout(timer));
  };
  response.setHeader('Connection', 'close');
  // Node's HTTP finish handler calls this public method for Connection: close. Its default destroys unread TCP data.
  // This connection is already rejected and paused; close gracefully, retaining the same hard destruction bound.
  socket.destroySoon = () => { close(); return socket; };
  response.once('finish', close);
}

export async function parseRecipeUpload(request: RecipeUploadRequest, response: ServerResponse, limit = RECIPE_LIMITS.requestBytes): Promise<void> {
  const seen = new Set<string>();
  await new Promise<void>((resolve, reject) => {
    let parser: Writable | undefined; let settled = false;
    const previousReadableListeners = new Set(request.listeners('readable'));
    const count = recipeBodyCounter(limit);
    const haltReading = () => {
      // A late Busboy error must not pause a keep-alive socket whose HTTP request has already finished.
      if (request.readableEnded || request.destroyed) return;
      request.unpipe();
      for (const listener of request.listeners('readable')) if (!previousReadableListeners.has(listener)) request.off('readable', listener as () => void);
      request.pause(); request.socket?.pause();
    };
    const onData = (chunk: Buffer) => { try { count(chunk); } catch (cause) { finish(cause); } };
    const finish = (cause?: unknown) => {
      if (settled) { if (cause) haltReading(); return; }
      settled = true; clearTimeout(timer);
      if (!cause) { request.off('data', onData); resolve(); return; }
      // Multer removes all Busboy listeners after abort. Attach an observer immediately before our only destroy.
      // The public error is the original rejection; never emit an error on the raw request or a counter stream.
      // Its deferred abort may install a drain after this call. Halt again on the destroy error, after that drain is installed.
      request.on('resume', haltReading);
      if (parser && !parser.destroyed) { parser.once('error', haltReading); parser.destroy(cause instanceof Error ? cause : new Error('Multipart parsing failed.')); }
      haltReading();
      if (!request.readableEnded && !request.destroyed) {
        closeRejectedUpload(request, response);
      }
      reject(parserError(cause));
    };
    const timer = setTimeout(() => finish(new RecipeError(504, 'TIMEOUT', 'Upload timed out before recipe processing. Nothing was saved.')),
      Math.max(1, (request.writeDeadline ?? Date.now() + RECIPE_WRITE_TIMEOUT_MS) - Date.now()));
    request.on('data', onData);
    request.once('close', () => { request.off('data', onData); request.off('resume', haltReading); });
    const upload = multer({
    limits: { fieldSize: RECIPE_LIMITS.metadataBytes + 1, fileSize: RECIPE_LIMITS.imageBytes, files: RECIPE_LIMITS.maxFiles,
      fields: 1, parts: RECIPE_LIMITS.maxFiles + 1, fieldNameSize: 100, fieldNestingDepth: 0 },
    fileFilter: (_request, file, callback) => {
      if (!/^(cover|step-(?:[0-9]|[1-9][0-9]))$/.test(file.fieldname) || seen.has(file.fieldname)) {
        const error = fieldError(file.fieldname, 'Unexpected or repeated image field.'); callback(error, false); finish(error); return;
      }
      seen.add(file.fieldname);
      if (!RECIPE_IMAGE_MIME_TYPES.some((mime) => mime === file.mimetype)) {
        const error = fieldError(file.fieldname, 'Use JPEG, PNG or static WebP.', 415, 'UNSUPPORTED_MEDIA_TYPE'); callback(error, false); finish(error); return;
      }
      callback(null, true);
    },
    streamHandler: (_request, busboy) => {
      parser = busboy;
      busboy.on('field', (field: string) => { if (field !== 'recipe') finish(fieldError('recipe', 'Only the recipe metadata field is allowed.')); });
      busboy.on('error', finish);
      for (const event of ['partsLimit', 'filesLimit', 'fieldsLimit']) busboy.on(event, () => finish(fieldError('recipe', 'Invalid or excessive multipart parts.')));
      busboy.on('file', (field: string, file: Writable) => file.once('limit', () => finish(fieldError(field, IMAGE_TOO_LARGE, 413, 'PAYLOAD_TOO_LARGE'))));
      // Preserve Multer's default pipe topology so req.unpipe(busboy) works on every abort path.
      request.pipe(busboy);
    },
  }).any();
    upload(request, response, finish);
  });
}

@Injectable()
export class RecipeUploadInterceptor implements NestInterceptor {
  constructor(private readonly slots: RecipeUploadSlots) {}
  async intercept(context: ExecutionContext, next: CallHandler) {
    const request = context.switchToHttp().getRequest<RecipeUploadRequest>();
    const release = this.slots.acquire(request.user!.id);
    try { await parseRecipeUpload(request, context.switchToHttp().getResponse<ServerResponse>()); }
    catch (error) { release(); throw error; }
    return next.handle().pipe(finalize(() => {
      if (!request.writeSettled) { release(); return; }
      // Bound retention even if a driver or cleanup promise never settles. Durable attempts fence later writes.
      const timer = setTimeout(release, Math.max(1, request.writeDeadline! + RECIPE_BACKGROUND_TIMEOUT_MS - Date.now()));
      timer.unref();
      const settled = () => { clearTimeout(timer); release(); };
      void request.writeSettled.then(settled, settled);
    }));
  }
}
