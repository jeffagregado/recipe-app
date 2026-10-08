CREATE TABLE "auth_accounts" (
	"id" text DEFAULT gen_random_uuid()::text NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_accounts_pkey" PRIMARY KEY("id"),
	CONSTRAINT "auth_accounts_provider_account_key" UNIQUE("provider_id","account_id")
);
--> statement-breakpoint
CREATE TABLE "auth_rate_limits" (
	"id" text DEFAULT gen_random_uuid()::text NOT NULL,
	"key" text NOT NULL,
	"count" integer NOT NULL,
	"last_request" bigint NOT NULL,
	CONSTRAINT "auth_rate_limits_pkey" PRIMARY KEY("id"),
	CONSTRAINT "auth_rate_limits_key_key" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "auth_sessions" (
	"id" text DEFAULT gen_random_uuid()::text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "auth_sessions_pkey" PRIMARY KEY("id"),
	CONSTRAINT "auth_sessions_token_key" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "auth_verifications" (
	"id" text DEFAULT gen_random_uuid()::text NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_verifications_pkey" PRIMARY KEY("id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text DEFAULT gen_random_uuid()::text NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_pkey" PRIMARY KEY("id"),
	CONSTRAINT "users_email_key" UNIQUE("email"),
	CONSTRAINT "users_email_normalized_check" CHECK ("users"."email" = lower(btrim("users"."email")) AND length("users"."email") > 0)
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" text DEFAULT gen_random_uuid()::text NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "categories_pkey" PRIMARY KEY("id"),
	CONSTRAINT "categories_name_key" UNIQUE("name"),
	CONSTRAINT "categories_name_check" CHECK ("categories"."name" IN ('Breakfast', 'Lunch', 'Dinner', 'Snacks', 'Desserts'))
);
--> statement-breakpoint
CREATE TABLE "favorites" (
	"user_id" text NOT NULL,
	"recipe_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "favorites_pkey" PRIMARY KEY("user_id","recipe_id")
);
--> statement-breakpoint
CREATE TABLE "ingredients" (
	"id" text DEFAULT gen_random_uuid()::text NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "ingredients_pkey" PRIMARY KEY("id"),
	CONSTRAINT "ingredients_name_check" CHECK (length(btrim("ingredients"."name")) BETWEEN 1 AND 100)
);
--> statement-breakpoint
CREATE TABLE "recipe_categories" (
	"recipe_id" text NOT NULL,
	"category_id" text NOT NULL,
	"sort_order" integer NOT NULL,
	CONSTRAINT "recipe_categories_pkey" PRIMARY KEY("recipe_id","category_id"),
	CONSTRAINT "recipe_categories_recipe_order_key" UNIQUE("recipe_id","sort_order"),
	CONSTRAINT "recipe_categories_sort_order_check" CHECK ("recipe_categories"."sort_order" BETWEEN 0 AND 2)
);
--> statement-breakpoint
CREATE TABLE "recipe_images" (
	"id" text DEFAULT gen_random_uuid()::text NOT NULL,
	"recipe_id" text NOT NULL,
	"object_key" text NOT NULL,
	"alt_text" text,
	"sort_order" integer NOT NULL,
	CONSTRAINT "recipe_images_pkey" PRIMARY KEY("id"),
	CONSTRAINT "recipe_images_object_key_key" UNIQUE("object_key"),
	CONSTRAINT "recipe_images_recipe_order_key" UNIQUE("recipe_id","sort_order"),
	CONSTRAINT "recipe_images_object_key_check" CHECK (length(btrim("recipe_images"."object_key")) > 0),
	CONSTRAINT "recipe_images_sort_order_check" CHECK ("recipe_images"."sort_order" >= 0)
);
--> statement-breakpoint
CREATE TABLE "recipe_ingredients" (
	"id" text DEFAULT gen_random_uuid()::text NOT NULL,
	"recipe_id" text NOT NULL,
	"ingredient_id" text NOT NULL,
	"name" text NOT NULL,
	"quantity" numeric(12, 3),
	"unit" text,
	"preparation" text,
	"note" text,
	"sort_order" integer NOT NULL,
	CONSTRAINT "recipe_ingredients_pkey" PRIMARY KEY("id"),
	CONSTRAINT "recipe_ingredients_recipe_order_key" UNIQUE("recipe_id","sort_order"),
	CONSTRAINT "recipe_ingredients_name_check" CHECK (length(btrim("recipe_ingredients"."name")) BETWEEN 1 AND 100),
	CONSTRAINT "recipe_ingredients_quantity_check" CHECK ("recipe_ingredients"."quantity" > 0),
	CONSTRAINT "recipe_ingredients_unit_check" CHECK ("recipe_ingredients"."unit" IN ('tsp', 'tbsp', 'cup', 'ml', 'l', 'g', 'kg', 'oz', 'lb', 'piece', 'clove', 'pinch', 'slice', 'can', 'pack')),
	CONSTRAINT "recipe_ingredients_preparation_check" CHECK (length("recipe_ingredients"."preparation") <= 200),
	CONSTRAINT "recipe_ingredients_note_check" CHECK (length("recipe_ingredients"."note") <= 500),
	CONSTRAINT "recipe_ingredients_sort_order_check" CHECK ("recipe_ingredients"."sort_order" >= 0)
);
--> statement-breakpoint
CREATE TABLE "recipe_instructions" (
	"id" text DEFAULT gen_random_uuid()::text NOT NULL,
	"recipe_id" text NOT NULL,
	"step_number" integer NOT NULL,
	"description" text NOT NULL,
	CONSTRAINT "recipe_instructions_pkey" PRIMARY KEY("id"),
	CONSTRAINT "recipe_instructions_recipe_step_key" UNIQUE("recipe_id","step_number"),
	CONSTRAINT "recipe_instructions_step_number_check" CHECK ("recipe_instructions"."step_number" > 0),
	CONSTRAINT "recipe_instructions_description_check" CHECK (length(btrim("recipe_instructions"."description")) BETWEEN 1 AND 5000)
);
--> statement-breakpoint
CREATE TABLE "recipes" (
	"id" text DEFAULT gen_random_uuid()::text NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"servings" integer,
	"prep_time_minutes" integer,
	"cook_time_minutes" integer,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recipes_pkey" PRIMARY KEY("id"),
	CONSTRAINT "recipes_title_check" CHECK (length(btrim("recipes"."title")) BETWEEN 1 AND 200),
	CONSTRAINT "recipes_description_check" CHECK (length("recipes"."description") <= 2000),
	CONSTRAINT "recipes_servings_check" CHECK ("recipes"."servings" > 0),
	CONSTRAINT "recipes_prep_time_check" CHECK ("recipes"."prep_time_minutes" >= 0),
	CONSTRAINT "recipes_cook_time_check" CHECK ("recipes"."cook_time_minutes" >= 0),
	CONSTRAINT "recipes_sort_order_check" CHECK ("recipes"."sort_order" >= 0)
);
--> statement-breakpoint
ALTER TABLE "auth_accounts" ADD CONSTRAINT "auth_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_categories" ADD CONSTRAINT "recipe_categories_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_categories" ADD CONSTRAINT "recipe_categories_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_images" ADD CONSTRAINT "recipe_images_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_ingredient_id_fkey" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_instructions" ADD CONSTRAINT "recipe_instructions_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auth_accounts_user_id_idx" ON "auth_accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "auth_sessions_user_id_idx" ON "auth_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "auth_verifications_identifier_idx" ON "auth_verifications" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "favorites_recipe_id_idx" ON "favorites" USING btree ("recipe_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ingredients_name_key" ON "ingredients" USING btree (lower(btrim("name")));--> statement-breakpoint
CREATE INDEX "recipe_categories_category_id_idx" ON "recipe_categories" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "recipe_ingredients_ingredient_id_idx" ON "recipe_ingredients" USING btree ("ingredient_id");--> statement-breakpoint
CREATE INDEX "recipes_user_id_idx" ON "recipes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "recipes_sort_order_id_idx" ON "recipes" USING btree ("sort_order","id");