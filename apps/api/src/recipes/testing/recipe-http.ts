import { once } from 'node:events';
import { request } from 'node:http';

/** Sends chunked bodies or headers only, without logging request/response headers or bodies. */
export async function rawRecipeRequest(url: string, headers: Record<string, string>, chunks?: Iterable<Buffer> | AsyncIterable<Buffer>, endBody = true): Promise<{ status: number; body: string }> {
  let failed = false;
  let responded = false;
  const req = request(url, { method: 'POST', headers });
  const response = new Promise<{ status: number; body: string }>((resolve, reject) => {
    req.once('error', (cause: NodeJS.ErrnoException) => {
      failed = true;
      const code = cause.code && /^[A-Z_]{1,30}$/.test(cause.code) ? cause.code : 'UNKNOWN';
      if (!responded) reject(new Error(`Disposable HTTP transport failed (${code}, response=${responded}).`));
    });
    req.once('response', (res) => {
      responded = true;
      const buffers: Buffer[] = [];
      res.on('data', (chunk: Buffer) => buffers.push(chunk));
      res.on('error', () => reject(new Error('Disposable HTTP response failed.')));
      res.on('end', () => { failed = true; req.destroy(); resolve({ status: res.statusCode ?? 0, body: Buffer.concat(buffers).toString('utf8') }); });
    });
  });
  req.flushHeaders();
  if (chunks) {
    const write = async () => {
      try {
        for await (const chunk of chunks) {
          if (failed) return;
          if (!req.write(chunk)) await once(req, 'drain');
        }
        if (endBody) req.end();
      } catch { failed = true; req.destroy(); }
    };
    void write();
  }
  return response;
}
