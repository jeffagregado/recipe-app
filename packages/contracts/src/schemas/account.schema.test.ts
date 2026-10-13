import { describe, expect, it } from "vitest";

import { cancelEmailChangeSchema, changeEmailSchema, changePasswordSchema, confirmEmailChangeResponseSchema, confirmEmailChangeSchema, disconnectGoogleSchema, requestSetPasswordSchema, resendEmailChangeSchema, updateDisplayNameSchema } from "./account.schema.js";

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

describe("change email", () => {
  const newEmail = "ana.new@example.invalid";
  const currentPassword = "old password";

  it("accepts exactly the new email and the current password, normalizing the email and leaving the password alone", () => {
    expect(changeEmailSchema.parse({ newEmail: "  Ana.New@Example.INVALID ", currentPassword: "  old password  " }))
      .toEqual({ newEmail: "ana.new@example.invalid", currentPassword: "  old password  " });
  });

  it("rejects unknown fields including identity and ownership claims", () => {
    for (const extra of ["email", "id", "userId", "token", "callbackURL", "password"]) {
      expect(changeEmailSchema.safeParse({ newEmail, currentPassword, [extra]: "x" }).success, extra).toBe(false);
    }
  });

  // The same rule as sign-up: one shared schema, so an address accepted there is accepted here.
  it.each([
    ["an empty email", "", "Enter your email."],
    ["a blank email", "   ", "Enter your email."],
    ["text that is not an address", "ana.new", "Enter a valid email address."],
    ["255 characters", `${"a".repeat(239)}@example.invalid`, "Use at most 254 characters."],
  ])("rejects %s on the new email field", (_case, value, message) => {
    const result = changeEmailSchema.safeParse({ newEmail: value, currentPassword });
    expect(result.error?.issues.map((issue) => [issue.path.join("."), issue.message])[0]).toEqual(["newEmail", message]);
  });

  // Any non-empty current password reaches verification, as at login.
  it.each([
    ["an empty current password", "", "Enter your current password."],
    ["a current password of 129 characters", "x".repeat(129), "Use at most 128 characters."],
  ])("rejects %s on its own field", (_case, value, message) => {
    const result = changeEmailSchema.safeParse({ newEmail, currentPassword: value });
    expect(result.error?.issues.map((issue) => [issue.path.join("."), issue.message])).toEqual([["currentPassword", message]]);
  });

  it("accepts a one-character current password", () => {
    expect(changeEmailSchema.safeParse({ newEmail, currentPassword: "x" }).success).toBe(true);
  });

  it.each([undefined, null, "ana.new@example.invalid", [], {}, { newEmail }, { currentPassword }, { newEmail: 7, currentPassword }])("rejects the malformed body %j", (body) => {
    expect(changeEmailSchema.safeParse(body).success).toBe(false);
  });
});

describe("confirm email change", () => {
  it("accepts exactly an opaque token of 1 to 128 characters", () => {
    for (const token of ["t", "t".repeat(128)]) expect(confirmEmailChangeSchema.parse({ token })).toEqual({ token });
    for (const body of [{ token: "" }, { token: "t".repeat(129) }, { token: 7 }, { token: "t", email: "ana@example.invalid" }, { token: "t", userId: "user-1" }, {}, undefined, null, []]) {
      expect(confirmEmailChangeSchema.safeParse(body).success, JSON.stringify(body)).toBe(false);
    }
  });

  it("answers only whether the caller is still signed in to the Account", () => {
    for (const signedIn of [true, false]) expect(confirmEmailChangeResponseSchema.parse({ signedIn })).toEqual({ signedIn });
    for (const body of [{}, { signedIn: "true" }, { signedIn: true, email: "ana@example.invalid" }]) {
      expect(confirmEmailChangeResponseSchema.safeParse(body).success, JSON.stringify(body)).toBe(false);
    }
  });
});

describe.each([
  ["resend email change", resendEmailChangeSchema],
  ["cancel email change", cancelEmailChangeSchema],
])("%s", (_name, schema) => {
  it("takes no input: the API acts on the signed-in Account's own pending address", () => {
    expect(schema.parse({})).toEqual({});
    for (const body of [{ newEmail: "ana.new@example.invalid" }, { userId: "user-1" }, undefined, null, []]) {
      expect(schema.safeParse(body).success, JSON.stringify(body)).toBe(false);
    }
  });
});

describe("disconnect Google", () => {
  it("takes no input: the API removes the signed-in Account's own Google identity", () => {
    expect(disconnectGoogleSchema.parse({})).toEqual({});
    for (const body of [{ accountId: "1" }, { userId: "user-1" }, undefined, null, []]) {
      expect(disconnectGoogleSchema.safeParse(body).success, JSON.stringify(body)).toBe(false);
    }
  });
});
