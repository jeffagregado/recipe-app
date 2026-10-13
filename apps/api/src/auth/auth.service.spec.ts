import { Logger } from '@nestjs/common';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ExecutionContext } from '@nestjs/common';
import { APIError } from 'better-auth/api';
import { describe, expect, it, vi } from 'vitest';
import type { ResilienceService } from '@nestjs/resilience';
import type { DrizzleDb } from '../database/database.service.js';
import type { RecipeAuth } from './auth.js';
import { AuthService } from './auth.service.js';
import { AuthController } from './auth.controller.js';
import { AuthRateLimiter } from './auth.rate-limit.js';
import { SessionGuard } from './session.guard.js';

function harness() {
  const getSession = vi.fn();
  const signOut = vi.fn().mockResolvedValue({ headers: new Headers({ 'set-cookie': 'better-auth.session_token=; Max-Age=0' }) });
  const signUpEmail = vi.fn();
  const findSession = vi.fn();
  const findUser = vi.fn();
  const auth = { api: { getSession, signOut, signUpEmail }, $context: Promise.resolve({ authCookies: { sessionToken: { name: 'better-auth.session_token' } } }) } as unknown as RecipeAuth;
  const send = vi.fn();
  const db = {
    query: { authSessions: { findFirst: findSession }, users: { findFirst: findUser } },
    delete: () => ({ where: () => Promise.resolve() }), insert: () => ({ values: () => Promise.resolve() }),
  } as unknown as DrizzleDb;
  const resilience = { preset: () => ({ execute: (fn: () => unknown) => fn() }) } as unknown as ResilienceService;
  const service = new AuthService(auth, db, resilience, { send });
  const request = { headers: {}, ip: '127.0.0.1' } as IncomingMessage & { ip: string };
  return { service, request, getSession, signOut, signUpEmail, findSession, findUser, send };
}

