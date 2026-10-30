import type { AddressInfo } from 'node:net';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { describe, expect, it, vi } from 'vitest';
import { AUTH } from './auth.tokens.js';
import { mountAuth } from './auth.http.js';

describe('Native auth HTTP boundary', () => {
  it('rejects HEAD and preflight bypasses, with no cookies and private error responses', async () => {
    const handler = vi.fn(() => new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } }));
    const module = await Test.createTestingModule({ providers: [
      { provide: AUTH, useValue: { handler } },
      { provide: ConfigService, useValue: { get: (key: string) => ({ AUTH_TRUSTED_ORIGINS: ['http://localhost:3000'] })[key] } },
    ] }).compile();
    const app = module.createNestApplication<NestExpressApplication>({ logger: false, bodyParser: false });
    mountAuth(app);
    try {
      await app.listen(0, '127.0.0.1');
      const url = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
      for (const [path, method] of [['/api/auth/sign-in/email', 'OPTIONS'], ['/api/auth/ok', 'HEAD'], ['/api/auth/ok', 'POST'], ['/api/auth/get-session', 'GET']] as const) {
        const response = await fetch(`${url}${path}`, { method, headers: { Origin: 'http://localhost:3000', 'Access-Control-Request-Method': 'POST' } });
        expect(response.status).toBe(404);
        expect(response.headers.getSetCookie()).toEqual([]);
        expect(response.headers.get('cache-control')).toBe('private, no-store');
      }
      expect(handler).not.toHaveBeenCalled();
      const health = await fetch(`${url}/api/auth/ok`, { headers: { Origin: 'http://localhost:3000' } });
      expect(health.status).toBe(200);
      expect(health.headers.get('access-control-allow-origin')).toBe('http://localhost:3000');
      expect(health.headers.get('cache-control')).toBe('private, no-store');
      expect(handler).toHaveBeenCalledOnce();
      // Only configured origins are allowed, never a built-in sibling such as another local port.
      const untrusted = await fetch(`${url}/api/auth/ok`, { headers: { Origin: 'http://127.0.0.1:4100' } });
      expect(untrusted.headers.get('access-control-allow-origin')).toBeNull();
    } finally { await app.close(); }
  });
});
