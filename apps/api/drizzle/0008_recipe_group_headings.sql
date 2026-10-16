ALTER TABLE "recipe_ingredients" ADD COLUMN "heading" text;--> statement-breakpoint
ALTER TABLE "recipe_instructions" ADD COLUMN "heading" text;--> statement-breakpoint
ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_heading_check" CHECK (length(btrim("recipe_ingredients"."heading")) BETWEEN 1 AND 100);--> statement-breakpoint
ALTER TABLE "recipe_instructions" ADD CONSTRAINT "recipe_instructions_heading_check" CHECK (length(btrim("recipe_instructions"."heading")) BETWEEN 1 AND 100);