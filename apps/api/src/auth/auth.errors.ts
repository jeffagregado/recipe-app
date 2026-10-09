import { HttpException } from '@nestjs/common';
import { logAuthFailure } from './auth.logger.js';
import type { AuthErrorCode, AuthErrorResponse } from '@recipe-app/contracts/types';

export class AuthError extends HttpException {
  constructor(status: number, code: AuthErrorCode, message: string, options: { cause?: unknown; fieldErrors?: Record<string, string[]>; retryAfter?: number } = {}) {
    super({ code, message, ...(options.fieldErrors ? { fieldErrors: options.fieldErrors } : {}) } satisfies AuthErrorResponse, status, { cause: options.cause });
    this.retryAfter = options.retryAfter;
  }

  readonly retryAfter?: number;
}

/** Logs the root cause under a static operation label, then builds the 503. */
export function unavailable(operation: string, cause: unknown): AuthError {
  logAuthFailure(operation, cause);
  return new AuthError(503, 'SERVICE_UNAVAILABLE', 'Authentication service unavailable. Try again.', { cause });
}
export const unauthenticated = () => new AuthError(401, 'UNAUTHENTICATED', 'Log in to continue.');
export const usernameUnavailable = () => new AuthError(409, 'USERNAME_UNAVAILABLE', 'Username is unavailable.');
