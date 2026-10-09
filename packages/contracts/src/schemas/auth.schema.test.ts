import { describe, expect, it } from "vitest";

import {
  authErrorResponseSchema,
  authSessionResponseSchema,
  authUserSchema,
  loginSchema,
  logoutSchema,
  signupSchema,
  usernameSchema,
} from "./auth.schema.js";
import { userSchema } from "./user.schema.js";

const password = "correct horse battery";

describe("username", () => {
  it("trims and lowercases accepted usernames", () => {
    expect(usernameSchema.parse("  Alice_1 ")).toBe("alice_1");
    expect(usernameSchema.parse("a.b_c.9")).toBe("a.b_c.9");
  });

  it("enforces 3-30 ASCII letters, digits, underscore or dot", () => {
    for (const value of ["ab", "a".repeat(31), "ali ce", "ali-ce", "alice@x", "álice", ""]) {
      expect(usernameSchema.safeParse(value).success, value).toBe(false);
    }
    expect(usernameSchema.safeParse("a".repeat(30)).success).toBe(true);
  });

  it("rejects leading, trailing and consecutive dots", () => {
    for (const value of [".abc", "abc.", "a..b", "..."]) {
      expect(usernameSchema.safeParse(value).success, value).toBe(false);
    }
  });
});

describe("signup", () => {
  it("accepts exactly display name, username and password", () => {
    expect(signupSchema.parse({ displayName: "  Ana María 🍜 ", username: "Ana.Maria", password })).toEqual({
      displayName: "Ana María 🍜",
      username: "ana.maria",
      password,
    });
  });

  it("rejects unknown fields including email and ownership claims", () => {
    for (const extra of ["email", "userId", "role", "token", "ownerId"]) {
      const result = signupSchema.safeParse({ displayName: "Ana", username: "ana", password, [extra]: "x" });
      expect(result.success, extra).toBe(false);
    }
  });

  it("bounds the display name and rejects control characters", () => {
    for (const displayName of ["", "   ", "a".repeat(101), "Ana\u0000", "Ana\nMaria", "Ana\u007f"]) {
      expect(signupSchema.safeParse({ displayName, username: "ana", password }).success).toBe(false);
    }
    expect(signupSchema.safeParse({ displayName: "a".repeat(100), username: "ana", password }).success).toBe(true);
  });

  it("keeps passwords untrimmed within 12-128 characters", () => {
    const padded = `  ${password}  `;
    expect(signupSchema.parse({ displayName: "Ana", username: "ana", password: padded }).password).toBe(padded);
    for (const value of ["x".repeat(11), "x".repeat(129)]) {
      expect(signupSchema.safeParse({ displayName: "Ana", username: "ana", password: value }).success).toBe(false);
    }
    expect(signupSchema.safeParse({ displayName: "Ana", username: "ana", password: "x".repeat(128) }).success).toBe(true);
  });
});

describe("login and logout", () => {
  it("normalizes the username and leaves the password untouched", () => {
    expect(loginSchema.parse({ username: " ANA ", password: " short " })).toEqual({ username: "ana", password: " short " });
  });

  it("rejects unknown fields, empty and oversized passwords", () => {
    expect(loginSchema.safeParse({ username: "ana", password, email: "a@b.invalid" }).success).toBe(false);
    expect(loginSchema.safeParse({ username: "ana", password: "" }).success).toBe(false);
    expect(loginSchema.safeParse({ username: "ana", password: "x".repeat(129) }).success).toBe(false);
  });

  it("accepts only an empty logout object", () => {
    expect(logoutSchema.safeParse({}).success).toBe(true);
    expect(logoutSchema.safeParse({ token: "x" }).success).toBe(false);
  });
});

describe("public auth responses", () => {
  const user = { id: "user-1", displayName: "Ana", username: "ana" };

  it("exposes only id, display name and username", () => {
    expect(authUserSchema.parse(user)).toEqual(user);
    for (const extra of ["email", "emailVerified", "token"]) {
      expect(authUserSchema.safeParse({ ...user, [extra]: "x" }).success, extra).toBe(false);
    }
    expect(authSessionResponseSchema.safeParse({ user, expiresAt: "2026-10-16T00:00:00.000Z" }).success).toBe(true);
    expect(authSessionResponseSchema.safeParse({ user, expiresAt: "2026-10-16T00:00:00.000Z", token: "x" }).success).toBe(false);
  });

  it("describes errors by code, message and optional field errors", () => {
    expect(authErrorResponseSchema.safeParse({ code: "USERNAME_UNAVAILABLE", message: "Username is unavailable." }).success).toBe(true);
    expect(authErrorResponseSchema.safeParse({ code: "VALIDATION_FAILED", message: "Invalid", fieldErrors: { username: ["Too short"] } }).success).toBe(true);
    expect(authErrorResponseSchema.safeParse({ code: "FAILED_TO_CREATE_USER", message: "x" }).success).toBe(false);
  });

  it("keeps email out of the public user contract", () => {
    const result = userSchema.safeParse({
      id: "user-1", name: "Ana", imageUrl: null,
      createdAt: "2026-10-09T00:00:00.000Z", updatedAt: "2026-10-09T00:00:00.000Z",
    });
    expect(result.success).toBe(true);
    expect(result.success && "email" in result.data).toBe(false);
  });
});
