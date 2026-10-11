import { z } from "zod";

import type { Category, CategoryWithUsage, SaveCategoryInput } from "../types/category.js";
import { RECIPE_LIMITS } from "../types/recipe.js";
import { entityIdSchema } from "./common.schema.js";

const withoutNul = (value: string) => !value.includes("\u0000");

/** Opaque and owner-scoped; the bound keeps a hostile value out of queries and logs. */
export const categoryIdSchema = entityIdSchema.max(200).refine(withoutNul, "NUL characters are not allowed.");

/** The stored form of a name: trimmed, with inner whitespace collapsed to one space. */
export const normalizeCategoryName = (value: string) => value.trim().replace(/\s+/g, " ");

/** Normalized, then 1 to 10 characters. */
export const categoryNameSchema = z.string()
  .refine(withoutNul, "NUL characters are not allowed.")
  .transform(normalizeCategoryName)
  .pipe(z.string().min(1, "Enter a category name.").max(RECIPE_LIMITS.categoryName, `Use ${RECIPE_LIMITS.categoryName} characters or fewer.`));

export const categorySchema: z.ZodType<Category> = z.object({ id: categoryIdSchema, name: z.string().min(1) });

export const categoryWithUsageSchema: z.ZodType<CategoryWithUsage> = z.object({
  id: categoryIdSchema,
  name: z.string().min(1),
  recipeCount: z.number().int().nonnegative(),
});

export const categoryListSchema = z.array(categoryWithUsageSchema);

/** The whole set a user keeps: ids absent from it are deleted, rows without an id are created. */
export const saveCategoriesSchema: z.ZodType<SaveCategoryInput[], unknown> = z.array(z.strictObject({
  id: categoryIdSchema.optional(),
  name: categoryNameSchema,
})).max(RECIPE_LIMITS.categoriesPerUser, `Keep up to ${RECIPE_LIMITS.categoriesPerUser} categories.`)
  .superRefine((rows, context) => {
    const names = new Map<string, string>();
    const ids = new Set<string>();
    rows.forEach((row, index) => {
      const key = row.name.toLowerCase();
      const existing = names.get(key);
      if (existing !== undefined) context.addIssue({ code: "custom", path: [index, "name"], message: `“${existing}” already exists. Choose a different name.` });
      else names.set(key, row.name);
      if (row.id === undefined) return;
      if (ids.has(row.id)) context.addIssue({ code: "custom", path: [index, "id"], message: "Each category can be saved once." });
      ids.add(row.id);
    });
  });
