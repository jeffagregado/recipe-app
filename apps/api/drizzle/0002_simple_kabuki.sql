ALTER TABLE "users" ADD COLUMN "username" text;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_username_key" UNIQUE("username");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_username_normalized_check" CHECK ("users"."username" = lower(btrim("users"."username")) AND length("users"."username") BETWEEN 3 AND 30);