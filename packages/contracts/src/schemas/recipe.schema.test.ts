import { describe, expect, it } from "vitest";

import {
  createRecipeMetadataSchema,
  createRecipeResultSchema,
  expectedRecipeFileFields,
  expectedRecipeUpdateFileFields,
  pendingPhotoSchema,
  recipeDetailSchema,
  recipeListItemSchema,
  recipeListQuerySchema,
  recipeListResponseSchema,
  updateRecipeMetadataSchema,
} from "./recipe.schema.js";
import { apiErrorEnvelopeSchema } from "./common.schema.js";
import { RECIPE_LIMITS } from "../types/recipe.js";

const ingredient = { name: " Salt ", quantity: null, unit: null };
const instruction = { description: " Stir ", hasImage: false };
const metadata = {
  title: " Soup ", description: null, categoryIds: [], servings: null,
  prepTimeMinutes: null, cookTimeMinutes: null, videoUrl: null, notes: null,
  ingredients: [ingredient], instructions: [instruction],
};

describe("recipe creation metadata", () => {
  it("rejects NUL in every creation text field with a field error", () => {
    const cases = [
      { title: "Soup\u0000" }, { description: "Text\u0000" }, { notes: "Note\u0000" },
      { videoUrl: "https://example.com/\u0000" },
      { ingredients: [{ ...ingredient, name: "Salt\u0000" }] },
      { instructions: [{ ...instruction, description: "Mix\u0000" }] },
    ];
    for (const value of cases) {
      const result = createRecipeMetadataSchema.safeParse({ ...metadata, ...value });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.issues.some((issue) => issue.message.includes("NUL"))).toBe(true);
    }
  });
  it("trims text, normalizes blank optional text and preserves category order", () => {
    const result = createRecipeMetadataSchema.parse({ ...metadata, description: " \t ", notes: " \n ", videoUrl: "  ", categoryIds: ["c-dinner", "c-lunch"] });
    expect(result).toMatchObject({ title: "Soup", description: null, notes: null, videoUrl: null, categoryIds: ["c-dinner", "c-lunch"], ingredients: [{ name: "Salt" }], instructions: [{ description: "Stir" }] });
    expect(createRecipeMetadataSchema.parse({ ...metadata, description: " Rich ", notes: " Tip " })).toMatchObject({ description: "Rich", notes: "Tip" });
  });

  it("enforces text boundaries and rejects blank required text", () => {
    for (const [field, limit] of [["title", 200], ["description", 2000], ["notes", 5000]] as const) {
      expect(createRecipeMetadataSchema.safeParse({ ...metadata, [field]: "x".repeat(limit) }).success, field).toBe(true);
      expect(createRecipeMetadataSchema.safeParse({ ...metadata, [field]: "x".repeat(limit + 1) }).success, field).toBe(false);
    }
    for (const [field, row, key, limit] of [["ingredients", ingredient, "name", 100], ["instructions", instruction, "description", 5000]] as const) {
      expect(createRecipeMetadataSchema.safeParse({ ...metadata, [field]: [{ ...row, [key]: "x".repeat(limit) }] }).success).toBe(true);
      for (const value of [" ", "x".repeat(limit + 1)]) {
        expect(createRecipeMetadataSchema.safeParse({ ...metadata, [field]: [{ ...row, [key]: value }] }).success).toBe(false);
      }
    }
    expect(createRecipeMetadataSchema.safeParse({ ...metadata, title: " " }).success).toBe(false);
  });

  it("requires 1–100 ingredients", () => {
    expect(createRecipeMetadataSchema.safeParse({ ...metadata, ingredients: Array.from({ length: 100 }, () => ingredient) }).success).toBe(true);
    for (const length of [0, 101]) {
      expect(createRecipeMetadataSchema.safeParse({ ...metadata, ingredients: Array.from({ length }, () => ingredient) }).success).toBe(false);
    }
  });

  it.each([
    ["create", createRecipeMetadataSchema, metadata, instruction],
    ["update", updateRecipeMetadataSchema, { ...metadata, cover: "keep" }, { id: null, description: "New", image: "remove" }],
  ] as const)("requires 1–50 steps on %s", (_request, schema, base, step) => {
    expect(schema.safeParse({ ...base, instructions: Array.from({ length: 50 }, () => step) }).success).toBe(true);
    for (const length of [0, 51]) {
      expect(schema.safeParse({ ...base, instructions: Array.from({ length }, () => step) }).success, String(length)).toBe(false);
    }
  });

  it("accepts zero to three unique category ids and no category names", () => {
    expect(createRecipeMetadataSchema.safeParse({ ...metadata, categoryIds: ["c1", "c2", "c3"] }).success).toBe(true);
    for (const categoryIds of [["c1", "c2", "c3", "c4"], ["c1", "c1"], [""], [{ id: "c1", name: "Dinner" }]]) {
      expect(createRecipeMetadataSchema.safeParse({ ...metadata, categoryIds }).success).toBe(false);
    }
    expect(createRecipeMetadataSchema.safeParse({ ...metadata, categories: ["Dinner"] }).success).toBe(false);
  });

  it("requires a parseable HTTPS video URL within 2048 characters", () => {
    const url = "https://example.com/";
    expect(createRecipeMetadataSchema.parse({ ...metadata, videoUrl: ` ${url} ` }).videoUrl).toBe(url);
    expect(createRecipeMetadataSchema.safeParse({ ...metadata, videoUrl: url + "x".repeat(2048 - url.length) }).success).toBe(true);
    for (const videoUrl of ["http://example.com", "javascript:alert(1)", "not a url", "https://", url + "x".repeat(2049 - url.length)]) {
      expect(createRecipeMetadataSchema.safeParse({ ...metadata, videoUrl }).success, videoUrl).toBe(false);
    }
  });

  it("requires finite positive quantities with at most three decimals and paired units", () => {
    for (const quantity of [0.001, 1.123, 1.001, 999999999.999]) {
      expect(createRecipeMetadataSchema.safeParse({ ...metadata, ingredients: [{ ...ingredient, quantity, unit: "g" }] }).success, String(quantity)).toBe(true);
    }
    for (const quantity of [0.0001, 1.1234, 999999999.9991, 0, -1, 1000000000, Infinity, NaN]) {
      expect(createRecipeMetadataSchema.safeParse({ ...metadata, ingredients: [{ ...ingredient, quantity, unit: "g" }] }).success, String(quantity)).toBe(false);
    }
    for (const row of [{ ...ingredient, quantity: 1 }, { ...ingredient, unit: "g" }, { ...ingredient, quantity: 1, unit: "unknown" }]) {
      expect(createRecipeMetadataSchema.safeParse({ ...metadata, ingredients: [row] }).success).toBe(false);
    }
    expect(createRecipeMetadataSchema.safeParse(metadata).success).toBe(true);
  });

  it("enforces integer ceilings and allows zero minutes only", () => {
    for (const field of ["servings", "prepTimeMinutes", "cookTimeMinutes"] as const) {
      expect(createRecipeMetadataSchema.safeParse({ ...metadata, [field]: 2147483647 }).success).toBe(true);
      for (const value of [2147483648, -1, 1.5]) {
        expect(createRecipeMetadataSchema.safeParse({ ...metadata, [field]: value }).success).toBe(false);
      }
      expect(createRecipeMetadataSchema.safeParse({ ...metadata, [field]: 0 }).success).toBe(field !== "servings");
    }
  });

  it("rejects missing keys, ownership claims and unknown nested keys", () => {
    for (const key of Object.keys(metadata)) {
      const missing: Record<string, unknown> = { ...metadata };
      delete missing[key];
      expect(createRecipeMetadataSchema.safeParse(missing).success, key).toBe(false);
    }
    for (const key of ["id", "userId", "imageUrl", "objectKey", "sortOrder", "createdAt"]) {
      expect(createRecipeMetadataSchema.safeParse({ ...metadata, [key]: "x" }).success, key).toBe(false);
      expect(createRecipeMetadataSchema.safeParse({ ...metadata, ingredients: [{ ...ingredient, [key]: "x" }] }).success, key).toBe(false);
      expect(createRecipeMetadataSchema.safeParse({ ...metadata, instructions: [{ ...instruction, [key]: "x" }] }).success, key).toBe(false);
    }
    for (const key of ["quantity", "unit", "name"]) {
      const missing: Record<string, unknown> = { ...ingredient };
      delete missing[key];
      expect(createRecipeMetadataSchema.safeParse({ ...metadata, ingredients: [missing] }).success).toBe(false);
    }
    expect(createRecipeMetadataSchema.safeParse({ ...metadata, instructions: [{ description: "Stir" }] }).success).toBe(false);
    expect(createRecipeMetadataSchema.safeParse({ ...metadata, instructions: [{ ...instruction, hasImage: "true" }] }).success).toBe(false);
    expect(createRecipeMetadataSchema.safeParse({ ...metadata, ingredients: [{ ...ingredient, preparation: null, note: null }] }).success).toBe(true);
    for (const key of ["preparation", "note"]) {
      expect(createRecipeMetadataSchema.safeParse({ ...metadata, ingredients: [{ ...ingredient, [key]: "text" }] }).success).toBe(false);
    }
  });
});

