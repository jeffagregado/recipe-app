import { z } from "zod";

import {
  RECIPE_SORT_FIELDS,
  RECIPE_IMAGE_SLOTS,
  RECIPE_LIMITS,
  type RecipeListItem,
  type UpdateRecipeMetadata,
  type CreateRecipeMetadata,
  type CreateRecipeMetadataIngredient,
  type CreateRecipeResult,
  type PendingPhoto,
  type PendingPhotoSlot,
  type RecipeDetail,
  type RecipeDetailInstruction,
  type CreateRecipeInput,
  type CreateRecipeInstructionInput,
  type Recipe,
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

import { categoryIdSchema, categorySchema } from "./category.schema.js";

import {
  createRecipeIngredientSchema,
  recipeIngredientSchema,
  measurementUnitSchema,
} from "./ingredient.schema.js";

const recipeCategoriesSchema = z.array(categorySchema).max(RECIPE_LIMITS.categories)
  .refine((categories) => new Set(categories.map(({ id }) => id)).size === categories.length, "Categories must be unique");

const recipeCategoryIdsSchema = z.array(categoryIdSchema).max(RECIPE_LIMITS.categories)
  .refine((ids) => new Set(ids).size === ids.length, "Categories must be unique");

export const recipeInstructionSchema: z.ZodType<RecipeInstruction> = z.object({
  id: entityIdSchema,
  stepNumber: z.number().int().positive(),
  description: z.string().trim().min(1).max(5_000),
  heading: z.string().trim().min(1).max(RECIPE_LIMITS.groupHeading).nullable(),
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

  categoryIds: recipeCategoryIdsSchema.optional(),

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

  categoryIds: recipeCategoryIdsSchema.optional(),

  description: z.string().trim().max(2_000).nullable().optional(),

  imageUrl: z.url().nullable().optional(),

  servings: z.number().int().positive().nullable().optional(),

  prepTimeMinutes: z.number().int().nonnegative().nullable().optional(),

  cookTimeMinutes: z.number().int().nonnegative().nullable().optional(),

  ingredients: z.array(createRecipeIngredientSchema).min(1).optional(),

  instructions: z.array(createRecipeInstructionSchema).min(1).optional(),
});

export const recipeListItemSchema: z.ZodType<RecipeListItem> = recipeSummarySchema.and(z.object({ isFavorite: z.boolean() }));

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
  category: categoryIdSchema.optional(),
  // Only the literal flag turns the filter on; leave it out to list every recipe.
  favorites: z.literal("true").transform(() => true as const).optional(),
  page: queryInteger(z.number().int().positive().max(Math.floor(Number.MAX_SAFE_INTEGER / 20))).default(1),
  limit: queryInteger(z.number().int().positive().max(20)).default(20),
  sortBy: recipeSortFieldSchema.default("createdAt"),
  order: sortDirectionSchema.default("desc"),
});

export const recipeListResponseSchema: z.ZodType<RecipeListResponse> = z.object({
  data: z.array(recipeListItemSchema),
  meta: paginationMetaSchema,
  counts: z.object({
    total: z.number().int().nonnegative(),
    favorites: z.number().int().nonnegative(),
    categories: z.array(z.object({ id: categoryIdSchema, name: z.string().min(1), total: z.number().int().nonnegative() })),
  }),
});

export const recipeQueryParamsSchema: z.ZodType<RecipeQueryParams> = z.object({
  page: z.number().int().positive().optional(),

  limit: z.number().int().positive().max(100).optional(),

  search: z.string().trim().min(1).max(200).optional(),

  sortBy: recipeSortFieldSchema.optional(),

  sortDirection: sortDirectionSchema.optional(),
});

const metadataText = () => z.string().trim().refine((value) => !value.includes("\u0000"), "NUL characters are not allowed.");
const nullableText = (limit: number) => metadataText().max(limit)
  .transform((value) => value || null).nullable();

// String round-tripping avoids binary floating-point modulo errors (e.g. 1.001).
const quantitySchema = z.number().positive().max(RECIPE_LIMITS.maxQuantity)
  .refine((value) => value === Number(value.toFixed(RECIPE_LIMITS.quantityDecimals)), "Use at most three decimal places.");

const headingSchema = () => metadataText().min(1).max(RECIPE_LIMITS.groupHeading).nullable().optional();

/** A row with a heading opens a named group, the first row included; the limit counts rows across all groups. */
const groupedRows = <T>(schema: z.ZodType<T>, limit: number) => z.array(schema).min(1).max(limit);

