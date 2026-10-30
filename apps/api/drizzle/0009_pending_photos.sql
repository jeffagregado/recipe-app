CREATE TABLE "pending_photos" (
	"id" text DEFAULT gen_random_uuid()::text NOT NULL,
	"user_id" text NOT NULL,
	"object_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pending_photos_pkey" PRIMARY KEY("id"),
	CONSTRAINT "pending_photos_object_key_key" UNIQUE("object_key"),
	CONSTRAINT "pending_photos_object_key_check" CHECK (length(btrim("pending_photos"."object_key")) > 0)
);
--> statement-breakpoint
ALTER TABLE "pending_photos" ADD CONSTRAINT "pending_photos_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pending_photos_user_id_created_at_idx" ON "pending_photos" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "pending_photos_created_at_idx" ON "pending_photos" USING btree ("created_at");