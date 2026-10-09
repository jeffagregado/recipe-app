import type { IncomingMessage, ServerResponse } from 'node:http';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { toNodeHandler } from 'better-auth/node';
import type { Environment } from '../config/environment.js';
import { AUTH } from './auth.tokens.js';
import type { RecipeAuth } from './auth.js';

/** Only native health remains public; wrappers own all credential and session operations. */
export function mountAuth(app: NestExpressApplication): void {
  const express = app.getHttpAdapter().getInstance();
  express.set('trust proxy', 'loopback');
  app.use((_request: IncomingMessage, response: ServerResponse, next: () => void) => {
    response.setHeader('Cache-Control', 'private, no-store');
    next();
  });
  // Reject native paths before CORS can answer their OPTIONS preflight with a success status.
  app.use((request: IncomingMessage, response: ServerResponse, next: () => void) => {
    const path = request.url?.split('?')[0];
    if (path !== '/api/auth' && !path?.startsWith('/api/auth/')) { next(); return; }
    if (request.method === 'GET' && path === '/api/auth/ok') { next(); return; }
    response.statusCode = 404;
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({ message: 'Not found.' }));
  });
  app.enableCors({ origin: app.get<ConfigService<Environment, true>>(ConfigService).get('AUTH_TRUSTED_ORIGINS', { infer: true }), credentials: true });
  express.get('/api/auth/ok', toNodeHandler(app.get<RecipeAuth>(AUTH)));
  app.useBodyParser('json', { limit: '8kb', type: (request: IncomingMessage) => {
    // Recipe create and update own their multipart boundary; even malformed/large JSON must reach their guards and 415 response.
    if (request.method === 'POST' && /^\/recipes\/?(?:\?|$)/.test(request.url ?? '')) return false;
    if (request.method === 'PATCH' && /^\/recipes\/[^/?]+\/?(?:\?|$)/.test(request.url ?? '')) return false;
    return /^application\/json(?:\s*;|$)/i.test(request.headers['content-type'] ?? '');
  } });
  app.use((error: unknown, _request: IncomingMessage, response: ServerResponse, next: (error: unknown) => void) => {
    const type = error && typeof error === 'object' && 'type' in error ? error.type : undefined;
    if (type !== 'entity.too.large' && type !== 'entity.parse.failed') { next(error); return; }
    response.statusCode = type === 'entity.too.large' ? 413 : 400;
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify(type === 'entity.too.large'
      ? { code: 'PAYLOAD_TOO_LARGE', message: 'JSON body exceeds 8 KiB.' }
      : { code: 'VALIDATION_FAILED', message: 'Malformed JSON body.' }));
  });
}
