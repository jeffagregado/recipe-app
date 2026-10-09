import type { EntityId, ISODateString } from "./common.js";

export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 30;
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;
export const DISPLAY_NAME_MAX_LENGTH = 100;

/** Public identity. Internal email, account records and session tokens never appear here. */
export type AuthUser = {
  id: EntityId;
  displayName: string;
  username: string;
};

export type SignupInput = {
  displayName: string;
  username: string;
  password: string;
};

export type LoginInput = {
  username: string;
  password: string;
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
  "USERNAME_UNAVAILABLE",
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
