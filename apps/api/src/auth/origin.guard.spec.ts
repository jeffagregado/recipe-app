import type { ConfigService } from '@nestjs/config';
import type { ExecutionContext } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import type { Environment } from '../config/environment.js';
import { OriginGuard } from './origin.guard.js';

const guard = (origins: string[]) => new OriginGuard({ get: () => origins } as unknown as ConfigService<Environment, true>);
const contextFor = (origin?: string) => ({ switchToHttp: () => ({ getRequest: () => ({ headers: origin === undefined ? {} : { origin } }) }) }) as ExecutionContext;
const rejection = { status: 403, response: expect.objectContaining({ code: 'ORIGIN_REJECTED' }) };

describe('OriginGuard', () => {
  const trusted = guard(['https://app.example.com']);

  it('allows only exact configured origins', () => {
    expect(trusted.canActivate(contextFor('https://app.example.com'))).toBe(true);
  });

  it.each([undefined, 'null', '', 'http://localhost:3000', 'http://127.0.0.1:4100', 'https://app.example.com/', 'https://app.example.com.evil.example', 'https://APP.example.com'])(
    'answers 403 ORIGIN_REJECTED for %j', (origin) => {
      expect(() => trusted.canActivate(contextFor(origin))).toThrow(expect.objectContaining(rejection));
    });
});
