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
/** The sign-in refusal of ADR 0003 under a code of its own, so the web returns a connect to Settings and a sign-in to login. */
export const googleConnectEmailNotVerified = () => new AuthError(403, 'GOOGLE_CONNECT_EMAIL_NOT_VERIFIED', 'Google has not verified this email address.');
/** A Google identity is a Sign-in method of one Account only. */
export const googleAlreadyLinked = () => new AuthError(409, 'GOOGLE_ALREADY_LINKED', 'This Google account is already connected to another Account.');
/** An Account holds at most one Google identity. */
export const googleAlreadyConnected = () => new AuthError(409, 'GOOGLE_ALREADY_LINKED', 'Google is already connected to this Account.');
/** One answer for a connect that cannot start or finish, a missing starting session included; the log keeps the cause. */
export function googleConnectFailed(operation: string, cause: unknown): AuthError {
  logAuthFailure(operation, cause);
  return new AuthError(400, 'GOOGLE_CONNECT_FAILED', 'Could not connect Google. Try again.', { cause });
}
/** The last Sign-in method is never removed: Google goes only while a password remains. */
export const passwordRequiredToDisconnect = () => new AuthError(409, 'PASSWORD_REQUIRED', 'Set a password first.');
