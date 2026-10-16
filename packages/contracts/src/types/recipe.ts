import type {
  EntityId,
  ISODateString,
  PaginationParams,
  PaginatedResult,
  SortDirection,
} from "./common.js";

import type { Category } from "./category.js";

import type {
  CreateRecipeIngredientInput,
  MeasurementUnit,
  RecipeIngredient,
} from "./ingredient.js";

const MAX_RECIPE_STEPS = 50;

export const RECIPE_LIMITS = {
  title: 200, description: 2000, notes: 5000, videoUrl: 2048,
  categories: 3, categoriesPerUser: 10, categoryName: 10, ingredients: 100, instructions: MAX_RECIPE_STEPS,
  ingredientName: 100, instructionDescription: 5000, groupHeading: 100,
  maxInteger: 2147483647, maxQuantity: 999999999.999, quantityDecimals: 3,
  imageBytes: 5 * 1024 * 1024, metadataBytes: 1024 * 1024,
  // The cover plus one photo per step.
  maxFiles: MAX_RECIPE_STEPS + 1, requestBytes: 128 * 1024 * 1024,
} as const;

export const RECIPE_IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export type CreateRecipeMetadataIngredient = {
  name: string;
  quantity: number | null;
  unit: MeasurementUnit | null;
  preparation?: null;
  note?: null;
  /** Opens a named group at this row; null or absent continues the current group. Always null on the first row. */
  heading?: string | null;
};

export type CreateRecipeMetadataInstruction = {
  description: string;
  hasImage: boolean;
  /** Opens a named group at this step; null or absent continues the current group. Always null on the first step. */
  heading?: string | null;
};

export type CreateRecipeMetadata = {
  title: string;
  description: string | null;
  /** The owner's categories in the chosen order. */
  categoryIds: EntityId[];
  servings: number | null;
  prepTimeMinutes: number | null;
  cookTimeMinutes: number | null;
  videoUrl: string | null;
  notes: string | null;
  ingredients: CreateRecipeMetadataIngredient[];
  instructions: CreateRecipeMetadataInstruction[];
};

export type CreateRecipeResult = { id: EntityId };

/** What an update does with an existing image slot (cover or one step photo). */
export const RECIPE_IMAGE_SLOTS = ["keep", "replace", "remove"] as const;

export type RecipeImageSlot = (typeof RECIPE_IMAGE_SLOTS)[number];

export type UpdateRecipeMetadataInstruction = {
  /** Existing instruction this row continues, or null for a new row. `keep` keeps that instruction's photo. */
  id: EntityId | null;
  description: string;
  image: RecipeImageSlot;
  heading?: string | null;
};

export type UpdateRecipeMetadata = Omit<CreateRecipeMetadata, "instructions"> & {
  cover: RecipeImageSlot;
  instructions: UpdateRecipeMetadataInstruction[];
};

export type RecipeDetailInstruction = RecipeInstruction & { imageUrl: string | null };

export type RecipeDetail = Omit<Recipe, "instructions"> & {
  isFavorite: boolean;
  notes: string | null;
  videoUrl: string | null;
  instructions: RecipeDetailInstruction[];
};

export type RecipeInstruction = {
  id: EntityId;
  stepNumber: number;
  description: string;
  /** Name of the group this step opens; null continues the group above. */
  heading: string | null;
};

export type Recipe = {
  id: EntityId;
  userId: EntityId;

  title: string;
  categories: Category[];
  description: string | null;

  imageUrl: string | null;

  servings: number | null;

  prepTimeMinutes: number | null;
  cookTimeMinutes: number | null;

  ingredients: RecipeIngredient[];
  instructions: RecipeInstruction[];

  createdAt: ISODateString;
  updatedAt: ISODateString;
};

export type RecipeSummary = Pick<
  Recipe,
  | "id"
  | "title"
  | "categories"
  | "description"
  | "imageUrl"
  | "servings"
  | "prepTimeMinutes"
  | "cookTimeMinutes"
  | "createdAt"
  | "updatedAt"
>;

export type CreateRecipeInstructionInput = {
  description: string;
};

export type CreateRecipeInput = {
  title: string;

  categoryIds?: EntityId[];

  description?: string | null;

  imageUrl?: string | null;

  servings?: number | null;

  prepTimeMinutes?: number | null;
  cookTimeMinutes?: number | null;

  ingredients: CreateRecipeIngredientInput[];
  instructions: CreateRecipeInstructionInput[];
};

export type UpdateRecipeInput = Partial<
  Omit<CreateRecipeInput, "ingredients" | "instructions">
> & {
  ingredients?: CreateRecipeIngredientInput[];
  instructions?: CreateRecipeInstructionInput[];
};

export const RECIPE_SORT_FIELDS = [
  "createdAt",
  "updatedAt",
  "title",
] as const;

export type RecipeSortField = (typeof RECIPE_SORT_FIELDS)[number];

export type RecipeFilters = {
  search?: string;
  /** Id of one of the owner's categories. */
  category?: EntityId;
  /** Present only when the list is narrowed to the signed-in user's favorites. */
  favorites?: true;
  sortBy: RecipeSortField;
  order: SortDirection;
};

export type RecipeListQuery = Required<PaginationParams> & RecipeFilters;

export type RecipeCounts = {
  total: number;
  favorites: number;
  /** Every category the owner keeps, in their order, including unused ones. */
  categories: Array<Category & { total: number }>;
};

export type RecipeListItem = RecipeSummary & { isFavorite: boolean };

export type RecipeListResponse = PaginatedResult<RecipeListItem> & {
  counts: RecipeCounts;
};

export type RecipeQueryParams = PaginationParams & {
  search?: string;

  sortBy?: RecipeSortField;
  sortDirection?: SortDirection;
};
