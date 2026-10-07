import { z } from "zod";

import type { User, UserSummary } from "../types/user.js";

import {
  entityIdSchema,
  isoDateStringSchema,
} from "./common.schema.js";

export const userSchema: z.ZodType<User> = z.object({
  id: entityIdSchema,

  name: z.string().trim().min(1).max(100),

  email: z.email(),

  imageUrl: z.url().nullable(),

  createdAt: isoDateStringSchema,
  updatedAt: isoDateStringSchema,
});

export const userSummarySchema: z.ZodType<UserSummary> = z.object({
  id: entityIdSchema,

  name: z.string().trim().min(1).max(100),

  imageUrl: z.url().nullable(),
});