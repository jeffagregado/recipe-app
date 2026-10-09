import { z } from "zod";

import {
  RECIPE_CATEGORIES,
  RECIPE_SORT_FIELDS,
  type CreateRecipeInput,
  type CreateRecipeInstructionInput,
  type Recipe,
  type RecipeCategory,
  type RecipeInstruction,
  type RecipeQueryParams,
  type RecipeSortField,
  type RecipeSummary,
  type RecipeListQuery,
  type RecipeListResponse,
  type UpdateRecipeInput,
} from "../types/recipe.js";

import {
  entityIdSchema,
  isoDateStringSchema,
  sortDirectionSchema,
  paginationMetaSchema,
} from "./common.schema.js";

import {
  createRecipeIngredientSchema,
  recipeIngredientSchema,
} from "./ingredient.schema.js";

export const recipeCategorySchema: z.ZodType<RecipeCategory> = z.enum(
  RECIPE_CATEGORIES,
);

const recipeCategoriesSchema = z.array(recipeCategorySchema).max(3)
  .refine((categories) => new Set(categories).size === categories.length, "Categories must be unique");

export const recipeInstructionSchema: z.ZodType<RecipeInstruction> = z.object({
  id: entityIdSchema,
  stepNumber: z.number().int().positive(),
  description: z.string().trim().min(1).max(5_000),
});

export const createRecipeInstructionSchema: z.ZodType<CreateRecipeInstructionInput> =
  z.object({
    description: z.string().trim().min(1).max(5_000),
  });

export const recipeSchema: z.ZodType<Recipe> = z.object({
  id: entityIdSchema,
  userId: entityIdSchema,

  title: z.string().trim().min(1).max(200),

  categories: recipeCategoriesSchema,

  description: z.string().trim().max(2_000).nullable(),

  imageUrl: z.url().nullable(),

  servings: z.number().int().positive().nullable(),

  prepTimeMinutes: z.number().int().nonnegative().nullable(),
  cookTimeMinutes: z.number().int().nonnegative().nullable(),

  ingredients: z.array(recipeIngredientSchema),

  instructions: z.array(recipeInstructionSchema),

  createdAt: isoDateStringSchema,
  updatedAt: isoDateStringSchema,
});

export const recipeSummarySchema: z.ZodType<RecipeSummary> = z.object({
  id: entityIdSchema,

  title: z.string().trim().min(1).max(200),

  categories: recipeCategoriesSchema,

  description: z.string().trim().max(2_000).nullable(),

  imageUrl: z.url().nullable(),

  servings: z.number().int().positive().nullable(),

  prepTimeMinutes: z.number().int().nonnegative().nullable(),
  cookTimeMinutes: z.number().int().nonnegative().nullable(),

  createdAt: isoDateStringSchema,
  updatedAt: isoDateStringSchema,
});

export const createRecipeSchema: z.ZodType<CreateRecipeInput> = z.object({
  title: z.string().trim().min(1).max(200),

  categories: recipeCategoriesSchema.optional(),

  description: z.string().trim().max(2_000).nullable().optional(),

  imageUrl: z.url().nullable().optional(),

  servings: z.number().int().positive().nullable().optional(),

  prepTimeMinutes: z.number().int().nonnegative().nullable().optional(),

  cookTimeMinutes: z.number().int().nonnegative().nullable().optional(),

  ingredients: z.array(createRecipeIngredientSchema).min(1),

  instructions: z.array(createRecipeInstructionSchema).min(1),
});

export const updateRecipeSchema: z.ZodType<UpdateRecipeInput> = z.object({
  title: z.string().trim().min(1).max(200).optional(),

  categories: recipeCategoriesSchema.optional(),

  description: z.string().trim().max(2_000).nullable().optional(),

  imageUrl: z.url().nullable().optional(),

  servings: z.number().int().positive().nullable().optional(),

  prepTimeMinutes: z.number().int().nonnegative().nullable().optional(),

  cookTimeMinutes: z.number().int().nonnegative().nullable().optional(),

  ingredients: z.array(createRecipeIngredientSchema).min(1).optional(),

  instructions: z.array(createRecipeInstructionSchema).min(1).optional(),
});

export const recipeSortFieldSchema: z.ZodType<RecipeSortField> = z.enum(
  RECIPE_SORT_FIELDS,
);

// Query strings must be whole numbers; blank, repeated and fractional values fail.
const queryInteger = (schema: z.ZodNumber) => z.preprocess(
  (value) => typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value,
  schema,
);

export const recipeSearchSchema = z.string().trim().max(200).transform((value) => value || undefined).optional();

export const recipeListQuerySchema: z.ZodType<RecipeListQuery> = z.object({
  search: recipeSearchSchema,
  category: recipeCategorySchema.optional(),
  page: queryInteger(z.number().int().positive().max(Math.floor(Number.MAX_SAFE_INTEGER / 20))).default(1),
  limit: queryInteger(z.number().int().positive().max(20)).default(20),
  sortBy: recipeSortFieldSchema.default("createdAt"),
  order: sortDirectionSchema.default("desc"),
});

export const recipeListResponseSchema: z.ZodType<RecipeListResponse> = z.object({
  data: z.array(recipeSummarySchema),
  meta: paginationMetaSchema,
  counts: z.object({
    total: z.number().int().nonnegative(),
    categories: z.record(z.enum(RECIPE_CATEGORIES), z.number().int().nonnegative()),
  }),
});

export const recipeQueryParamsSchema: z.ZodType<RecipeQueryParams> = z.object({
  page: z.number().int().positive().optional(),

  limit: z.number().int().positive().max(100).optional(),

  search: z.string().trim().min(1).max(200).optional(),

  sortBy: recipeSortFieldSchema.optional(),

  sortDirection: sortDirectionSchema.optional(),
});