describe('Auth dependency failure boundaries', () => {
  it('reports session storage failure as 503 through session and guard, never 401', async () => {
    const { service, request, getSession } = harness();
    getSession.mockRejectedValue(new APIError('INTERNAL_SERVER_ERROR', { code: 'FAILED_TO_GET_SESSION', message: 'Storage unavailable' }));
    await expect(service.session(request)).rejects.toMatchObject({ status: 503 });
    const context = { switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext;
    await expect(new SessionGuard(service).canActivate(context)).rejects.toMatchObject({ status: 503 });
  });

  it.each(['row remains', 'confirmation fails'])('fails logout when %s and forwards no expiry cookie', async (failure) => {
    const { service, request, getSession, findSession } = harness();
    getSession.mockResolvedValue({ session: { token: 'unit-session' } });
    if (failure === 'row remains') findSession.mockResolvedValue({ id: 'unit-session-id' });
    else findSession.mockRejectedValue(new Error('Storage unavailable'));
    const response = { setHeader: vi.fn() };
    const limiter = { consume: vi.fn() } as unknown as AuthRateLimiter;
    const controller = new AuthController(service, limiter);
    await expect(controller.logout({}, request, response as unknown as ServerResponse)).rejects.toMatchObject({ status: 503 });
    expect(response.setHeader).not.toHaveBeenCalled();
  });

  it.each([true, false])('maps generic signup 422 to conflict only when confirmed (%s)', async (exists) => {
    const { service, request, signUpEmail, findUser } = harness();
    signUpEmail.mockRejectedValue(new APIError('UNPROCESSABLE_ENTITY', { code: 'FAILED_TO_CREATE_USER', message: 'Creation failed' }));
    findUser.mockResolvedValue(exists ? { id: 'unit-user' } : undefined);
    await expect(service.signup({ displayName: 'Unit User', email: 'unit@example.invalid', password: 'unit-password-123' }, request, 'http://localhost:3000'))
      .rejects.toMatchObject({ status: exists ? 409 : 503 });
  });
});

describe('Auth failure logging', () => {
  const cookie = 'secret-cookie-value-123';
  const email = 'logged@example.invalid';

  function captureLogs() {
    const lines: string[] = [];
    const spy = vi.spyOn(Logger.prototype, 'error').mockImplementation((message: unknown) => { lines.push(String(message)); });
    return { lines, restore: () => spy.mockRestore() };
  }

  const leaky = () => Object.assign(new Error(`insert ${email} ${cookie}`), { code: '08006' });

  it('logs the guard storage failure with a session-guard label and no sensitive text', async () => {
    const { service, request, getSession } = harness();
    const logs = captureLogs();
    try {
      getSession.mockRejectedValue(leaky());
      const context = { switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext;
      await expect(new SessionGuard(service).canActivate(context)).rejects.toMatchObject({ status: 503 });
      expect(logs.lines).toHaveLength(1);
      expect(logs.lines[0]).toContain('session-guard');
      expect(logs.lines[0]).toContain('Error');
      expect(logs.lines[0]).toContain('08006');
      expect(logs.lines[0]).not.toContain(cookie);
      expect(logs.lines[0]).not.toContain(email);
    } finally { logs.restore(); }
  });

  it('logs logout confirmation failure with its own label and no sensitive text', async () => {
    const { service, request, getSession, findSession } = harness();
    const logs = captureLogs();
    try {
      getSession.mockResolvedValue({ session: { token: cookie } });
      findSession.mockRejectedValue(leaky());
      await expect(service.logout(request)).rejects.toMatchObject({ status: 503 });
      expect(logs.lines).toHaveLength(1);
      expect(logs.lines[0]).toContain('logout-confirm');
      expect(logs.lines[0]).not.toContain(cookie);
      expect(logs.lines[0]).not.toContain(email);
    } finally { logs.restore(); }
  });

  it.each(['signup', 'resend'] as const)('completes %s and logs only a label and class when the verification mail fails', async (operation) => {
    const { service, request, signUpEmail, findUser, send } = harness();
    const logs = captureLogs();
    try {
      signUpEmail.mockResolvedValue({ user: { id: 'unit-user' } });
      findUser.mockResolvedValue({ id: 'unit-user', email, emailVerified: false });
      send.mockImplementation((message: { html: string }) => Promise.reject(new Error(`refused ${email} ${message.html}`)));
      if (operation === 'signup') await expect(service.signup({ displayName: 'Unit User', email, password: 'unit-password-123' }, request, 'http://localhost:3000')).resolves.toBeUndefined();
      else await expect(service.resendVerification(email, 'http://localhost:3000')).resolves.toBeUndefined();
      expect(send).toHaveBeenCalledTimes(1);
      expect(logs.lines).toEqual([`Auth ${operation === 'signup' ? 'signup-mail' : 'resend-verification-mail'} failed: Error.`]);
    } finally { logs.restore(); }
  });
});

describe('Logout confirmation', () => {
  it('queries auth_sessions with the token returned by getSession', async () => {
    const { service, request, getSession, findSession } = harness();
    getSession.mockResolvedValue({ session: { token: 'unit-token' } });
    findSession.mockResolvedValue(undefined);
    await expect(service.logout(request)).resolves.toContain('better-auth.session_token');
    expect(findSession).toHaveBeenCalledTimes(1);
    // The bound parameter in the where clause is the getSession token.
    const chunks = (findSession.mock.calls[0][0].where as { queryChunks: { value?: unknown }[] }).queryChunks;
    expect(chunks.some((chunk) => chunk.value === 'unit-token')).toBe(true);
  });

  it('answers 503 instead of confirming when the session token is missing', async () => {
    const { service, request, getSession, findSession } = harness();
    getSession.mockResolvedValue({ session: {} });
    findSession.mockResolvedValue(undefined);
    await expect(service.logout(request)).rejects.toMatchObject({ status: 503 });
  });
});
