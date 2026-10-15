import { Readable } from 'node:stream';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { once } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { RECIPE_LIMITS } from '@recipe-app/contracts/types';
import { parseRecipeUpload, recipeBodyCounter, RecipeUploadSlots, RecipeUploadInterceptor } from './recipe-upload.js';
import type { RecipeUploadRequest } from './recipe-upload.js';
import { RecipeError } from './recipe-errors.js';
import { rawRecipeRequest } from './testing/recipe-http.js';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';

const rejectedPart = Buffer.from('--verification-boundary\r\nContent-Disposition: form-data; name="cover"; filename="bad.gif"\r\nContent-Type: image/gif\r\n\r\nGIF89a');

type FirstConnection = { answered: Promise<void>; closed: Promise<void> };

async function parserServer(test: (url: string, received: () => number, first: FirstConnection) => Promise<void>, limit = 4096) {
  let received = 0; let markAnswered = () => {}; let markClosed = () => {};
  const first: FirstConnection = { answered: new Promise((resolve) => { markAnswered = resolve; }), closed: new Promise((resolve) => { markClosed = resolve; }) };
  const server = createServer((req, res) => {
    res.once('finish', markAnswered); req.socket.once('close', markClosed);
    req.on('data', (chunk: Buffer) => { received += chunk.length; });
    const request = req as RecipeUploadRequest; request.writeDeadline = Date.now() + 150;
    void parseRecipeUpload(request, res, limit).then(() => { res.end('{}'); }, (cause: unknown) => {
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
      const body = new FormData(); body.append('cover', new Blob(['GIF89a'], { type: 'image/gif' }), 'bad.gif');
      const response = await fetch(url, { method: 'POST', body });
      expect(response.status).toBe(415); expect(response.headers.get('connection')).toBe('close');
      expect((await response.json()).code).toBe('UNSUPPORTED_MEDIA_TYPE');
    });
  });
  it('does not pause a reusable socket after a fully drained metadata rejection', async () => {
    const bytes = Buffer.from(`--verification-boundary\r\nContent-Disposition: form-data; name="recipe"\r\n\r\n${'x'.repeat(RECIPE_LIMITS.metadataBytes + 1)}\r\n--verification-boundary--\r\n`);
    const request = Readable.from([bytes]) as unknown as RecipeUploadRequest;
    request.headers = { 'Content-Type': multipartHeaders['Content-Type'], 'content-type': multipartHeaders['Content-Type'], 'content-length': String(bytes.length) };
    request.writeDeadline = Date.now() + 1000;
    const pause = vi.fn(); request.socket = { pause } as unknown as RecipeUploadRequest['socket'];
    await expect(parseRecipeUpload(request, {} as Parameters<typeof parseRecipeUpload>[1])).rejects.toMatchObject({ response: { code: 'VALIDATION_FAILED' } });
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(request.readableEnded).toBe(true); expect(pause).not.toHaveBeenCalled();
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
      const first = Buffer.from('--verification-boundary\r\nContent-Disposition: form-data; name="recipe"\r\n\r\n');
      const response = await rawRecipeRequest(url, multipartHeaders, [first, Buffer.alloc(8192)]);
      expect(response.status).toBe(413); expect(JSON.parse(response.body).code).toBe('PAYLOAD_TOO_LARGE');
    });
  });
  it('delivers 413 while the client still has a large chunk queued', async () => {
    await parserServer(async (url, received) => {
      const first = Buffer.from('--verification-boundary\r\nContent-Disposition: form-data; name="recipe"\r\n\r\n');
      const response = await rawRecipeRequest(url, multipartHeaders, [first, Buffer.alloc(5 * 1024 * 1024)]);
      expect(response.status).toBe(413); expect(JSON.parse(response.body).code).toBe('PAYLOAD_TOO_LARGE');
      expect(received()).toBeLessThanOrEqual(4096 + 65536);
    });
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
      const request = Readable.from([Buffer.from('--verification-boundary--\r\n')]) as RecipeUploadRequest;
      request.headers = { ...multipartHeaders, 'content-length': '27' };
      request.user = { id: 'owner' } as RecipeUploadRequest['user'];
      request.writeDeadline = Date.now() + 30_000; request.writeSettled = new Promise(() => {});
      const context = { switchToHttp: () => ({ getRequest: () => request, getResponse: () => ({}) }) } as ExecutionContext;
      await lastValueFrom(await interceptor.intercept(context, { handle: () => of(null) } as CallHandler));
      await vi.advanceTimersByTimeAsync(60_001);
      const releases = Array.from({ length: 4 }, (_, i) => slots.acquire(`other-${i}`));
      releases.forEach((release) => release());
    } finally { vi.useRealTimers(); }
  });
  it('accepts exactly 128 MiB but rejects one extra chunk byte before forwarding it', async () => {
    const chunk = Buffer.alloc(1024 * 1024);
    async function count(extra: boolean) {
      const input = Readable.from((function* () { for (let i = 0; i < 128; i++) yield chunk; if (extra) yield Buffer.from([1]); })());
      const countBytes = recipeBodyCounter(); let bytes = 0;
      for await (const part of input) { countBytes(part as Buffer); bytes += (part as Buffer).length; }
      return bytes;
    }
    expect(await count(false)).toBe(RECIPE_LIMITS.requestBytes);
    await expect(count(true)).rejects.toMatchObject({ response: { code: 'PAYLOAD_TOO_LARGE' } });
  });
  it('admits four uploads and releases slots exactly once', () => {
    const slots = new RecipeUploadSlots(); const releases = Array.from({ length: 4 }, (_, i) => slots.acquire(`owner-${i}`));
    expect(() => slots.acquire('extra')).toThrow(); releases[0](); releases[0]();
    const release = slots.acquire('extra'); expect(() => slots.acquire('another')).toThrow(); release(); releases.forEach((release) => release());
  });
});
