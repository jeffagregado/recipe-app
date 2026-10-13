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
export const emailAlreadyExists = () => new AuthError(409, 'EMAIL_ALREADY_EXISTS', 'Email already exists.');
export const emailNotVerified = (cause: unknown) => new AuthError(403, 'EMAIL_NOT_VERIFIED', 'Verify your email to log in.', { cause });
export const googleEmailNotVerified = () => new AuthError(403, 'GOOGLE_EMAIL_NOT_VERIFIED', 'Google has not verified this email address.');
/** One answer for a bad or replayed state, a failed exchange and an unconfigured provider; the log keeps the cause. */
export function googleSignInFailed(operation: string, cause: unknown): AuthError {
  logAuthFailure(operation, cause);
  return new AuthError(400, 'GOOGLE_SIGN_IN_FAILED', 'Google sign-in failed. Try again.', { cause });
}
export const verificationLinkInvalid = () => new AuthError(400, 'VERIFICATION_LINK_INVALID', 'This verification link has expired or was already used.');
/** Answered only to the signed-in Account itself, and named on the field so the form can show it there. */
export const invalidCurrentPassword = () => new AuthError(400, 'INVALID_CURRENT_PASSWORD', 'Current password is incorrect.', { fieldErrors: { currentPassword: ['Current password is incorrect.'] } });
export const passwordAlreadySet = () => new AuthError(409, 'PASSWORD_ALREADY_SET', 'This Account already has a password.');
/** An Account without a password proves nothing by one: it sets a password first. */
export const passwordRequired = () => new AuthError(409, 'PASSWORD_REQUIRED', 'Set a password before changing your email.');