describe("recipe files and responses", () => {
  it("declares cover first and image steps by original zero-based index", () => {
    const parsed = createRecipeMetadataSchema.parse({ ...metadata, instructions: [instruction, { ...instruction, hasImage: true }, instruction, { ...instruction, hasImage: true }] });
    expect(expectedRecipeFileFields(parsed, true)).toEqual(["cover", "step-1", "step-3"]);
    expect(expectedRecipeFileFields(parsed, false)).toEqual(["step-1", "step-3"]);
    expect(expectedRecipeFileFields(createRecipeMetadataSchema.parse(metadata), false)).toEqual([]);
    const all = createRecipeMetadataSchema.parse({ ...metadata, instructions: Array.from({ length: 50 }, () => ({ ...instruction, hasImage: true })) });
    expect(expectedRecipeFileFields(all, true)).toHaveLength(51);
    expect(expectedRecipeFileFields(all, true).at(-1)).toBe("step-49");
  });

  it("validates creation IDs and general API errors", () => {
    expect(createRecipeResultSchema.parse({ id: "recipe-1" })).toEqual({ id: "recipe-1" });
    expect(createRecipeResultSchema.safeParse({ id: "" }).success).toBe(false);
    expect(apiErrorEnvelopeSchema.safeParse({ code: "RECIPE_WRITE_PENDING", message: "Pending", fieldErrors: { title: ["Required"] } }).success).toBe(true);
    expect(apiErrorEnvelopeSchema.safeParse({ code: "ERROR", message: "Failed", fieldErrors: { title: "Required" } }).success).toBe(false);
  });

  it("validates nullable detail fields and per-instruction image URLs", () => {
    const detail = { id: "r1", userId: "u1", title: "Soup", categories: [], description: null, imageUrl: null, servings: null, prepTimeMinutes: null, cookTimeMinutes: null, ingredients: [], instructions: [{ id: "s1", stepNumber: 1, description: "Stir", imageUrl: null, heading: null }], isFavorite: false, notes: null, videoUrl: null, createdAt: "2026-10-09T00:00:00.000Z", updatedAt: "2026-10-09T00:00:00.000Z" };
    expect(recipeDetailSchema.safeParse(detail).success).toBe(true);
    expect(recipeDetailSchema.safeParse({ ...detail, isFavorite: undefined }).success).toBe(false);
    expect(recipeDetailSchema.safeParse({ ...detail, notes: "x".repeat(5000), videoUrl: "x".repeat(2048), instructions: [{ ...detail.instructions[0], imageUrl: "https://example.com/step.png" }] }).success).toBe(true);
    for (const invalid of [{ ...detail, notes: "x".repeat(5001) }, { ...detail, videoUrl: "x".repeat(2049) }, { ...detail, instructions: [{ ...detail.instructions[0], imageUrl: "invalid" }] }]) {
      expect(recipeDetailSchema.safeParse(invalid).success).toBe(false);
    }
  });
});

