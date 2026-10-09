CREATE TABLE "recipe_write_attempts" (
	"id" text DEFAULT gen_random_uuid()::text NOT NULL,
	"user_id" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"operation" text NOT NULL,
	"request_hash" text NOT NULL,
	"recipe_id" text NOT NULL,
	"object_keys" text[] DEFAULT '{}'::text[] NOT NULL,
	"stale_object_keys" text[] DEFAULT '{}'::text[] NOT NULL,
	"state" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recipe_write_attempts_pkey" PRIMARY KEY("id"),
	CONSTRAINT "recipe_write_attempts_user_key_key" UNIQUE("user_id","idempotency_key"),
	CONSTRAINT "recipe_write_attempts_idempotency_key_check" CHECK (length("recipe_write_attempts"."idempotency_key") BETWEEN 1 AND 200),
	CONSTRAINT "recipe_write_attempts_operation_check" CHECK ("recipe_write_attempts"."operation" IN ('create', 'update', 'delete')),
	CONSTRAINT "recipe_write_attempts_state_check" CHECK ("recipe_write_attempts"."state" IN ('pending', 'completed', 'cleanup_pending'))
);
--> statement-breakpoint
ALTER TABLE "recipe_instructions" ADD COLUMN "image_id" text;--> statement-breakpoint
ALTER TABLE "recipes" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "recipes" ADD COLUMN "video_url" text;--> statement-breakpoint
ALTER TABLE "recipe_write_attempts" ADD CONSTRAINT "recipe_write_attempts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recipe_write_attempts_state_created_at_idx" ON "recipe_write_attempts" USING btree ("state","created_at");--> statement-breakpoint
ALTER TABLE "recipe_instructions" ADD CONSTRAINT "recipe_instructions_image_id_fkey" FOREIGN KEY ("image_id") REFERENCES "public"."recipe_images"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_instructions" ADD CONSTRAINT "recipe_instructions_image_id_key" UNIQUE("image_id");--> statement-breakpoint
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_notes_check" CHECK (length("recipes"."notes") <= 5000);--> statement-breakpoint
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_video_url_check" CHECK (length("recipes"."video_url") <= 2048);