import { Readable } from 'node:stream';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { once } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { RECIPE_LIMITS } from '@recipe-app/contracts/types';
import { parsePhotoUpload, PHOTO_UPLOAD, readRecipeJson, recipeBodyCounter, RecipeUploadSlots, RecipeUploadInterceptor } from './recipe-upload.js';
import type { RecipeUploadRequest } from './recipe-upload.js';
import { RecipeError } from './recipe-errors.js';
import { rawRecipeRequest } from './testing/recipe-http.js';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';

const rejectedPart = Buffer.from('--verification-boundary\r\nContent-Disposition: form-data; name="photo"; filename="bad.gif"\r\nContent-Type: image/gif\r\n\r\nGIF89a');
const photoPart = Buffer.from('--verification-boundary\r\nContent-Disposition: form-data; name="photo"; filename="photo.jpg"\r\nContent-Type: image/jpeg\r\n\r\n');

type FirstConnection = { answered: Promise<void>; closed: Promise<void> };

type Reader = (request: RecipeUploadRequest, response: Parameters<typeof parsePhotoUpload>[1]) => Promise<void>;
const photoReader = (limit: number): Reader => (request, response) => parsePhotoUpload(request, response, { ...PHOTO_UPLOAD, requestBytes: limit });

async function parserServer(test: (url: string, received: () => number, first: FirstConnection) => Promise<void>, read: Reader = photoReader(4096)) {
  let received = 0; let markAnswered = () => {}; let markClosed = () => {};
  const first: FirstConnection = { answered: new Promise((resolve) => { markAnswered = resolve; }), closed: new Promise((resolve) => { markClosed = resolve; }) };
  const server = createServer((req, res) => {
    res.once('finish', markAnswered); req.socket.once('close', markClosed);
    req.on('data', (chunk: Buffer) => { received += chunk.length; });
    const request = req as RecipeUploadRequest; request.writeDeadline = Date.now() + 150;
    void read(request, res).then(() => { res.end('{}'); }, (cause: unknown) => {
      res.statusCode = cause instanceof RecipeError ? cause.getStatus() : 500;
      res.end(JSON.stringify(cause instanceof RecipeError ? cause.getResponse() : { code: 'UNKNOWN' }));
    });
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  try { await test(`http://127.0.0.1:${(server.address() as AddressInfo).port}`, () => received, first); }
  finally { server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve())); }
}

const multipartHeaders = { 'Content-Type': 'multipart/form-data; boundary=verification-boundary', 'Transfer-Encoding': 'chunked' };

