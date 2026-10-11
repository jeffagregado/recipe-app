import { describe, expect, it } from "vitest";

import { RECIPE_LIMITS } from "../types/recipe.js";
import { categoryIdSchema, categoryListSchema, categoryNameSchema, saveCategoriesSchema } from "./category.schema.js";

const names = (count: number) => Array.from({ length: count }, (_, index) => ({ name: `Name ${index}` }));
const issuePaths = (input: unknown) => {
  const result = saveCategoriesSchema.safeParse(input);
  return result.success ? [] : result.error.issues.map((issue) => issue.path.join("."));
};

describe("category name", () => {
  it.each([
    ["  Dinner  ", "Dinner"],
    ["Slow \t\n  food", "Slow food"],
    ["x".repeat(10), "x".repeat(10)],
    ["  " + "x".repeat(10) + "  ", "x".repeat(10)],
    ["Crème 🍮", "Crème 🍮"],
  ])("normalizes %j to %j", (input, expected) => {
    expect(categoryNameSchema.parse(input)).toBe(expected);
  });

  it.each([[""], ["   "], ["\t\n"], ["x".repeat(11)], ["a b c d e f"], ["Soup\u0000"], [5], [null]])("rejects %j", (input) => {
    expect(categoryNameSchema.safeParse(input).success).toBe(false);
  });
});

describe("category id", () => {
  it("accepts an opaque id and rejects blank, oversized and NUL values", () => {
    expect(categoryIdSchema.parse("3f0c6f1e-category")).toBe("3f0c6f1e-category");
    for (const id of ["", "x".repeat(201), "id\u0000", 7, ["a", "b"]]) expect(categoryIdSchema.safeParse(id).success, String(id)).toBe(false);
  });
});

describe("saved category set", () => {
  it("allows an empty set and up to ten categories per user", () => {
    expect(RECIPE_LIMITS.categoriesPerUser).toBe(10);
    expect(saveCategoriesSchema.parse([])).toEqual([]);
    expect(saveCategoriesSchema.safeParse(names(10)).success).toBe(true);
    expect(saveCategoriesSchema.safeParse(names(11)).success).toBe(false);
  });

  it("keeps ids on existing rows, leaves new rows without one and normalizes names", () => {
    expect(saveCategoriesSchema.parse([{ id: "c1", name: " Late   night " }, { name: "Soup" }])).toEqual([{ id: "c1", name: "Late night" }, { name: "Soup" }]);
  });

  it("reports a duplicate name, ignoring case and spacing, on the later row", () => {
    expect(issuePaths([{ id: "c1", name: "Dinner" }, { name: "Soup" }, { name: "  dinner " }])).toEqual(["2.name"]);
    const result = saveCategoriesSchema.safeParse([{ name: "Dinner" }, { name: "DINNER" }]);
    expect(result.success ? "" : result.error.issues[0].message).toBe("“Dinner” already exists. Choose a different name.");
  });

  it("reports a repeated id on the later row", () => {
    expect(issuePaths([{ id: "c1", name: "Dinner" }, { id: "c1", name: "Soup" }])).toEqual(["1.id"]);
  });

  it("reports an invalid name on its own row", () => {
    expect(issuePaths([{ name: "Soup" }, { name: " " }, { name: "x".repeat(11) }])).toEqual(["1.name", "2.name"]);
  });

  it("rejects ownership claims and other unknown keys", () => {
    for (const key of ["userId", "sortOrder", "recipeCount"]) expect(saveCategoriesSchema.safeParse([{ name: "Soup", [key]: 1 }]).success, key).toBe(false);
    expect(saveCategoriesSchema.safeParse({ categories: [] }).success).toBe(false);
  });
});

describe("category list response", () => {
  it("requires a non-negative whole recipe count on every category", () => {
    expect(categoryListSchema.safeParse([{ id: "c1", name: "Dinner", recipeCount: 0 }, { id: "c2", name: "Soup", recipeCount: 12 }]).success).toBe(true);
    for (const recipeCount of [undefined, -1, 1.5]) expect(categoryListSchema.safeParse([{ id: "c1", name: "Dinner", recipeCount }]).success).toBe(false);
  });
});
