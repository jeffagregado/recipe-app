import type { EntityId, ISODateString } from "./common.js";

export const EMAIL_MAX_LENGTH = 254;
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;
export const DISPLAY_NAME_MAX_LENGTH = 100;
export const VERIFICATION_TOKEN_MAX_LENGTH = 128;

/** Public identity. Email, account records and session tokens never appear here. */
export type AuthUser = {
  id: EntityId;
  displayName: string;
};

export type SignupInput = {
  displayName: string;
  email: string;
  password: string;
};

export type LoginInput = {
  email: string;
  password: string;
};

export type ResendVerificationInput = {
  email: string;
};

export type VerifyEmailInput = {
  token: string;
};

export type ForgotPasswordInput = {
  email: string;
};

/** The token from the reset link and the password that replaces the old one. */
export type ResetPasswordInput = {
  token: string;
  password: string;
};

/** Signup creates no session: the Account signs in only after its email is verified. */
export type SignupResponse = {
  verificationRequired: true;
};

export type AuthUserResponse = {
  user: AuthUser;
};

export type AuthSessionResponse = {
  user: AuthUser;
  expiresAt: ISODateString;
};

export const AUTH_ERROR_CODES = [
  "VALIDATION_FAILED",
  "INVALID_CREDENTIALS",
  "UNAUTHENTICATED",
  "ORIGIN_REJECTED",
  "EMAIL_ALREADY_EXISTS",
  "EMAIL_NOT_VERIFIED",
  "VERIFICATION_LINK_INVALID",
  "RESET_LINK_INVALID",
  "PAYLOAD_TOO_LARGE",
  "RATE_LIMITED",
  "SERVICE_UNAVAILABLE",
  "INTERNAL_ERROR",
] as const;

export type AuthErrorCode = (typeof AUTH_ERROR_CODES)[number];

export type AuthErrorResponse = {
  code: AuthErrorCode;
  message: string;
  fieldErrors?: Record<string, string[]>;
};
