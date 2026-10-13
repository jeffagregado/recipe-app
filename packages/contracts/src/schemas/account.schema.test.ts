import { describe, expect, it } from "vitest";

import { updateDisplayNameSchema } from "./account.schema.js";

describe("update display name", () => {
  it("accepts exactly a display name and trims it", () => {
    expect(updateDisplayNameSchema.parse({ displayName: "  Ana María 🍜 " })).toEqual({ displayName: "Ana María 🍜" });
  });

  it("rejects unknown fields including identity and ownership claims", () => {
    for (const extra of ["email", "id", "userId", "name", "emailVerified", "password"]) {
      expect(updateDisplayNameSchema.safeParse({ displayName: "Ana", [extra]: "x" }).success, extra).toBe(false);
    }
  });

  // The same rule as sign-up: one shared schema, so a name accepted there is accepted here.
  it.each([
    ["an empty name", "", "Enter a display name."],
    ["a blank name", "   ", "Enter a display name."],
    ["101 characters", "a".repeat(101), "Use at most 100 characters."],
    ["a control character", "Ana\nMaria", "Remove control characters."],
  ])("rejects %s on the display name field", (_case, displayName, message) => {
    const result = updateDisplayNameSchema.safeParse({ displayName });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => [issue.path.join("."), issue.message])).toEqual([["displayName", message]]);
  });

  it("accepts 100 characters, counted after trimming", () => {
    expect(updateDisplayNameSchema.safeParse({ displayName: ` ${"a".repeat(100)} ` }).success).toBe(true);
  });

  it.each([undefined, null, 7, "Ana", [], { displayName: 7 }, {}])("rejects the malformed body %j", (body) => {
    expect(updateDisplayNameSchema.safeParse(body).success).toBe(false);
  });
});