describe("recipe update metadata", () => {
  const update = { ...metadata, cover: "keep", instructions: [{ id: "step-a", description: " Stir ", image: "keep" }] };

  it("accepts keep, replace and remove slots and applies the creation rules", () => {
    expect(updateRecipeMetadataSchema.parse(update)).toMatchObject({ title: "Soup", cover: "keep", instructions: [{ id: "step-a", description: "Stir", image: "keep" }] });
    for (const slot of ["replace", "remove"]) {
      expect(updateRecipeMetadataSchema.safeParse({ ...update, cover: slot, instructions: [{ id: null, description: "New", image: slot }] }).success, slot).toBe(true);
    }
    expect(updateRecipeMetadataSchema.safeParse({ ...update, title: " " }).success).toBe(false);
    expect(updateRecipeMetadataSchema.safeParse({ ...update, cover: "delete" }).success).toBe(false);
  });

  it("rejects keeping a photo on a new step, reused step ids and unknown keys", () => {
    expect(updateRecipeMetadataSchema.safeParse({ ...update, instructions: [{ id: null, description: "New", image: "keep" }] }).success).toBe(false);
    const twice = { id: "step-a", description: "Stir", image: "keep" };
    expect(updateRecipeMetadataSchema.safeParse({ ...update, instructions: [twice, twice] }).success).toBe(false);
    expect(updateRecipeMetadataSchema.safeParse({ ...update, userId: "other" }).success).toBe(false);
    expect(updateRecipeMetadataSchema.safeParse({ ...update, instructions: [{ ...twice, hasImage: true }] }).success).toBe(false);
  });

  it("names one file field per replaced slot", () => {
    const parsed = updateRecipeMetadataSchema.parse({ ...update, cover: "replace", instructions: [
      { id: "step-a", description: "One", image: "keep" }, { id: null, description: "Two", image: "replace" }, { id: "step-b", description: "Three", image: "remove" },
    ] });
    expect(expectedRecipeUpdateFileFields(parsed)).toEqual(["cover", "step-1"]);
    expect(expectedRecipeUpdateFileFields(updateRecipeMetadataSchema.parse(update))).toEqual([]);
  });
});

