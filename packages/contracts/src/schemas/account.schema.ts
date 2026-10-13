import { z } from "zod";

import type { UpdateDisplayNameInput } from "../types/account.js";

import { displayNameSchema } from "./auth.schema.js";

export const updateDisplayNameSchema: z.ZodType<UpdateDisplayNameInput, UpdateDisplayNameInput> = z.strictObject({
  displayName: displayNameSchema,
});