describe('Upload admission and wire byte bound', () => {
  it('marks early rejection connections as closed so fetch cannot reuse them', async () => {
    await parserServer(async (url) => {
      const body = new FormData(); body.append('photo', new Blob(['GIF89a'], { type: 'image/gif' }), 'bad.gif');
      const response = await fetch(url, { method: 'POST', body });
      expect(response.status).toBe(415); expect(response.headers.get('connection')).toBe('close');
      expect((await response.json()).code).toBe('UNSUPPORTED_MEDIA_TYPE');
    });
  });
  it('survives a rejected part whose body never finishes and returns its error promptly', async () => {
    await parserServer(async (url) => {
      const response = await rawRecipeRequest(url, multipartHeaders, [rejectedPart], false);
      expect(response.status).toBe(415);
      expect(JSON.parse(response.body).code).toBe('UNSUPPORTED_MEDIA_TYPE');
      await new Promise((resolve) => setTimeout(resolve, 200));
      const next = await rawRecipeRequest(url, multipartHeaders, [Buffer.from('--verification-boundary--\r\n')]);
      expect(next.status).toBeLessThan(500);
    });
  });
  it('survives overflow after a multer abort without buffering the rest of a chunked body', async () => {
    await parserServer(async (url, received, { answered, closed }) => {
      let written = 0;
      async function* chunks() {
        yield rejectedPart;
        // The overflow starts only once the server has answered, so it always follows the abort.
        await answered;
        // The writer asks for the next chunk only after writing this one.
        for (let i = 0; i < 1000; i++) { yield Buffer.alloc(1024); written++; }
      }
      const response = await rawRecipeRequest(url, multipartHeaders, chunks());
      expect(response.status).toBe(415); expect(JSON.parse(response.body).code).toBe('UNSUPPORTED_MEDIA_TYPE');
      // The client wrote more than the 4096-byte limit after the answer.
      expect(written).toBeGreaterThan(4);
      // A server still reading the body reads every sent byte before its socket closes; a halted one closes after its 1 s bound.
      await closed;
      expect(received()).toBe(rejectedPart.length);
    });
  });
  it('bounds raw chunked bytes while parser is active', async () => {
    await parserServer(async (url) => {
      const response = await rawRecipeRequest(url, multipartHeaders, [photoPart, Buffer.alloc(8192)]);
      expect(response.status).toBe(413); expect(JSON.parse(response.body).code).toBe('PAYLOAD_TOO_LARGE');
    });
  });
  it('delivers 413 while the client still has a large chunk queued', async () => {
    await parserServer(async (url, received) => {
      const response = await rawRecipeRequest(url, multipartHeaders, [photoPart, Buffer.alloc(5 * 1024 * 1024)]);
      expect(response.status).toBe(413); expect(JSON.parse(response.body).code).toBe('PAYLOAD_TOO_LARGE');
      expect(received()).toBeLessThanOrEqual(4096 + 65536);
    });
  });
  it('refuses a JSON save body past 1 MiB while it arrives, and stops reading the rest', async () => {
    await parserServer(async (url, received, { closed }) => {
      const response = await rawRecipeRequest(url, { 'Content-Type': 'application/json', 'Transfer-Encoding': 'chunked' },
        (function* () { for (let i = 0; i < 64; i++) yield Buffer.alloc(64 * 1024, 32); })());
      expect(response.status).toBe(413); expect(JSON.parse(response.body).code).toBe('PAYLOAD_TOO_LARGE');
      await closed;
      expect(received()).toBeLessThan(2 * RECIPE_LIMITS.metadataBytes);
    }, readRecipeJson);
  });
  it('limits each owner to one slot and frees it exactly once', () => {
    const slots = new RecipeUploadSlots();
    const release = slots.acquire('owner');
    expect(() => slots.acquire('owner')).toThrowError(expect.objectContaining({ response: expect.objectContaining({ code: 'IDEMPOTENCY_IN_PROGRESS' }) }));
    const other = slots.acquire('other'); other(); release(); release(); slots.acquire('owner')();
  });
  it('releases a hung background write after a bounded post-deadline interval', async () => {
    vi.useFakeTimers();
    try {
      const slots = new RecipeUploadSlots(); const interceptor = new RecipeUploadInterceptor(slots);
      const request = Readable.from([Buffer.from('{}')]) as RecipeUploadRequest;
      request.headers = { 'content-type': 'application/json', 'content-length': '2' };
      request.user = { id: 'owner' } as RecipeUploadRequest['user'];
      request.writeDeadline = Date.now() + 30_000; request.writeSettled = new Promise(() => {});
      const context = { switchToHttp: () => ({ getRequest: () => request, getResponse: () => ({}) }) } as ExecutionContext;
      await lastValueFrom(await interceptor.intercept(context, { handle: () => of(null) } as CallHandler));
      await vi.advanceTimersByTimeAsync(60_001);
      const releases = Array.from({ length: 4 }, (_, i) => slots.acquire(`other-${i}`));
      releases.forEach((release) => release());
    } finally { vi.useRealTimers(); }
  });
  it('accepts exactly one photo request but rejects one extra chunk byte before forwarding it', async () => {
    const chunk = Buffer.alloc(64 * 1024);
    async function count(extra: boolean) {
      const input = Readable.from((function* () { for (let i = 0; i < 65; i++) yield chunk; if (extra) yield Buffer.from([1]); })());
      const countBytes = recipeBodyCounter(PHOTO_UPLOAD); let bytes = 0;
      for await (const part of input) { countBytes(part as Buffer); bytes += (part as Buffer).length; }
      return bytes;
    }
    expect(await count(false)).toBe(RECIPE_LIMITS.photoRequestBytes);
    await expect(count(true)).rejects.toMatchObject({ response: { code: 'PAYLOAD_TOO_LARGE' } });
  });
  it('admits four uploads and releases slots exactly once', () => {
    const slots = new RecipeUploadSlots(); const releases = Array.from({ length: 4 }, (_, i) => slots.acquire(`owner-${i}`));
    expect(() => slots.acquire('extra')).toThrow(); releases[0](); releases[0]();
    const release = slots.acquire('extra'); expect(() => slots.acquire('another')).toThrow(); release(); releases.forEach((release) => release());
  });
});