describe("Pending photos", () => {
  const pendingPhotoId = "0b0f6a3e-4c1d-4d6e-9f1a-2b3c4d5e6f70";
  const update = { ...metadata, cover: "keep", instructions: [{ id: "step-a", description: "Stir", image: "keep" }] };

  it("stores at most 4 MiB per photo and sends one photo per request within Vercel's 4.5 MB", () => {
    expect(RECIPE_LIMITS.imageBytes).toBe(4_194_304);
    expect(RECIPE_LIMITS.photoRequestBytes).toBe(4_259_840);
  });

  it.each([
    ["create", createRecipeMetadataSchema, metadata],
    ["update", updateRecipeMetadataSchema, update],
  ] as const)("lets the %s cover name a Pending photo by its UUID", (_name, schema, base) => {
    expect(schema.parse({ ...base, cover: { pendingPhotoId } })).toMatchObject({ cover: { pendingPhotoId } });
    for (const cover of [{ pendingPhotoId: "photo-1" }, { pendingPhotoId, extra: true }, {}, pendingPhotoId]) {
      expect(schema.safeParse({ ...base, cover }).success, JSON.stringify(cover)).toBe(false);
    }
  });

  it("expects no cover file when the cover names a Pending photo", () => {
    const create = createRecipeMetadataSchema.parse({ ...metadata, cover: { pendingPhotoId }, instructions: [instruction, { ...instruction, hasImage: true }] });
    expect(expectedRecipeFileFields(create, true)).toEqual(["step-1"]);
    const edit = updateRecipeMetadataSchema.parse({ ...update, cover: { pendingPhotoId }, instructions: [{ id: null, description: "New", image: "replace" }] });
    expect(expectedRecipeUpdateFileFields(edit)).toEqual(["step-0"]);
  });

  it("answers an upload with the Pending photo's UUID", () => {
    expect(pendingPhotoSchema.parse({ id: pendingPhotoId })).toEqual({ id: pendingPhotoId });
    expect(pendingPhotoSchema.safeParse({ id: "photo-1" }).success).toBe(false);
    expect(pendingPhotoSchema.safeParse({}).success).toBe(false);
  });
});

