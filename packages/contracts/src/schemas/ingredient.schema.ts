import { z } from "zod";

import {
  MEASUREMENT_UNITS,
  type CreateRecipeIngredientInput,
  type Ingredient,
  type MeasurementUnit,
  type RecipeIngredient,
} from "../types/ingredient";

import { entityIdSchema } from "./common.schema";

export const measurementUnitSchema: z.ZodType<MeasurementUnit> = z.enum(
  MEASUREMENT_UNITS,
);

export const ingredientSchema: z.ZodType<Ingredient> = z.object({
  id: entityIdSchema,
  name: z.string().trim().min(1).max(100),
});

export const recipeIngredientSchema: z.ZodType<RecipeIngredient> = z.object({
  id: entityIdSchema,

  ingredientId: entityIdSchema.nullable(),

  name: z.string().trim().min(1).max(100),

  quantity: z.number().positive().nullable(),
  unit: measurementUnitSchema.nullable(),

  preparation: z.string().trim().max(200).nullable(),
  note: z.string().trim().max(500).nullable(),

  sortOrder: z.number().int().nonnegative(),
});

export const createRecipeIngredientSchema: z.ZodType<CreateRecipeIngredientInput> =
  z.object({
    name: z.string().trim().min(1).max(100),

    quantity: z.number().positive().nullable(),
    unit: measurementUnitSchema.nullable(),

    preparation: z.string().trim().max(200).nullable().optional(),
    note: z.string().trim().max(500).nullable().optional(),
  });