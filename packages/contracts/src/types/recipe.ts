import type {
  EntityId,
  ISODateString,
  PaginationParams,
  SortDirection,
} from "./common.js";

import type {
  CreateRecipeIngredientInput,
  RecipeIngredient,
} from "./ingredient.js";

export const RECIPE_CATEGORIES = [
  "Breakfast",
  "Lunch",
  "Dinner",
  "Snacks",
  "Desserts",
] as const;

export type RecipeCategory = (typeof RECIPE_CATEGORIES)[number];

export type RecipeInstruction = {
  id: EntityId;
  stepNumber: number;
  description: string;
};

export type Recipe = {
  id: EntityId;
  userId: EntityId;

  title: string;
  categories: RecipeCategory[];
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

  categories?: RecipeCategory[];

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

export type RecipeQueryParams = PaginationParams & {
  search?: string;

  sortBy?: RecipeSortField;
  sortDirection?: SortDirection;
};
