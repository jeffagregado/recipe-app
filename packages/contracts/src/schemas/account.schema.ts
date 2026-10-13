import { z } from "zod";

import type { ChangePasswordInput, UpdateDisplayNameInput } from "../types/account.js";
import { PASSWORD_MAX_LENGTH } from "../types/auth.js";

import { displayNameSchema, passwordSchema } from "./auth.schema.js";

export const updateDisplayNameSchema: z.ZodType<UpdateDisplayNameInput, UpdateDisplayNameInput> = z.strictObject({
  displayName: displayNameSchema,
});

// Any non-empty current password reaches verification, as at login; the new one follows the sign-up rule. Neither is trimmed.
export const changePasswordSchema: z.ZodType<ChangePasswordInput, ChangePasswordInput> = z.strictObject({
  currentPassword: z.string().min(1, "Enter your current password.").max(PASSWORD_MAX_LENGTH, `Use at most ${PASSWORD_MAX_LENGTH} characters.`),
  newPassword: passwordSchema,
});

// Asking takes no input: the API mails the link to the signed-in Account's own address.
export const requestSetPasswordSchema = z.strictObject({});
