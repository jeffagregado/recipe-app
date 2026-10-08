import { relations } from 'drizzle-orm';
import { authAccounts, authSessions, users } from './auth.schema.js';
import { categories, favorites, ingredients, recipeCategories, recipeImages, recipeIngredients, recipeInstructions, recipes } from './recipe.schema.js';

export const usersRelations = relations(users, ({ many }) => ({
  accounts: many(authAccounts), sessions: many(authSessions), recipes: many(recipes), favorites: many(favorites),
}));
export const authAccountsRelations = relations(authAccounts, ({ one }) => ({
  user: one(users, { fields: [authAccounts.userId], references: [users.id] }),
}));
export const authSessionsRelations = relations(authSessions, ({ one }) => ({
  user: one(users, { fields: [authSessions.userId], references: [users.id] }),
}));
export const recipesRelations = relations(recipes, ({ one, many }) => ({
  owner: one(users, { fields: [recipes.userId], references: [users.id] }),
  ingredients: many(recipeIngredients), instructions: many(recipeInstructions), categories: many(recipeCategories), images: many(recipeImages), favorites: many(favorites),
}));
export const ingredientsRelations = relations(ingredients, ({ many }) => ({ recipes: many(recipeIngredients) }));
export const recipeIngredientsRelations = relations(recipeIngredients, ({ one }) => ({
  recipe: one(recipes, { fields: [recipeIngredients.recipeId], references: [recipes.id] }),
  ingredient: one(ingredients, { fields: [recipeIngredients.ingredientId], references: [ingredients.id] }),
}));
export const recipeInstructionsRelations = relations(recipeInstructions, ({ one }) => ({
  recipe: one(recipes, { fields: [recipeInstructions.recipeId], references: [recipes.id] }),
}));
export const categoriesRelations = relations(categories, ({ many }) => ({ recipes: many(recipeCategories) }));
export const recipeCategoriesRelations = relations(recipeCategories, ({ one }) => ({
  recipe: one(recipes, { fields: [recipeCategories.recipeId], references: [recipes.id] }),
  category: one(categories, { fields: [recipeCategories.categoryId], references: [categories.id] }),
}));
export const recipeImagesRelations = relations(recipeImages, ({ one }) => ({
  recipe: one(recipes, { fields: [recipeImages.recipeId], references: [recipes.id] }),
}));
export const favoritesRelations = relations(favorites, ({ one }) => ({
  user: one(users, { fields: [favorites.userId], references: [users.id] }),
  recipe: one(recipes, { fields: [favorites.recipeId], references: [recipes.id] }),
}));
