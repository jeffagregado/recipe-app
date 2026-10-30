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

type BodyLimit = { requestBytes: number; tooLarge: string };

/** What one multipart photo upload may carry: its byte limit, the file fields it accepts and the field request-level problems are reported on. */
export type UploadShape = BodyLimit & { files: number; fileField: RegExp; field: string };

/** One photo per request, so every upload stays under Vercel's 4.5 MB request limit (ADR 0005). */
export const PHOTO_UPLOAD: UploadShape = {
  requestBytes: RECIPE_LIMITS.photoRequestBytes, tooLarge: 'Request exceeds one photo.', files: 1, fileField: /^photo$/, field: 'photo',
};

/** A recipe save is JSON metadata that names its photos and never carries one. */
const RECIPE_SAVE: BodyLimit = { requestBytes: RECIPE_LIMITS.metadataBytes, tooLarge: 'Recipe exceeds 1 MiB.' };

export type RecipeUploadRequest = AuthRequest & {
  /** A save's JSON body as received, read once the guards have passed. */
  recipeJson?: string; files?: RecipeFile[]; idempotencyKey?: string;
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
    admitBody(request, RECIPE_SAVE, /^application\/json(?:\s*;|$)/i, 'Send the recipe as application/json.');
    await consumeRecipeWrite(this.rateLimiter, request.user.id);
    return true;
  }
}

/** Refuses a declared size over the shape's limit and any body that is not multipart before a byte of it is read; starts the write deadline. */
export function checkMultipartHeaders(request: RecipeUploadRequest, shape: UploadShape): void {
  admitBody(request, shape, /^multipart\/form-data(?:\s*;|$)/i, 'Use multipart/form-data.');
}

function admitBody(request: RecipeUploadRequest, { requestBytes, tooLarge }: BodyLimit, type: RegExp, typeMessage: string): void {
  const size = request.headers['content-length'];
  if (size !== undefined && (!/^\d+$/.test(size) || Number(size) > requestBytes)) {
    throw new RecipeError(413, 'PAYLOAD_TOO_LARGE', tooLarge);
  }
  if (!type.test(request.headers['content-type'] ?? '')) throw new RecipeError(415, 'UNSUPPORTED_MEDIA_TYPE', typeMessage);
  request.writeDeadline = Date.now() + RECIPE_WRITE_TIMEOUT_MS;
}

/** Throws the write timeout once the request's write deadline has passed. */
export function writeDeadlineCheck(deadline: number): () => void {
  return () => { if (Date.now() >= deadline) throw new RecipeError(504, 'TIMEOUT', 'Recipe write timed out. Retry with the same key and payload.'); };
}

@Injectable()
export class RecipeUploadSlots {
  private active = 0;
  private readonly owners = new Map<string, number>();
  /** An upload beyond `perOwner` running for this owner returns 409 IDEMPOTENCY_IN_PROGRESS, including during bounded cleanup. */
  acquire(userId: string, perOwner = 1): () => void {
    const held = this.owners.get(userId) ?? 0;
    if (held >= perOwner) throw new RecipeError(409, 'IDEMPOTENCY_IN_PROGRESS', 'An upload for this account is still in progress. Retry when it settles.');
    if (this.active >= RECIPE_UPLOAD_CONCURRENCY) throw new RecipeError(503, 'SERVICE_UNAVAILABLE', 'Upload capacity reached. Try again.');
    this.active++; this.owners.set(userId, held + 1);
    let released = false;
    return () => {
      if (released) return;
      released = true; this.active--;
      const left = (this.owners.get(userId) ?? 1) - 1;
      if (left > 0) this.owners.set(userId, left); else this.owners.delete(userId);
    };
  }
}

/** Counts raw request bytes, including while Multer has unpiped its parser and is draining. */
export function recipeBodyCounter({ requestBytes, tooLarge }: BodyLimit): (chunk: Buffer) => void {
  let received = 0;
  return (chunk) => {
    received += chunk.length;
    if (received > requestBytes) throw new RecipeError(413, 'PAYLOAD_TOO_LARGE', tooLarge);
  };
}

type MulterOptions = {
  limits: { fileSize: number; files: number; fields: number; parts: number; fieldNameSize: number; fieldNestingDepth: number };
  fileFilter: (request: RecipeUploadRequest, file: Pick<RecipeFile, 'fieldname' | 'mimetype'>, callback: (error: Error | null, accept: boolean) => void) => void;
  streamHandler: (request: RecipeUploadRequest, parser: Writable) => void;
};
type Multer = (options: MulterOptions) => { any(): (request: RecipeUploadRequest, response: ServerResponse, done: (error?: unknown) => void) => void };
// Resolve the parser owned by platform-express; do not add a direct or global package dependency.
const require = createRequire(import.meta.url);
const multer: Multer = require(require.resolve('multer', { paths: [require.resolve('@nestjs/platform-express')] }));

