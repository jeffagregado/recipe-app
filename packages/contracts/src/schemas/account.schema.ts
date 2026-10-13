import { z } from "zod";

import type { ChangeEmailInput, ChangePasswordInput, ConfirmEmailChangeInput, ConfirmEmailChangeResponse, UpdateDisplayNameInput } from "../types/account.js";
import { PASSWORD_MAX_LENGTH, VERIFICATION_TOKEN_MAX_LENGTH } from "../types/auth.js";

import { displayNameSchema, emailSchema, passwordSchema } from "./auth.schema.js";

// Any non-empty current password reaches verification, as at login. It is never trimmed.
const currentPasswordSchema = z.string().min(1, "Enter your current password.").max(PASSWORD_MAX_LENGTH, `Use at most ${PASSWORD_MAX_LENGTH} characters.`);

export const updateDisplayNameSchema: z.ZodType<UpdateDisplayNameInput, UpdateDisplayNameInput> = z.strictObject({
  displayName: displayNameSchema,
});

// The new password follows the sign-up rule and is not trimmed either.
export const changePasswordSchema: z.ZodType<ChangePasswordInput, ChangePasswordInput> = z.strictObject({
  currentPassword: currentPasswordSchema,
  newPassword: passwordSchema,
});

// Asking takes no input: the API mails the link to the signed-in Account's own address.
export const requestSetPasswordSchema = z.strictObject({});

// The new email follows the sign-up rule: trimmed and lowercased before validation.
export const changeEmailSchema: z.ZodType<ChangeEmailInput, ChangeEmailInput> = z.strictObject({
  newEmail: emailSchema,
  currentPassword: currentPasswordSchema,
});

// The same opaque token bound as a verification link: only the API decides whether it names a live link.
export const confirmEmailChangeSchema: z.ZodType<ConfirmEmailChangeInput> = z.strictObject({
  token: z.string().min(1).max(VERIFICATION_TOKEN_MAX_LENGTH),
});

export const confirmEmailChangeResponseSchema: z.ZodType<ConfirmEmailChangeResponse> = z.strictObject({
  signedIn: z.boolean(),
});

// Resending and cancelling take no input: the API acts on the signed-in Account's own pending address.
export const resendEmailChangeSchema = z.strictObject({});
export const cancelEmailChangeSchema = z.strictObject({});

// Disconnecting takes no input: the API removes the signed-in Account's own Google identity.
export const disconnectGoogleSchema = z.strictObject({});
