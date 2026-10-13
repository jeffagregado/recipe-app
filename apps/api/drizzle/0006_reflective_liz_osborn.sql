ALTER TABLE "auth_accounts" ADD COLUMN "provider_email" text;--> statement-breakpoint
ALTER TABLE "auth_accounts" ADD CONSTRAINT "auth_accounts_user_provider_key" UNIQUE("user_id","provider_id");