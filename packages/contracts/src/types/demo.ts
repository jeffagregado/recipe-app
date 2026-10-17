import type { AuthSessionResponse } from "./auth.js";

/**
 * Error codes of the live demo (issue #112), answered only when the API runs with `DEMO_MODE` on.
 *
 * - `DEMO_UNAVAILABLE`: the endpoint needs email, a password or Google, which the demo does not offer.
 * - `DEMO_UPLOADS_DISABLED`: a recipe create or update carried a photo.
 * - `DEMO_PHOTO_REMOVAL_DISABLED`: a recipe update removed an existing cover or step photo.
 * - `DEMO_RECIPE_LIMIT`: the Demo account already holds the most recipes it may.
 * - `DEMO_BUSY`: Start demo found the most live Demo accounts the demo allows.
 */
export const DEMO_ERROR_CODES = [
  "DEMO_UNAVAILABLE",
  "DEMO_UPLOADS_DISABLED",
  "DEMO_PHOTO_REMOVAL_DISABLED",
  "DEMO_RECIPE_LIMIT",
  "DEMO_BUSY",
] as const;

export type DemoErrorCode = (typeof DEMO_ERROR_CODES)[number];

/**
 * The error codes `POST /demo/start` answers: too many starts from this address (429, with `Retry-After`), the demo
 * full (503), a disallowed origin (403) and a failure that left no account behind (503).
 */
export const DEMO_START_ERROR_CODES = ["RATE_LIMITED", "DEMO_BUSY", "ORIGIN_REJECTED", "SERVICE_UNAVAILABLE"] as const;

export type DemoStartErrorCode = (typeof DEMO_START_ERROR_CODES)[number];

/** Start demo answers 201 with the new Demo account and when its session, and the account, expire. The session cookie comes with it. */
export type DemoStartResponse = AuthSessionResponse;