const metadataIngredientSchema: z.ZodType<CreateRecipeMetadataIngredient> = z.strictObject({
  name: metadataText().min(1).max(RECIPE_LIMITS.ingredientName),
  quantity: quantitySchema.nullable(),
  unit: measurementUnitSchema.nullable(),
  preparation: z.null().optional(),
  note: z.null().optional(),
  heading: headingSchema(),
}).refine((row) => (row.quantity === null) === (row.unit === null), {
  message: "Set both quantity and unit, or use null for both to taste.",
  path: ["quantity"],
});

const videoUrlSchema = nullableText(RECIPE_LIMITS.videoUrl).refine((value) => {
  if (value === null) return true;
  try { return new URL(value).protocol === "https:"; } catch { return false; }
}, "Enter a valid HTTPS URL.");

/** Pending photo ids are server-generated UUIDs; anything else names no Pending photo. */
const pendingPhotoIdSchema = z.uuid();

const pendingPhotoSlotSchema: z.ZodType<PendingPhotoSlot> = z.strictObject({ pendingPhotoId: pendingPhotoIdSchema });

export const pendingPhotoSchema: z.ZodType<PendingPhoto> = z.object({ id: pendingPhotoIdSchema });

const metadataFields = {
  title: metadataText().min(1).max(RECIPE_LIMITS.title),
  description: nullableText(RECIPE_LIMITS.description),
  categoryIds: recipeCategoryIdsSchema,
  servings: z.number().int().positive().max(RECIPE_LIMITS.maxInteger).nullable(),
  prepTimeMinutes: z.number().int().nonnegative().max(RECIPE_LIMITS.maxInteger).nullable(),
  cookTimeMinutes: z.number().int().nonnegative().max(RECIPE_LIMITS.maxInteger).nullable(),
  videoUrl: videoUrlSchema,
  notes: nullableText(RECIPE_LIMITS.notes),
  ingredients: groupedRows(metadataIngredientSchema, RECIPE_LIMITS.ingredients),
};
const instructionDescription = () => metadataText().min(1).max(RECIPE_LIMITS.instructionDescription);

export const createRecipeMetadataSchema: z.ZodType<CreateRecipeMetadata> = z.strictObject({
  ...metadataFields,
  cover: pendingPhotoSlotSchema.optional(),
  instructions: groupedRows(z.strictObject({
    description: instructionDescription(),
    hasImage: z.boolean(),
    heading: headingSchema(),
  }), RECIPE_LIMITS.instructions),
});

const imageSlotSchema = z.enum(RECIPE_IMAGE_SLOTS);

export const updateRecipeMetadataSchema: z.ZodType<UpdateRecipeMetadata> = z.strictObject({
  ...metadataFields,
  cover: z.union([imageSlotSchema, pendingPhotoSlotSchema]),
  instructions: groupedRows(z.strictObject({
    id: entityIdSchema.max(200).nullable(),
    description: instructionDescription(),
    image: imageSlotSchema,
    heading: headingSchema(),
  }).refine((step) => step.id !== null || step.image !== "keep", {
    message: "A new step has no photo to keep.", path: ["image"],
  }), RECIPE_LIMITS.instructions)
    .refine((steps) => {
      const ids = steps.flatMap((step) => step.id === null ? [] : [step.id]);
      return new Set(ids).size === ids.length;
    }, "Each existing step can be used once."),
});

export const createRecipeResultSchema: z.ZodType<CreateRecipeResult> = z.object({ id: entityIdSchema });

export const recipeDetailInstructionSchema: z.ZodType<RecipeDetailInstruction> = recipeInstructionSchema.and(z.object({
  imageUrl: z.url().nullable(),
}));

export const recipeDetailSchema: z.ZodType<RecipeDetail> = recipeSchema.and(z.object({
  isFavorite: z.boolean(),
  notes: z.string().trim().max(RECIPE_LIMITS.notes).nullable(),
  videoUrl: z.string().max(RECIPE_LIMITS.videoUrl).nullable(),
  instructions: z.array(recipeDetailInstructionSchema),
}));

/** Multipart image fields in cover-first order, using original instruction indexes. A cover named as a Pending photo sends no file. */
export function expectedRecipeFileFields(metadata: CreateRecipeMetadata, hasCover: boolean): string[] {
  return [
    ...(hasCover && !metadata.cover ? ["cover"] : []),
    ...metadata.instructions.flatMap((step, index) => step.hasImage ? [`step-${index}`] : []),
  ];
}

/** Multipart image fields an update must carry: one per slot marked `replace`. */
export function expectedRecipeUpdateFileFields(metadata: UpdateRecipeMetadata): string[] {
  return [
    ...(metadata.cover === "replace" ? ["cover"] : []),
    ...metadata.instructions.flatMap((step, index) => step.image === "replace" ? [`step-${index}`] : []),
  ];
}
