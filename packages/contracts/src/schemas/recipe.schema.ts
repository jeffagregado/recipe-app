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
  type UpdateRecipeInput,
} from "../types/recipe.js";

import {
  entityIdSchema,
  isoDateStringSchema,
  sortDirectionSchema,
} from "./common.schema.js";

import {
  createRecipeIngredientSchema,
  recipeIngredientSchema,
} from "./ingredient.schema.js";

export const recipeCategorySchema: z.ZodType<RecipeCategory> = z.enum(
  RECIPE_CATEGORIES,
);

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

  category: recipeCategorySchema.optional(),

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

  category: recipeCategorySchema.optional(),

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

  category: recipeCategorySchema.optional(),

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

  category: recipeCategorySchema.optional(),

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

export const recipeQueryParamsSchema: z.ZodType<RecipeQueryParams> = z.object({
  page: z.number().int().positive().optional(),

  limit: z.number().int().positive().max(100).optional(),

  search: z.string().trim().min(1).max(200).optional(),

  sortBy: recipeSortFieldSchema.optional(),

  sortDirection: sortDirectionSchema.optional(),
});
