-- Issue #43: Accounts are identified by email. The owner approved wiping every existing Account instead of migrating it.
-- Deleting a user cascades to its sessions, sign-in methods, recipes, categories, favorites and write attempts.
DELETE FROM "users";--> statement-breakpoint
DELETE FROM "auth_verifications";--> statement-breakpoint
-- Login counters were keyed by username.
DELETE FROM "auth_rate_limits";--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "users_username_key";--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "users_username_normalized_check";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "username";