function parserError(cause: unknown, fallbackField: string): RecipeError {
  if (cause instanceof RecipeError) return cause;
  const error = cause as { code?: unknown; field?: unknown } | null | undefined;
  const field = typeof error?.field === 'string' ? error.field : fallbackField;
  if (error?.code === 'LIMIT_FILE_SIZE') return fieldError(field, IMAGE_TOO_LARGE, 413, 'PAYLOAD_TOO_LARGE');
  return new RecipeError(400, 'VALIDATION_FAILED', 'Invalid photo upload.', {
    cause, fieldErrors: Object.assign(Object.create(null), { [field]: ['Invalid or excessive multipart parts.'] }),
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

const uploadTimeout = (request: RecipeUploadRequest) => Math.max(1, (request.writeDeadline ?? Date.now() + RECIPE_WRITE_TIMEOUT_MS) - Date.now());
const notReceived = () => new RecipeError(504, 'TIMEOUT', 'The request timed out before it was read. Nothing was saved.');

/** Reads a save's JSON body once the guards have passed, counting bytes as they arrive: more than 1 MiB is refused without reading the rest. */
export function readRecipeJson(request: RecipeUploadRequest, response: ServerResponse): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const count = recipeBodyCounter(RECIPE_SAVE); const chunks: Buffer[] = []; let settled = false;
    const finish = (cause?: unknown) => {
      if (settled) return;
      settled = true; clearTimeout(timer); request.off('data', onData);
      if (!cause) { request.recipeJson = Buffer.concat(chunks).toString('utf8'); resolve(); return; }
      if (!request.readableEnded && !request.destroyed) { request.pause(); closeRejectedUpload(request, response); }
      reject(cause instanceof RecipeError ? cause : new RecipeError(400, 'VALIDATION_FAILED', 'The recipe could not be read.', { cause }));
    };
    const onData = (chunk: Buffer) => { try { count(chunk); chunks.push(chunk); } catch (cause) { finish(cause); } };
    const timer = setTimeout(() => finish(notReceived()), uploadTimeout(request));
    request.on('data', onData);
    request.once('end', () => finish());
    request.once('error', finish);
    request.once('close', () => finish(new Error('The request closed before the recipe was read.')));
  });
}

/** Reads one multipart photo upload with Multer, bounding its bytes and parts. */
export async function parsePhotoUpload(request: RecipeUploadRequest, response: ServerResponse, shape: UploadShape = PHOTO_UPLOAD): Promise<void> {
  const seen = new Set<string>();
  await new Promise<void>((resolve, reject) => {
    let parser: Writable | undefined; let settled = false;
    const previousReadableListeners = new Set(request.listeners('readable'));
    const count = recipeBodyCounter(shape);
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
      reject(parserError(cause, shape.field));
    };
    const timer = setTimeout(() => finish(notReceived()), uploadTimeout(request));
    request.on('data', onData);
    request.once('close', () => { request.off('data', onData); request.off('resume', haltReading); });
    const upload = multer({
    limits: { fileSize: RECIPE_LIMITS.imageBytes, files: shape.files, fields: 0, parts: shape.files, fieldNameSize: 100, fieldNestingDepth: 0 },
    fileFilter: (_request, file, callback) => {
      if (!shape.fileField.test(file.fieldname) || seen.has(file.fieldname)) {
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
      busboy.on('field', () => finish(fieldError(shape.field, 'Send only the photo.')));
      busboy.on('error', finish);
      for (const event of ['partsLimit', 'filesLimit', 'fieldsLimit']) busboy.on(event, () => finish(fieldError(shape.field, 'Invalid or excessive multipart parts.')));
      busboy.on('file', (field: string, file: Writable) => file.once('limit', () => finish(fieldError(field, IMAGE_TOO_LARGE, 413, 'PAYLOAD_TOO_LARGE'))));
      // Preserve Multer's default pipe topology so req.unpipe(busboy) works on every abort path.
      request.pipe(busboy);
    },
  }).any();
    upload(request, response, finish);
  });
}

/** Holds an upload slot while the body is read and until the write settles. A save reads its JSON; the photo upload overrides `read`. */
@Injectable()
export class RecipeUploadInterceptor implements NestInterceptor {
  /** Uploads one owner may run at once. */
  protected readonly perOwner: number = 1;
  constructor(private readonly slots: RecipeUploadSlots) {}
  protected read(request: RecipeUploadRequest, response: ServerResponse): Promise<void> { return readRecipeJson(request, response); }
  async intercept(context: ExecutionContext, next: CallHandler) {
    const request = context.switchToHttp().getRequest<RecipeUploadRequest>();
    const release = this.slots.acquire(request.user!.id, this.perOwner);
    try { await this.read(request, context.switchToHttp().getResponse<ServerResponse>()); }
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
