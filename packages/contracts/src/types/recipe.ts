import type {
  EntityId,
  ISODateString,
  PaginationParams,
  SortDirection,
} from "./common";

import type {
  CreateRecipeIngredientInput,
  RecipeIngredient,
} from "./ingredient";

export type RecipeInstruction = {
  id: EntityId;
  stepNumber: number;
  description: string;
};

export type Recipe = {
  id: EntityId;
  userId: EntityId;

  title: string;
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