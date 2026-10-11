ALTER TABLE "categories" DROP CONSTRAINT "categories_name_key";--> statement-breakpoint
ALTER TABLE "categories" DROP CONSTRAINT "categories_name_check";--> statement-breakpoint
ALTER TABLE "recipe_categories" DROP CONSTRAINT "recipe_categories_category_id_fkey";
--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "user_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "sort_order" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_categories" ADD CONSTRAINT "recipe_categories_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "categories_user_name_key" ON "categories" USING btree ("user_id",lower("name"));--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_user_order_key" UNIQUE("user_id","sort_order");--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_sort_order_check" CHECK ("categories"."sort_order" BETWEEN 0 AND 9);--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_name_check" CHECK (length(btrim("categories"."name")) BETWEEN 1 AND 10);