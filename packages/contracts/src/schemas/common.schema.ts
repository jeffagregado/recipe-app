import { z } from "zod";

import type {
  PaginationMeta,
  PaginationParams,
  SortDirection,
} from "../types/common.js";

export const entityIdSchema = z.string().min(1);

export const isoDateStringSchema = z.iso.datetime();

export const paginationParamsSchema: z.ZodType<PaginationParams> = z.object({
  page: z.number().int().positive().optional(),
  limit: z.number().int().positive().max(100).optional(),
});

export const paginationMetaSchema: z.ZodType<PaginationMeta> = z.object({
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});

export const sortDirectionSchema: z.ZodType<SortDirection> = z.enum([
  "asc",
  "desc",
]);