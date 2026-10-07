import type { EntityId } from "./common.js";

export const MEASUREMENT_UNITS = [
  "tsp",
  "tbsp",
  "cup",
  "ml",
  "l",
  "g",
  "kg",
  "oz",
  "lb",
  "piece",
  "clove",
  "pinch",
  "slice",
  "can",
  "pack",
] as const;

export type MeasurementUnit = (typeof MEASUREMENT_UNITS)[number];

export type Ingredient = {
  id: EntityId;
  name: string;
};

export type RecipeIngredient = {
  id: EntityId;

  ingredientId: EntityId | null;

  /**
   * Snapshot/display name.
   *
   * Useful even if you later create a normalized Ingredient table.
   */
  name: string;

  quantity: number | null;
  unit: MeasurementUnit | null;

  /**
   * Examples:
   * "finely chopped"
   * "room temperature"
   * "divided"
   */
  preparation: string | null;

  /**
   * Optional free-form note.
   *
   * Example:
   * "plus extra for garnish"
   */
  note: string | null;

  sortOrder: number;
};

export type CreateRecipeIngredientInput = {
  name: string;

  quantity: number | null;
  unit: MeasurementUnit | null;

  preparation?: string | null;
  note?: string | null;
};