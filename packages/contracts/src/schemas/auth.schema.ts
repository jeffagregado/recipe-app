import { z } from "zod";

import {
  AUTH_ERROR_CODES,
  DISPLAY_NAME_MAX_LENGTH,
  EMAIL_MAX_LENGTH,
  GOOGLE_CODE_MAX_LENGTH,
  GOOGLE_STATE_MAX_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  VERIFICATION_TOKEN_MAX_LENGTH,
  type AuthErrorResponse,
  type AuthSessionResponse,
  type AuthUser,
  type AuthUserResponse,
  type ForgotPasswordInput,
  type GoogleCallbackInput,
  type GoogleCallbackResponse,
  type GoogleStartResponse,
  type LoginInput,
  type ResendVerificationInput,
  type ResetPasswordInput,
  type SignupInput,
  type SignupResponse,
  type VerifyEmailInput,
} from "../types/auth.js";

import { entityIdSchema, isoDateStringSchema } from "./common.schema.js";

// Trimmed and lowercased before validation, so one address has one stored form.
export const emailSchema: z.ZodType<string, string> = z.string().trim().toLowerCase()
  .min(1, "Enter your email.")
  .max(EMAIL_MAX_LENGTH, `Use at most ${EMAIL_MAX_LENGTH} characters.`)
  .regex(z.regexes.email, "Enter a valid email address.");

export const displayNameSchema: z.ZodType<string, string> = z.string().trim()
  .min(1, "Enter a display name.")
  .max(DISPLAY_NAME_MAX_LENGTH, `Use at most ${DISPLAY_NAME_MAX_LENGTH} characters.`)
  .regex(/^\P{Cc}*$/u, "Remove control characters.");

// Passwords are never trimmed or normalized.
export const passwordSchema: z.ZodType<string, string> = z.string()
  .min(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters.`)
  .max(PASSWORD_MAX_LENGTH, `Use at most ${PASSWORD_MAX_LENGTH} characters.`);

export const signupSchema: z.ZodType<SignupInput, SignupInput> = z.strictObject({
  displayName: displayNameSchema,
  email: emailSchema,
  password: passwordSchema,
});

// Any non-empty password reaches verification so wrong and unknown credentials fail identically.
export const loginSchema: z.ZodType<LoginInput, LoginInput> = z.strictObject({
  email: emailSchema,
  password: z.string().min(1, "Enter your password.").max(PASSWORD_MAX_LENGTH, `Use at most ${PASSWORD_MAX_LENGTH} characters.`),
});

export const logoutSchema = z.strictObject({});

export const resendVerificationSchema: z.ZodType<ResendVerificationInput, ResendVerificationInput> = z.strictObject({
  email: emailSchema,
});

// The token is opaque here: only the API decides whether it names a live link.
export const verifyEmailSchema: z.ZodType<VerifyEmailInput> = z.strictObject({
  token: z.string().min(1).max(VERIFICATION_TOKEN_MAX_LENGTH),
});

export const forgotPasswordSchema: z.ZodType<ForgotPasswordInput, ForgotPasswordInput> = z.strictObject({
  email: emailSchema,
});

// The same opaque token bound as a verification link, and the sign-up password rule.
export const resetPasswordSchema: z.ZodType<ResetPasswordInput> = z.strictObject({
  token: z.string().min(1).max(VERIFICATION_TOKEN_MAX_LENGTH),
  password: passwordSchema,
});

// Starting takes no input: the API decides the provider, the callback and the scopes.
export const googleStartSchema = z.strictObject({});

// Both values are opaque here: only the API decides whether they complete a sign-in it started.
export const googleCallbackSchema: z.ZodType<GoogleCallbackInput> = z.strictObject({
  code: z.string().min(1).max(GOOGLE_CODE_MAX_LENGTH),
  state: z.string().min(1).max(GOOGLE_STATE_MAX_LENGTH),
});

export const googleStartResponseSchema: z.ZodType<GoogleStartResponse> = z.strictObject({
  url: z.url({ protocol: /^https?$/, hostname: /\S+/ }),
});

export const googleCallbackResponseSchema: z.ZodType<GoogleCallbackResponse> = z.strictObject({
  connected: z.literal(true),
});

export const signupResponseSchema: z.ZodType<SignupResponse> = z.strictObject({
  verificationRequired: z.literal(true),
});

export const authUserSchema: z.ZodType<AuthUser> = z.strictObject({
  id: entityIdSchema,
  displayName: z.string().min(1).max(DISPLAY_NAME_MAX_LENGTH),
  hasPassword: z.boolean(),
  google: z.strictObject({ email: emailSchema.nullable() }).nullable(),
});

export const authUserResponseSchema: z.ZodType<AuthUserResponse> = z.strictObject({
  user: authUserSchema,
});

export const authSessionResponseSchema: z.ZodType<AuthSessionResponse> = z.strictObject({
  user: authUserSchema,
  expiresAt: isoDateStringSchema,
});

export const authErrorResponseSchema: z.ZodType<AuthErrorResponse> = z.object({
  code: z.enum(AUTH_ERROR_CODES),
  message: z.string().min(1),
  fieldErrors: z.record(z.string(), z.array(z.string())).optional(),
});
