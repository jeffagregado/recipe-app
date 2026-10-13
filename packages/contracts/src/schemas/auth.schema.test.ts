import { describe, expect, it } from "vitest";

import {
  authErrorResponseSchema,
  authSessionResponseSchema,
  authUserSchema,
  emailSchema,
  loginSchema,
  logoutSchema,
  resendVerificationSchema,
  signupResponseSchema,
  signupSchema,
  verifyEmailSchema,
} from "./auth.schema.js";
import { userSchema } from "./user.schema.js";

const password = "correct horse battery";
const email = "ana@example.invalid";
// 254 characters in total, the longest address accepted.
const longestEmail = `${"a".repeat(64)}@${"b".repeat(63)}.${"c".repeat(63)}.${"d".repeat(53)}.invalid`;

describe("email", () => {
  it("trims and lowercases accepted addresses", () => {
    expect(emailSchema.parse("  Ana.Maria+Tag@Example.INVALID ")).toBe("ana.maria+tag@example.invalid");
  });

  it.each(["", "   ", "ana", "ana@", "@example.invalid", "ana@example", "ana maria@example.invalid", "ana@@example.invalid", "ana@example..invalid"])(
    "rejects the malformed address %j",
    (value) => {
      expect(emailSchema.safeParse(value).success).toBe(false);
    },
  );

  it("bounds the address at 254 characters", () => {
    expect(longestEmail).toHaveLength(254);
    expect(emailSchema.safeParse(longestEmail).success).toBe(true);
    expect(emailSchema.safeParse(`a${longestEmail}`).success).toBe(false);
  });
});

describe("signup", () => {
  it("accepts exactly display name, email and password", () => {
    expect(signupSchema.parse({ displayName: "  Ana María 🍜 ", email: " Ana.Maria@Example.invalid ", password })).toEqual({
      displayName: "Ana María 🍜",
      email: "ana.maria@example.invalid",
      password,
    });
  });

  it("rejects unknown fields including username and ownership claims", () => {
    for (const extra of ["username", "userId", "role", "token", "ownerId", "emailVerified"]) {
      const result = signupSchema.safeParse({ displayName: "Ana", email, password, [extra]: "x" });
      expect(result.success, extra).toBe(false);
    }
  });

  it("bounds the display name and rejects control characters", () => {
    for (const displayName of ["", "   ", "a".repeat(101), "Ana\u0000", "Ana\nMaria", "Ana\u007f"]) {
      expect(signupSchema.safeParse({ displayName, email, password }).success).toBe(false);
    }
    expect(signupSchema.safeParse({ displayName: "a".repeat(100), email, password }).success).toBe(true);
  });

  it("keeps passwords untrimmed within 12-128 characters", () => {
    const padded = `  ${password}  `;
    expect(signupSchema.parse({ displayName: "Ana", email, password: padded }).password).toBe(padded);
    for (const value of ["x".repeat(11), "x".repeat(129)]) {
      expect(signupSchema.safeParse({ displayName: "Ana", email, password: value }).success).toBe(false);
    }
    expect(signupSchema.safeParse({ displayName: "Ana", email, password: "x".repeat(128) }).success).toBe(true);
  });
});

describe("login and logout", () => {
  it("normalizes the email and leaves the password untouched", () => {
    expect(loginSchema.parse({ email: " ANA@Example.invalid ", password: " short " })).toEqual({ email, password: " short " });
  });

  it("rejects unknown fields, a malformed email, empty and oversized passwords", () => {
    expect(loginSchema.safeParse({ email, password, username: "ana" }).success).toBe(false);
    expect(loginSchema.safeParse({ email: "ana", password }).success).toBe(false);
    expect(loginSchema.safeParse({ email, password: "" }).success).toBe(false);
    expect(loginSchema.safeParse({ email, password: "x".repeat(129) }).success).toBe(false);
  });

  it("accepts only an empty logout object", () => {
    expect(logoutSchema.safeParse({}).success).toBe(true);
    expect(logoutSchema.safeParse({ token: "x" }).success).toBe(false);
  });
});

describe("email verification", () => {
  it("normalizes the resend address and accepts nothing else", () => {
    expect(resendVerificationSchema.parse({ email: " ANA@Example.invalid " })).toEqual({ email });
    expect(resendVerificationSchema.safeParse({ email: "ana" }).success).toBe(false);
    expect(resendVerificationSchema.safeParse({ email, userId: "user-1" }).success).toBe(false);
  });

  it("accepts a token of 1 to 128 characters unchanged and nothing else", () => {
    expect(verifyEmailSchema.parse({ token: "Ab_-9" })).toEqual({ token: "Ab_-9" });
    expect(verifyEmailSchema.safeParse({ token: "x".repeat(128) }).success).toBe(true);
    for (const token of ["", "x".repeat(129), 7, null]) {
      expect(verifyEmailSchema.safeParse({ token }).success, String(token)).toBe(false);
    }
    expect(verifyEmailSchema.safeParse({ token: "x", email }).success).toBe(false);
  });

  it("answers signup with the verification requirement and no identity", () => {
    expect(signupResponseSchema.parse({ verificationRequired: true })).toEqual({ verificationRequired: true });
    expect(signupResponseSchema.safeParse({ verificationRequired: false }).success).toBe(false);
    expect(signupResponseSchema.safeParse({ verificationRequired: true, user: { id: "user-1", displayName: "Ana" } }).success).toBe(false);
  });
});

describe("public auth responses", () => {
  const user = { id: "user-1", displayName: "Ana" };

  it("exposes only id and display name", () => {
    expect(authUserSchema.parse(user)).toEqual(user);
    for (const extra of ["username", "email", "emailVerified", "token"]) {
      expect(authUserSchema.safeParse({ ...user, [extra]: "x" }).success, extra).toBe(false);
    }
    expect(authSessionResponseSchema.safeParse({ user, expiresAt: "2026-10-16T00:00:00.000Z" }).success).toBe(true);
    expect(authSessionResponseSchema.safeParse({ user, expiresAt: "2026-10-16T00:00:00.000Z", token: "x" }).success).toBe(false);
  });

  it("describes errors by code, message and optional field errors", () => {
    expect(authErrorResponseSchema.safeParse({ code: "EMAIL_ALREADY_EXISTS", message: "Email already exists." }).success).toBe(true);
    expect(authErrorResponseSchema.safeParse({ code: "VALIDATION_FAILED", message: "Invalid", fieldErrors: { email: ["Too long"] } }).success).toBe(true);
    for (const code of ["EMAIL_NOT_VERIFIED", "VERIFICATION_LINK_INVALID"]) {
      expect(authErrorResponseSchema.safeParse({ code, message: "x" }).success, code).toBe(true);
    }
    for (const code of ["USERNAME_UNAVAILABLE", "FAILED_TO_CREATE_USER"]) {
      expect(authErrorResponseSchema.safeParse({ code, message: "x" }).success, code).toBe(false);
    }
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