describe("favorite state in recipe responses", () => {
  it("requires isFavorite on list items", () => {
    const item = { id: "r1", title: "Soup", categories: [], description: null, imageUrl: null, servings: null, prepTimeMinutes: null, cookTimeMinutes: null, createdAt: "2026-10-09T00:00:00.000Z", updatedAt: "2026-10-09T00:00:00.000Z" };
    expect(recipeListItemSchema.safeParse({ ...item, isFavorite: true }).success).toBe(true);
    expect(recipeListItemSchema.safeParse(item).success).toBe(false);
  });

  it("requires the favorites total beside the other list counts", () => {
    const meta = { page: 1, limit: 20, total: 0, totalPages: 0 };
    const counts = { total: 2, categories: [{ id: "c1", name: "Dinner", total: 2 }, { id: "c2", name: "Soup", total: 0 }] };
    expect(recipeListResponseSchema.safeParse({ data: [], meta, counts: { ...counts, favorites: 1 } }).success).toBe(true);
    expect(recipeListResponseSchema.safeParse({ data: [], meta, counts }).success).toBe(false);
    expect(recipeListResponseSchema.safeParse({ data: [], meta, counts: { ...counts, favorites: -1 } }).success).toBe(false);
  });
});

describe("favorites filter in the recipe list query", () => {
  it("is off by default and on only for the literal true", () => {
    expect(recipeListQuerySchema.parse({}).favorites).toBeUndefined();
    expect(recipeListQuerySchema.parse({ favorites: "true" }).favorites).toBe(true);
  });

  it.each([["false"], [""], ["1"], ["TRUE"], [["true", "true"]]])("rejects favorites=%j", (favorites) => {
    expect(recipeListQuerySchema.safeParse({ favorites }).success).toBe(false);
  });
});

describe("categories in recipe responses and the list query", () => {
  const item = { id: "r1", title: "Soup", description: null, imageUrl: null, servings: null, prepTimeMinutes: null, cookTimeMinutes: null, isFavorite: false, createdAt: "2026-10-09T00:00:00.000Z", updatedAt: "2026-10-09T00:00:00.000Z" };
  const category = (id: string) => ({ id, name: `Name ${id}` });

  it("carries up to three ordered categories as id and name", () => {
    const categories = [category("c2"), category("c1"), category("c3")];
    expect(recipeListItemSchema.parse({ ...item, categories }).categories).toEqual(categories);
    for (const invalid of [[...categories, category("c4")], [category("c1"), category("c1")], ["Dinner"]]) {
      expect(recipeListItemSchema.safeParse({ ...item, categories: invalid }).success).toBe(false);
    }
  });

  it("lists category totals by id in the owner's order, with none for an owner without categories", () => {
    const meta = { page: 1, limit: 20, total: 0, totalPages: 0 };
    expect(recipeListResponseSchema.safeParse({ data: [], meta, counts: { total: 0, favorites: 0, categories: [] } }).success).toBe(true);
    for (const categories of [{ Dinner: 2 }, [{ id: "c1", name: "Dinner" }], [{ id: "c1", name: "Dinner", total: -1 }]]) {
      expect(recipeListResponseSchema.safeParse({ data: [], meta, counts: { total: 0, favorites: 0, categories } }).success).toBe(false);
    }
  });

  it("filters by a category id, never a repeated or blank value", () => {
    expect(recipeListQuerySchema.parse({ category: "c1" }).category).toBe("c1");
    expect(recipeListQuerySchema.parse({}).category).toBeUndefined();
    for (const value of ["", ["c1", "c2"], "x".repeat(201)]) expect(recipeListQuerySchema.safeParse({ category: value }).success).toBe(false);
  });
});

