import { describe, expect, it } from "vitest";

import { changePasswordSchema, requestSetPasswordSchema, updateDisplayNameSchema } from "./account.schema.js";

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

describe("change password", () => {
  const currentPassword = "old password";
  const newPassword = "x".repeat(12);

  it("accepts exactly the current and the new password and trims neither", () => {
    const padded = { currentPassword: "  old password  ", newPassword: `  ${newPassword}  ` };
    expect(changePasswordSchema.parse(padded)).toEqual(padded);
  });

  it("rejects unknown fields including identity and ownership claims", () => {
    for (const extra of ["email", "id", "userId", "token", "revokeOtherSessions", "password"]) {
      expect(changePasswordSchema.safeParse({ currentPassword, newPassword, [extra]: "x" }).success, extra).toBe(false);
    }
  });

  // The same rule as sign-up for the new password: one shared schema, 12 to 128 characters.
  it.each([
    ["11 characters", "x".repeat(11), "Use at least 12 characters."],
    ["129 characters", "x".repeat(129), "Use at most 128 characters."],
  ])("rejects a new password of %s on its own field", (_case, value, message) => {
    const result = changePasswordSchema.safeParse({ currentPassword, newPassword: value });
    expect(result.error?.issues.map((issue) => [issue.path.join("."), issue.message])).toEqual([["newPassword", message]]);
  });

  it("accepts a new password of 12 and of 128 characters", () => {
    for (const length of [12, 128]) expect(changePasswordSchema.safeParse({ currentPassword, newPassword: "x".repeat(length) }).success, String(length)).toBe(true);
  });

  // Any non-empty current password reaches verification, as at login: an old password may predate today's rule.
  it.each([
    ["an empty current password", "", "Enter your current password."],
    ["a current password of 129 characters", "x".repeat(129), "Use at most 128 characters."],
  ])("rejects %s on its own field", (_case, value, message) => {
    const result = changePasswordSchema.safeParse({ currentPassword: value, newPassword });
    expect(result.error?.issues.map((issue) => [issue.path.join("."), issue.message])).toEqual([["currentPassword", message]]);
  });

  it("accepts a one-character current password", () => {
    expect(changePasswordSchema.safeParse({ currentPassword: "x", newPassword }).success).toBe(true);
  });

  it.each([undefined, null, "secret", [], {}, { currentPassword }, { newPassword }, { currentPassword: 7, newPassword }])("rejects the malformed body %j", (body) => {
    expect(changePasswordSchema.safeParse(body).success).toBe(false);
  });
});

describe("request set password", () => {
  it("takes no input: the API mails the signed-in Account's own address", () => {
    expect(requestSetPasswordSchema.parse({})).toEqual({});
    for (const body of [{ email: "ana@example.invalid" }, { userId: "user-1" }, undefined, null, []]) {
      expect(requestSetPasswordSchema.safeParse(body).success, JSON.stringify(body)).toBe(false);
    }
  });
});
