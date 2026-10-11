import type { EntityId } from "./common.js";

/** A label owned by one user. The owner comes from the session and is never serialised. */
export type Category = {
  id: EntityId;
  name: string;
};

export type CategoryWithUsage = Category & { recipeCount: number };

/** A row of the saved set: an existing category keeps its id, a new one has none. */
export type SaveCategoryInput = {
  id?: EntityId;
  name: string;
};