describe("group headings on ingredient and instruction rows", () => {
  const update = { ...metadata, cover: "keep", instructions: [{ id: null, description: "Stir", image: "remove" }] };
  const cases = [
    ["create ingredients", createRecipeMetadataSchema, metadata, "ingredients", ingredient, 100],
    ["create instructions", createRecipeMetadataSchema, metadata, "instructions", instruction, 50],
    ["update ingredients", updateRecipeMetadataSchema, update, "ingredients", ingredient, 100],
    ["update instructions", updateRecipeMetadataSchema, update, "instructions", update.instructions[0], 50],
  ] as const;

  it.each(cases)("trims a heading of 1–100 characters on any row of %s, the first row included", (_name, schema, base, field, row) => {
    const parsed = schema.parse({ ...base, [field]: [{ ...row, heading: null }, { ...row, heading: "  Sauce  " }, row] }) as unknown as Record<string, Array<{ heading?: string | null }>>;
    expect(parsed[field].map((item) => item.heading)).toEqual([null, "Sauce", undefined]);
    expect(schema.safeParse({ ...base, [field]: [row, { ...row, heading: "x".repeat(100) }] }).success).toBe(true);
    for (const heading of ["", "   ", "x".repeat(101), "Sauce\u0000"]) {
      expect(schema.safeParse({ ...base, [field]: [row, { ...row, heading }] }).success, JSON.stringify(heading)).toBe(false);
      expect(schema.safeParse({ ...base, [field]: [{ ...row, heading }, row] }).success, `first row ${JSON.stringify(heading)}`).toBe(false);
    }
    const first = schema.parse({ ...base, [field]: [{ ...row, heading: " Dough " }, row] }) as unknown as Record<string, Array<{ heading?: string | null }>>;
    expect(first[field].map((item) => item.heading)).toEqual(["Dough", undefined]);
  });

  it.each(cases)("counts the row limit across all groups on %s", (_name, schema, base, field, row, limit) => {
    const rows = (length: number) => Array.from({ length }, (_, index) => ({ ...row, heading: index > 0 && index % 10 === 0 ? `Group ${index}` : null }));
    expect(schema.safeParse({ ...base, [field]: rows(limit) }).success).toBe(true);
    expect(schema.safeParse({ ...base, [field]: rows(limit + 1) }).success).toBe(false);
  });

  it("returns a nullable heading on every detail row", () => {
    const detail = { id: "r1", userId: "u1", title: "Soup", categories: [], description: null, imageUrl: null, servings: null, prepTimeMinutes: null, cookTimeMinutes: null,
      ingredients: [{ id: "i1", ingredientId: "g1", name: "Salt", quantity: null, unit: null, preparation: null, note: null, sortOrder: 0, heading: null }],
      instructions: [{ id: "s1", stepNumber: 1, description: "Stir", imageUrl: null, heading: null }, { id: "s2", stepNumber: 2, description: "Serve", imageUrl: null, heading: "Finish" }],
      isFavorite: false, notes: null, videoUrl: null, createdAt: "2026-10-09T00:00:00.000Z", updatedAt: "2026-10-09T00:00:00.000Z" };
    expect(recipeDetailSchema.safeParse(detail).success).toBe(true);
    const { heading: _heading, ...withoutHeading } = detail.ingredients[0];
    expect(recipeDetailSchema.safeParse({ ...detail, ingredients: [withoutHeading] }).success).toBe(false);
  });
});
